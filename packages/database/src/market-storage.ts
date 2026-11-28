import type { Connection } from 'mongoose';
import { createMarketModels } from './market-models.js';
import { marketValidators, type MarketCollection } from './market-validators.js';
import { assertTransactionSupport } from './auth-indexes.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}
// Exactly the Phase 8B validator, before the optional preview context existed.
// No other legacy/custom validator is eligible for this explicit additive upgrade.
function withoutPreviewContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPreviewContext);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === 'properties' && entry && typeof entry === 'object'
        ? Object.fromEntries(
            Object.entries(entry)
              .filter(([name]) => name !== 'context')
              .map(([name, child]) => [name, withoutPreviewContext(child)]),
          )
        : withoutPreviewContext(entry),
    ]),
  );
}
export async function inspectMarketStorage(connection: Connection) {
  if (!connection.db) throw new Error('Market database connection is not ready.');
  const missingCollections: string[] = [];
  const missingIndexes: string[] = [];
  const incompatible: string[] = [];
  const validatorsToInstall: string[] = [];
  for (const model of Object.values(createMarketModels(connection))) {
    const name = model.collection.collectionName as MarketCollection;
    const info = await connection.db.listCollections({ name }, { nameOnly: false }).next();
    if (!info) {
      missingCollections.push(name);
      continue;
    }
    const options = 'options' in info ? info.options : undefined;
    const current = options?.validator;
    const knownLegacy =
      ['importBatches', 'importStaging'].includes(name) &&
      current &&
      canonical(current) === canonical(withoutPreviewContext(marketValidators[name]));
    if (
      current &&
      Object.keys(current).length > 0 &&
      canonical(current) !== canonical(marketValidators[name])
    ) {
      if (knownLegacy) validatorsToInstall.push(name);
      else incompatible.push(`${name}:validator`);
    } else if (
      !current ||
      Object.keys(current).length === 0 ||
      options?.validationLevel !== 'strict' ||
      options?.validationAction !== 'error'
    )
      validatorsToInstall.push(name);
    const indexes = await model.listIndexes();
    const expected = model.schema.indexes();
    for (const [key, options] of expected) {
      const index = indexes.find((entry) => entry.name === options.name);
      if (!index) {
        missingIndexes.push(`${name}:${String(options.name)}`);
        continue;
      }
      if (
        JSON.stringify(index.key) !== JSON.stringify(key) ||
        Boolean(index.unique) !== Boolean(options.unique) ||
        index.expireAfterSeconds !== options.expireAfterSeconds ||
        canonical(index.partialFilterExpression) !== canonical(options.partialFilterExpression)
      )
        incompatible.push(`${name}:${String(options.name)}`);
    }
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      if (
        !expected.some(([, options]) => options.name === index.name) &&
        (index.unique || index.expireAfterSeconds !== undefined)
      )
        incompatible.push(`${name}:unexpected-constraint`);
    }
    // Existing documents are never silently backfilled, deleted or made valid by DDL.
    try {
      if (
        await model.collection
          .find({ $nor: [marketValidators[name]] }, { projection: { _id: 1 } })
          .limit(1)
          .hasNext()
      )
        incompatible.push(`${name}:records`);
    } catch {
      incompatible.push(`${name}:records`);
    }
  }
  return { missingCollections, missingIndexes, validatorsToInstall, incompatible };
}
/** Read-only: no collection creation, index creation or repair. */
export async function verifyMarketStorage(connection: Connection): Promise<void> {
  const report = await inspectMarketStorage(connection);
  if (Object.values(report).some((items) => items.length))
    throw new Error('Market storage is missing or incompatible. Explicit preparation is required.');
}
/** Explicit operator/test DDL only. Dry-run by default; never called by auth/health. */
export async function prepareMarketStorage(connection: Connection, apply = false) {
  const report = await inspectMarketStorage(connection);
  if (!apply) return { apply, ...report };
  if (report.incompatible.length)
    throw new Error('Existing market storage requires manual compatibility review.');
  await assertTransactionSupport(connection);
  for (const model of Object.values(createMarketModels(connection))) {
    const name = model.collection.collectionName as MarketCollection;
    if (report.missingCollections.includes(name))
      await model.createCollection({
        validator: marketValidators[name],
        validationLevel: 'strict',
        validationAction: 'error',
        writeConcern: { w: 'majority' },
      });
    else if (report.validatorsToInstall.includes(name))
      await connection.db!.command({
        collMod: name,
        validator: marketValidators[name],
        validationLevel: 'strict',
        validationAction: 'error',
      });
    await model.createIndexes();
  }
  await verifyMarketStorage(connection);
  return { apply, ...report };
}

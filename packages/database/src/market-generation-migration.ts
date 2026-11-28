import type { Connection } from 'mongoose';
import {
  dailyOhlcvSchema,
  importJobRecordSchema,
  stockRecordSchema,
  GENERATION_LIMITS,
} from '@darvas/contracts';
import { createMarketModels } from './market-models.js';
import { legacyMarketValidators, marketValidators } from './market-validators.js';
import type { MarketCollection } from './market-validators.js';
import { verifyMarketStorage } from './market-storage.js';
import { recordInput } from './models/market-options.js';
import { marketFingerprint } from './market-content.js';
import { generationCapacity, GenerationStorageError } from './market-generation-plan.js';

const changed = ['stocks', 'dailyPrices', 'priceRevisions', 'importJobs'] as const;
const oldIndexes = {
  dailyPrices: [
    { name: 'stock_session', key: { stockId: 1, sessionDate: 1 }, unique: true },
    { name: 'stock_history', key: { stockId: 1, sessionDate: -1 }, unique: false },
  ],
  priceRevisions: [
    {
      name: 'price_revision_identity',
      key: { stockId: 1, sessionDate: 1, newRevision: 1 },
      unique: true,
    },
  ],
};
const transitional = (name: (typeof changed)[number]) => ({
  $or: [legacyMarketValidators[name], marketValidators[name]],
});
/** Offline-only explicit migration. Acknowledgments are operator attestations, not backup creation. */
export async function migrateMarketGenerations(
  connection: Connection,
  options: {
    apply?: boolean;
    offlineConfirmed?: boolean;
    backupConfirmed?: boolean;
  } = {},
) {
  if (!connection.db) throw new GenerationStorageError('DATABASE_UNAVAILABLE');
  if (options.apply && (!options.offlineConfirmed || !options.backupConfirmed))
    throw new GenerationStorageError('OFFLINE_AND_VERIFIED_BACKUP_REQUIRED');
  const models = createMarketModels(connection);
  const rollback = {
    verifiedBackupRequired: true,
    automaticRollback: false,
    restoreOnlyBeforeNewMarketWrites: true,
    generationDeletionAvailable: false,
  } as const;
  try {
    await verifyMarketStorage(connection);
    return {
      apply: options.apply ?? false,
      alreadyReady: true,
      pricesToTag: 0,
      jobsToInitialize: 0,
      stocksToRehash: 0,
      rollback,
    };
  } catch {
    /* Inspect only the recognized legacy/transitional storage below. */
  }
  for (const model of Object.values(models)) {
    const name = model.collection.collectionName as MarketCollection;
    const info = await connection.db.listCollections({ name }, { nameOnly: false }).next();
    if (
      !info ||
      !('options' in info) ||
      info.options.validationLevel !== 'strict' ||
      info.options.validationAction !== 'error'
    )
      throw new GenerationStorageError('LEGACY_STORAGE_REQUIRES_REVIEW');
    const allowed: unknown[] = [marketValidators[name], legacyMarketValidators[name]];
    if (changed.includes(name as (typeof changed)[number]))
      allowed.push(transitional(name as (typeof changed)[number]));
    const currentValidator = info.options.validator;
    if (!allowed.some((value) => marketFingerprint(value) === marketFingerprint(currentValidator)))
      throw new GenerationStorageError('UNKNOWN_VALIDATOR');
    const old =
      name === 'dailyPrices'
        ? oldIndexes.dailyPrices
        : name === 'priceRevisions'
          ? oldIndexes.priceRevisions
          : [];
    const expected = model.schema.indexes();
    for (const index of await model.listIndexes()) {
      if (index.name === '_id_') continue;
      const knownOld = old.find((entry) => entry.name === index.name);
      const knownNew = expected.find(([, settings]) => settings.name === index.name);
      if (
        knownOld &&
        (JSON.stringify(index.key) !== JSON.stringify(knownOld.key) ||
          Boolean(index.unique) !== knownOld.unique)
      )
        throw new GenerationStorageError('UNKNOWN_INDEX');
      if (
        knownNew &&
        (JSON.stringify(index.key) !== JSON.stringify(knownNew[0]) ||
          Boolean(index.unique) !== Boolean(knownNew[1].unique) ||
          index.expireAfterSeconds !== knownNew[1].expireAfterSeconds ||
          marketFingerprint(index.partialFilterExpression) !==
            marketFingerprint(knownNew[1].partialFilterExpression))
      )
        throw new GenerationStorageError('UNKNOWN_INDEX');
      if (!knownOld && !knownNew && (index.unique || index.expireAfterSeconds !== undefined))
        throw new GenerationStorageError('UNKNOWN_INDEX');
    }
  }
  if (
    await models.ImportJob.exists({
      $or: [
        { status: { $in: ['RUNNING', 'RETRY'] } },
        { generation: { $ne: null, $exists: true } },
      ],
    })
  )
    throw new GenerationStorageError('IMPORTS_MUST_BE_QUIESCENT');
  if (await models.PriceRevision.collection.find({ datasetRevision: { $exists: false } }).hasNext())
    throw new GenerationStorageError('LEGACY_AUDIT_LINEAGE_REQUIRED');
  const stocks = await models.Stock.find().limit(1001);
  if (stocks.length > 1000) throw new GenerationStorageError('MIGRATION_STOCK_LIMIT');
  const plan: { stockId: string; revision: number; hash: string | null; missing: number }[] = [];
  let totalPrices = 0;
  for (const document of stocks) {
    const stock = stockRecordSchema.parse(recordInput(document));
    if (
      !['PUBLISHED', 'UNAVAILABLE'].includes(stock.publication.state) ||
      stock.publication.activeJobId
    )
      throw new GenerationStorageError('AMBIGUOUS_LEGACY_DATASET');
    const prices = await models.DailyPrice.find({ stockId: document._id })
      .sort({ sessionDate: 1 })
      .limit(GENERATION_LIMITS.rows + 1);
    if (stock.publication.publishedRevision === 0 && prices.length)
      throw new GenerationStorageError('AMBIGUOUS_LEGACY_DATASET');
    if (
      stock.publication.publishedRevision > 0 &&
      (!prices.length || stock.publication.asOfSession !== prices.at(-1)!.get('sessionDate'))
    )
      throw new GenerationStorageError('AMBIGUOUS_LEGACY_DATASET');
    const rows = prices.map((price) => {
      const raw = recordInput(price) as Record<string, unknown>;
      if (
        raw.datasetRevision !== undefined &&
        raw.datasetRevision !== stock.publication.publishedRevision
      )
        throw new GenerationStorageError('AMBIGUOUS_LEGACY_DATASET');
      return dailyOhlcvSchema.parse({
        ...raw,
        datasetRevision: stock.publication.publishedRevision,
      });
    });
    generationCapacity(rows);
    totalPrices += prices.length;
    plan.push({
      stockId: document.id,
      revision: stock.publication.publishedRevision,
      hash: rows.length ? marketFingerprint(rows) : null,
      missing: prices.filter((price) => price.get('datasetRevision') === undefined).length,
    });
  }
  if (totalPrices !== (await models.DailyPrice.countDocuments()))
    throw new GenerationStorageError('ORPHAN_PRICES');
  for (const job of await models.ImportJob.find()) importJobRecordSchema.parse(recordInput(job));
  const jobsToInitialize = await models.ImportJob.countDocuments({
    generation: { $exists: false },
  });
  const result = {
    apply: options.apply ?? false,
    alreadyReady: false,
    pricesToTag: plan.reduce((sum, stock) => sum + stock.missing, 0),
    jobsToInitialize,
    stocksToRehash: plan.filter((stock) => stock.hash !== null).length,
    rollback,
  };
  if (!options.apply) return result;
  // DDL cannot share the backfill transaction. Exact transitional validators make
  // an interrupted offline migration recognizable and forward-resumable.
  for (const name of changed)
    await connection.db.command({
      collMod: name,
      validator: transitional(name),
      validationLevel: 'strict',
      validationAction: 'error',
    });
  for (const model of Object.values(models)) await model.createIndexes();
  for (const stock of plan) {
    await connection.transaction(
      async (session) => {
        const stockId = new connection.base.Types.ObjectId(stock.stockId);
        await models.DailyPrice.collection.updateMany(
          { stockId, datasetRevision: { $exists: false } },
          { $set: { datasetRevision: stock.revision } },
          { session },
        );
        if (stock.hash)
          await models.Stock.collection.updateOne(
            { _id: stockId, 'publication.publishedRevision': stock.revision },
            { $set: { 'publication.sourceRevisionKey': stock.hash }, $inc: { __v: 1 } },
            { session },
          );
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  }
  for (;;) {
    const jobs = await models.ImportJob.collection
      .find({ generation: { $exists: false } }, { projection: { _id: 1 } })
      .limit(100)
      .toArray();
    if (!jobs.length) break;
    await models.ImportJob.collection.updateMany(
      { _id: { $in: jobs.map((job) => job._id) }, generation: { $exists: false } },
      { $set: { generation: null } },
    );
  }
  for (const name of changed)
    await connection.db.command({
      collMod: name,
      validator: marketValidators[name],
      validationLevel: 'strict',
      validationAction: 'error',
    });
  for (const [name, indexes] of Object.entries(oldIndexes)) {
    const collection = connection.db.collection(name);
    for (const index of indexes)
      if ((await collection.listIndexes().toArray()).some((entry) => entry.name === index.name))
        await collection.dropIndex(index.name);
  }
  await verifyMarketStorage(connection);
  return result;
}

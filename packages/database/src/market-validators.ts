import { z } from 'zod';
import {
  stockRecordSchema,
  tradingSessionSchema,
  dailyOhlcvSchema,
  importBatchMetadataSchema,
  importJobRecordSchema,
} from '@darvas/contracts';
import { priceRevisionContract } from './models/price-revision.js';
import { importStagingContract } from './models/import-staging.js';
import { objectIdFields } from './models/market-contract-schema.js';

type Json = Record<string, unknown>;
/** Native validators protect critical invariants even if document hooks are bypassed. */
function bsonSchema(node: Json, key = '', parent = '', root = false): Json {
  if (node.anyOf)
    return { anyOf: (node.anyOf as Json[]).map((entry) => bsonSchema(entry, key, parent, root)) };
  if (node.type === 'null') return { bsonType: 'null' };
  if (objectIdFields.has(key)) return { bsonType: 'objectId' };
  if (node.format === 'date-time') return { bsonType: 'date' };
  if (
    (['open', 'high', 'low', 'close'].includes(key) && ['raw', 'adjusted'].includes(parent)) ||
    (key === 'volume' && parent !== 'columnMapping')
  )
    return {
      bsonType: 'decimal',
      minimum: 0,
      ...(key !== 'volume' ? { exclusiveMinimum: true } : {}),
    };
  const result: Json = {};
  if (node.type)
    result.bsonType =
      node.type === 'integer'
        ? ['int', 'long', 'double']
        : node.type === 'boolean'
          ? 'bool'
          : node.type;
  for (const option of [
    'enum',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'additionalProperties',
  ])
    if (node[option] !== undefined) result[option] = node[option];
  if (node.const !== undefined) result.enum = [node.const];
  if (node.type === 'integer') result.multipleOf = 1;
  if (node.items) result.items = bsonSchema(node.items as Json, '', key);
  if (node.properties) {
    const properties = Object.fromEntries(
      Object.entries(node.properties as Record<string, Json>).map(([name, child]) => [
        name,
        bsonSchema(child, name, key),
      ]),
    );
    if (root)
      Object.assign(properties, {
        _id: { bsonType: 'objectId' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
        __v: { bsonType: ['int', 'long', 'double'] },
      });
    result.properties = properties;
    result.required = [
      ...((node.required as string[] | undefined) ?? []),
      ...(root ? ['_id', 'createdAt', 'updatedAt'] : []),
    ];
  }
  return result;
}
const eq = (a: unknown, b: unknown) => ({ $eq: [a, b] });
const all = (...values: unknown[]) => ({ $and: values });
const any = (...values: unknown[]) => ({ $or: values });
const absent = (field: string) => eq({ $type: field }, 'missing');
const finite = (field: string) => ({
  $not: [{ $in: [{ $toString: field }, ['Infinity', '-Infinity', 'NaN']] }],
});
const realSession = (field: string) =>
  eq(
    {
      $dateToString: {
        date: {
          $dateFromString: { dateString: field, format: '%Y-%m-%d', onError: null, onNull: null },
        },
        format: '%Y-%m-%d',
        timezone: 'UTC',
        onNull: null,
      },
    },
    field,
  );
function bar(field: string) {
  return any(
    eq(field, null),
    all(
      ...['open', 'high', 'low', 'close'].map((key) => finite(`${field}.${key}`)),
      { $gte: [`${field}.high`, `${field}.open`] },
      { $gte: [`${field}.high`, `${field}.close`] },
      { $gte: [`${field}.high`, `${field}.low`] },
      { $lte: [`${field}.low`, `${field}.open`] },
      { $lte: [`${field}.low`, `${field}.close`] },
    ),
  );
}
function row(prefix: string) {
  const raw = `${prefix}raw`;
  const adjusted = `${prefix}adjusted`;
  const basis = `${prefix}provenance.basis`;
  return all(
    realSession(`${prefix}sessionDate`),
    bar(raw),
    bar(adjusted),
    any(
      all(eq(basis, 'RAW'), { $ne: [raw, null] }, eq(adjusted, null)),
      all(eq(basis, 'ADJUSTED'), eq(raw, null), { $ne: [adjusted, null] }),
      all(eq(basis, 'BOTH'), { $ne: [raw, null] }, { $ne: [adjusted, null] }),
    ),
    finite(`${prefix}volume`),
    any(eq(`${prefix}volume`, null), eq({ $trunc: `${prefix}volume` }, `${prefix}volume`)),
    any(eq(basis, 'RAW'), { $ne: [`${prefix}provenance.adjustmentVersion`, null] }),
  );
}
function quality(prefix: string) {
  return all(
    {
      $gte: [
        `${prefix}missingSessionCount`,
        { $size: { $ifNull: [`${prefix}missingSessions`, []] } },
      ],
    },
    any(eq(`${prefix}valid`, false), eq(`${prefix}blockingErrorCount`, 0)),
    any(
      eq(`${prefix}complete`, false),
      all(eq(`${prefix}missingSessionCount`, 0), eq(`${prefix}valid`, true), {
        $ne: [`${prefix}calendarVersion`, null],
      }),
    ),
    any(
      eq(`${prefix}freshness`, 'UNKNOWN'),
      all(
        { $ne: [`${prefix}expectedSession`, null] },
        { $ne: [`${prefix}latestSession`, null] },
        { $ne: [`${prefix}calendarVersion`, null] },
      ),
    ),
    any(
      { $ne: [`${prefix}freshness`, 'FRESH'] },
      eq(`${prefix}expectedSession`, `${prefix}latestSession`),
    ),
    any(
      { $ne: [`${prefix}freshness`, 'STALE'] },
      { $lt: [`${prefix}latestSession`, `${prefix}expectedSession`] },
    ),
  );
}
function previewCounts(prefix: string) {
  return all(
    eq(`${prefix}read`, { $add: [`${prefix}valid`, `${prefix}rejected`] }),
    eq(`${prefix}valid`, { $add: [`${prefix}new`, `${prefix}changed`, `${prefix}unchanged`] }),
  );
}
const publication = all(
  { $lte: ['$publication.publishedRevision', '$publication.revision'] },
  any(
    all(
      eq('$publication.state', 'UNAVAILABLE'),
      eq('$publication.publishedRevision', 0),
      eq('$publication.activeJobId', null),
      eq('$publication.asOfSession', null),
      eq('$publication.sourceRevisionKey', null),
    ),
    all(
      eq('$publication.state', 'PUBLISHED'),
      { $gte: ['$publication.revision', 1] },
      { $gte: ['$publication.publishedRevision', 1] },
      eq('$publication.activeJobId', null),
      { $ne: ['$publication.asOfSession', null] },
      { $ne: ['$publication.sourceRevisionKey', null] },
    ),
    all(
      { $in: ['$publication.state', ['IMPORTING', 'UNPUBLISHED']] },
      { $gt: ['$publication.revision', '$publication.publishedRevision'] },
      { $ne: ['$publication.activeJobId', null] },
    ),
  ),
);
const job = all(
  eq('$cursor', { $add: ['$counts.inserted', '$counts.updated', '$counts.unchanged'] }),
  { $lte: ['$cursor', '$total'] },
  any(
    all(
      eq('$status', 'RUNNING'),
      { $ne: ['$leaseOwner', null] },
      { $ne: ['$leaseUntil', null] },
      { $ne: ['$startedAt', null] },
      { $gt: ['$leaseUntil', '$startedAt'] },
      eq('$finishedAt', null),
      { $gte: ['$attempts', 1] },
      { $gte: ['$leaseVersion', 1] },
      { $not: [{ $in: ['$phase', ['QUEUED', 'COMPLETED']] }] },
    ),
    all({ $ne: ['$status', 'RUNNING'] }, eq('$leaseOwner', null), eq('$leaseUntil', null)),
  ),
  any(
    { $ne: ['$status', 'QUEUED'] },
    all(
      eq('$phase', 'QUEUED'),
      eq('$cursor', 0),
      eq('$attempts', 0),
      eq('$leaseVersion', 0),
      eq('$startedAt', null),
      eq('$finishedAt', null),
      eq('$errorCode', null),
    ),
  ),
  any(
    { $ne: ['$status', 'COMPLETED'] },
    all(
      eq('$phase', 'COMPLETED'),
      eq('$cursor', '$total'),
      { $ne: ['$startedAt', null] },
      { $ne: ['$finishedAt', null] },
      eq('$errorCode', null),
    ),
  ),
  any(
    { $not: [{ $in: ['$status', ['RETRY', 'FAILED']] }] },
    all({ $ne: ['$errorCode', null] }, { $ne: ['$phase', 'COMPLETED'] }),
  ),
  any({ $ne: ['$status', 'RETRY'] }, all({ $ne: ['$startedAt', null] }, eq('$finishedAt', null))),
  any({ $ne: ['$status', 'FAILED'] }, { $ne: ['$finishedAt', null] }),
  any(eq('$startedAt', null), eq('$finishedAt', null), { $gte: ['$finishedAt', '$startedAt'] }),
);
const stage = all(
  any(
    all(eq('$state', 'ATTACHED'), { $ne: ['$jobId', null] }, absent('$expiresAt')),
    all(eq('$state', 'PREVIEW'), eq('$jobId', null), eq({ $type: '$expiresAt' }, 'date'), {
      $lte: ['$expiresAt', { $add: ['$createdAt', 30 * 60 * 1000] }],
    }),
    all(eq('$state', 'PURGEABLE'), eq({ $type: '$expiresAt' }, 'date')),
  ),
  any(
    all(
      eq('$kind', 'MANIFEST'),
      eq('$stagingId', '$_id'),
      eq('$familyId', '$metadata.familyId'),
      eq('$uploadedBy', '$metadata.uploadedBy'),
      eq('$stockId', '$metadata.stockId'),
      eq('$rowCount', '$metadata.rows.valid'),
      eq('$chunkCount', { $ceil: { $divide: ['$rowCount', 100] } }),
      any({ $ne: ['$state', 'PREVIEW'] }, eq('$expiresAt', '$metadata.expiresAt')),
      quality('$metadata.quality.'),
      previewCounts('$metadata.rows.'),
    ),
    all(eq('$kind', 'CHUNK'), {
      $allElementsTrue: [
        { $map: { input: { $ifNull: ['$rows', []] }, as: 'row', in: row('$$row.') } },
      ],
    }),
  ),
);
function validator(contract: z.ZodType, expression: Json): Json {
  return {
    $and: [
      { $jsonSchema: bsonSchema(z.toJSONSchema(contract) as Json, '', '', true) },
      { $expr: expression },
    ],
  };
}
export const marketValidators = {
  stocks: validator(stockRecordSchema, publication),
  tradingSessions: validator(
    tradingSessionSchema,
    all(
      realSession('$sessionDate'),
      any(
        all(
          eq('$isOpen', true),
          { $ne: ['$sessionType', 'CLOSED'] },
          { $ne: ['$closeTimeLocal', null] },
        ),
        all(eq('$isOpen', false), eq('$sessionType', 'CLOSED'), eq('$closeTimeLocal', null)),
      ),
    ),
  ),
  dailyPrices: validator(dailyOhlcvSchema, row('$')),
  priceRevisions: validator(
    priceRevisionContract,
    all(
      row('$oldPrice.'),
      row('$newPrice.'),
      eq('$newRevision', { $add: ['$oldRevision', 1] }),
      eq('$oldPrice.sessionDate', '$sessionDate'),
      eq('$newPrice.sessionDate', '$sessionDate'),
      { $ne: ['$oldPrice', '$newPrice'] },
    ),
  ),
  importBatches: validator(
    importBatchMetadataSchema,
    all(
      eq('$stockId', '$preview.stockId'),
      eq('$familyId', '$preview.familyId'),
      eq('$uploadedBy', '$preview.uploadedBy'),
      { $gt: ['$preview.rows.valid', 0] },
      eq('$preview.rows.rejected', 0),
      eq('$preview.quality.valid', true),
      eq('$preview.quality.blockingErrorCount', 0),
      { $ne: ['$preview.quality.calendarVersion', null] },
      { $ne: ['$preview.source.basis', 'UNKNOWN'] },
      { $lt: ['$confirmedAt', '$preview.expiresAt'] },
      any(eq('$preview.rows.changed', 0), { $ne: ['$correctionReason', null] }),
      quality('$preview.quality.'),
      previewCounts('$preview.rows.'),
    ),
  ),
  importJobs: validator(
    importJobRecordSchema,
    all(
      job,
      any(
        eq('$generation', null),
        all(
          any(eq('$generation.candidateRevision', null), {
            $gt: ['$generation.candidateRevision', '$generation.basePublishedRevision'],
          }),
          any(
            all(eq('$generation.build.rows', 0), eq('$generation.build.lastSession', null)),
            all(
              { $gt: ['$generation.build.rows', 0] },
              { $ne: ['$generation.build.lastSession', null] },
            ),
          ),
        ),
      ),
    ),
  ),
  importStaging: validator(importStagingContract, stage),
} as const;
// Recognized pre-generation validators only. Used by the offline migration, never
// automatically accepted/upgraded by HTTP or ordinary storage preparation.
const legacy = structuredClone(marketValidators) as Record<string, Json>;
function removeProperty(name: string, key: string) {
  const schema = (legacy[name]!.$and as Json[])[0]!.$jsonSchema as Json;
  delete (schema.properties as Json)[key];
  schema.required = (schema.required as string[]).filter((entry) => entry !== key);
}
removeProperty('dailyPrices', 'datasetRevision');
removeProperty('priceRevisions', 'datasetRevision');
removeProperty('importJobs', 'generation');
removeProperty('importJobs', 'execution');
(legacy.importJobs!.$and as Json[])[1]!.$expr = job;
const oldPublication = structuredClone(publication);
// Recover the exact original expression while preserving other native constraints.
const branches = (oldPublication.$and as Json[])[1]!.$or as Json[];
(branches[0]!.$and as Json[]).splice(1, 0, eq('$publication.revision', 0));
(branches[1]!.$and as Json[])[2] = eq('$publication.publishedRevision', '$publication.revision');
(legacy.stocks!.$and as Json[])[1]!.$expr = oldPublication;
export const legacyMarketValidators = legacy as unknown as typeof marketValidators;
export type MarketCollection = keyof typeof marketValidators;

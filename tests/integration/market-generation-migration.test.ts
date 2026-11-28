import { afterAll, beforeAll, beforeEach, expect, it, vi, afterEach } from 'vitest';
import {
  createMarketModels,
  prepareMarketStorage,
  migrateMarketGenerations,
  legacyMarketValidators,
  verifyMarketStorage,
  readPublishedPrices,
} from '@darvas/database';
import { startAuthFixture } from '../support/mongo.js';
import {
  syntheticStock,
  syntheticRow,
  syntheticJob,
  syntheticRevision,
  marketIds,
} from '../support/market-records.js';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
const models = () => createMarketModels(fixture.connection);
beforeAll(async () => {
  fixture = await startAuthFixture();
});
afterAll(async () => {
  await fixture?.close();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  fixture.assertOwned();
  for (const model of Object.values(models()))
    await model.collection.drop().catch((error) => {
      if (error.code !== 26) throw error;
    });
  await prepareMarketStorage(fixture.connection, true);
});
async function legacy() {
  for (const name of ['stocks', 'dailyPrices', 'priceRevisions', 'importJobs'] as const)
    await fixture.connection.db!.command({
      collMod: name,
      validator: legacyMarketValidators[name],
      validationLevel: 'strict',
      validationAction: 'error',
    });
  await models().DailyPrice.collection.dropIndex('stock_generation_session');
  await models().DailyPrice.collection.dropIndex('generation_history');
  await models().DailyPrice.collection.createIndex(
    { stockId: 1, sessionDate: 1 },
    { name: 'stock_session', unique: true },
  );
  await models().DailyPrice.collection.createIndex(
    { stockId: 1, sessionDate: -1 },
    { name: 'stock_history' },
  );
  await models().PriceRevision.collection.dropIndex('generation_price_revision_identity');
  await models().PriceRevision.collection.createIndex(
    { stockId: 1, sessionDate: 1, newRevision: 1 },
    { name: 'price_revision_identity', unique: true },
  );
  const stock = await models().Stock.create({ _id: marketIds.stock, ...syntheticStock() });
  const document = new (models().DailyPrice)({
    ...syntheticRow(),
    stockId: marketIds.stock,
    revision: 1,
    sourceImportBatchId: marketIds.batch,
  });
  const raw = document.toObject({ transform: false });
  await models().DailyPrice.collection.insertOne({
    ...raw,
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });
  await models().Stock.collection.updateOne(
    { _id: stock._id },
    {
      $set: {
        publication: {
          state: 'PUBLISHED',
          revision: 1,
          publishedRevision: 1,
          activeJobId: null,
          asOfSession: syntheticRow().sessionDate,
          sourceRevisionKey: 'a'.repeat(64),
          derivedStatus: 'DEFERRED',
        },
      },
    },
  );
  const job = new (models().ImportJob)(syntheticJob());
  const data = job.toObject({ transform: false });
  Reflect.deleteProperty(data, 'generation');
  await models().ImportJob.collection.insertOne({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });
}
const applied = { apply: true, offlineConfirmed: true, backupConfirmed: true };
it('dry-run reports tagging and rollback prerequisites without changing records or indexes', async () => {
  await legacy();
  const before = await models().DailyPrice.collection.findOne();
  const indexes = await models().DailyPrice.listIndexes();
  const report = await migrateMarketGenerations(fixture.connection);
  expect(report.apply).toBe(false);
  expect(report.pricesToTag).toBe(1);
  expect(report.jobsToInitialize).toBe(1);
  expect(report.rollback).toMatchObject({
    verifiedBackupRequired: true,
    automaticRollback: false,
    restoreOnlyBeforeNewMarketWrites: true,
  });
  expect(await models().DailyPrice.collection.findOne()).toEqual(before);
  expect(await models().DailyPrice.listIndexes()).toEqual(indexes);
});
it('requires offline/backup attestations before writes', async () => {
  await legacy();
  await expect(migrateMarketGenerations(fixture.connection, { apply: true })).rejects.toThrow(
    'BACKUP',
  );
  expect(await models().DailyPrice.countDocuments({ datasetRevision: { $exists: false } })).toBe(1);
});
it('migrates legacy published prices and queued metadata, then verifies indexes/readers and idempotency', async () => {
  await legacy();
  await models().DailyPrice.collection.createIndex(
    { revision: 1 },
    { name: 'unrelated_nonunique' },
  );
  await migrateMarketGenerations(fixture.connection, applied);
  await verifyMarketStorage(fixture.connection);
  expect((await readPublishedPrices(fixture.connection, marketIds.stock))?.rows).toHaveLength(1);
  expect((await models().ImportJob.collection.findOne())!.generation).toBeNull();
  const indexes = await models().DailyPrice.listIndexes();
  expect(indexes.some((index) => index.name === 'stock_session')).toBe(false);
  expect(indexes.some((index) => index.name === 'unrelated_nonunique')).toBe(true);
  expect((await migrateMarketGenerations(fixture.connection, applied)).alreadyReady).toBe(true);
});
it('keeps ordinary preparation read-only/refusing legacy generation changes', async () => {
  await legacy();
  await expect(verifyMarketStorage(fixture.connection)).rejects.toThrow('preparation');
  await expect(prepareMarketStorage(fixture.connection, true)).rejects.toThrow(
    'manual compatibility',
  );
  expect(await models().DailyPrice.countDocuments({ datasetRevision: { $exists: false } })).toBe(1);
});
it('refuses unknown native validators without overwriting them', async () => {
  await legacy();
  const unknown = { $jsonSchema: { bsonType: 'object' } };
  await fixture.connection.db!.command({ collMod: 'dailyPrices', validator: unknown });
  await expect(migrateMarketGenerations(fixture.connection, applied)).rejects.toThrow(
    'UNKNOWN_VALIDATOR',
  );
  const info = await fixture.connection
    .db!.listCollections({ name: 'dailyPrices' }, { nameOnly: false })
    .next();
  expect(info!.options!.validator).toEqual(unknown);
});
it('refuses incompatible indexes, ambiguous datasets and missing audit lineage', async () => {
  await legacy();
  await models().DailyPrice.collection.createIndex(
    { revision: 1 },
    { name: 'unexpected_unique', unique: true },
  );
  await expect(migrateMarketGenerations(fixture.connection)).rejects.toThrow('UNKNOWN_INDEX');
  await models().DailyPrice.collection.dropIndex('unexpected_unique');
  await models().Stock.collection.updateOne(
    { _id: new fixture.connection.base.Types.ObjectId(marketIds.stock) },
    {
      $set: {
        'publication.state': 'IMPORTING',
        'publication.revision': 2,
        'publication.activeJobId': new fixture.connection.base.Types.ObjectId(marketIds.job),
      },
    },
  );
  await expect(migrateMarketGenerations(fixture.connection)).rejects.toThrow('AMBIGUOUS');
});
it('is forward-resumable after a recognized DDL interruption', async () => {
  await legacy();
  const original = models().DailyPrice.createIndexes.bind(models().DailyPrice);
  vi.spyOn(models().DailyPrice, 'createIndexes').mockRejectedValueOnce(
    new Error('Synthetic DDL interruption'),
  );
  await expect(migrateMarketGenerations(fixture.connection, applied)).rejects.toThrow(
    'interruption',
  );
  vi.restoreAllMocks();
  await original();
  await migrateMarketGenerations(fixture.connection, applied);
  await verifyMarketStorage(fixture.connection);
  expect((await readPublishedPrices(fixture.connection, marketIds.stock))?.datasetRevision).toBe(1);
});
it('requires no migration writes for a freshly prepared generation store', async () => {
  const report = await migrateMarketGenerations(fixture.connection);
  expect(report.alreadyReady).toBe(true);
  expect(await models().Stock.countDocuments()).toBe(0);
});
it('refuses to guess generation lineage for legacy correction audit records', async () => {
  await legacy();
  const document = new (models().PriceRevision)(syntheticRevision());
  const raw = document.toObject({ transform: false });
  Reflect.deleteProperty(raw, 'datasetRevision');
  await models().PriceRevision.collection.insertOne({
    ...raw,
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });
  await expect(migrateMarketGenerations(fixture.connection, applied)).rejects.toThrow(
    'AUDIT_LINEAGE',
  );
  expect(await models().DailyPrice.countDocuments({ datasetRevision: { $exists: false } })).toBe(1);
});
it('refuses active execution and missing legacy publication data', async () => {
  await legacy();
  const job = await models().ImportJob.collection.findOne();
  await models().ImportJob.collection.updateOne(
    { _id: job!._id },
    {
      $set: {
        status: 'RUNNING',
        phase: 'VALIDATING',
        leaseOwner: 'synthetic',
        leaseUntil: new Date(Date.now() + 60_000),
        startedAt: new Date(),
        attempts: 1,
        leaseVersion: 1,
      },
    },
  );
  await expect(migrateMarketGenerations(fixture.connection)).rejects.toThrow('QUIESCENT');
  await models().ImportJob.collection.deleteMany({});
  await models().DailyPrice.collection.updateOne(
    {},
    { $set: { stockId: new fixture.connection.base.Types.ObjectId() } },
  );
  await expect(migrateMarketGenerations(fixture.connection)).rejects.toThrow('AMBIGUOUS');
});

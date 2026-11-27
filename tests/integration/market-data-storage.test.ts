import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import {
  connectDatabase,
  createMarketModels,
  disconnectDatabase,
  prepareMarketStorage,
  verifyMarketStorage,
  inspectMarketStorage,
} from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import {
  marketIds,
  runningJob,
  syntheticBatch,
  syntheticJob,
  syntheticManifest,
  syntheticRevision,
  syntheticRow,
  syntheticSession,
  syntheticStock,
} from '../support/market-records.js';

const databaseName = `advanced_darvas_test_${randomUUID().replaceAll('-', '')}`;
let replica: MongoMemoryReplSet;
let connection: DatabaseConnection;
function owned() {
  if (
    !connection ||
    connection.name !== databaseName ||
    !/^advanced_darvas_test_[a-f\d]{32}$/.test(connection.name) ||
    connection.host !== '127.0.0.1'
  )
    throw new Error('Refusing non-disposable database access.');
  return connection;
}
const models = () => createMarketModels(owned());
const objectId = () => new (owned().base.Types.ObjectId)();
const decimal = (text: string) => owned().base.Types.Decimal128.fromString(text);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: {
      version: '8.2.6',
      checkMD5: true,
      downloadDir: fileURLToPath(
        new URL('../../node_modules/.cache/mongodb-binaries/', import.meta.url),
      ),
    },
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
  const uri = replica.getUri(databaseName);
  if (new URL(uri).hostname !== '127.0.0.1') throw new Error('Loopback fixture required.');
  connection = await connectDatabase({ uri, databaseName });
});
beforeEach(async () => {
  await owned().dropDatabase();
});
afterAll(async () => {
  try {
    if (connection) await disconnectDatabase(owned());
  } finally {
    await replica?.stop();
  }
});
const prepare = () => prepareMarketStorage(owned(), true);
const priceData = () => ({
  ...syntheticRow(),
  stockId: marketIds.stock,
  revision: 1,
  sourceImportBatchId: marketIds.batch,
});
async function jobAndStage() {
  const job = await models().ImportJob.create({ _id: marketIds.job, ...syntheticJob() });
  const stage = await models().ImportStaging.create(syntheticManifest());
  return { job, stage };
}
async function attachStage() {
  const { job, stage } = await jobAndStage();
  await owned().transaction(async (session) => {
    stage.$session(session);
    stage.set({ state: 'ATTACHED', jobId: job._id, expiresAt: undefined });
    await stage.save();
  });
  return { job, stage: (await models().ImportStaging.findById(stage._id))! };
}

it('registration, dry-run and readiness verification never provision storage', async () => {
  models();
  const report = await prepareMarketStorage(owned());
  expect(report.apply).toBe(false);
  expect(report.missingCollections).toHaveLength(7);
  await expect(verifyMarketStorage(owned())).rejects.toThrow('Explicit preparation');
  expect(await owned().db!.listCollections().toArray()).toEqual([]);
});
it('explicit preparation is idempotent, installs native validators/indexes and seeds nothing', async () => {
  await prepare();
  await verifyMarketStorage(owned());
  const again = await prepare();
  expect(again.missingCollections).toEqual([]);
  expect(again.missingIndexes).toEqual([]);
  for (const model of Object.values(models())) expect(await model.countDocuments()).toBe(0);
});
it('enforces unique stock identity and session dates', async () => {
  await prepare();
  await models().Stock.create(syntheticStock());
  await expect(models().Stock.create(syntheticStock())).rejects.toMatchObject({ code: 11000 });
  await models().Stock.create({ ...syntheticStock(), series: 'BE' });
  await models().TradingSession.create(syntheticSession());
  await expect(models().TradingSession.create(syntheticSession())).rejects.toMatchObject({
    code: 11000,
  });
});
it('preserves exact Decimal128 prices and rejects duplicate stock/session imports', async () => {
  await prepare();
  const exact = '1.000000000000000000000000000000001';
  const price = await models().DailyPrice.create({
    ...priceData(),
    raw: { open: exact, high: exact, low: exact, close: exact },
    volume: null,
  });
  const loaded = await models().DailyPrice.findById(price._id);
  expect(loaded!.raw!.close.toString()).toBe(exact);
  expect(loaded!.volume).toBeNull();
  await expect(models().DailyPrice.create(priceData())).rejects.toMatchObject({ code: 11000 });
});
it('native validators reject invalid OHLC and unsafe publication even through driver updates', async () => {
  await prepare();
  const price = await models().DailyPrice.create(priceData());
  await expect(
    models().DailyPrice.collection.updateOne(
      { _id: price._id },
      { $set: { 'raw.high': decimal('1') } },
    ),
  ).rejects.toMatchObject({ code: 121 });
  await expect(
    models().DailyPrice.collection.updateOne(
      { _id: price._id },
      { $set: { 'raw.high': decimal('Infinity') } },
    ),
  ).rejects.toMatchObject({ code: 121 });
  const stock = await models().Stock.create(syntheticStock());
  await expect(
    models().Stock.collection.updateOne(
      { _id: stock._id },
      { $set: { 'publication.state': 'PUBLISHED' } },
    ),
  ).rejects.toMatchObject({ code: 121 });
});
it('publication requires transactional reservation and a matching completed job, with calculation deferred', async () => {
  await prepare();
  const stock = await models().Stock.create({ _id: marketIds.stock, ...syntheticStock() });
  const job = await models().ImportJob.create({ _id: marketIds.job, ...syntheticJob() });
  const importing = {
    ...syntheticStock().publication,
    state: 'IMPORTING',
    revision: 1,
    activeJobId: job._id,
  };
  stock.set('publication', importing);
  await expect(stock.save()).rejects.toThrow('transaction');
  await owned().transaction(async (session) => {
    const current = (await models().Stock.findById(stock._id).session(session))!;
    current.set('publication', importing);
    await current.save();
  });
  const published = {
    ...syntheticStock().publication,
    state: 'PUBLISHED',
    revision: 1,
    publishedRevision: 1,
    asOfSession: '2026-11-26',
    sourceRevisionKey: 'a'.repeat(64),
  };
  await expect(
    owned().transaction(async (session) => {
      const current = (await models().Stock.findById(stock._id).session(session))!;
      current.set('publication', published);
      await current.save();
    }),
  ).rejects.toThrow('matching job');
  job.set(runningJob());
  await job.save();
  job.set('phase', 'UPSERTING');
  await job.save();
  job.set({
    cursor: 2,
    counts: { inserted: 2, updated: 0, unchanged: 0 },
    phase: 'CHECKING_QUALITY',
  });
  await job.save();
  job.set('phase', 'READY_TO_PUBLISH');
  await job.save();
  await owned().transaction(async (session) => {
    job.$session(session);
    job.set({
      status: 'COMPLETED',
      phase: 'COMPLETED',
      leaseOwner: null,
      leaseUntil: null,
      finishedAt: new Date(),
    });
    await job.save();
    const current = (await models().Stock.findById(stock._id).session(session))!;
    current.set('publication', published);
    await current.save();
  });
  expect((await models().Stock.findById(stock._id))!.publication.derivedStatus).toBe('DEFERRED');
  expect((await models().Stock.findById(stock._id))!.publication.state).toBe('PUBLISHED');
});
it('price revisions have unique consecutive identities and append-only model operations', async () => {
  await prepare();
  const revision = await models().PriceRevision.create(syntheticRevision());
  await expect(models().PriceRevision.create(syntheticRevision())).rejects.toMatchObject({
    code: 11000,
  });
  await expect(
    models().PriceRevision.updateOne({ _id: revision._id }, { $set: { reason: 'changed' } }),
  ).rejects.toThrow('validated market');
  await expect(models().PriceRevision.deleteMany({})).rejects.toThrow('validated market');
  await expect(
    models().PriceRevision.bulkWrite([{ deleteOne: { filter: { _id: revision._id } } }]),
  ).rejects.toThrow('audited');
  revision.reason = 'changed';
  await expect(revision.save()).rejects.toThrow('append-only');
  await expect(
    models().PriceRevision.collection.updateOne(
      { _id: revision._id },
      { $set: { newRevision: 9 } },
    ),
  ).rejects.toMatchObject({ code: 121 });
});
it('batch idempotency is actor-scoped and administrative history is family-scoped', async () => {
  await prepare();
  const batch = syntheticBatch();
  await models().ImportBatch.create(batch);
  await expect(
    models().ImportBatch.create({ ...batch, requestHash: 'f'.repeat(64) }),
  ).rejects.toMatchObject({ code: 11000 });
  const otherFamily = objectId().toHexString();
  const otherUser = objectId().toHexString();
  await models().ImportBatch.create({
    ...batch,
    familyId: otherFamily,
    uploadedBy: otherUser,
    preview: { ...batch.preview, familyId: otherFamily, uploadedBy: otherUser },
  });
  const scoped = await models().ImportBatch.find({ familyId: marketIds.family });
  expect(scoped).toHaveLength(1);
  expect(scoped[0]!.uploadedBy.toHexString()).toBe(marketIds.user);
  await expect(models().ImportBatch.create({ ...batch, familyId: otherFamily })).rejects.toThrow();
});
it('database indexes arbitrate concurrent imports globally per stock and deduplicate batch jobs', async () => {
  await prepare();
  const outcomes = await Promise.allSettled([
    models().ImportJob.create(syntheticJob()),
    models().ImportJob.create({ ...syntheticJob(), importBatchId: objectId() }),
  ]);
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 11000 },
  });
  const existing = await models().ImportJob.findOne();
  await expect(
    models().ImportJob.create({
      ...syntheticJob(),
      stockId: objectId(),
      importBatchId: existing!.importBatchId,
    }),
  ).rejects.toMatchObject({ code: 11000 });
});
it('persisted jobs retain checkpoints/fencing and reject phase jumps, scope changes and stale saves', async () => {
  await prepare();
  const created = await models().ImportJob.create(syntheticJob());
  const first = (await models().ImportJob.findById(created._id))!;
  const stale = (await models().ImportJob.findById(created._id))!;
  first.set(runningJob());
  await first.save();
  stale.set(runningJob());
  await expect(stale.save()).rejects.toMatchObject({ name: 'VersionError' });
  first.set({
    phase: 'READY_TO_PUBLISH',
    cursor: 2,
    counts: { inserted: 2, updated: 0, unchanged: 0 },
  });
  await expect(first.save()).rejects.toThrow();
  const current = (await models().ImportJob.findById(created._id))!;
  current.set({ phase: 'UPSERTING' });
  await current.save();
  current.set({ cursor: 1, counts: { inserted: 1, updated: 0, unchanged: 0 } });
  await current.save();
  current.set({ cursor: 0, counts: { inserted: 0, updated: 0, unchanged: 0 } });
  await expect(current.save()).rejects.toThrow();
  const loaded = (await models().ImportJob.findById(created._id))!;
  expect(loaded.cursor).toBe(1);
  expect(loaded.leaseVersion).toBe(1);
  loaded.familyId = objectId();
  await expect(loaded.save()).rejects.toThrow();
});
it('native job validation rejects incomplete completion and active-job TTL indexes do not exist', async () => {
  await prepare();
  const job = await models().ImportJob.create(syntheticJob());
  await expect(
    models().ImportJob.collection.updateOne(
      { _id: job._id },
      { $set: { status: 'COMPLETED', phase: 'COMPLETED' } },
    ),
  ).rejects.toMatchObject({ code: 121 });
  expect(
    (await models().ImportJob.listIndexes()).some(
      (index) => index.expireAfterSeconds !== undefined,
    ),
  ).toBe(false);
});
it('payload attachment requires a matching job in a transaction and removes the TTL deadline', async () => {
  await prepare();
  const { job, stage } = await jobAndStage();
  stage.set({ state: 'ATTACHED', jobId: job._id, expiresAt: undefined });
  await expect(stage.save()).rejects.toThrow('transaction');
  const loaded = (await models().ImportStaging.findById(stage._id))!;
  await expect(
    models().ImportStaging.collection.updateOne(
      { _id: stage._id },
      { $set: { state: 'ATTACHED', jobId: job._id } },
    ),
  ).rejects.toMatchObject({ code: 121 });
  await owned().transaction(async (session) => {
    loaded.$session(session);
    loaded.set({ state: 'ATTACHED', jobId: job._id, expiresAt: undefined });
    await loaded.save();
  });
  const saved = await models().ImportStaging.findById(stage._id);
  expect(saved!.state).toBe('ATTACHED');
  expect(saved!.expiresAt).toBeUndefined();
  expect(saved!.get('tokenHash')).toBeUndefined();
  await expect(
    models().ImportStaging.collection.updateOne(
      { _id: saved!._id },
      { $set: { expiresAt: new Date(0) } },
    ),
  ).rejects.toMatchObject({ code: 121 });
  expect(saved!.toJSON()).not.toHaveProperty('tokenHash');
  const expiry = (await models().ImportStaging.listIndexes()).find(
    (index) => index.name === 'inactive_staging_expiry',
  );
  expect(expiry!.partialFilterExpression).toEqual({ state: { $in: ['PREVIEW', 'PURGEABLE'] } });
});
it('active/retryable payloads cannot be purged; a matching terminal job and transaction are required', async () => {
  await prepare();
  const { job, stage } = await attachStage();
  await expect(
    owned().transaction(async (session) => {
      stage.$session(session);
      stage.set({ state: 'PURGEABLE', expiresAt: new Date(Date.now() + 60_000) });
      await stage.save();
    }),
  ).rejects.toThrow();
  const attached = (await models().ImportStaging.findById(stage._id))!;
  expect(attached.state).toBe('ATTACHED');
  expect(attached.expiresAt).toBeUndefined();
  job.set({ status: 'FAILED', errorCode: 'SYNTHETIC_FINAL_FAILURE', finishedAt: new Date() });
  await job.save();
  await owned().transaction(async (session) => {
    attached.$session(session);
    attached.set({ state: 'PURGEABLE', expiresAt: new Date(Date.now() + 60_000) });
    await attached.save();
  });
  expect((await models().ImportStaging.findById(stage._id))!.state).toBe('PURGEABLE');
});
it('rejects cross-family attachment even when the preview is internally consistent', async () => {
  await prepare();
  const job = await models().ImportJob.create({ _id: marketIds.job, ...syntheticJob() });
  const data = syntheticManifest();
  const familyId = objectId().toHexString();
  const stage = await models().ImportStaging.create({
    ...data,
    familyId,
    metadata: { ...data.metadata, familyId },
  });
  await expect(
    owned().transaction(async (session) => {
      stage.$session(session);
      stage.set({ state: 'ATTACHED', jobId: job._id, expiresAt: undefined });
      await stage.save();
    }),
  ).rejects.toThrow('matching job');
  expect((await models().ImportStaging.findById(stage._id))!.state).toBe('PREVIEW');
});
it('staging rejects duplicate tokens/chunks, oversized payloads and mismatched family metadata', async () => {
  await prepare();
  const manifest = syntheticManifest();
  await models().ImportStaging.create(manifest);
  const secondId = objectId();
  await expect(
    models().ImportStaging.create({ ...manifest, _id: secondId, stagingId: secondId }),
  ).rejects.toMatchObject({ code: 11000 });
  await expect(
    models().ImportStaging.create({
      ...manifest,
      _id: secondId,
      stagingId: secondId,
      tokenHash: 'f'.repeat(64),
      familyId: objectId(),
    }),
  ).rejects.toThrow();
  const chunk = {
    stagingId: marketIds.staging,
    stockId: marketIds.stock,
    familyId: marketIds.family,
    uploadedBy: marketIds.user,
    kind: 'CHUNK' as const,
    state: 'PREVIEW' as const,
    jobId: null,
    expiresAt: manifest.expiresAt,
    ordinal: 0,
    chunkHash: 'e'.repeat(64),
    rows: [syntheticRow()],
  };
  const storedChunk = await models().ImportStaging.create(chunk);
  const plain = storedChunk.toObject({ transform: false });
  if (plain.kind !== 'CHUNK') throw new Error('Expected synthetic chunk.');
  await expect(
    models().ImportStaging.collection.updateOne(
      { _id: storedChunk._id },
      { $set: { rows: Array.from({ length: 101 }, () => plain.rows[0]!) } },
    ),
  ).rejects.toMatchObject({ code: 121 });
  await expect(models().ImportStaging.create(chunk)).rejects.toMatchObject({ code: 11000 });
  await expect(
    models().ImportStaging.create({
      ...chunk,
      ordinal: 1,
      rows: Array.from({ length: 101 }, syntheticRow),
    }),
  ).rejects.toThrow();
});
it('verification fails closed on legacy TTL/index drift without dropping unrelated indexes', async () => {
  await prepare();
  await models().Stock.collection.createIndex({ companyName: 1 }, { name: 'unrelated_lookup' });
  await verifyMarketStorage(owned());
  await prepare();
  expect(
    (await models().Stock.listIndexes()).some((index) => index.name === 'unrelated_lookup'),
  ).toBe(true);
  await models().ImportStaging.collection.createIndex(
    { createdAt: 1 },
    { name: 'unsafe_legacy_ttl', expireAfterSeconds: 3600 },
  );
  await expect(verifyMarketStorage(owned())).rejects.toThrow('incompatible');
  await expect(prepare()).rejects.toThrow('manual compatibility');
  expect(
    (await models().ImportStaging.listIndexes()).some(
      (index) => index.name === 'unsafe_legacy_ttl',
    ),
  ).toBe(true);
});
it('preparation refuses incompatible records/validators rather than rewriting them', async () => {
  await owned().db!.createCollection('stocks');
  await owned().db!.collection('stocks').insertOne({ syntheticInvalid: true });
  const report = await inspectMarketStorage(owned());
  expect(report.incompatible).toContain('stocks:records');
  await expect(prepare()).rejects.toThrow('manual compatibility');
  expect(await owned().db!.collection('stocks').countDocuments()).toBe(1);
  expect((await owned().db!.listCollections().toArray()).map((entry) => entry.name)).toEqual([
    'stocks',
  ]);
});
it('detects compound index order drift rather than treating reversed keys as compatible', async () => {
  await prepare();
  await models().DailyPrice.collection.dropIndex('stock_history');
  await models().DailyPrice.collection.createIndex(
    { sessionDate: -1, stockId: 1 },
    { name: 'stock_history' },
  );
  const report = await inspectMarketStorage(owned());
  expect(report.incompatible).toContain('dailyPrices:stock_history');
  await expect(prepare()).rejects.toThrow('manual compatibility');
});
it('refuses unknown native validators instead of overwriting operator constraints', async () => {
  await prepare();
  const unexpected = { $jsonSchema: { bsonType: 'object' } };
  await owned().db!.command({ collMod: 'stocks', validator: unexpected });
  const report = await inspectMarketStorage(owned());
  expect(report.incompatible).toContain('stocks:validator');
  await expect(prepare()).rejects.toThrow('manual compatibility');
  const info = await owned().db!.listCollections({ name: 'stocks' }, { nameOnly: false }).next();
  expect(info && 'options' in info ? info.options.validator : undefined).toEqual(unexpected);
});

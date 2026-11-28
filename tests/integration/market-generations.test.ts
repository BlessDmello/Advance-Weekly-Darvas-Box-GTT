import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  createGenerationRepository,
  createMarketModels,
  createMarketRepository,
  marketFingerprint,
  stockReferenceFingerprint,
  prepareMarketStorage,
  readPublishedPrices,
  verifyMarketStorage,
} from '@darvas/database';
import type { GenerationFence } from '@darvas/database';
import type { MarketReferencePolicy } from '@darvas/contracts';
import { createApp } from '../../apps/api/src/app.js';
import { parseEnvironment } from '../../apps/api/src/config/env.js';
import {
  csvFile,
  dataRows,
  parseOptions,
  syntheticCalendar,
} from '../../apps/api/tests/parsing-fixtures.js';
import { startAuthFixture } from '../support/mongo.js';
import { testCredentials } from '../support/credentials.js';
import { syntheticStock } from '../support/market-records.js';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
let stockId: string, policy: MarketReferencePolicy, app: ReturnType<typeof createApp>;
const models = () => createMarketModels(fixture.connection);
const repo = () =>
  createGenerationRepository(fixture.connection, () => new Date('2026-01-03T12:00:00.000Z'));
const origin = 'http://127.0.0.1:3000';
beforeAll(async () => {
  fixture = await startAuthFixture();
});
afterAll(async () => {
  await fixture?.close();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  fixture.assertOwned();
  await prepareMarketStorage(fixture.connection, true);
  for (const model of Object.values(models())) await model.collection.deleteMany({});
  const stock = { ...syntheticStock(), symbol: parseOptions.stock.symbol };
  stockId = (await models().Stock.create(stock)).id;
  for (const day of syntheticCalendar.days) await models().TradingSession.create(day);
  policy = {
    stocks: [{ stockId, fingerprint: stockReferenceFingerprint(stock) }],
    calendars: [
      {
        source: syntheticCalendar.source,
        version: syntheticCalendar.version,
        from: syntheticCalendar.from,
        to: syntheticCalendar.to,
        fingerprint: marketFingerprint(syntheticCalendar.days),
      },
    ],
    priceSources: [
      {
        provider: parseOptions.source.provider,
        reference: parseOptions.source.reference,
        basis: 'RAW',
        adjustmentVersion: null,
      },
    ],
  };
  app = createApp(
    parseEnvironment({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: origin,
      CSRF_SECRET: 'g'.repeat(64),
    }),
    fixture.runtime,
    undefined,
    {
      repository: async () => {
        await verifyMarketStorage(fixture.connection);
        return createMarketRepository(fixture.connection);
      },
      policy: () => policy,
    },
  );
});
type Agent = ReturnType<typeof request.agent>;
async function csrf(agent: Agent) {
  return String((await agent.get('/api/v1/auth/csrf').expect(200)).body.data.csrfToken);
}
async function queued(rows = dataRows) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .send(testCredentials)
    .expect(200);
  const csrfToken = await csrf(agent);
  const input = {
    stockSymbol: parseOptions.stock.symbol,
    mapping: parseOptions.mapping,
    source: {
      provider: parseOptions.source.provider,
      reference: parseOptions.source.reference,
      adjustmentVersion: null,
    },
    adjustmentBasis: 'RAW',
    dateMode: 'ISO',
    requestedRange: { from: rows[0]![0], to: rows.at(-1)![0] },
    minimumHistorySessions: '5',
    expectedCompletedSession: '2026-01-03',
  };
  let upload = agent
    .post('/api/v1/imports/preview')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrfToken);
  for (const [name, value] of Object.entries(input))
    upload = upload.field(
      name,
      ['mapping', 'source', 'requestedRange', 'expectedCompletedSession'].includes(name)
        ? JSON.stringify(value)
        : String(value),
    );
  const file = csvFile(rows);
  const preview = await upload
    .attach('file', Buffer.from(file.bytes), { filename: file.name, contentType: file.mimeType })
    .expect(200);
  expect(preview.body.data.committable).toBe(true);
  const signed = await csrf(agent);
  const confirmation = await agent
    .post('/api/v1/imports/commit')
    .set('Origin', origin)
    .set('X-CSRF-Token', signed)
    .set('Idempotency-Key', randomUUID())
    .send({
      previewToken: preview.body.data.previewToken,
      correctionReason: 'Synthetic reviewed correction',
    })
    .expect(202);
  const job = await models().ImportJob.findById(confirmation.body.data.jobId).orFail();
  // Explicit synthetic setup only. There is no production claim/coordinator in this milestone.
  job.set({
    status: 'RUNNING',
    phase: 'VALIDATING',
    attempts: 1,
    leaseVersion: 1,
    leaseOwner: 'synthetic-storage-test',
    leaseUntil: new Date(Date.now() + 300_000),
    startedAt: new Date(),
  });
  await job.save();
  const fence: GenerationFence = {
    jobId: job.id,
    familyId: String(job.get('familyId')),
    uploadedBy: String(job.get('uploadedBy')),
    leaseOwner: 'synthetic-storage-test',
    leaseVersion: 1,
  };
  return { fence, agent, reserved: await repo().reserveCandidate(fence, policy) };
}
async function built(state: Awaited<ReturnType<typeof queued>>, omitLast = false) {
  const job = await models().ImportJob.findById(state.fence.jobId).orFail();
  job.set('phase', 'UPSERTING');
  await job.save();
  if (state.reserved.generation!.candidateRevision !== null) {
    await fixture.connection.transaction(async (session) => {
      for (const row of omitLast ? state.reserved.plan.rows.slice(0, -1) : state.reserved.plan.rows)
        await new (models().DailyPrice)(row).save({ session });
      for (const audit of state.reserved.plan.revisions)
        await new (models().PriceRevision)(audit).save({ session });
    });
    job.set('generation.build', {
      lastSession: state.reserved.plan.rows.at(-1)!.sessionDate,
      rows: state.reserved.plan.rows.length,
      bytes: state.reserved.plan.capacity.bytes,
    });
  }
  job.set({
    cursor: job.get('total'),
    counts: state.reserved.plan.counts,
    phase: 'CHECKING_QUALITY',
  });
  await job.save();
}
async function ready(state: Awaited<ReturnType<typeof queued>>) {
  await built(state);
  const assessment = await repo().assessCandidate(state.fence, policy);
  const job = await models().ImportJob.findById(state.fence.jobId).orFail();
  job.set('phase', 'READY_TO_PUBLISH');
  await job.save();
  return assessment;
}
async function initial() {
  const state = await queued();
  await ready(state);
  await repo().publish(state.fence, policy);
  return state;
}
it('keeps initial candidates invisible and atomically publishes only complete assessed generations', async () => {
  const state = await queued();
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
  const assessment = await ready(state);
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
  expect(assessment.warnings).toEqual(
    expect.arrayContaining(['RAW_ONLY', 'SHORT_HISTORY', 'DECLARED_SOURCE']),
  );
  expect(assessment.screeningEligible).toBe(false);
  expect(await repo().publish(state.fence, policy)).toEqual({
    datasetRevision: 1,
    noop: false,
    screeningEligible: false,
  });
  const published = await readPublishedPrices(fixture.connection, stockId);
  expect(published?.rows).toHaveLength(3);
  expect((await models().ImportJob.findById(state.fence.jobId))!.get('status')).toBe('COMPLETED');
});
it('retains previous published data throughout a partial-range correction and audits only its changed session', async () => {
  await initial();
  const before = await readPublishedPrices(fixture.connection, stockId);
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  expect((await readPublishedPrices(fixture.connection, stockId))?.contentHash).toBe(
    before!.contentHash,
  );
  await ready(state);
  expect((await readPublishedPrices(fixture.connection, stockId))?.datasetRevision).toBe(1);
  await repo().publish(state.fence, policy);
  const after = await readPublishedPrices(fixture.connection, stockId);
  expect(after?.rows.map((row) => row.sessionDate)).toEqual(
    before!.rows.map((row) => row.sessionDate),
  );
  expect(after?.rows[0]?.raw).toEqual(before!.rows[0]?.raw);
  expect(after?.rows[1]?.raw?.close).toBe('101.40');
  expect(await models().PriceRevision.countDocuments({ datasetRevision: 2 })).toBe(1);
  expect(await models().DailyPrice.countDocuments({ datasetRevision: 1 })).toBe(3);
});
it('rejects incomplete candidates even when source counters claim completion', async () => {
  const state = await queued();
  await built(state, true);
  await expect(repo().assessCandidate(state.fence, policy)).rejects.toThrow('INCOMPLETE');
  await expect(repo().publish(state.fence, policy)).rejects.toThrow('ASSESSMENT');
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
});
it('serializes concurrent publication and rejects a stale fencing token', async () => {
  const state = await queued();
  await ready(state);
  await expect(repo().publish({ ...state.fence, leaseVersion: 2 }, policy)).rejects.toThrow(
    'STALE_FENCE',
  );
  const results = await Promise.allSettled([
    repo().publish(state.fence, policy),
    repo().publish(state.fence, policy),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect((await readPublishedPrices(fixture.connection, stockId))?.datasetRevision).toBe(1);
});
it('rolls back job completion when the final publication write fails', async () => {
  const state = await queued();
  await ready(state);
  const original = models().Stock.prototype.save;
  vi.spyOn(models().Stock.prototype, 'save').mockImplementationOnce(function () {
    throw new Error('Synthetic final write failure');
  });
  await expect(repo().publish(state.fence, policy)).rejects.toThrow('Synthetic final');
  vi.restoreAllMocks();
  expect(models().Stock.prototype.save).toBe(original);
  expect((await models().ImportJob.findById(state.fence.jobId))!.get('status')).toBe('RUNNING');
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
  await repo().publish(state.fence, policy);
});
it('rejects revoked reference approvals at final publication without replacing the old generation', async () => {
  await initial();
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  await ready(state);
  policy.stocks = [];
  await expect(repo().publish(state.fence, policy)).rejects.toThrow('REFERENCE_CHANGED');
  expect((await readPublishedPrices(fixture.connection, stockId))?.datasetRevision).toBe(1);
});
it('abandons candidates without reusing revision numbers or deleting old data', async () => {
  const state = await queued();
  await built(state);
  await repo().abandonCandidate(state.fence, 'SYNTHETIC_FAILURE');
  const publication = (await models().Stock.findById(stockId))!.get('publication');
  expect(publication.revision).toBe(1);
  expect(publication.publishedRevision).toBe(0);
  expect(publication.state).toBe('UNAVAILABLE');
  const next = await queued();
  expect(next.reserved.generation!.candidateRevision).toBe(2);
  expect(await models().DailyPrice.countDocuments({ datasetRevision: 1 })).toBe(3);
});
it('completes identical reimports with no new generation or price writes', async () => {
  await initial();
  const state = await queued();
  expect(state.reserved.generation!.candidateRevision).toBeNull();
  await ready(state);
  expect(await repo().publish(state.fence, policy)).toMatchObject({
    datasetRevision: 1,
    noop: true,
  });
  expect((await models().Stock.findById(stockId))!.get('publication.revision')).toBe(1);
  expect(await models().DailyPrice.countDocuments()).toBe(3);
});
it('publishes valid stale/raw/short data with warnings rather than screening eligibility', async () => {
  const state = await queued(dataRows.slice(0, 2));
  const assessment = await ready(state);
  expect(assessment.freshness).toBe('STALE');
  expect(assessment.warnings).toEqual(
    expect.arrayContaining(['STALE_DATA', 'RAW_ONLY', 'SHORT_HISTORY']),
  );
  await repo().publish(state.fence, policy);
  expect((await readPublishedPrices(fixture.connection, stockId))?.screeningEligible).toBe(false);
});
it('enforces immutable published model inserts, updates and deletes', async () => {
  await initial();
  const price = (await models().DailyPrice.findOne())!;
  await expect(price.save()).rejects.toThrow('append-only');
  await expect(
    models().DailyPrice.updateOne({ _id: price._id }, { $set: { revision: 8 } }),
  ).rejects.toThrow('audited');
  await expect(price.deleteOne()).rejects.toThrow('not deleted');
  await expect(
    fixture.connection.transaction((session) =>
      new (models().DailyPrice)({ ...price.toObject(), _id: undefined }).save({ session }),
    ),
  ).rejects.toThrow('immutable');
});
it('never falls back to candidates if the published generation is missing or inconsistent', async () => {
  await initial();
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  await built(state);
  fixture.assertOwned();
  await models().DailyPrice.collection.deleteOne({ datasetRevision: 1 });
  await expect(readPublishedPrices(fixture.connection, stockId)).rejects.toThrow(
    'PUBLICATION_INCONSISTENT',
  );
});
it('reports storage capacity without provisioning or pruning records', async () => {
  await initial();
  const before = await models().DailyPrice.countDocuments();
  const capacity = await repo().capacity(stockId);
  expect(capacity.retainedRecords).toBe(3);
  expect(capacity.retainedBytes).toBeGreaterThan(0);
  expect(capacity.generationRowLimit).toBe(20_000);
  expect(capacity.pruningAvailable).toBe(false);
  expect(await models().DailyPrice.countDocuments()).toBe(before);
});
it('a snapshot reader keeps the previous generation across concurrent publication', async () => {
  await initial();
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  await ready(state);
  await fixture.connection.transaction(
    async (session) => {
      const before = await readPublishedPrices(fixture.connection, stockId, session);
      await repo().publish(state.fence, policy);
      const after = await readPublishedPrices(fixture.connection, stockId, session);
      expect(after).toEqual(before);
      expect(after!.datasetRevision).toBe(1);
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
  expect((await readPublishedPrices(fixture.connection, stockId))!.datasetRevision).toBe(2);
});
it('rejects expired leases, cross-family fences and an old worker after actual takeover', async () => {
  const state = await queued();
  await ready(state);
  await expect(
    repo().publish({ ...state.fence, familyId: 'f'.repeat(24) }, policy),
  ).rejects.toThrow('STALE_FENCE');
  fixture.assertOwned();
  await models().ImportJob.collection.updateOne(
    { _id: new fixture.connection.base.Types.ObjectId(state.fence.jobId) },
    { $set: { leaseUntil: new Date(Date.now() - 1) } },
  );
  await expect(repo().publish(state.fence, policy)).rejects.toThrow('STALE_FENCE');
  await models().ImportJob.collection.updateOne(
    { _id: new fixture.connection.base.Types.ObjectId(state.fence.jobId) },
    {
      $set: {
        leaseUntil: new Date(Date.now() + 60_000),
        leaseOwner: 'replacement',
        leaseVersion: 2,
        attempts: 2,
      },
    },
  );
  await expect(repo().publish(state.fence, policy)).rejects.toThrow('STALE_FENCE');
  await repo().publish({ ...state.fence, leaseOwner: 'replacement', leaseVersion: 2 }, policy);
});
it('rejects missing correction audits without replacing published prices', async () => {
  await initial();
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  await built(state);
  fixture.assertOwned();
  await models().PriceRevision.collection.deleteMany({ datasetRevision: 2 });
  await expect(repo().assessCandidate(state.fence, policy)).rejects.toThrow('AUDIT_INCOMPLETE');
  expect((await readPublishedPrices(fixture.connection, stockId))!.datasetRevision).toBe(1);
});
it('allows one stock/session in different generations but rejects duplicates within a generation', async () => {
  await initial();
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  await built(state);
  const row = state.reserved.plan.rows[0]!;
  expect(await models().DailyPrice.countDocuments({ sessionDate: row.sessionDate })).toBe(2);
  await expect(
    fixture.connection.transaction((session) => new (models().DailyPrice)(row).save({ session })),
  ).rejects.toMatchObject({ code: 11000 });
});
it('refuses over-budget retained storage before reservation and rolls back the allocator', async () => {
  const collection = models().DailyPrice.collection;
  const cursor = collection.aggregate([]);
  vi.spyOn(cursor, 'next').mockResolvedValue({ bytes: 128 * 1024 * 1024, rows: 1 });
  vi.spyOn(collection, 'aggregate').mockReturnValueOnce(cursor);
  await expect(queued()).rejects.toThrow('STOCK_CAPACITY');
  expect((await models().Stock.findById(stockId))!.get('publication.revision')).toBe(0);
});
it('abandoning an update retains the old published pointer and advances the next allocation', async () => {
  await initial();
  const before = await readPublishedPrices(fixture.connection, stockId);
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const state = await queued([corrected]);
  await built(state);
  await repo().abandonCandidate(state.fence, 'SYNTHETIC_FAILURE');
  expect((await readPublishedPrices(fixture.connection, stockId))!.contentHash).toBe(
    before!.contentHash,
  );
  const publication = (await models().Stock.findById(stockId))!.get('publication');
  expect(publication.state).toBe('PUBLISHED');
  expect(publication.revision).toBe(2);
  expect(publication.publishedRevision).toBe(1);
  expect((await queued([corrected])).reserved.generation!.candidateRevision).toBe(3);
});
it('checks confirmed payload integrity again before assessment or publication', async () => {
  const state = await queued();
  await built(state);
  fixture.assertOwned();
  await models().ImportStaging.collection.updateOne(
    { kind: 'CHUNK' },
    { $set: { chunkHash: 'f'.repeat(64) } },
  );
  await expect(repo().assessCandidate(state.fence, policy)).rejects.toThrow('PAYLOAD_INTEGRITY');
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
});

import {
  runImportSlice,
  runnerConfig,
  createImportRunner,
} from '../../apps/api/src/modules/imports/runner.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  createImportRunnerRepository,
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
import { seedAuthorizationIdentity } from '../../apps/api/tests/authorization-fixture.js';

let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
let stockId: string, policy: MarketReferencePolicy, app: ReturnType<typeof createApp>;
const models = () => createMarketModels(fixture.connection);
const repo = () =>
  createImportRunnerRepository(
    fixture.connection,
    () => new Date(`${policy.calendars[0]!.to}T12:00:00.000Z`),
  );
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
    expectedCompletedSession: policy.calendars[0]!.to,
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
  expect(preview.body.data.blockingErrors).toEqual([]);
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
  return { jobId: String(confirmation.body.data.jobId), agent };
}
const config = { ...runnerConfig({}), enabled: true, chunkRows: 1 };
const dependencies = () => ({ repository: async () => repo(), policy: () => policy });
async function execute(jobId: string, repository = repo()) {
  let fence: GenerationFence | null = null;
  for (let step = 0; step < 100; step++) {
    const result = await runImportSlice(
      { repository: async () => repository, policy: () => policy },
      config,
      jobId,
      'runner-test',
      fence,
    );
    fence = result.fence;
    const state = await repo().view(jobId);
    if (['COMPLETED', 'FAILED', 'RETRY'].includes(state.job.status)) return state;
  }
  throw new Error('Synthetic execution did not finish');
}
async function claimAndBuild(jobId: string) {
  const repository = repo();
  const fence = (await repository.claim(jobId, 'crashing-worker', 60_000, 5))!;
  await repository.reserveCandidate(fence, policy, (await repository.view(jobId)).checkpoint);
  await repository.advance(fence, (await repository.view(jobId)).checkpoint, 'UPSERTING');
  return { repository, fence };
}
async function expire(jobId: string) {
  fixture.assertOwned();
  await models().ImportJob.collection.updateOne(
    { _id: new fixture.connection.base.Types.ObjectId(jobId) },
    { $set: { startedAt: new Date(Date.now() - 120_000), leaseUntil: new Date(Date.now() - 1) } },
  );
}
it('publishes exact prices, records quality and retires staging only after completion', async () => {
  const { jobId, agent } = await queued();
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
  const state = await execute(jobId);
  expect(state.job.status).toBe('COMPLETED');
  expect(state.job.counts).toEqual({ inserted: 3, updated: 0, unchanged: 0 });
  expect(state.job.execution?.retiredAt).toBeTruthy();
  expect(state.job.generation?.assessment?.screeningEligible).toBe(false);
  expect((await readPublishedPrices(fixture.connection, stockId))?.rows[0]?.raw?.open).toBe(
    dataRows[0]![1],
  );
  expect(await models().ImportStaging.countDocuments({ state: 'ATTACHED' })).toBe(0);
  expect(
    await models().ImportStaging.countDocuments({
      state: 'PURGEABLE',
      expiresAt: { $exists: true },
    }),
  ).toBeGreaterThan(0);
  const response = await agent.get(`/api/v1/imports/jobs/${jobId}`).expect(200);
  expect(response.body.data.recovery.payloadRetired).toBe(true);
  expect(response.body.data.quality.warnings).toContain('RAW_ONLY');
  expect(response.text).not.toMatch(
    /leaseOwner|leaseVersion|receipts|keyHash|tokenHash|password|contentHash|referenceApprovalHash|referenceDataHash/,
  );
});
it('preserves partial ranges, immutable correction audits and avoids generations for identical reimports', async () => {
  await execute((await queued()).jobId);
  const unchanged = await execute((await queued()).jobId);
  expect(unchanged.job.status).toBe('COMPLETED');
  expect(unchanged.job.generation?.candidateRevision).toBeNull();
  expect(await models().DailyPrice.countDocuments()).toBe(3);
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.40';
  const correctedState = await execute((await queued([corrected])).jobId);
  expect(correctedState.job.status).toBe('COMPLETED');
  const published = await readPublishedPrices(fixture.connection, stockId);
  expect(published?.rows).toHaveLength(3);
  expect(published?.rows[1]?.raw?.close).toBe('101.40');
  expect(await models().PriceRevision.countDocuments({ datasetRevision: 2 })).toBe(1);
  expect(await models().DailyPrice.countDocuments({ datasetRevision: 1 })).toBe(3);
});
it('recovers a crash after a committed chunk with takeover fencing and replay protection', async () => {
  const { jobId, agent } = await queued();
  const { repository, fence } = await claimAndBuild(jobId);
  const before = await repository.view(jobId);
  await repository.writeChunk(fence, before.checkpoint, policy, 1);
  await expect(repository.writeChunk(fence, before.checkpoint, policy, 1)).rejects.toThrow(
    'CHECKPOINT_CHANGED',
  );
  expect(await models().DailyPrice.countDocuments()).toBe(1);
  expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
  expect(
    await models().ImportStaging.countDocuments({
      state: 'ATTACHED',
      expiresAt: { $exists: true },
    }),
  ).toBe(0);
  await expire(jobId);
  expect(
    (await agent.get(`/api/v1/imports/jobs/${jobId}`).expect(200)).body.data.recovery.retryAllowed,
  ).toBe(true);
  const replacement = (await repository.claim(jobId, 'replacement', 60_000, 5))!;
  expect(replacement.leaseVersion).toBe(2);
  await expect(
    repository.writeChunk(fence, (await repository.view(jobId)).checkpoint, policy, 1),
  ).rejects.toThrow('STALE_FENCE');
  await repository.pause(replacement, 'TEST_RECOVERY', false, 5);
  const actor = await repository.operatorUser(jobId);
  await repository.requestRetry(actor, jobId, randomUUID(), 'Synthetic recovery');
  expect((await execute(jobId)).job.status).toBe('COMPLETED');
  expect(await models().DailyPrice.countDocuments()).toBe(3);
});
it('recovers immediately before publication and keeps old data visible until the atomic pointer switch', async () => {
  await execute((await queued()).jobId);
  const old = await readPublishedPrices(fixture.connection, stockId);
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.4';
  const { jobId } = await queued([corrected]);
  const { repository, fence } = await claimAndBuild(jobId);
  await repository.writeChunk(fence, (await repository.view(jobId)).checkpoint, policy, 100);
  await repository.assessCandidate(fence, policy);
  await repository.advance(fence, (await repository.view(jobId)).checkpoint, 'READY_TO_PUBLISH');
  expect((await readPublishedPrices(fixture.connection, stockId))?.contentHash).toBe(
    old?.contentHash,
  );
  await expire(jobId);
  expect((await execute(jobId)).job.status).toBe('COMPLETED');
  expect((await readPublishedPrices(fixture.connection, stockId))?.datasetRevision).toBe(2);
});
it('allows only one concurrent claimant and deduplicates explicit retry receipts', async () => {
  const { jobId } = await queued();
  const repository = repo();
  const claims = await Promise.all([
    repository.claim(jobId, 'one', 60_000, 5),
    repository.claim(jobId, 'two', 60_000, 5),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const fence = claims.find(Boolean)!;
  await repository.pause(fence, 'TEST_PAUSE', true, 5);
  const actor = await repository.operatorUser(jobId),
    key = randomUUID();
  const results = await Promise.all([
    repository.requestRetry(actor, jobId, key, 'Reviewed'),
    repository.requestRetry(actor, jobId, key, 'Reviewed'),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect((await repository.view(jobId)).job.execution?.receipts).toHaveLength(1);
  await expect(repository.requestRetry(actor, jobId, key, 'Different')).rejects.toThrow(
    'IDEMPOTENCY_CONFLICT',
  );
  expect((await execute(jobId)).job.status).toBe('COMPLETED');
});
it.each(['references', 'payload', 'candidate'])(
  'blocks publication after %s corruption and preserves private records',
  async (kind) => {
    const sentinels = ['portfolios', 'trades', 'positions', 'triggerStates'].map((name) =>
      fixture.connection.collection(name),
    );
    const before = [];
    for (const collection of sentinels) {
      await collection.insertOne({ owner: 'synthetic-private-sentinel', value: '123.45' });
      before.push(await collection.find({}).toArray());
    }
    const { jobId } = await queued();
    const { repository, fence } = await claimAndBuild(jobId);
    await repository.writeChunk(fence, (await repository.view(jobId)).checkpoint, policy, 100);
    fixture.assertOwned();
    if (kind === 'references') policy.stocks = [];
    if (kind === 'payload')
      await models().ImportStaging.collection.updateOne(
        { kind: 'CHUNK' },
        { $set: { chunkHash: 'f'.repeat(64) } },
      );
    if (kind === 'candidate')
      await models().DailyPrice.collection.deleteOne({ datasetRevision: 1 });
    const state = await runImportSlice(dependencies(), config, jobId, fence.leaseOwner, fence);
    expect(state.finished).toBe(true);
    expect((await repository.view(jobId)).job.status).toBe('FAILED');
    expect(await readPublishedPrices(fixture.connection, stockId)).toBeNull();
    for (const [index, collection] of sentinels.entries())
      expect(await collection.find({}).toArray()).toEqual(before[index]);
    expect(
      await models().ImportStaging.countDocuments({
        state: 'ATTACHED',
        expiresAt: { $exists: true },
      }),
    ).toBe(0);
  },
);
it('resolves a committed-but-unknown chunk from durable state without duplicating it', async () => {
  const { jobId } = await queued();
  const repository = repo();
  const original = repository.writeChunk;
  vi.spyOn(repository, 'writeChunk').mockImplementationOnce(async (...args) => {
    await original(...args);
    throw Object.assign(new Error('Synthetic uncertain commit'), {
      hasErrorLabel: (label: string) => label === 'UnknownTransactionCommitResult',
    });
  });
  let state = await runImportSlice(
    { repository: async () => repository, policy: () => policy },
    config,
    jobId,
    'runner-test',
  );
  expect(state.fence).not.toBeNull();
  state = await runImportSlice(
    { repository: async () => repository, policy: () => policy },
    config,
    jobId,
    'runner-test',
    state.fence,
  );
  expect(state.finished).toBe(true);
  expect(await models().DailyPrice.countDocuments()).toBe(3);
});
it('keeps automatic recovery bounded, supports shutdown and never starts work by default', async () => {
  const { jobId } = await queued();
  const repository = repo();
  const disabled = createImportRunner(
    { repository: async () => repository, policy: () => policy },
    runnerConfig({}),
  );
  disabled.kick(jobId);
  await disabled.start();
  await disabled.stop();
  expect((await repository.view(jobId)).job.status).toBe('QUEUED');
  const fence = (await repository.claim(jobId, 'stopping', 60_000, 0))!;
  await runImportSlice(
    dependencies(),
    { ...config, maxRecoveries: 0 },
    jobId,
    'stopping',
    fence,
    () => true,
  );
  expect((await repository.view(jobId)).job.errorCode).toBe('SHUTDOWN');
  expect(await repository.claim(jobId, 'exhausted', 60_000, 0)).toBeNull();
  expect((await repository.view(jobId)).job.execution?.mode).toBe('MANUAL');
});
it('imports five synthetic years in 100-row chunks and then adds one synthetic trading week', async () => {
  fixture.assertOwned();
  const start = Date.parse('2021-01-04'),
    end = Date.parse('2026-01-09');
  const days = Array.from({ length: (end - start) / 86400_000 + 1 }, (_, index) => {
    const date = new Date(start + index * 86400_000),
      open = ![0, 6].includes(date.getUTCDay());
    return {
      ...syntheticCalendar.days[0]!,
      sessionDate: date.toISOString().slice(0, 10),
      isOpen: open,
      sessionType: open ? ('REGULAR' as const) : ('CLOSED' as const),
      closeTimeLocal: open ? '15:30' : null,
    };
  });
  await models().TradingSession.collection.deleteMany({});
  for (let offset = 0; offset < days.length; offset += 100)
    await models().TradingSession.create(days.slice(offset, offset + 100));
  policy.calendars = [
    {
      ...policy.calendars[0]!,
      from: days[0]!.sessionDate,
      to: days.at(-1)!.sessionDate,
      fingerprint: marketFingerprint(days),
    },
  ];
  const dates = days.filter((day) => day.isOpen).map((day) => day.sessionDate);
  const rows = dates.map((date) => [date, ...dataRows[0]!.slice(1)]);
  const initial = await queued(rows.slice(0, -5));
  const repository = repo(),
    sizes: number[] = [];
  const insert = models().DailyPrice.collection.insertMany.bind(models().DailyPrice.collection);
  vi.spyOn(models().DailyPrice.collection, 'insertMany').mockImplementation((...args) => {
    sizes.push(args[0].length);
    return insert(...args);
  });
  let result = await runImportSlice(
    { repository: async () => repository, policy: () => policy },
    { ...config, chunkRows: 100 },
    initial.jobId,
    'five-year',
  );
  for (let slices = 0; !result.finished && slices < 20; slices++)
    result = await runImportSlice(
      { repository: async () => repository, policy: () => policy },
      { ...config, chunkRows: 100 },
      initial.jobId,
      'five-year',
      result.fence,
    );
  expect((await repository.view(initial.jobId)).job.status).toBe('COMPLETED');
  expect(sizes.length).toBeGreaterThan(10);
  expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
  expect((await readPublishedPrices(fixture.connection, stockId))?.rows).toHaveLength(
    rows.length - 5,
  );
  const increment = await queued(rows.slice(-5));
  let final = await runImportSlice(
    { repository: async () => repository, policy: () => policy },
    { ...config, chunkRows: 100 },
    increment.jobId,
    'weekly',
  );
  for (let slices = 0; !final.finished && slices < 20; slices++)
    final = await runImportSlice(
      { repository: async () => repository, policy: () => policy },
      { ...config, chunkRows: 100 },
      increment.jobId,
      'weekly',
      final.fence,
    );
  expect((await repository.view(increment.jobId)).job.counts.inserted).toBe(5);
  expect((await readPublishedPrices(fixture.connection, stockId))?.rows).toHaveLength(rows.length);
}, 180_000);
it('denies Member and cross-family retries with valid CSRF, rejects missing CSRF and accepts idempotent Admin retries', async () => {
  const { jobId } = await queued();
  const runner = createImportRunner(dependencies(), { ...config, enabled: true });
  // No scheduled kick is needed: exercise the production retry implementation and cancel its timer below.
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
      repository: async () => createMarketRepository(fixture.connection),
      policy: () => policy,
      runner,
    },
  );
  async function identity(role: 'MEMBER' | 'ADMIN') {
    const seeded = await seedAuthorizationIdentity(fixture, role),
      client = request.agent(app);
    const token = await csrf(client);
    await client
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({ email: seeded.user.emailNormalized, password: testCredentials.password })
      .expect(200);
    return client;
  }
  try {
    const member = await identity('MEMBER'),
      other = await identity('ADMIN');
    for (const [client, expected] of [
      [member, 403],
      [other, 404],
    ] as const) {
      const token = await csrf(client);
      await client
        .post(`/api/v1/imports/jobs/${jobId}/retry`)
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'Synthetic review' })
        .expect(expected);
    }
    const owner = request.agent(app);
    const ownerToken = await csrf(owner);
    await owner
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerToken)
      .send(testCredentials)
      .expect(200);
    await owner
      .post(`/api/v1/imports/jobs/${jobId}/retry`)
      .set('Origin', origin)
      .send({ reason: 'Review' })
      .expect(403);
    const key = randomUUID(),
      token = await csrf(owner);
    for (let repeat = 0; repeat < 2; repeat++)
      await owner
        .post(`/api/v1/imports/jobs/${jobId}/retry`)
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .set('Idempotency-Key', key)
        .send({ reason: 'Synthetic review' })
        .expect(202);
    await owner
      .post(`/api/v1/imports/jobs/${jobId}/retry`)
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .set('Idempotency-Key', key)
      .send({ reason: 'Different review' })
      .expect(409);
    expect((await repo().view(jobId)).job.execution?.receipts).toHaveLength(1);
  } finally {
    await runner.stop();
  }
});
it('rolls back prices, audits and checkpoints together when an audit write fails', async () => {
  await execute((await queued()).jobId);
  const corrected = [...dataRows[1]!];
  corrected[4] = '101.4';
  const { jobId } = await queued([corrected]);
  const { repository, fence } = await claimAndBuild(jobId);
  const before = await repository.view(jobId);
  vi.spyOn(models().PriceRevision.collection, 'insertMany').mockRejectedValueOnce(
    new Error('Synthetic audit failure'),
  );
  await expect(repository.writeChunk(fence, before.checkpoint, policy, 100)).rejects.toThrow(
    'Synthetic audit failure',
  );
  expect((await repository.view(jobId)).checkpoint).toBe(before.checkpoint);
  expect(await models().DailyPrice.countDocuments({ datasetRevision: 2 })).toBe(0);
  expect(await models().PriceRevision.countDocuments()).toBe(0);
  expect((await readPublishedPrices(fixture.connection, stockId))?.datasetRevision).toBe(1);
  await runImportSlice(dependencies(), config, jobId, fence.leaseOwner, fence);
  expect((await repository.view(jobId)).job.status).toBe('COMPLETED');
  expect(await models().PriceRevision.countDocuments()).toBe(1);
});
it('releases healthy slices without spending recovery budget or holding leases while other jobs run', async () => {
  const { jobId } = await queued(),
    repository = repo();
  const first = (await repository.claim(jobId, 'first-slice', 60_000, 0))!;
  await repository.pause(first, 'SLICE_YIELD', false, 0, (await repository.view(jobId)).checkpoint);
  expect(await repository.listRunnable()).toContain(jobId);
  const next = (await repository.claim(jobId, 'next-slice', 60_000, 0))!;
  expect(next.leaseVersion).toBe(2);
  expect((await repository.view(jobId)).job.execution?.autoRecoveries).toBe(0);
  expect(
    (await runImportSlice(dependencies(), config, jobId, next.leaseOwner, next)).finished,
  ).toBe(true);
});
it('resolves an uncertain publication commit as completed and retires staging idempotently', async () => {
  const { jobId } = await queued(),
    repository = repo(),
    publish = repository.publish;
  vi.spyOn(repository, 'publish').mockImplementationOnce(async (...args) => {
    await publish(...args);
    throw Object.assign(new Error('Synthetic lost publication acknowledgement'), {
      hasErrorLabel: (label: string) => label === 'UnknownTransactionCommitResult',
    });
  });
  expect((await execute(jobId, repository)).job.status).toBe('COMPLETED');
  await repository.retire(jobId);
  await repository.retire(jobId);
  expect(await models().DailyPrice.countDocuments()).toBe(3);
  expect((await readPublishedPrices(fixture.connection, stockId))?.datasetRevision).toBe(1);
  expect((await repository.view(jobId)).job.execution?.retiredAt).toBeTruthy();
});
it('publishes stale/raw/short data with truthful warnings and no screening eligibility', async () => {
  const state = await execute((await queued(dataRows.slice(0, 2))).jobId);
  expect(state.job.status).toBe('COMPLETED');
  expect(state.job.generation?.assessment).toMatchObject({
    freshness: 'STALE',
    screeningEligible: false,
  });
  expect(state.job.generation?.assessment?.warnings).toEqual(
    expect.arrayContaining(['STALE_DATA', 'RAW_ONLY', 'SHORT_HISTORY']),
  );
  expect(state.job.derivedStatus).toBe('DEFERRED');
});
it('upgrades only the recognized previous job validator through explicit preparation', async () => {
  fixture.assertOwned();
  const info = await fixture.connection
    .db!.listCollections({ name: 'importJobs' }, { nameOnly: false })
    .next();
  const prior = structuredClone(info!.options!.validator!);
  delete prior.$and[0].$jsonSchema.properties.execution;
  await fixture.connection.db!.command({ collMod: 'importJobs', validator: prior });
  await expect(verifyMarketStorage(fixture.connection)).rejects.toThrow('preparation');
  const dryRun = await prepareMarketStorage(fixture.connection);
  expect(dryRun.validatorsToInstall).toContain('importJobs');
  expect(
    (
      await fixture.connection
        .db!.listCollections({ name: 'importJobs' }, { nameOnly: false })
        .next()
    )?.options?.validator,
  ).toEqual(prior);
  await prepareMarketStorage(fixture.connection, true);
  await verifyMarketStorage(fixture.connection);
});
it('terminalizes an exhausted expired claim without stranding the stock or reusing its generation', async () => {
  const { jobId } = await queued(),
    { repository, fence } = await claimAndBuild(jobId);
  await expire(jobId);
  fixture.assertOwned();
  await models().ImportJob.collection.updateOne(
    { _id: new fixture.connection.base.Types.ObjectId(jobId) },
    { $set: { attempts: 100 } },
  );
  expect(await repository.claim(jobId, 'limit-cleanup', 60_000, 5)).toBeNull();
  expect((await repository.view(jobId)).job).toMatchObject({
    status: 'FAILED',
    errorCode: 'ATTEMPT_LIMIT',
  });
  expect((await models().Stock.findById(stockId))!.get('publication')).toMatchObject({
    activeJobId: null,
    revision: 1,
    publishedRevision: 0,
  });
  await expect(
    repository.writeChunk(fence, (await repository.view(jobId)).checkpoint, policy, 1),
  ).rejects.toThrow('STALE_FENCE');
  const next = await queued();
  expect((await execute(next.jobId)).job.generation?.candidateRevision).toBe(2);
});

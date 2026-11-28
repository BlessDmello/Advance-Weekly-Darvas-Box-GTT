import { randomUUID } from 'node:crypto';
import { insertSyntheticPrice } from '../support/market-storage-fixture.js';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMarketModels,
  createMarketRepository,
  marketFingerprint,
  stockReferenceFingerprint,
  prepareMarketStorage,
  verifyMarketStorage,
  toPublicUser,
} from '@darvas/database';
import type { MarketReferencePolicy, PublicUser } from '@darvas/contracts';
import { createApp } from '../../apps/api/src/app.js';
import { parseEnvironment } from '../../apps/api/src/config/env.js';
import { startAuthFixture } from '../support/mongo.js';
import { testCredentials } from '../support/credentials.js';
import { syntheticStock, unavailablePublication } from '../support/market-records.js';
import {
  csvFile,
  xlsxFile,
  dataRows,
  parseOptions,
  syntheticCalendar,
} from '../../apps/api/tests/parsing-fixtures.js';
import { seedAuthorizationIdentity } from '../../apps/api/tests/authorization-fixture.js';
import { hashToken } from '../../apps/api/src/modules/auth/tokens.js';

const origin = 'http://127.0.0.1:3000';
const environment = parseEnvironment({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: origin,
  CSRF_SECRET: 'm'.repeat(64),
});
let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
let app: ReturnType<typeof createApp>;
let policy: MarketReferencePolicy;
let stockId: string;
let stock: ReturnType<typeof syntheticStock>;
let administrator: PublicUser;
const models = () => createMarketModels(fixture.connection);
beforeAll(async () => {
  fixture = await startAuthFixture();
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  fixture.assertOwned();
  await prepareMarketStorage(fixture.connection, true);
  for (const model of Object.values(models())) await model.collection.deleteMany({});
  stock = { ...syntheticStock(), symbol: parseOptions.stock.symbol };
  const document = await models().Stock.create(stock);
  stockId = document.id;
  for (const day of syntheticCalendar.days) await models().TradingSession.create(day);
  policy = {
    stocks: [{ stockId, fingerprint: stockReferenceFingerprint(stock) }],
    calendars: [
      {
        ...{
          source: syntheticCalendar.source,
          version: syntheticCalendar.version,
          from: syntheticCalendar.from,
          to: syntheticCalendar.to,
        },
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
  administrator = toPublicUser(
    (
      await fixture.models.User.findOne({ emailNormalized: testCredentials.email }).orFail()
    ).toObject(),
  );
  app = createApp(environment, fixture.runtime, undefined, {
    repository: async () => {
      await verifyMarketStorage(fixture.connection);
      return createMarketRepository(fixture.connection);
    },
    policy: () => policy,
  });
});
type Agent = ReturnType<typeof request.agent>;
async function csrf(agent: Agent) {
  return String((await agent.get('/api/v1/auth/csrf').expect(200)).body.data.csrfToken);
}
async function login(email = testCredentials.email) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .send({ email, password: testCredentials.password })
    .expect(200);
  return agent;
}
async function preview(
  agent: Agent,
  input: Record<string, unknown> = {},
  file = csvFile(),
  withCsrf = true,
) {
  const values = {
    stockSymbol: stock.symbol,
    series: 'EQ',
    mapping: parseOptions.mapping,
    source: {
      provider: parseOptions.source.provider,
      reference: parseOptions.source.reference,
      adjustmentVersion: null,
    },
    adjustmentBasis: 'RAW',
    dateMode: 'ISO',
    requestedRange: parseOptions.requestedRange,
    minimumHistorySessions: 3,
    expectedCompletedSession: parseOptions.expectedCompletedSession,
    mode: 'INITIAL',
    ...input,
  };
  const token = withCsrf ? await csrf(agent) : null;
  let operation = agent.post('/api/v1/imports/preview').set('Origin', origin);
  if (token) operation = operation.set('X-CSRF-Token', token);
  for (const [name, value] of Object.entries(values))
    operation = operation.field(
      name,
      ['mapping', 'source', 'requestedRange', 'expectedCompletedSession'].includes(name)
        ? JSON.stringify(value)
        : String(value),
    );
  return operation.attach('file', Buffer.from(file.bytes), {
    filename: file.name,
    contentType: file.mimeType,
  });
}
async function commit(
  agent: Agent,
  token: string,
  key = randomUUID(),
  values: Record<string, unknown> = {},
) {
  const tokenValue = await csrf(agent);
  return agent
    .post('/api/v1/imports/commit')
    .set('Origin', origin)
    .set('X-CSRF-Token', tokenValue)
    .set('Idempotency-Key', key)
    .send({ previewToken: token, ...values });
}
async function validPreview(agent: Agent) {
  const result = await preview(agent);
  expect(result.status).toBe(200);
  expect(result.body.data.committable).toBe(true);
  return result.body.data as { previewToken: string };
}
async function assertNoExecution() {
  expect(await models().DailyPrice.countDocuments()).toBe(0);
  expect(await models().PriceRevision.countDocuments()).toBe(0);
  expect((await models().Stock.findById(stockId).orFail()).toObject().publication).toEqual(
    unavailablePublication(),
  );
}
describe('secure import preview/confirmation APIs', () => {
  it('denies anonymous and Member requests even with valid CSRF, before reading uploads', async () => {
    expect((await preview(request.agent(app))).status).toBe(401);
    const member = await seedAuthorizationIdentity(fixture, 'MEMBER', administrator.familyId);
    const agent = await login(member.user.emailNormalized);
    expect((await preview(agent)).status).toBe(403);
    expect((await commit(agent, 'a'.repeat(43))).status).toBe(403);
    await agent.get('/api/v1/imports/batches').expect(403);
    await agent.get(`/api/v1/imports/jobs/${'a'.repeat(24)}`).expect(403);
    expect(await models().ImportStaging.countDocuments()).toBe(0);
  });
  it.each(['CSV', 'XLSX'])(
    'creates a scoped %s preview using the real parser without returning its payload',
    async (format) => {
      const agent = await login();
      const result = await preview(agent, {}, format === 'CSV' ? csvFile() : xlsxFile());
      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({
        committable: true,
        fileFormat: format,
        rows: { read: 3, valid: 3, new: 3, changed: 0 },
      });
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body.data).not.toHaveProperty('records');
      expect(result.body.data).not.toHaveProperty('tokenHash');
      expect(result.body.data).not.toHaveProperty('stagingId');
      const manifest = await models()
        .ImportStaging.findOne({ kind: 'MANIFEST' })
        .select('+tokenHash')
        .orFail();
      expect(manifest.get('tokenHash')).toBe(hashToken(result.body.data.previewToken));
      expect(String(manifest.get('familyId'))).toBe(administrator.familyId);
      expect(String(manifest.get('uploadedBy'))).toBe(administrator.id);
      expect(manifest.get('rowCount')).toBe(3);
      expect(manifest.get('metadata.source.verification')).toBe('DECLARED');
      const chunk = await models().ImportStaging.findOne({ kind: 'CHUNK' }).orFail();
      expect(chunk.get('rows')?.[0]?.raw?.open.toString()).toBe(dataRows[0]?.[1]);
      await assertNoExecution();
    },
  );
  it('rejects missing CSRF and a foreign Origin on authenticated requests', async () => {
    const agent = await login();
    expect((await preview(agent, {}, csvFile(), false)).status).toBe(403);
    await agent
      .post('/api/v1/imports/commit')
      .set('Origin', 'https://foreign.invalid')
      .set('X-CSRF-Token', await csrf(agent))
      .set('Idempotency-Key', randomUUID())
      .send({ previewToken: 'a'.repeat(43) })
      .expect(403);
  });
  it('requires an existing stock master and never seeds a missing symbol', async () => {
    expect((await preview(await login(), { stockSymbol: 'UNKNOWN' })).status).toBe(422);
    expect(await models().Stock.countDocuments()).toBe(1);
    expect(await models().ImportStaging.countDocuments()).toBe(0);
  });
  it('blocks unapproved stock records and unavailable calendar coverage', async () => {
    policy.stocks = [];
    policy.calendars = [];
    const agent = await login();
    const result = await preview(agent);
    expect(result.status).toBe(200);
    expect(result.body.data.committable).toBe(false);
    expect(result.body.data.blockingErrors.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining(['STOCK_REFERENCE_UNAPPROVED', 'CALENDAR_UNAVAILABLE']),
    );
    expect((await commit(agent, result.body.data.previewToken)).status).toBe(422);
    expect(await models().ImportJob.countDocuments()).toBe(0);
  });
  it('blocks calendar fingerprints that no longer match operator-approved rows', async () => {
    policy.calendars[0]!.fingerprint = 'f'.repeat(64);
    const result = await preview(await login());
    expect(result.body.data.committable).toBe(false);
    expect(result.body.data.completeness.coverage).toBe('UNAVAILABLE');
  });
  it.each(['UNKNOWN', 'BOTH'])(
    'stages a non-committable %s-basis preview without invented counterpart prices',
    async (basis) => {
      const agent = await login();
      const result = await preview(agent, {
        adjustmentBasis: basis,
        source: {
          provider: parseOptions.source.provider,
          reference: parseOptions.source.reference,
          adjustmentVersion: basis === 'BOTH' ? 'test' : null,
        },
      });
      expect(result.status).toBe(200);
      expect(result.body.data.committable).toBe(false);
      expect((await commit(agent, result.body.data.previewToken)).status).toBe(422);
    },
  );
  it('does not trust client provenance verification or role/ownership fields', async () => {
    const agent = await login();
    expect(
      (await preview(agent, { source: { ...parseOptions.source, verification: 'VERIFIED' } }))
        .status,
    ).toBe(422);
    expect((await preview(agent, { role: 'ADMIN' })).status).toBe(422);
    expect((await preview(agent, { familyId: administrator.familyId })).status).toBe(422);
    expect((await preview(agent, { adjustmentBasis: 'ADJUSTED' })).status).toBe(422);
    policy.priceSources = [];
    const result = await preview(agent);
    expect(result.body.data.committable).toBe(false);
    expect(result.body.data.blockingErrors.map((entry: { code: string }) => entry.code)).toContain(
      'SOURCE_UNAPPROVED',
    );
  });
  it('returns malformed CSV errors as a blocked preview and rejects unsupported/oversized files', async () => {
    const agent = await login();
    const result = await preview(
      agent,
      {},
      { ...csvFile(), bytes: Buffer.from('Date,Open\n"unclosed') },
    );
    expect(result.status).toBe(200);
    expect(result.body.data.committable).toBe(false);
    expect((await preview(agent, {}, { ...csvFile(), name: 'bad.xls' })).status).toBe(415);
    expect(
      (await preview(agent, {}, { ...csvFile(), bytes: Buffer.alloc(3 * 1024 * 1024 + 1) })).status,
    ).toBe(413);
    await assertNoExecution();
  });
  it('preserves identical duplicate warnings without treating collapsed rows as invalid', async () => {
    const agent = await login();
    const result = await preview(agent, {}, csvFile([...dataRows, dataRows[0]!]));
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      committable: true,
      normalization: { original: 4, identicalDuplicates: 1 },
      rows: { read: 3, valid: 3, rejected: 0 },
    });
  });
  it('atomically queues and attaches all payloads without prices, revisions or publication', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const result = await commit(agent, previewToken);
    expect(result.status, JSON.stringify(result.body)).toBe(202);
    expect(result.body.data).toMatchObject({ status: 'QUEUED', executionAvailable: false });
    expect(await models().ImportBatch.countDocuments()).toBe(1);
    expect(await models().ImportJob.countDocuments()).toBe(1);
    for (const stage of await models().ImportStaging.find().lean()) {
      expect(stage.state).toBe('ATTACHED');
      expect(stage).not.toHaveProperty('expiresAt');
      expect(String(stage.jobId)).toBe(result.body.data.jobId);
    }
    const job = await agent.get(`/api/v1/imports/jobs/${result.body.data.jobId}`).expect(200);
    expect(job.body.data).toMatchObject({
      phase: 'QUEUED',
      processed: 0,
      derivedStatus: 'DEFERRED',
      executionAvailable: false,
    });
    const history = await agent.get('/api/v1/imports/batches?limit=1').expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).not.toHaveProperty('previewToken');
    expect(history.body.data[0]).not.toHaveProperty('requestHash');
    await assertNoExecution();
  });
  it('returns identical idempotent confirmations and rejects key reuse with a different payload', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const key = randomUUID();
    const first = await commit(agent, previewToken, key);
    const second = await commit(agent, previewToken, key);
    expect(second.status, JSON.stringify(second.body)).toBe(202);
    expect(second.body).toEqual(first.body);
    expect(
      (await commit(agent, previewToken, key, { correctionReason: 'Different request' })).status,
    ).toBe(409);
    expect((await commit(agent, previewToken)).status).toBe(409);
    expect(await models().ImportJob.countDocuments()).toBe(1);
  });
  it('arbitrates concurrent identical confirmations into exactly one batch and job', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const key = randomUUID();
    // Reuse one valid CSRF pair rather than rotating cookies during the race.
    const token = await csrf(agent);
    const send = () =>
      agent
        .post('/api/v1/imports/commit')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .set('Idempotency-Key', key)
        .send({ previewToken });
    const results = await Promise.all([send(), send(), send()]);
    expect(
      results.map((result) => result.status),
      JSON.stringify(results.map((r) => r.body)),
    ).toEqual([202, 202, 202]);
    expect(new Set(results.map((result) => result.body.data.jobId)).size).toBe(1);
    expect(await models().ImportBatch.countDocuments()).toBe(1);
    await assertNoExecution();
  });
  it('enforces stock exclusion across different previews and families', async () => {
    const first = await login();
    const a = await validPreview(first);
    const secondIdentity = await seedAuthorizationIdentity(fixture, 'ADMIN');
    const second = await login(secondIdentity.user.emailNormalized);
    const b = await validPreview(second);
    const results = await Promise.all([
      commit(first, a.previewToken),
      commit(second, b.previewToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(await models().ImportJob.countDocuments()).toBe(1);
    const winner = results.find((r) => r.status === 202)!;
    const loser = results[0]!.status === 202 ? second : first;
    await loser.get(`/api/v1/imports/jobs/${winner.body.data.jobId}`).expect(404);
    expect((await loser.get('/api/v1/imports/batches').expect(200)).body.data).toEqual([]);
  });
  it('denies preview consumption by another Admin in the same or a different family', async () => {
    const owner = await login();
    const { previewToken } = await validPreview(owner);
    for (const family of [administrator.familyId, undefined]) {
      const identity = await seedAuthorizationIdentity(fixture, 'ADMIN', family);
      expect((await commit(await login(identity.user.emailNormalized), previewToken)).status).toBe(
        404,
      );
    }
    expect(await models().ImportJob.countDocuments()).toBe(0);
  });
  it('rechecks logical expiry rather than relying on TTL deletion', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const expired = new Date(Date.now() - 1);
    await models().ImportStaging.collection.updateMany(
      { kind: 'MANIFEST' },
      { $set: { expiresAt: expired, 'metadata.expiresAt': expired } },
    );
    expect([404, 422]).toContain((await commit(agent, previewToken)).status);
    expect(await models().ImportJob.countDocuments()).toBe(0);
  });
  it('denies stale dataset revisions without creating a batch or job', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    await models().Stock.collection.updateOne(
      { _id: new fixture.connection.base.Types.ObjectId(stockId) },
      {
        $set: {
          publication: {
            state: 'PUBLISHED',
            revision: 1,
            publishedRevision: 1,
            activeJobId: null,
            asOfSession: '2026-01-03',
            sourceRevisionKey: 'a'.repeat(64),
            derivedStatus: 'DEFERRED',
          },
        },
      },
    );
    expect((await commit(agent, previewToken)).status).toBe(409);
    expect(await models().ImportBatch.countDocuments()).toBe(0);
  });
  it('rechecks operator approvals before confirmation', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    policy.priceSources = [];
    expect((await commit(agent, previewToken)).status).toBe(422);
    expect(await models().ImportJob.countDocuments()).toBe(0);
  });
  it('rejects a missing chunk and rolls back all confirmation writes', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    await models().ImportStaging.collection.deleteOne({ kind: 'CHUNK' });
    expect((await commit(agent, previewToken)).status).toBe(422);
    expect(await models().ImportBatch.countDocuments()).toBe(0);
    expect(await models().ImportJob.countDocuments()).toBe(0);
    expect((await models().ImportStaging.findOne({ kind: 'MANIFEST' }).orFail()).get('state')).toBe(
      'PREVIEW',
    );
    await assertNoExecution();
  });
  it('requires correction reasons while leaving existing historical prices and revisions untouched', async () => {
    const source = { ...parseOptions.source, verification: 'VERIFIED' as const };
    const price = {
      stockId,
      datasetRevision: 1,
      sessionDate: '2026-01-01',
      raw: { open: '100', high: '102', low: '99', close: '100' },
      adjusted: null,
      volume: '1000',
      provenance: source,
      qualityFlags: [],
      revision: 1,
      sourceImportBatchId: 'b'.repeat(24),
    };
    await models().Stock.collection.updateOne(
      { _id: new fixture.connection.base.Types.ObjectId(stockId) },
      {
        $set: {
          publication: {
            state: 'PUBLISHED',
            revision: 1,
            publishedRevision: 1,
            activeJobId: null,
            asOfSession: '2026-01-01',
            sourceRevisionKey: marketFingerprint([price]),
            derivedStatus: 'DEFERRED',
          },
        },
      },
    );
    await insertSyntheticPrice(fixture.connection, price);
    const agent = await login();
    const result = await preview(agent);
    expect(result.body.data.rows.changed).toBe(1);
    expect((await commit(agent, result.body.data.previewToken)).status).toBe(422);
    expect(
      (
        await commit(agent, result.body.data.previewToken, randomUUID(), {
          correctionReason: 'Synthetic correction review',
        })
      ).status,
    ).toBe(202);
    expect((await models().DailyPrice.findOne().orFail()).get('raw')?.close.toString()).toBe('100');
    expect(await models().PriceRevision.countDocuments()).toBe(0);
    expect((await models().Stock.findById(stockId).orFail()).get('publication.revision')).toBe(1);
  });
  it('keeps lookup shared, import history scoped, pagination bounded and all responses no-store', async () => {
    const admin = await login();
    const result = await admin.get('/api/v1/stocks?query=SYNTH&limit=1').expect(200);
    expect(result.body.data[0]).toMatchObject({ id: stockId, referenceApproved: true });
    expect(result.headers['cache-control']).toBe('no-store');
    await admin.get('/api/v1/stocks?limit=101').expect(422);
    await admin.get('/api/v1/imports/batches?cursor=invalid').expect(422);
    const member = await seedAuthorizationIdentity(fixture, 'MEMBER', administrator.familyId);
    await (await login(member.user.emailNormalized)).get('/api/v1/stocks').expect(200);
  });
  it('requires Idempotency-Key and rejects identity fields on confirmation', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    await agent
      .post('/api/v1/imports/commit')
      .set('Origin', origin)
      .set('X-CSRF-Token', await csrf(agent))
      .send({ previewToken })
      .expect(422);
    expect(
      (
        await commit(agent, previewToken, randomUUID(), {
          role: 'ADMIN',
          uploadedBy: administrator.id,
        })
      ).status,
    ).toBe(422);
  });
  it('leaves Login and health functional when market storage is missing, with no automatic DDL', async () => {
    fixture.assertOwned();
    await models().ImportStaging.collection.drop();
    const agent = await login();
    await agent.get('/api/v1/imports/batches').expect(503);
    await agent.get('/api/v1/auth/me').expect(200);
    await agent.get('/api/v1/health').expect(200);
    expect(await fixture.connection.db!.listCollections({ name: 'importStaging' }).hasNext()).toBe(
      false,
    );
  });
  it('rolls back the batch, job, stock fence and all TTL changes when late attachment fails', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const model = models().ImportStaging;
    const original = model.prototype.save;
    const fail = vi.spyOn(model.prototype, 'save').mockImplementation(function (
      this: { get(path: string): unknown },
      ...args: unknown[]
    ) {
      if (this.get('state') === 'ATTACHED' && this.get('kind') === 'CHUNK')
        throw new Error('Synthetic attachment failure');
      return Reflect.apply(original, this, args);
    });
    try {
      expect((await commit(agent, previewToken)).status).toBe(503);
    } finally {
      fail.mockRestore();
    }
    expect(await models().ImportBatch.countDocuments()).toBe(0);
    expect(await models().ImportJob.countDocuments()).toBe(0);
    expect((await models().Stock.findById(stockId).orFail()).get('__v')).toBe(0);
    for (const stage of await models().ImportStaging.find().lean()) {
      expect(stage.state).toBe('PREVIEW');
      expect(stage.expiresAt).toBeInstanceOf(Date);
    }
    expect((await commit(agent, previewToken)).status).toBe(202);
    await assertNoExecution();
  });
  it('denies concurrent confirmations of one preview under different keys', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const token = await csrf(agent);
    const send = () =>
      agent
        .post('/api/v1/imports/commit')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .set('Idempotency-Key', randomUUID())
        .send({ previewToken });
    const results = await Promise.all([send(), send()]);
    expect(results.map((result) => result.status).sort()).toEqual([202, 409]);
    expect(await models().ImportBatch.countDocuments()).toBe(1);
    expect(await models().ImportJob.countDocuments()).toBe(1);
  });
  it('rejects changed chunk hashes and legacy previews without a verification context', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    await models().ImportStaging.collection.updateOne(
      { kind: 'CHUNK' },
      { $set: { chunkHash: 'f'.repeat(64) } },
    );
    expect((await commit(agent, previewToken)).status).toBe(422);
    await models().ImportStaging.collection.updateOne(
      { kind: 'MANIFEST' },
      { $unset: { 'metadata.context': '' } },
    );
    expect((await commit(agent, previewToken)).status).toBe(422);
    expect(await models().ImportJob.countDocuments()).toBe(0);
  });
  it('revalidates the actual calendar records at confirmation', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    await models().TradingSession.collection.updateOne(
      { sessionDate: '2026-01-02' },
      { $set: { closeTimeLocal: '15:00' } },
    );
    expect((await commit(agent, previewToken)).status).toBe(422);
    expect(await models().ImportJob.countDocuments()).toBe(0);
  });
  it('fails closed when more than one approved calendar covers the request', async () => {
    policy.calendars.push({ ...policy.calendars[0]! });
    const result = await preview(await login());
    expect(result.body.data.committable).toBe(false);
  });
  it('rejects disabled users and logged-out sessions on confirmation', async () => {
    const agent = await login();
    const { previewToken } = await validPreview(agent);
    const token = await csrf(agent);
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .expect(204);
    expect((await commit(agent, previewToken)).status).toBe(401);
    const second = await seedAuthorizationIdentity(fixture, 'ADMIN', administrator.familyId);
    const disabled = await login(second.user.emailNormalized);
    await fixture.models.User.updateOne({ _id: second.user._id }, { status: 'DISABLED' });
    expect((await commit(disabled, previewToken)).status).toBe(401);
  });
  it('rejects multiple files, duplicate fields, malformed JSON and non-multipart requests', async () => {
    const agent = await login();
    let token = await csrf(agent);
    const result = await agent
      .post('/api/v1/imports/preview')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .attach('file', Buffer.from(csvFile().bytes), 'one.csv')
      .attach('file', Buffer.from(csvFile().bytes), 'two.csv');
    expect(result.status).toBe(413);
    token = await csrf(agent);
    expect(
      (
        await agent
          .post('/api/v1/imports/preview')
          .set('Origin', origin)
          .set('X-CSRF-Token', token)
          .field('stockSymbol', stock.symbol)
          .field('stockSymbol', stock.symbol)
          .attach('file', Buffer.from(csvFile().bytes), 'one.csv')
      ).status,
    ).toBe(400);
    expect((await preview(agent, { mapping: '{invalid' })).status).toBe(422);
    token = await csrf(agent);
    await agent
      .post('/api/v1/imports/preview')
      .set('Origin', origin)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(415);
    expect(await models().ImportStaging.countDocuments()).toBe(0);
  });
  it('accepts the inclusive 3 MiB transport boundary while still returning parser validation errors', async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024, ' ');
    const content = Buffer.concat([Buffer.from(csvFile().bytes), Buffer.from('\n')]);
    content.copy(bytes);
    const result = await preview(await login(), {}, { ...csvFile(), bytes });
    expect(result.status).toBe(200);
    expect(result.body.data.committable).toBe(false);
    expect(result.body.data.blockingErrors.map((entry: { code: string }) => entry.code)).toContain(
      'MALFORMED_CSV',
    );
  });
});

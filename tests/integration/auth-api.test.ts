import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { parseEnvironment } from '../../apps/api/src/config/env.js';
import { startAuthFixture } from '../support/mongo.js';
import { testCredentials } from '../support/credentials.js';
import { hashToken } from '../../apps/api/src/modules/auth/tokens.js';

const origin = 'http://127.0.0.1:3000';
let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
const environment = () =>
  parseEnvironment({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: origin,
    CSRF_SECRET: 'c'.repeat(64),
  });
beforeAll(async () => {
  fixture = await startAuthFixture();
});
beforeEach(async () => {
  fixture.assertOwned();
  await fixture.models.User.updateMany({}, { $set: { status: 'ACTIVE' } });
  await fixture.models.Family.updateMany({}, { $set: { status: 'ACTIVE' } });
  await fixture.models.Session.deleteMany({});
});
afterAll(async () => {
  await fixture?.close();
});
function client() {
  const app = createApp(environment(), fixture.runtime);
  return request.agent(app);
}
type Agent = ReturnType<typeof client>;
async function token(agent: Agent) {
  return String((await agent.get('/api/v1/auth/csrf').expect(200)).body.data.csrfToken);
}
async function login(agent: Agent, values: Record<string, unknown> = {}) {
  const csrf = await token(agent);
  return agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send({ ...testCredentials, ...values });
}
const cookies = (response: request.Response): string[] =>
  response.headers['set-cookie'] as unknown as string[];
const sessionToken = (response: request.Response) =>
  cookies(response)
    .find((cookie) => cookie.startsWith('adb_session='))!
    .split(';')[0]!
    .slice('adb_session='.length);

describe('real authentication HTTP API', () => {
  it('logs in the synthetic Admin, stores only its hash, returns the safe profile, and validates me', async () => {
    const agent = client();
    const result = await login(agent, { email: ' ADMIN@AUTH-FIXTURE.EXAMPLE ' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      data: { user: { email: testCredentials.email, role: 'ADMIN' } },
    });
    const raw = sessionToken(result);
    const stored = await fixture.models.Session.findOne().select('+sessionTokenHash').orFail();
    expect(stored.sessionTokenHash).toBe(hashToken(raw));
    expect(stored.sessionTokenHash).not.toBe(raw);
    expect(JSON.stringify(result.body)).not.toMatch(/password|token|Hash/);
    expect(result.headers['cache-control']).toBe('no-store');
    expect((await agent.get('/api/v1/auth/me').expect(200)).body).toEqual(result.body);
    const cookie = cookies(result).find((value) => value.startsWith('adb_session='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure|Domain|Max-Age/);
  });
  it.each([{ password: 'incorrect' }, { email: 'unknown@example.com' }])(
    'returns identical generic errors for invalid credentials %#',
    async (input) => {
      const result = await login(client(), input);
      expect(result.status).toBe(401);
      expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(result.body.error.message).toBe('Email or password is incorrect.');
      expect(await fixture.models.Session.countDocuments()).toBe(0);
    },
  );
  it.each(['User', 'Family'] as const)(
    'rejects disabled %s without account enumeration',
    async (model) => {
      if (model === 'User')
        await fixture.models.User.updateMany({}, { $set: { status: 'DISABLED' } });
      else await fixture.models.Family.updateMany({}, { $set: { status: 'DISABLED' } });
      const result = await login(client());
      expect(result.status).toBe(401);
      expect(result.body.error.message).toBe('Email or password is incorrect.');
    },
  );
  it.each(['expired', 'revoked', 'disabled-user', 'disabled-family'] as const)(
    'rejects %s sessions synchronously',
    async (state) => {
      const agent = client();
      expect((await login(agent)).status).toBe(200);
      if (state === 'expired')
        await fixture.models.Session.updateMany({}, { $set: { expiresAt: new Date(0) } });
      if (state === 'revoked')
        await fixture.models.Session.updateMany({}, { $set: { revokedAt: new Date() } });
      if (state === 'disabled-user')
        await fixture.models.User.updateMany({}, { $set: { status: 'DISABLED' } });
      if (state === 'disabled-family')
        await fixture.models.Family.updateMany({}, { $set: { status: 'DISABLED' } });
      const response = await agent.get('/api/v1/auth/me').expect(401);
      expect(cookies(response).join(';')).toContain('Expires=Thu, 01 Jan 1970');
    },
  );
  it('rejects missing and malformed session cookies', async () => {
    await client().get('/api/v1/auth/me').expect(401);
    await client().get('/api/v1/auth/me').set('Cookie', 'adb_session=not-a-token').expect(401);
  });
  it('revokes logout and rejects replay of the previously valid cookie', async () => {
    const agent = client();
    const signed = await login(agent);
    const raw = sessionToken(signed);
    const csrf = await token(agent);
    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(204);
    expect((await fixture.models.Session.findOne().orFail()).revokedAt).toBeInstanceOf(Date);
    await client().get('/api/v1/auth/me').set('Cookie', `adb_session=${raw}`).expect(401);
    await agent.get('/api/v1/auth/me').expect(401);
  });
  it('rotates an existing browser session on a new login', async () => {
    const agent = client();
    const first = await login(agent);
    const old = sessionToken(first);
    const second = await login(agent);
    expect(sessionToken(second)).not.toBe(old);
    await client().get('/api/v1/auth/me').set('Cookie', `adb_session=${old}`).expect(401);
    expect(await fixture.models.Session.countDocuments({ revokedAt: null })).toBe(1);
  });
  it('matches Remember Me cookie lifetime to the database absolute expiry', async () => {
    const result = await login(client(), { rememberMe: true });
    expect(cookies(result).join(';')).toContain('Max-Age=604800');
    const session = await fixture.models.Session.findOne().orFail();
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeGreaterThan(604_790_000);
  });
  it.each([
    'missing-origin',
    'foreign-origin',
    'null-origin',
    'missing-token',
    'tampered-token',
  ] as const)('rejects %s before credential work', async (mode) => {
    const agent = client();
    const csrf = await token(agent);
    const call = agent.post('/api/v1/auth/login').send(testCredentials);
    if (mode !== 'missing-origin')
      call.set(
        'Origin',
        mode === 'foreign-origin'
          ? 'https://attacker.example'
          : mode === 'null-origin'
            ? 'null'
            : origin,
      );
    if (mode !== 'missing-token')
      call.set('X-CSRF-Token', mode === 'tampered-token' ? 'invalid' : csrf);
    await call.expect(403);
    expect(await fixture.models.Session.countDocuments()).toBe(0);
  });
  it('rejects cross-browser token substitution, old pre-login tokens and unprotected logout', async () => {
    const one = client(),
      two = client();
    const old = await token(one);
    await token(two);
    await two
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', old)
      .send(testCredentials)
      .expect(403);
    await login(one);
    await one.post('/api/v1/auth/logout').set('Origin', origin).send({}).expect(403);
    await one
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', old)
      .send({})
      .expect(403);
    await one.get('/api/v1/auth/me').expect(200);
  });
  it('throttles repeated failed logins without creating a session', async () => {
    const agent = client();
    const csrf = await token(agent);
    for (let i = 0; i < 10; i++)
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({ ...testCredentials, password: 'wrong' })
        .expect(401);
    const blocked = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send(testCredentials)
      .expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(await fixture.models.Session.countDocuments()).toBe(0);
  });
  it('uses secure host-only production cookies and rejects missing production security config', async () => {
    const env = parseEnvironment({
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: 'https://private.example',
      CSRF_SECRET: 'p'.repeat(64),
    });
    const app = createApp(env, fixture.runtime);
    const csrf = await request(app).get('/api/v1/auth/csrf');
    const jar = cookies(csrf)
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const result = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://private.example')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .send(testCredentials)
      .expect(200);
    const session = cookies(result).find((value) => value.startsWith('__Host-adb_session='))!;
    expect(session).toMatch(/Secure/);
    expect(session).toMatch(/HttpOnly/);
    expect(session).not.toContain('Domain=');
    const unavailable = createApp(
      parseEnvironment({ NODE_ENV: 'production', LOG_LEVEL: 'silent' }),
      fixture.runtime,
    );
    await request(unavailable).get('/api/v1/auth/csrf').expect(503);
    await request(unavailable).get('/api/v1/health').expect(200);
  });
  it('validates Zod input without reflecting sensitive values', async () => {
    const result = await login(client(), {
      email: 'invalid',
      password: 'synthetic-private-canary',
    });
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).not.toContain('synthetic-private-canary');
  });
  it('sanitizes database errors and does not issue a session cookie on failure', async () => {
    const app = createApp(environment(), {
      repository: async () => {
        throw new Error('synthetic-private-db-canary');
      },
      close: async () => {},
    });
    const agent = request.agent(app);
    const result = await login(agent);
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain('synthetic-private-db-canary');
    expect(cookies(result)?.some((value) => value.startsWith('adb_session='))).not.toBe(true);
  });
});

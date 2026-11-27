import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authErrorSchema } from '@darvas/contracts';
import { createApp } from '../../apps/api/src/app.js';
import { parseEnvironment } from '../../apps/api/src/config/env.js';
import {
  createAuthorizationTestApp,
  seedAuthorizationIdentity,
} from '../../apps/api/tests/authorization-fixture.js';
import { createTokenMaterial } from '../../apps/api/src/modules/auth/tokens.js';
import { startAuthFixture } from '../support/mongo.js';
import { testCredentials } from '../support/credentials.js';

const origin = 'http://127.0.0.1:3000';
const environment = parseEnvironment({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: origin,
  CSRF_SECRET: 'a'.repeat(64),
});
let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
let harness: Awaited<ReturnType<typeof createAuthorizationTestApp>>;
beforeAll(async () => {
  fixture = await startAuthFixture();
  harness = await createAuthorizationTestApp(
    createApp(environment, fixture.runtime),
    environment,
    fixture,
  );
});
afterAll(async () => {
  await fixture?.close();
});
const path = '/api/v1/__test';

async function actor(role: 'ADMIN' | 'MEMBER', familyId?: string) {
  const identity = await seedAuthorizationIdentity(fixture, role, familyId);
  const agent = request.agent(harness.app);
  const csrf = (await agent.get('/api/v1/auth/csrf').expect(200)).body.data.csrfToken;
  const signed = await agent
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', String(csrf))
    .send({ email: identity.user.emailNormalized, password: testCredentials.password })
    .expect(200);
  const cookie = (signed.headers['set-cookie'] as unknown as string[])
    .find((value) => value.startsWith('adb_session='))!
    .split(';')[0]!;
  return { ...identity, agent, cookie };
}
function resource(user: { _id: { toHexString(): string }; familyId: { toHexString(): string } }) {
  const id = randomUUID();
  harness.resources.set(id, {
    ownerId: user._id.toHexString(),
    familyId: user.familyId.toHexString(),
    value: 'synthetic-private-resource',
  });
  return `${path}/resources/${id}`;
}
function error(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(authErrorSchema.parse(response.body).error.code).toBe(code);
  expect(response.body).not.toHaveProperty('data');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  expect(JSON.stringify(response.body)).not.toMatch(
    /synthetic-private-resource|passwordHash|sessionTokenHash/,
  );
}

describe('server-enforced authorization through direct Express requests', () => {
  it('rejects anonymous callers and forged identity fields without Next.js', async () => {
    for (const endpoint of ['identity', 'admin']) {
      const result = await request(harness.app)
        .get(`${path}/${endpoint}`)
        .set('X-User-Id', 'a'.repeat(24))
        .set('X-Role', 'ADMIN')
        .query({ role: 'ADMIN', familyId: 'b'.repeat(24) });
      error(result, 401, 'UNAUTHORIZED');
    }
  });
  it.each(['guard-only', 'spoof-locals'])(
    'denies %s without middleware-established identity',
    async (endpoint) => {
      error(await request(harness.app).get(`${path}/${endpoint}`), 401, 'UNAUTHORIZED');
    },
  );
  it('permits an active Admin and returns only the verified profile', async () => {
    const admin = await actor('ADMIN');
    await admin.agent.get(`${path}/admin`).expect(200);
    const result = await admin.agent.get(`${path}/identity`).expect(200);
    expect(result.body.data.user).toMatchObject({
      id: admin.user._id.toHexString(),
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|sessionTokenHash/);
  });
  it('permits an active Member but denies Admin operations despite body, query and header spoofing', async () => {
    const member = await actor('MEMBER');
    const admin = await actor('ADMIN');
    await member.agent.get(`${path}/identity`).expect(200);
    error(
      await member.agent
        .get(`${path}/admin`)
        .set('X-Role', 'ADMIN')
        .set('X-User-Id', admin.user._id.toHexString())
        .query({
          role: 'ADMIN',
          userId: admin.user._id.toHexString(),
          familyId: admin.family._id.toHexString(),
        })
        .send({
          role: 'ADMIN',
          userId: admin.user._id.toHexString(),
          familyId: admin.family._id.toHexString(),
        }),
      403,
      'FORBIDDEN',
    );
  });
  it('rejects client-submitted role escalation at the actual login boundary', async () => {
    const agent = request.agent(harness.app);
    const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
    error(
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-CSRF-Token', String(csrf))
        .send({
          ...testCredentials,
          role: 'ADMIN',
          userId: 'a'.repeat(24),
          familyId: 'b'.repeat(24),
        }),
      422,
      'VALIDATION_ERROR',
    );
  });
  it.each(['expired', 'revoked', 'disabled-user', 'disabled-family'] as const)(
    'denies an existing %s session',
    async (state) => {
      const member = await actor('MEMBER');
      fixture.assertOwned();
      if (state === 'expired')
        await fixture.models.Session.updateMany(
          { userId: member.user._id },
          { expiresAt: new Date(0) },
        );
      if (state === 'revoked')
        await fixture.models.Session.updateMany(
          { userId: member.user._id },
          { revokedAt: new Date() },
        );
      if (state === 'disabled-user')
        await fixture.models.User.updateOne({ _id: member.user._id }, { status: 'DISABLED' });
      if (state === 'disabled-family')
        await fixture.models.Family.updateOne({ _id: member.family._id }, { status: 'DISABLED' });
      error(await member.agent.get(`${path}/identity`), 401, 'UNAUTHORIZED');
    },
  );
  it('uses a changed database role immediately on an existing session', async () => {
    const admin = await actor('ADMIN');
    await admin.agent.get(`${path}/admin`).expect(200);
    fixture.assertOwned();
    await fixture.models.User.updateOne({ _id: admin.user._id }, { role: 'MEMBER' });
    error(await admin.agent.get(`${path}/admin`), 403, 'FORBIDDEN');
    expect((await admin.agent.get(`${path}/identity`)).body.data.user.role).toBe('MEMBER');
  });
  it.each(['ADMIN', 'MEMBER'] as const)(
    'denies %s access to another member in the same family',
    async (role) => {
      const one = await actor(role);
      const two = await seedAuthorizationIdentity(fixture, 'MEMBER', one.family._id.toHexString());
      const own = resource(one.user);
      await one.agent.get(own).expect(200);
      error(
        await one.agent.get(resource(two.user)).query({ ownerId: one.user._id.toHexString() }),
        404,
        'NOT_FOUND',
      );
      error(await one.agent.get(`${path}/resources/${randomUUID()}`), 404, 'NOT_FOUND');
    },
  );
  it('denies cross-family access even to an Admin and ignores forged ownership', async () => {
    const one = await actor('ADMIN'),
      two = await actor('MEMBER');
    error(
      await one.agent
        .get(resource(two.user))
        .set('X-Family-Id', two.family._id.toHexString())
        .query({ ownerId: two.user._id.toHexString(), familyId: two.family._id.toHexString() }),
      404,
      'NOT_FOUND',
    );
  });
  it('denies access after real logout, including replayed cookies', async () => {
    const member = await actor('MEMBER');
    const csrf = (await member.agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
    await member.agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', String(csrf))
      .send({})
      .expect(204);
    error(
      await request(harness.app).get(`${path}/identity`).set('Cookie', member.cookie),
      401,
      'UNAUTHORIZED',
    );
  });
  it('fails closed with a sanitized 503 when session storage fails outside /auth', async () => {
    const broken = {
      ...fixture,
      runtime: {
        repository: async () => {
          throw new Error('synthetic-db-private-canary');
        },
        close: async () => {},
      },
    };
    const { app } = await createAuthorizationTestApp(
      createApp(environment, broken.runtime),
      environment,
      broken,
    );
    const result = await request(app)
      .get(`${path}/identity`)
      .set('Cookie', `adb_session=${createTokenMaterial().token}`);
    error(result, 503, 'AUTH_UNAVAILABLE');
    expect(JSON.stringify(result.body)).not.toContain('synthetic-db-private-canary');
  });
  it('does not expose any test fixture routes on the production application factory', async () => {
    const app = createApp(environment, fixture.runtime);
    await request(app).post(`${path}/session`).send({ role: 'ADMIN' }).expect(404);
    await request(app).get(`${path}/admin`).expect(404);
  });
});

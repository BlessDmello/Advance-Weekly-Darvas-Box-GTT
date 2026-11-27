import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import { z } from 'zod';
import type { ApiEnvironment } from '../src/config/env.js';
import * as sourceGuards from '../src/middleware/auth.js';
import * as sourcePolicy from '../src/modules/auth/authorization.js';
import * as sourceErrors from '../src/middleware/error-handler.js';
import { authCookies } from '../src/modules/auth/cookies.js';
import { createTokenMaterial } from '../src/modules/auth/tokens.js';
import type { startAuthFixture } from '../../../tests/support/mongo.js';
import { testCredentials } from '../../../tests/support/credentials.js';

type Fixture = Awaited<ReturnType<typeof startAuthFixture>>;
const seedSchema = z
  .object({
    role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
    state: z
      .enum(['active', 'expired', 'revoked', 'disabled-user', 'disabled-family'])
      .default('active'),
  })
  .strict();

// Test-owned database only. Never import this file into application composition.
export async function seedAuthorizationIdentity(
  fixture: Fixture,
  role: 'ADMIN' | 'MEMBER',
  familyId?: string,
) {
  fixture.assertOwned();
  const credential = await fixture.models.User.findOne({ emailNormalized: testCredentials.email })
    .select('+passwordHash')
    .orFail();
  const userId = new fixture.models.User()._id;
  const family = familyId
    ? await fixture.models.Family.findById(familyId).orFail()
    : await fixture.models.Family.create({ name: 'Authorization fixture', createdBy: userId });
  const user = await fixture.models.User.create({
    _id: userId,
    familyId: family._id,
    emailNormalized: `authz-${randomUUID()}@example.com`,
    displayName: `Synthetic ${role === 'ADMIN' ? 'Admin' : 'Member'}`,
    role,
    status: 'ACTIVE',
    passwordHash: credential.passwordHash,
  });
  return { user, family };
}

export async function createAuthorizationTestApp(
  application: Express,
  environment: ApiEnvironment,
  fixture: Fixture,
  compiled = false,
) {
  fixture.assertOwned();
  const guards: typeof sourceGuards = compiled
    ? await import(new URL('../dist/middleware/auth.js', import.meta.url).href)
    : sourceGuards;
  const policy: typeof sourcePolicy = compiled
    ? await import(new URL('../dist/modules/auth/authorization.js', import.meta.url).href)
    : sourcePolicy;
  const errors: typeof sourceErrors = compiled
    ? await import(new URL('../dist/middleware/error-handler.js', import.meta.url).href)
    : sourceErrors;
  const app = express();
  // All fixture routes are composed outside createApp/server.ts and exist only in tests.
  app.use('/api/v1/__test', (_request, response, next) => {
    response.setHeader('x-request-id', randomUUID());
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  const router = express.Router();
  router.use(express.json({ limit: '32kb' }), cookieParser());
  const authenticated = guards.requireAuthenticated(environment, fixture.runtime);
  const resources = new Map<string, { ownerId: string; familyId: string; value: string }>();
  router.get('/identity', authenticated, guards.requireActiveAccount, (_request, response) => {
    response.json({ data: { user: guards.authenticatedUser(response) } });
  });
  router.get(
    '/admin',
    authenticated,
    guards.requireActiveAccount,
    guards.requireAdmin,
    (_request, response) => {
      response.json({ data: { allowed: true } });
    },
  );
  router.get('/guard-only', guards.requireAdmin, (_request, response) =>
    response.json({ data: {} }),
  );
  router.get(
    '/spoof-locals',
    (_request, response, next) => {
      response.locals.authUser = { role: 'ADMIN', status: 'ACTIVE' };
      next();
    },
    guards.requireAdmin,
    (_request, response) => response.json({ data: {} }),
  );
  router.get('/resources/:id', authenticated, guards.requireActiveAccount, (request, response) => {
    const resource = policy.authorizeOwnedResource(
      guards.authenticatedUser(response),
      resources.get(request.params.id as string) ?? null,
    );
    response.json({ data: { value: resource.value } });
  });
  // Each browser scenario gets its own identity and session; no shared account is disabled.
  // Cookies carry tokens; even this test fixture never puts session tokens in JSON.
  router.post('/session', async (request, response) => {
    const { role, state } = seedSchema.parse(request.body);
    const { user, family } = await seedAuthorizationIdentity(fixture, role);
    fixture.assertOwned();
    if (state === 'disabled-user')
      await fixture.models.User.updateOne({ _id: user._id }, { status: 'DISABLED' });
    if (state === 'disabled-family')
      await fixture.models.Family.updateOne({ _id: family._id }, { status: 'DISABLED' });
    const material = createTokenMaterial();
    await fixture.models.Session.create({
      userId: user._id,
      sessionTokenHash: material.hash,
      expiresAt: state === 'expired' ? new Date(0) : new Date(Date.now() + 10 * 60_000),
      ...(state === 'revoked' ? { revokedAt: new Date() } : {}),
    });
    const id = randomUUID();
    resources.set(id, {
      ownerId: user._id.toHexString(),
      familyId: family._id.toHexString(),
      value: 'synthetic-private-resource',
    });
    const cookies = authCookies(environment);
    response.cookie(cookies.names.session, material.token, cookies.options);
    response.json({ data: { resourceId: id } });
  });
  app.use('/api/v1/__test', router);
  app.use(application);
  app.use(errors.errorHandler);
  return { app, resources };
}

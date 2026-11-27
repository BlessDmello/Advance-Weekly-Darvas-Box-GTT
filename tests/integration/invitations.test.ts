import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createInvitationRepository,
  prepareInvitationStorage,
  verifyInvitationStorage,
  verifyAuthStorage,
  toPublicUser,
} from '@darvas/database';
import { createApp } from '../../apps/api/src/app.js';
import { parseEnvironment } from '../../apps/api/src/config/env.js';
import { hashToken } from '../../apps/api/src/modules/auth/tokens.js';
import { verifyPassword } from '../../apps/api/src/modules/auth/password.js';
import type {
  InvitationMail,
  InvitationSender,
} from '../../apps/api/src/modules/invitations/types.js';
import { seedAuthorizationIdentity } from '../../apps/api/tests/authorization-fixture.js';
import {
  createInvitationTestApp,
  invitationTestDependencies,
} from '../../apps/api/tests/invitation-fixture.js';
import { startAuthFixture } from '../support/mongo.js';
import { testCredentials } from '../support/credentials.js';

const origin = 'http://127.0.0.1:3000';
const environment = parseEnvironment({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: origin,
  CSRF_SECRET: 'i'.repeat(64),
});
let fixture: Awaited<ReturnType<typeof startAuthFixture>>;
let mails: InvitationMail[];
let delivery: 'ACCEPTED' | 'FAILED' | 'UNCONFIRMED';
let configured: boolean;
let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  fixture = await startAuthFixture();
});
beforeEach(() => {
  fixture.assertOwned();
  mails = [];
  delivery = 'ACCEPTED';
  configured = true;
  const sender: InvitationSender = {
    configured: () => configured,
    send: async (mail) => {
      mails.push(mail);
      return { delivery };
    },
  };
  app = createApp(environment, fixture.runtime, {
    repository: async () => createInvitationRepository(fixture.connection),
    sender,
  });
});
afterAll(async () => {
  await fixture?.close();
});
const email = () => `member-${randomUUID()}@example.com`;
type Agent = ReturnType<typeof request.agent>;
async function post(agent: Agent, path: string, body: object) {
  const csrf = (await agent.get('/api/v1/auth/csrf').expect(200)).body.data.csrfToken;
  return agent
    .post(`/api/v1${path}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', String(csrf))
    .send(body);
}
async function admin() {
  const agent = request.agent(app);
  expect((await post(agent, '/auth/login', testCredentials)).status).toBe(200);
  return agent;
}
async function issue(agent: Agent, target = email()) {
  const result = await post(agent, '/invitations', { email: target });
  expect(result.status).toBe(201);
  return { result, target, token: new URL(mails.at(-1)!.link).hash.slice(7) };
}
async function accept(token: string, values: Record<string, unknown> = {}) {
  return post(request.agent(app), '/invitations/accept', {
    token,
    password: testCredentials.password,
    displayName: 'New Member',
    ...values,
  });
}

describe('family invitation HTTP lifecycle', () => {
  it('protects in-memory mock email capture and keeps it out of production composition', async () => {
    app = createInvitationTestApp(
      createApp(environment, fixture.runtime, invitationTestDependencies(fixture)),
      fixture,
    );
    const actor = await admin();
    const issued = await post(actor, '/invitations', { email: email() });
    expect(issued.status).toBe(201);
    const path = `/api/v1/__test/invitations/${issued.body.data.invitationId}/email`;
    await request(app).get(path).expect(401);
    for (const role of ['MEMBER', 'ADMIN'] as const) {
      const identity = await seedAuthorizationIdentity(fixture, role);
      const agent = request.agent(app);
      expect(
        (
          await post(agent, '/auth/login', {
            email: identity.user.emailNormalized,
            password: testCredentials.password,
          })
        ).status,
      ).toBe(200);
      await agent.get(path).expect(role === 'MEMBER' ? 403 : 404);
    }
    const captured = await actor.get(path).expect(303);
    expect(captured.headers['cache-control']).toBe('no-store');
    expect(captured.headers['referrer-policy']).toBe('no-referrer');
    expect(captured.text).toBe('');
    const link = new URL(String(captured.headers.location));
    expect(link.origin).toBe(origin);
    expect(link.pathname).toBe('/accept-invitation');
    const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
    expect(JSON.stringify(issued.body)).not.toContain(token);
    const row = await fixture.models.Invitation.findById(issued.body.data.invitationId)
      .select('+tokenHash')
      .orFail();
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.status).toBe('PENDING');
    await actor.get(path).expect(404);
    await request(createApp(environment, fixture.runtime)).get(path).expect(404);
  });
  it('denies Member invitation creation with valid session-bound CSRF and no writes or email', async () => {
    const identity = await seedAuthorizationIdentity(fixture, 'MEMBER');
    const agent = request.agent(app);
    expect(
      (
        await post(agent, '/auth/login', {
          email: identity.user.emailNormalized,
          password: testCredentials.password,
        })
      ).status,
    ).toBe(200);
    const before = await fixture.models.Invitation.countDocuments();
    const result = await post(agent, '/invitations', { email: email() });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN');
    expect(await fixture.models.Invitation.countDocuments()).toBe(before);
    expect(mails).toEqual([]);
  });
  it('denies cross-family resend with valid CSRF without rotating the link or sending email', async () => {
    const { result, token } = await issue(await admin());
    const foreign = await seedAuthorizationIdentity(fixture, 'ADMIN');
    const agent = request.agent(app);
    expect(
      (
        await post(agent, '/auth/login', {
          email: foreign.user.emailNormalized,
          password: testCredentials.password,
        })
      ).status,
    ).toBe(200);
    const before = await fixture.models.Invitation.countDocuments();
    const denied = await post(agent, `/invitations/${result.body.data.invitationId}/resend`, {});
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe('NOT_FOUND');
    expect(await fixture.models.Invitation.countDocuments()).toBe(before);
    const row = await fixture.models.Invitation.findById(result.body.data.invitationId)
      .select('+tokenHash')
      .orFail();
    expect(row.status).toBe('PENDING');
    expect(row.replacedBy).toBeUndefined();
    expect(row.tokenHash).toBe(hashToken(token));
    expect(mails).toHaveLength(1);
    expect((await post(request.agent(app), '/invitations/verify', { token })).body.data.state).toBe(
      'VALID',
    );
  });
  it('arbitrates concurrent duplicate invitation creation at the database boundary', async () => {
    const agent = await admin(),
      target = email();
    const results = await Promise.all([
      post(agent, '/invitations', { email: target }),
      post(agent, '/invitations', { email: target }),
    ]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.every((result) => [201, 409, 429].includes(result.status))).toBe(true);
    expect(
      await fixture.models.Invitation.countDocuments({
        emailNormalized: target,
        status: 'PENDING',
      }),
    ).toBe(1);
    expect(mails).toHaveLength(1);
  });
  it('persists the three-send daily quota across fresh-token replacements', async () => {
    const agent = await admin();
    let current = (await issue(agent)).result.body.data.invitationId as string;
    for (let i = 0; i < 2; i++) {
      fixture.assertOwned();
      await fixture.models.Invitation.updateOne({ _id: current }, { nextSendAt: new Date(0) });
      const result = await post(agent, `/invitations/${current}/resend`, {});
      expect(result.status).toBe(201);
      current = result.body.data.invitationId;
    }
    await fixture.models.Invitation.updateOne({ _id: current }, { nextSendAt: new Date(0) });
    expect((await post(agent, `/invitations/${current}/resend`, {})).status).toBe(429);
    expect(mails).toHaveLength(3);
  });
  it.each(['resend', 'revoke'] as const)(
    'serializes acceptance racing with %s',
    async (operation) => {
      const agent = await admin();
      const { token, target, result } = await issue(agent);
      fixture.assertOwned();
      await fixture.models.Invitation.updateOne(
        { _id: result.body.data.invitationId },
        { nextSendAt: new Date(0) },
      );
      const [accepted, changed] = await Promise.all([
        accept(token),
        post(agent, `/invitations/${result.body.data.invitationId}/${operation}`, {}),
      ]);
      if (accepted.status === 201) expect(changed.status).toBe(409);
      else {
        expect(accepted.status).toBe(422);
        expect(changed.status).toBe(operation === 'resend' ? 201 : 204);
      }
      expect(await fixture.models.User.countDocuments({ emailNormalized: target })).toBe(
        accepted.status === 201 ? 1 : 0,
      );
    },
  );
  it('creates a 72-hour hash-only invitation; lists and verifies without consuming', async () => {
    const agent = await admin();
    const { result, token, target } = await issue(agent);
    const row = await fixture.models.Invitation.findById(result.body.data.invitationId)
      .select('+tokenHash')
      .orFail();
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(72 * 3600_000 - 1000);
    expect(row.purgeAt.getTime() - row.expiresAt.getTime()).toBe(90 * 86400_000);
    expect(JSON.stringify(result.body)).not.toContain(token);
    const checked = await post(request.agent(app), '/invitations/verify', { token });
    expect(checked.body.data).toMatchObject({
      state: 'VALID',
      email: target,
      familyName: 'Synthetic Test Family',
    });
    expect((await fixture.models.Invitation.findById(row._id))?.status).toBe('PENDING');
    const listed = await agent.get('/api/v1/invitations').expect(200);
    expect(
      listed.body.data.some(
        (item: { invitationId: string }) => item.invitationId === row._id.toHexString(),
      ),
    ).toBe(true);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(listed.body)).not.toMatch(/tokenHash|providerMessageId/);
  });
  it('atomically creates a verified Member with the invited family/email and no session', async () => {
    const actor = await admin();
    const familyId = (await actor.get('/api/v1/auth/me').expect(200)).body.data.user.familyId;
    const { token, target, result: issued } = await issue(actor);
    const invitation = await fixture.models.Invitation.findById(
      issued.body.data.invitationId,
    ).orFail();
    const result = await accept(token);
    expect(result.status).toBe(201);
    expect(String(result.headers['set-cookie'] ?? '')).not.toMatch(/adb_session=/);
    const user = await fixture.models.User.findById(result.body.data.userId)
      .select('+passwordHash')
      .orFail();
    expect(user.role).toBe('MEMBER');
    expect(user.familyId.toHexString()).toBe(familyId);
    expect(user.familyId.equals(invitation.familyId)).toBe(true);
    expect(user.emailNormalized).toBe(target);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyPassword(user.passwordHash, testCredentials.password)).toBe(true);
    expect((await fixture.models.Invitation.findOne({ consumedBy: user._id }))?.status).toBe(
      'CONSUMED',
    );
    expect((await accept(token)).status).toBe(422);
    expect((await post(request.agent(app), '/invitations/verify', { token })).body.data).toEqual({
      state: 'CONSUMED',
    });
    const member = request.agent(app);
    expect(
      (
        await post(member, '/auth/login', {
          email: target,
          password: testCredentials.password,
        })
      ).status,
    ).toBe(200);
    expect((await member.get('/api/v1/auth/me').expect(200)).body.data.user).toMatchObject({
      id: user._id.toHexString(),
      familyId,
      role: 'MEMBER',
      email: target,
    });
  });
  it.each([
    'expired',
    'revoked',
    'disabled-family',
    'disabled-inviter',
    'demoted-inviter',
  ] as const)('denies %s links without creating an account', async (state) => {
    // A dedicated issuing Admin prevents one test from disabling another test's actor.
    const identity = await seedAuthorizationIdentity(fixture, 'ADMIN');
    const actor = toPublicUser(identity.user);
    const token = randomUUID().replaceAll('-', '') + 'a'.repeat(11);
    const repo = createInvitationRepository(fixture.connection);
    const invite = await repo.issue(actor, email(), hashToken(token));
    fixture.assertOwned();
    if (state === 'expired')
      await fixture.models.Invitation.updateOne(
        { _id: invite.invitationId },
        { expiresAt: new Date(0) },
      );
    if (state === 'revoked') await repo.revoke(actor, invite.invitationId);
    if (state === 'disabled-family')
      await fixture.models.Family.updateOne({ _id: actor.familyId }, { status: 'DISABLED' });
    if (state === 'disabled-inviter')
      await fixture.models.User.updateOne({ _id: actor.id }, { status: 'DISABLED' });
    if (state === 'demoted-inviter')
      await fixture.models.User.updateOne({ _id: actor.id }, { role: 'MEMBER' });
    const before = await fixture.models.User.countDocuments();
    const result = await accept(token);
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('INVITATION_INVALID');
    expect(await fixture.models.User.countDocuments()).toBe(before);
  });
  it('permits exactly one concurrent acceptance', async () => {
    const { token, target } = await issue(await admin());
    const results = await Promise.all([accept(token), accept(token)]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 422]);
    expect(await fixture.models.User.countDocuments({ emailNormalized: target })).toBe(1);
  });
  it('rolls back consumption if a duplicate account already exists', async () => {
    const agent = await admin();
    const { token, result, target } = await issue(agent);
    const original = await fixture.models.User.findOne({ emailNormalized: testCredentials.email })
      .select('+passwordHash')
      .orFail();
    await fixture.models.User.create({
      familyId: original.familyId,
      emailNormalized: target,
      displayName: 'Existing',
      role: 'MEMBER',
      status: 'ACTIVE',
      passwordHash: original.passwordHash,
    });
    expect((await accept(token)).status).toBe(422);
    expect((await fixture.models.Invitation.findById(result.body.data.invitationId))?.status).toBe(
      'PENDING',
    );
  });
  it('rejects privilege, email and family substitution, bad passwords, and invalid tokens', async () => {
    const { token } = await issue(await admin());
    for (const extra of [
      { role: 'ADMIN' },
      { familyId: 'a'.repeat(24) },
      { email: email() },
      { password: 'short' },
    ])
      expect((await accept(token, extra)).status).toBe(422);
    expect((await accept('invalid')).status).toBe(422);
    expect((await accept('a'.repeat(43))).status).toBe(422);
  });
  it('requires an anonymous browser to accept and preserves its existing session', async () => {
    const agent = await admin();
    const { token } = await issue(agent);
    expect(
      (
        await post(agent, '/invitations/accept', {
          token,
          displayName: 'Name',
          password: testCredentials.password,
        })
      ).status,
    ).toBe(409);
    await agent.get('/api/v1/auth/me').expect(200);
  });
  it('denies anonymous/Member calls, CSRF bypass and cross-family invitation IDs', async () => {
    await request(app).get('/api/v1/invitations').expect(401);
    const agent = await admin();
    const { result } = await issue(agent);
    await agent.post('/api/v1/invitations').send({ email: email() }).expect(403);
    const member = await seedAuthorizationIdentity(fixture, 'MEMBER');
    const other = await seedAuthorizationIdentity(fixture, 'ADMIN');
    for (const identity of [member, other]) {
      const client = request.agent(app);
      expect(
        (
          await post(client, '/auth/login', {
            email: identity.user.emailNormalized,
            password: testCredentials.password,
          })
        ).status,
      ).toBe(200);
      const denied = await post(client, `/invitations/${result.body.data.invitationId}/revoke`, {});
      expect(denied.status).toBe(identity.user.role === 'MEMBER' ? 403 : 404);
      const list = await client.get('/api/v1/invitations');
      expect(list.status).toBe(identity.user.role === 'MEMBER' ? 403 : 200);
      if (identity.user.role === 'ADMIN') expect(list.body.data).toEqual([]);
    }
  });
  it('handles duplicate creation, resend cooldown, rotation, revocation and retained history', async () => {
    const agent = await admin();
    const { token, target, result } = await issue(agent);
    expect([409, 429]).toContain(
      (await post(agent, '/invitations', { email: target.toUpperCase() })).status,
    );
    const path = `/invitations/${result.body.data.invitationId}`;
    expect((await post(agent, `${path}/resend`, {})).status).toBe(429);
    await fixture.models.Invitation.updateOne(
      { _id: result.body.data.invitationId },
      { nextSendAt: new Date(0) },
    );
    const fresh = await post(agent, `${path}/resend`, {});
    expect(fresh.status).toBe(201);
    expect((await accept(token)).status).toBe(422);
    const newToken = new URL(mails.at(-1)!.link).hash.slice(7);
    expect(newToken).not.toBe(token);
    expect(
      (await post(agent, `/invitations/${fresh.body.data.invitationId}/revoke`, {})).status,
    ).toBe(204);
    expect((await accept(newToken)).status).toBe(422);
    expect((await fixture.models.Invitation.findById(result.body.data.invitationId))?.status).toBe(
      'REVOKED',
    );
  });
  it.each(['FAILED', 'UNCONFIRMED'] as const)(
    'records %s delivery honestly and does not lose the invitation',
    async (state) => {
      delivery = state;
      const { result } = await issue(await admin());
      expect(result.body.data.delivery).toBe(state);
      expect(
        (await fixture.models.Invitation.findById(result.body.data.invitationId))?.delivery,
      ).toBe(state);
    },
  );
  it('fails safely before database writes when email configuration is absent', async () => {
    configured = false;
    const before = await fixture.models.Invitation.countDocuments();
    const result = await post(await admin(), '/invitations', { email: email() });
    expect(result.status).toBe(503);
    expect(await fixture.models.Invitation.countDocuments()).toBe(before);
    expect(mails).toEqual([]);
  });
  it('explicitly migrates a legacy TTL without breaking login readiness or dropping unrelated indexes', async () => {
    fixture.assertOwned();
    await fixture.models.Invitation.collection.createIndex(
      { expiresAt: 1 },
      { name: 'invitation_expiry', expireAfterSeconds: 0 },
    );
    await expect(verifyAuthStorage(fixture.connection)).resolves.toBeUndefined();
    await expect(verifyInvitationStorage(fixture.connection)).rejects.toThrow('Legacy');
    expect((await prepareInvitationStorage(fixture.connection)).legacyExpiryIndex).toBe(true);
    const sample = await fixture.models.Invitation.findOne({
      expiresAt: { $gt: new Date() },
    }).orFail();
    await fixture.models.Invitation.collection.updateOne(
      { _id: sample._id },
      { $unset: { purgeAt: '' } },
    );
    await prepareInvitationStorage(fixture.connection, true);
    const backfilled = await fixture.models.Invitation.findById(sample._id).orFail();
    expect(backfilled.purgeAt.getTime() - backfilled.expiresAt.getTime()).toBe(90 * 86400_000);
    await expect(verifyInvitationStorage(fixture.connection)).resolves.toBeUndefined();
    expect(
      (await fixture.models.Invitation.listIndexes()).some(
        (index) => index.name === 'unique_invitation_token',
      ),
    ).toBe(true);
  });
  it('keeps provider/storage exception details out of invitation errors', async () => {
    const broken = createApp(environment, fixture.runtime, {
      repository: async () => {
        throw new Error('private-db-canary');
      },
      sender: { configured: () => true, send: async () => ({ delivery: 'ACCEPTED' }) },
    });
    const agent = request.agent(broken);
    expect((await post(agent, '/auth/login', testCredentials)).status).toBe(200);
    const result = await post(agent, '/invitations', { email: email() });
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain('private-db-canary');
    expect(result.headers['cache-control']).toBe('no-store');
  });
});

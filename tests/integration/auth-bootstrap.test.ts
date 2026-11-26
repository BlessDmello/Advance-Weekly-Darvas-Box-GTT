import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import {
  BootstrapError,
  connectDatabase,
  createAuthModels,
  createInitialAdmin,
  disconnectDatabase,
  isInvitationValid,
  isSessionValid,
  prepareAuthStorage,
  toPublicUser,
} from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import { bootstrapAdmin } from '../../apps/api/src/modules/auth/bootstrap-admin.js';
import { hashPassword, verifyPassword } from '../../apps/api/src/modules/auth/password.js';
import { createTokenMaterial } from '../../apps/api/src/modules/auth/tokens.js';

// Never read process.env MongoDB settings or load application environment files.
const databaseName = `advanced_darvas_test_${randomUUID().replaceAll('-', '')}`;
let replicaSet: MongoMemoryReplSet | undefined;
let connection: DatabaseConnection | undefined;
let passwordHash: string;
function ownedConnection(): DatabaseConnection {
  if (
    !connection ||
    connection.name !== databaseName ||
    !/^advanced_darvas_test_[a-f\d]{32}$/.test(connection.name) ||
    !['127.0.0.1', 'localhost'].includes(connection.host)
  )
    throw new Error('Refusing access outside the disposable test database.');
  return connection;
}
const models = () => createAuthModels(ownedConnection());
const initial = () => ({
  workspaceName: 'Synthetic Family',
  email: 'initial@example.com',
  displayName: 'Synthetic Admin',
  passwordHash,
});
beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: {
      version: '8.2.6',
      checkMD5: true,
      downloadDir: fileURLToPath(
        new URL('../../node_modules/.cache/mongodb-binaries/', import.meta.url),
      ),
    },
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
  const uri = replicaSet.getUri(databaseName);
  if (new URL(uri).hostname !== '127.0.0.1')
    throw new Error('Expected a loopback-only MongoDB test instance.');
  connection = await connectDatabase({ uri, databaseName });
  passwordHash = await hashPassword('synthetic integration passphrase');
});
beforeEach(async () => {
  const { Family, User, Session, Invitation } = models();
  // The guard above is mandatory before any cleanup, and the server is test-owned.
  await Family.deleteMany({});
  await User.deleteMany({});
  await Session.deleteMany({});
  await Invitation.deleteMany({});
  await prepareAuthStorage(ownedConnection());
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  try {
    if (connection) await disconnectDatabase(ownedConnection());
  } finally {
    await replicaSet?.stop();
  }
});

describe('real MongoDB identity constraints and atomic bootstrap', () => {
  it('creates linked active Family/Admin records with a real Argon2id hash, without verifying email or issuing a session', async () => {
    await bootstrapAdmin(ownedConnection(), {
      workspaceName: ' Synthetic Family ',
      email: ' INITIAL@Example.COM ',
      displayName: ' Synthetic Admin ',
      password: 'synthetic integration passphrase',
      confirmPassword: 'synthetic integration passphrase',
    });
    const { Family, User, Session, Invitation } = models();
    const family = await Family.findOne().orFail();
    const user = await User.findOne().select('+passwordHash').orFail();
    expect(user.familyId.equals(family._id)).toBe(true);
    expect(family.createdBy.equals(user._id)).toBe(true);
    expect(user).toMatchObject({
      role: 'ADMIN',
      status: 'ACTIVE',
      emailNormalized: 'initial@example.com',
      displayName: 'Synthetic Admin',
    });
    expect(user.emailVerifiedAt).toBeUndefined();
    expect(await verifyPassword(user.passwordHash, 'synthetic integration passphrase')).toBe(true);
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    expect(toPublicUser(user)).not.toHaveProperty('passwordHash');
    expect(await Session.countDocuments()).toBe(0);
    expect(await Invitation.countDocuments()).toBe(0);
    expect(await User.findOne().lean()).not.toHaveProperty('passwordHash');
    expect(await User.findOne().select('+passwordHash').lean()).toHaveProperty('passwordHash');
    // DTO allowlisting still protects explicitly selected lean records.
    expect(
      toPublicUser(await User.findOne().select('+passwordHash').lean().orFail()),
    ).not.toHaveProperty('passwordHash');
  });
  it('rejects repeated bootstrap, even if the original Admin is disabled', async () => {
    await createInitialAdmin(ownedConnection(), initial());
    await models().User.updateOne({}, { $set: { status: 'DISABLED' } });
    await expect(
      createInitialAdmin(ownedConnection(), { ...initial(), email: 'another@example.com' }),
    ).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
    expect(await models().Family.countDocuments()).toBe(1);
    expect(await models().User.countDocuments()).toBe(1);
  });
  it('allows exactly one of concurrent bootstrap attempts with different emails', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        createInitialAdmin(ownedConnection(), {
          ...initial(),
          email: `concurrent${i}@example.com`,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(3);
    expect(await models().Family.countDocuments()).toBe(1);
    expect(await models().User.countDocuments()).toBe(1);
    const family = await models().Family.findOne().orFail();
    const user = await models().User.findOne().orFail();
    expect(family.createdBy.equals(user._id) && user.familyId.equals(family._id)).toBe(true);
  });
  it('rolls back a Family insert when the User insert fails and allows safe retry', async () => {
    vi.spyOn(models().User, 'create').mockRejectedValueOnce(
      new Error('synthetic-sensitive-driver-canary'),
    );
    await expect(createInitialAdmin(ownedConnection(), initial())).rejects.toMatchObject({
      code: 'BOOTSTRAP_FAILED',
    });
    expect(await models().Family.countDocuments()).toBe(0);
    expect(await models().User.countDocuments()).toBe(0);
    await createInitialAdmin(ownedConnection(), initial());
    expect(await models().User.countDocuments()).toBe(1);
  });
  it('rejects an invalid record after the Family write without leaving partial initialization', async () => {
    await expect(
      createInitialAdmin(ownedConnection(), { ...initial(), passwordHash: 'plaintext' }),
    ).rejects.toBeInstanceOf(BootstrapError);
    expect(await models().Family.countDocuments()).toBe(0);
    expect(await models().User.countDocuments()).toBe(0);
  });
  it('refuses bootstrap if the required unique index is missing', async () => {
    await models().Family.collection.dropIndex('one_initial_bootstrap');
    await expect(createInitialAdmin(ownedConnection(), initial())).rejects.toMatchObject({
      code: 'BOOTSTRAP_FAILED',
    });
    expect(await models().User.countDocuments()).toBe(0);
  });
  it('enforces normalized email uniqueness globally across families', async () => {
    await createInitialAdmin(ownedConnection(), initial());
    const { User, Family } = models();
    const admin = await User.findOne().orFail();
    const other = await Family.create({ name: 'Another Family', createdBy: admin._id });
    await expect(
      User.create({
        familyId: other._id,
        emailNormalized: ' INITIAL@EXAMPLE.COM ',
        displayName: 'Duplicate',
        passwordHash,
        role: 'MEMBER',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
  it('enforces session/invitation token uniqueness and synchronous invalidation before TTL cleanup', async () => {
    await createInitialAdmin(ownedConnection(), initial());
    const { User, Session, Invitation } = models();
    const admin = await User.findOne().orFail();
    const future = new Date(Date.now() + 60_000);
    const sessionHash = createTokenMaterial().hash;
    const session = await Session.create({
      userId: admin._id,
      sessionTokenHash: sessionHash,
      expiresAt: future,
    });
    await expect(
      Session.create({ userId: admin._id, sessionTokenHash: sessionHash, expiresAt: future }),
    ).rejects.toMatchObject({ code: 11000 });
    session.revokedAt = new Date();
    await session.save();
    expect(isSessionValid(session)).toBe(false);
    expect(isSessionValid(session, future)).toBe(false);
    expect(await Session.findById(session._id).lean()).not.toHaveProperty('sessionTokenHash');
    const invitationHash = createTokenMaterial().hash;
    const invite = {
      familyId: admin.familyId,
      invitedBy: admin._id,
      emailNormalized: 'guest@example.com',
      tokenHash: invitationHash,
      expiresAt: future,
    };
    const invitation = await Invitation.create(invite);
    await expect(Invitation.create(invite)).rejects.toMatchObject({ code: 11000 });
    expect(isInvitationValid(invitation, future)).toBe(false);
    invitation.status = 'CONSUMED';
    invitation.consumedAt = new Date();
    invitation.consumedBy = admin._id;
    await invitation.save();
    expect(isInvitationValid(invitation)).toBe(false);
    expect(await Invitation.findById(invitation._id).lean()).not.toHaveProperty('tokenHash');
    for (const model of [Session, Invitation]) {
      expect(await model.listIndexes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
        ]),
      );
    }
  });
});

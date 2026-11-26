import { afterAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createAuthModels, toPublicUser } from './index.js';

const connection = mongoose.createConnection();
const models = createAuthModels(connection);
const id = () => new mongoose.Types.ObjectId();
const hash =
  '$argon2id$v=19$m=65536,t=3,p=1$YWJjZGVmZ2hpamtsbW5vcA$YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo';
const user = () =>
  new models.User({
    familyId: id(),
    emailNormalized: ' MEMBER@Example.COM ',
    displayName: ' Member ',
    passwordHash: hash,
    role: 'MEMBER',
  });
afterAll(async () => connection.close());

describe('connection-scoped auth models', () => {
  it('registers the same models without a database connection or automatic DDL', () => {
    expect(createAuthModels(connection).User).toBe(models.User);
    expect(connection.readyState).toBe(0);
    for (const model of Object.values(models)) {
      expect(model.schema.options.autoCreate).toBe(false);
      expect(model.schema.options.autoIndex).toBe(false);
      expect(model.schema.options.strict).toBe('throw');
    }
  });
  it('normalizes email and names; excludes even explicitly loaded password hashes from serialization', async () => {
    const document = user();
    await document.validate();
    expect(document.emailNormalized).toBe('member@example.com');
    expect(document.displayName).toBe('Member');
    expect(document.passwordHash).toBe(hash);
    expect(document.toJSON()).not.toHaveProperty('passwordHash');
    expect(document.toObject()).not.toHaveProperty('passwordHash');
    expect(toPublicUser(document)).not.toHaveProperty('passwordHash');
  });
  it.each([
    { role: 'OWNER' },
    { status: 'INVITED' },
    { familyId: null },
    { familyId: 'invalid' },
    { passwordHash: 'plaintext' },
    { emailNormalized: 'invalid' },
    { displayName: ' ' },
  ])('rejects invalid user fields %#', async (changes) => {
    const document = user();
    document.set(changes);
    await expect(document.validate()).rejects.toThrow();
  });
  it('requires Family creator and name; defaults to an active workspace', async () => {
    await expect(new models.Family({ name: 'Workspace' }).validate()).rejects.toThrow();
    const family = new models.Family({ name: 'Workspace', createdBy: id() });
    await family.validate();
    expect(family.status).toBe('ACTIVE');
  });
  it('requires hash-only session and invitation tokens and redacts them', async () => {
    const session = new models.Session({
      userId: id(),
      sessionTokenHash: 'a'.repeat(64),
      expiresAt: new Date(),
    });
    await session.validate();
    expect(session.toJSON()).not.toHaveProperty('sessionTokenHash');
    session.sessionTokenHash = 'raw-token';
    await expect(session.validate()).rejects.toThrow();
    const invitation = new models.Invitation({
      familyId: id(),
      emailNormalized: ' A@Example.COM ',
      invitedBy: id(),
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(),
    });
    await invitation.validate();
    expect(invitation.emailNormalized).toBe('a@example.com');
    expect(invitation.toJSON()).not.toHaveProperty('tokenHash');
    invitation.status = 'INVALID' as 'PENDING';
    await expect(invitation.validate()).rejects.toThrow();
  });
});

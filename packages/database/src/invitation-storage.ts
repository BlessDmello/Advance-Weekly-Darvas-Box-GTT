import type { Connection } from 'mongoose';
import { createAuthModels } from './models/index.js';
import { assertAuthIndexes, assertTransactionSupport } from './auth-indexes.js';

export async function verifyInvitationStorage(connection: Connection) {
  const models = createAuthModels(connection);
  await assertAuthIndexes(models);
  const indexes = await models.Invitation.listIndexes();
  if (indexes.some((index) => 'expiresAt' in index.key && index.expireAfterSeconds !== undefined))
    throw new Error('Legacy invitation expiry index requires explicit migration.');
}

/** Explicit CLI/test operation. Dry-run by default; never called by HTTP requests. */
export async function prepareInvitationStorage(connection: Connection, apply = false) {
  await assertTransactionSupport(connection);
  const { Invitation } = createAuthModels(connection);
  const exists = await connection.db!.listCollections({ name: 'invitations' }).hasNext();
  const indexes = exists ? await Invitation.listIndexes() : [];
  const legacy = indexes.filter(
    (index) => 'expiresAt' in index.key && index.expireAfterSeconds !== undefined,
  );
  if (
    legacy.some(
      (index) =>
        index.name !== 'invitation_expiry' ||
        index.expireAfterSeconds !== 0 ||
        JSON.stringify(index.key) !== '{"expiresAt":1}',
    )
  )
    throw new Error('Unrecognized legacy index. Manual review required.');
  const duplicates = exists
    ? await Invitation.aggregate([
        { $match: { status: 'PENDING', expiresAt: { $gt: new Date() } } },
        {
          $group: { _id: { familyId: '$familyId', email: '$emailNormalized' }, count: { $sum: 1 } },
        },
        { $match: { count: { $gt: 1 } } },
        { $count: 'count' },
      ])
    : [];
  const duplicateGroups = Number(duplicates[0]?.count ?? 0);
  const report = { apply, legacyExpiryIndex: legacy.length > 0, duplicateGroups };
  if (!apply) return report;
  if (duplicateGroups)
    throw new Error('Duplicate pending invitations require explicit reconciliation.');
  await Invitation.createCollection();
  // Stop destructive expiry cleanup before backfill; never drop unrelated indexes.
  if (legacy.length) await Invitation.collection.dropIndex('invitation_expiry');
  await Invitation.collection.updateMany({ purgeAt: { $exists: false } }, [
    { $set: { purgeAt: { $dateAdd: { startDate: '$expiresAt', unit: 'day', amount: 90 } } } },
  ]);
  await Invitation.updateMany(
    { status: 'PENDING', expiresAt: { $lte: new Date() } },
    { $set: { status: 'EXPIRED' } },
  );
  await Invitation.createIndexes();
  await verifyInvitationStorage(connection);
  return report;
}

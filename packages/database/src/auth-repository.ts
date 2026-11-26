import type { Connection } from 'mongoose';
import { createAuthModels, toPublicUser } from './models/index.js';

export function createAuthRepository(connection: Connection) {
  const { User, Family, Session } = createAuthModels(connection);
  return {
    async findCredentials(email: string) {
      const user = await User.findOne({ emailNormalized: email }).select('+passwordHash');
      if (!user) return null;
      const familyActive = Boolean(await Family.exists({ _id: user.familyId, status: 'ACTIVE' }));
      return { user: toPublicUser(user), passwordHash: user.passwordHash, familyActive };
    },
    async findSession(hash: string, now: Date) {
      const session = await Session.findOne({
        sessionTokenHash: hash,
        expiresAt: { $gt: now },
        revokedAt: null,
      });
      if (!session) return null;
      const user = await User.findOne({ _id: session.userId, status: 'ACTIVE' });
      if (!user || !(await Family.exists({ _id: user.familyId, status: 'ACTIVE' }))) return null;
      return { id: session._id.toHexString(), user: toPublicUser(user) };
    },
    async createSession(input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      previousTokenHash?: string;
    }) {
      await connection.transaction(
        async (session) => {
          const user = await User.findOne({ _id: input.userId, status: 'ACTIVE' }).session(session);
          if (
            !user ||
            !(await Family.exists({ _id: user.familyId, status: 'ACTIVE' }).session(session))
          )
            throw new Error('Inactive membership.');
          if (input.previousTokenHash)
            await Session.updateOne(
              { sessionTokenHash: input.previousTokenHash, revokedAt: null },
              { $set: { revokedAt: new Date() } },
              { session },
            );
          await Session.create(
            [
              {
                userId: input.userId,
                sessionTokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
              },
            ],
            { session },
          );
        },
        { writeConcern: { w: 'majority' }, readConcern: { level: 'snapshot' } },
      );
    },
    async revokeSession(hash: string) {
      await Session.updateOne(
        { sessionTokenHash: hash, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    },
  };
}

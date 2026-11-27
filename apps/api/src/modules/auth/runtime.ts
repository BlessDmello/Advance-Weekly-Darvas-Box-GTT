import {
  connectDatabase,
  createAuthRepository,
  disconnectDatabase,
  readDatabaseConfig,
  verifyAuthStorage,
  createInvitationRepository,
  verifyInvitationStorage,
} from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import type { AuthRuntime } from './types.js';

export function createAuthRuntime(environment: Record<string, string | undefined>): AuthRuntime & {
  invitationRepository(): Promise<ReturnType<typeof createInvitationRepository>>;
} {
  // Called by server composition only; no import-time connection or automatic DDL.
  let owned: Promise<DatabaseConnection> | undefined;
  let closing = false;
  let verified: Promise<void> | undefined;
  let invitationsVerified: Promise<void> | undefined;
  async function database() {
    if (closing) throw new Error('Authentication unavailable.');
    owned ??= connectDatabase(readDatabaseConfig(environment)).catch((error: unknown) => {
      owned = undefined;
      throw error;
    });
    return owned;
  }
  return {
    async repository() {
      const connection = await database();
      verified ??= verifyAuthStorage(connection).catch((error: unknown) => {
        verified = undefined;
        throw error;
      });
      await verified;
      return createAuthRepository(connection);
    },
    async invitationRepository() {
      const connection = await database();
      invitationsVerified ??= verifyInvitationStorage(connection).catch((error: unknown) => {
        invitationsVerified = undefined;
        throw error;
      });
      await invitationsVerified;
      return createInvitationRepository(connection);
    },
    async close() {
      closing = true;
      if (owned) {
        const connection = await owned.catch(() => undefined);
        if (connection) await disconnectDatabase(connection);
      }
    },
  };
}

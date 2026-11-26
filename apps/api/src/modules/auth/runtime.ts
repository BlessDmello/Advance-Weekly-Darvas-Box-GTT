import {
  connectDatabase,
  createAuthRepository,
  disconnectDatabase,
  readDatabaseConfig,
  verifyAuthStorage,
} from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import type { AuthRuntime } from './types.js';

export function createAuthRuntime(environment: Record<string, string | undefined>): AuthRuntime {
  // Called by server composition only; no import-time connection or automatic DDL.
  let owned: Promise<DatabaseConnection> | undefined;
  let closing = false;
  let verified: Promise<void> | undefined;
  return {
    async repository() {
      if (closing) throw new Error('Authentication unavailable.');
      owned ??= connectDatabase(readDatabaseConfig(environment)).catch((error: unknown) => {
        owned = undefined;
        throw error;
      });
      const connection = await owned;
      verified ??= verifyAuthStorage(connection).catch((error: unknown) => {
        verified = undefined;
        throw error;
      });
      await verified;
      return createAuthRepository(connection);
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

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import {
  connectDatabase,
  createAuthModels,
  createAuthRepository,
  disconnectDatabase,
  prepareAuthStorage,
} from '@darvas/database';
import { bootstrapAdmin } from '../../apps/api/src/modules/auth/bootstrap-admin.js';
import { testCredentials } from './credentials.js';

export async function startAuthFixture() {
  const name = `advanced_darvas_test_${randomUUID().replaceAll('-', '')}`;
  const mongo = await MongoMemoryReplSet.create({
    binary: {
      version: '8.2.6',
      checkMD5: true,
      downloadDir: fileURLToPath(
        new URL('../../node_modules/.cache/mongodb-binaries/', import.meta.url),
      ),
    },
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
  let connection;
  try {
    const uri = mongo.getUri(name);
    if (new URL(uri).hostname !== '127.0.0.1')
      throw new Error('Test MongoDB must be loopback-only.');
    connection = await connectDatabase({ uri, databaseName: name });
    const owned = connection;
    const assertOwned = () => {
      if (
        owned.name !== name ||
        !/^advanced_darvas_test_[a-f\d]{32}$/.test(owned.name) ||
        owned.host !== '127.0.0.1'
      )
        throw new Error('Refusing non-test database access.');
    };
    assertOwned();
    await prepareAuthStorage(owned);
    await bootstrapAdmin(owned, {
      workspaceName: 'Synthetic Test Family',
      displayName: 'Synthetic Admin',
      ...testCredentials,
      confirmPassword: testCredentials.password,
    });
    return {
      connection: owned,
      models: createAuthModels(owned),
      assertOwned,
      runtime: { repository: async () => createAuthRepository(owned), close: async () => {} },
      close: async () => {
        assertOwned();
        try {
          await disconnectDatabase(owned);
        } finally {
          await mongo.stop();
        }
      },
    };
  } catch (error) {
    if (connection) await disconnectDatabase(connection);
    await mongo.stop();
    throw error;
  }
}

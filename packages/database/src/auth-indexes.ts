import type { Connection } from 'mongoose';
import { createAuthModels } from './models/index.js';
import type { AuthModels } from './models/index.js';

export async function assertTransactionSupport(connection: Connection): Promise<void> {
  if (!connection.db) throw new Error('Database connection is not ready.');
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('Bootstrap requires MongoDB transaction support. No account was created.');
  }
}

/** Explicit administrative operation only; never called by model import or API startup. */
export async function prepareAuthStorage(connection: Connection): Promise<void> {
  await assertTransactionSupport(connection);
  const models = createAuthModels(connection);
  for (const model of Object.values(models)) {
    await model.createCollection({ writeConcern: { w: 'majority' } });
    await model.createIndexes();
  }
  await assertAuthIndexes(models);
}

export async function assertAuthIndexes(models: AuthModels): Promise<void> {
  for (const model of Object.values(models)) {
    const actual = await model.listIndexes();
    for (const [key, options] of model.schema.indexes()) {
      const index = actual.find((candidate) => candidate.name === options.name);
      if (
        !index ||
        JSON.stringify(index.key) !== JSON.stringify(key) ||
        Boolean(index.unique) !== Boolean(options.unique) ||
        index.expireAfterSeconds !== options.expireAfterSeconds ||
        JSON.stringify(index.partialFilterExpression) !==
          JSON.stringify(options.partialFilterExpression)
      ) {
        throw new Error('Required authentication indexes are missing or incompatible.');
      }
    }
  }
}

/** Read-only readiness check. API requests must never provision identity storage. */
export async function verifyAuthStorage(connection: Connection): Promise<void> {
  await assertAuthIndexes(createAuthModels(connection));
}

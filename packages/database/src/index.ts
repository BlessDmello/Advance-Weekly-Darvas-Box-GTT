import mongoose, { type Connection } from 'mongoose';
import { z } from 'zod';

const databaseConfigSchema = z.object({
  uri: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  databaseName: z.string().trim().min(1),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

/** Call explicitly at the persistence composition boundary, never at module import. */
export function readDatabaseConfig(
  environment: Record<string, string | undefined>,
): DatabaseConfig {
  const result = databaseConfigSchema.safeParse({
    uri: environment.MONGODB_URI,
    databaseName: environment.MONGODB_DB_NAME,
  });
  if (!result.success) {
    throw new Error('Valid MONGODB_URI and MONGODB_DB_NAME are required to connect to MongoDB.');
  }
  return result.data;
}

/** Caller owns this connection and must close it on shutdown. Does not create collections/indexes. */
export async function connectDatabase(config: DatabaseConfig): Promise<Connection> {
  const { uri, databaseName } = databaseConfigSchema.parse(config);
  const connection = mongoose.createConnection(uri, {
    dbName: databaseName,
    autoCreate: false,
    autoIndex: false,
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 5,
  });
  try {
    return await connection.asPromise();
  } catch {
    await connection.close().catch(() => undefined);
    throw new Error('MongoDB connection failed. Check server configuration and Atlas access.');
  }
}

export async function disconnectDatabase(connection: Connection): Promise<void> {
  await connection.close();
}

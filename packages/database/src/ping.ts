import { connectDatabase, disconnectDatabase, readDatabaseConfig } from './index.js';

const developmentDatabase = 'advanced_darvas_dev';

/** Explicit diagnostic only: never imported by application startup or package exports. */
export async function pingDevelopmentDatabase(
  environment: Record<string, string | undefined>,
): Promise<void> {
  if (!['development', 'test'].includes(environment.NODE_ENV ?? '')) {
    throw new Error('The development ping permits only development or test mode.');
  }
  const config = readDatabaseConfig(environment);
  let uriDatabase: string;
  try {
    const uri = new URL(config.uri);
    if (!uri.hostname || uri.hash) throw new Error('Invalid MongoDB URI');
    if (/<[^>]+>|YOUR_[A-Z0-9_]+/i.test(decodeURIComponent(config.uri))) {
      throw new Error('Placeholder configuration');
    }
    uriDatabase = decodeURIComponent(uri.pathname.slice(1));
  } catch {
    throw new Error('The development ping requires a valid URI without placeholders.');
  }
  // dbName overrides the URI path in Mongoose; require both to agree before connecting.
  if (config.databaseName !== developmentDatabase || uriDatabase !== developmentDatabase) {
    throw new Error('The development ping requires advanced_darvas_dev in both database settings.');
  }

  const connection = await connectDatabase(config);
  try {
    if (!connection.db) throw new Error('The MongoDB connection is not ready.');
    const result = await connection.db.command({ ping: 1 }, { timeoutMS: 5_000 });
    if (result.ok !== 1) throw new Error('MongoDB did not acknowledge the ping.');
  } finally {
    await disconnectDatabase(connection);
  }
}

export async function main(environment: Record<string, string | undefined>): Promise<number> {
  try {
    await pingDevelopmentDatabase(environment);
    console.info('MongoDB ping succeeded (database: advanced_darvas_dev).');
    return 0;
  } catch {
    // Driver exceptions can contain connection details. Never print the raw error.
    console.error(
      'MongoDB ping failed. Check the local development configuration, Atlas access, and credentials.',
    );
    return 1;
  }
}

if (import.meta.main) process.exitCode = await main(process.env);

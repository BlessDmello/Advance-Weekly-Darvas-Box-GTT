import {
  connectDatabase,
  disconnectDatabase,
  prepareMarketStorage,
  readDatabaseConfig,
} from '@darvas/database';

export function marketPreparationConfig(
  environment: Record<string, string | undefined>,
  args: string[],
) {
  if (
    environment.NODE_ENV !== 'development' ||
    args.length > 1 ||
    args.some((arg) => arg !== '--apply')
  )
    throw new Error('Explicit development invocation required.');
  const config = readDatabaseConfig(environment);
  const uri = new URL(config.uri);
  if (
    config.databaseName !== 'advanced_darvas_dev' ||
    uri.pathname !== '/advanced_darvas_dev' ||
    /YOUR_|PLACEHOLDER|[<>]/i.test(decodeURIComponent(config.uri))
  )
    throw new Error('Development database required.');
  return { config, apply: args.includes('--apply') };
}
export async function main(environment: Record<string, string | undefined>, args: string[]) {
  let connection;
  try {
    const input = marketPreparationConfig(environment, args);
    connection = await connectDatabase(input.config);
    const report = await prepareMarketStorage(connection, input.apply);
    console.info(JSON.stringify(report));
    console.info(
      input.apply
        ? 'Market storage prepared. No reference data seeded.'
        : 'Dry-run only. Review before explicitly using --apply.',
    );
    return 0;
  } catch {
    console.error(
      'Market storage preparation failed. Review development configuration, connectivity and storage compatibility. No credentials are logged.',
    );
    return 1;
  } finally {
    if (connection) await disconnectDatabase(connection).catch(() => {});
  }
}
if (import.meta.main) process.exitCode = await main(process.env, process.argv.slice(2));

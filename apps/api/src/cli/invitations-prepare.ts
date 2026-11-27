import {
  connectDatabase,
  disconnectDatabase,
  prepareInvitationStorage,
  readDatabaseConfig,
} from '@darvas/database';

export function preparationConfig(environment: Record<string, string | undefined>, args: string[]) {
  if (
    environment.NODE_ENV !== 'development' ||
    args.some((arg) => arg !== '--apply') ||
    args.length > 1
  )
    throw new Error('Development invocation required.');
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
    const input = preparationConfig(environment, args);
    connection = await connectDatabase(input.config);
    const report = await prepareInvitationStorage(connection, input.apply);
    console.info(JSON.stringify(report));
    console.info(
      input.apply
        ? 'Invitation indexes prepared.'
        : 'Dry-run only. Review before explicitly using --apply.',
    );
    return 0;
  } catch {
    console.error(
      'Invitation preparation failed. Review development configuration, connectivity and pending-invitation duplicates. No credentials are logged.',
    );
    return 1;
  } finally {
    if (connection) await disconnectDatabase(connection).catch(() => {});
  }
}
if (import.meta.main) process.exitCode = await main(process.env, process.argv.slice(2));

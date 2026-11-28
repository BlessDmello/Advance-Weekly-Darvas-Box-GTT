import { connectDatabase, disconnectDatabase, migrateMarketGenerations } from '@darvas/database';
import { marketPreparationConfig } from './market-data-prepare.js';

export function generationMigrationConfig(
  environment: Record<string, string | undefined>,
  args: string[],
) {
  const allowed = ['--apply', '--offline-confirmed', '--backup-confirmed'];
  if (new Set(args).size !== args.length || args.some((arg) => !allowed.includes(arg)))
    throw new Error('Explicit migration arguments required.');
  const { config } = marketPreparationConfig(
    environment,
    args.includes('--apply') ? ['--apply'] : [],
  );
  if (
    args.includes('--apply') &&
    (!args.includes('--offline-confirmed') || !args.includes('--backup-confirmed'))
  )
    throw new Error('Offline operation and verified backup required.');
  return {
    config,
    apply: args.includes('--apply'),
    offlineConfirmed: args.includes('--offline-confirmed'),
    backupConfirmed: args.includes('--backup-confirmed'),
  };
}
export async function main(environment: Record<string, string | undefined>, args: string[]) {
  let connection;
  try {
    const input = generationMigrationConfig(environment, args);
    connection = await connectDatabase(input.config);
    console.info(JSON.stringify(await migrateMarketGenerations(connection, input)));
    return 0;
  } catch {
    console.error(
      'Generation migration refused or incomplete. Keep market writers offline; inspect the dry-run and verified backup. No credentials or database errors are logged.',
    );
    return 1;
  } finally {
    if (connection) await disconnectDatabase(connection).catch(() => {});
  }
}
if (import.meta.main) process.exitCode = await main(process.env, process.argv.slice(2));

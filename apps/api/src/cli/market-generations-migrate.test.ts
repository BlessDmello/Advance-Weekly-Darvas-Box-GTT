import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, disconnectDatabase, migrateMarketGenerations } from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import { generationMigrationConfig, main } from './market-generations-migrate.js';
vi.mock('@darvas/database', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
  migrateMarketGenerations: vi.fn(),
}));
const environment = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1/advanced_darvas_dev',
  MONGODB_DB_NAME: 'advanced_darvas_dev',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(connectDatabase).mockResolvedValue({} as DatabaseConnection);
  vi.mocked(disconnectDatabase).mockResolvedValue();
  vi.mocked(migrateMarketGenerations).mockResolvedValue({
    apply: false,
    alreadyReady: true,
    pricesToTag: 0,
    jobsToInitialize: 0,
    stocksToRehash: 0,
    rollback: {
      verifiedBackupRequired: true,
      automaticRollback: false,
      restoreOnlyBeforeNewMarketWrites: true,
      generationDeletionAvailable: false,
    },
  });
});
afterEach(() => vi.restoreAllMocks());
it('defaults to dry-run and closes its owned connection', async () => {
  expect(generationMigrationConfig(environment, []).apply).toBe(false);
  expect(await main(environment, [])).toBe(0);
  expect(vi.mocked(migrateMarketGenerations).mock.calls[0]![1]).toMatchObject({ apply: false });
  expect(disconnectDatabase).toHaveBeenCalledWith({});
});
it.each([
  [environment, ['--apply']],
  [environment, ['--apply', '--offline-confirmed']],
  [environment, ['--force']],
  [environment, ['--apply', '--apply']],
  [{ ...environment, NODE_ENV: 'production' }, []],
  [{ ...environment, MONGODB_DB_NAME: 'other' }, []],
])('refuses unsafe migration invocation before connecting %#', async (settings, args) => {
  expect(await main(settings, args as string[])).toBe(1);
  expect(connectDatabase).not.toHaveBeenCalled();
});
it('permits only the explicit acknowledged apply and sanitizes failures', async () => {
  vi.mocked(migrateMarketGenerations).mockRejectedValue(new Error('sensitive database error'));
  expect(await main(environment, ['--apply', '--offline-confirmed', '--backup-confirmed'])).toBe(1);
  expect(disconnectDatabase).toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    'sensitive database error',
  );
});

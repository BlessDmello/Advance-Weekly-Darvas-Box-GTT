import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, disconnectDatabase, prepareMarketStorage } from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import { main, marketPreparationConfig } from './market-data-prepare.js';

vi.mock('@darvas/database', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
  prepareMarketStorage: vi.fn(),
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
  vi.mocked(prepareMarketStorage).mockResolvedValue({
    apply: false,
    missingCollections: [],
    missingIndexes: [],
    validatorsToInstall: [],
    incompatible: [],
  });
});
afterEach(() => vi.restoreAllMocks());
it('defaults to dry-run and closes its owned connection', async () => {
  expect(marketPreparationConfig(environment, []).apply).toBe(false);
  expect(await main(environment, [])).toBe(0);
  expect(prepareMarketStorage).toHaveBeenCalledWith({}, false);
  expect(disconnectDatabase).toHaveBeenCalledWith({});
});
it('permits writes only with the explicit development --apply invocation', async () => {
  expect(await main(environment, ['--apply'])).toBe(0);
  expect(prepareMarketStorage).toHaveBeenCalledWith({}, true);
});
it.each([
  [{ ...environment, NODE_ENV: 'production' }, ['--apply']],
  [{ ...environment, NODE_ENV: 'test' }, []],
  [{ ...environment, MONGODB_DB_NAME: 'production' }, []],
  [{ ...environment, MONGODB_URI: 'mongodb://127.0.0.1/other' }, []],
  [
    { ...environment, MONGODB_URI: 'mongodb+srv://YOUR_PASSWORD@YOUR_HOST/advanced_darvas_dev' },
    [],
  ],
  [environment, ['--apply', '--apply']],
  [environment, ['--force']],
] as const)('refuses unsafe configuration/arguments before connecting %#', async (input, args) => {
  expect(await main(input, [...args])).toBe(1);
  expect(connectDatabase).not.toHaveBeenCalled();
});
it('sanitizes database failures and still closes the connection', async () => {
  vi.mocked(prepareMarketStorage).mockRejectedValue(new Error('sensitive driver detail'));
  expect(await main(environment, ['--apply'])).toBe(1);
  expect(disconnectDatabase).toHaveBeenCalled();
  const output = JSON.stringify([
    vi.mocked(console.info).mock.calls,
    vi.mocked(console.error).mock.calls,
  ]);
  expect(output).not.toContain('sensitive driver detail');
  expect(output).not.toContain(environment.MONGODB_URI);
});

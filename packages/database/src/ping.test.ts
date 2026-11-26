import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import type * as DatabaseModule from './index.js';
import { connectDatabase, disconnectDatabase } from './index.js';
import { main, pingDevelopmentDatabase } from './ping.js';

vi.mock('./index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

const environment = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb+srv://example.invalid/advanced_darvas_dev?retryWrites=true&w=majority',
  MONGODB_DB_NAME: 'advanced_darvas_dev',
};
const command = vi.fn();
const connection = { db: { command } } as unknown as Connection;

beforeEach(() => {
  vi.clearAllMocks();
  command.mockReset().mockResolvedValue({ ok: 1 });
  vi.mocked(connectDatabase).mockReset().mockResolvedValue(connection);
  vi.mocked(disconnectDatabase).mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('explicit development MongoDB ping', () => {
  it('runs only ping against the requested database and closes its owned connection', async () => {
    await pingDevelopmentDatabase(environment);
    expect(connectDatabase).toHaveBeenCalledExactlyOnceWith({
      uri: environment.MONGODB_URI,
      databaseName: 'advanced_darvas_dev',
    });
    expect(command).toHaveBeenCalledExactlyOnceWith({ ping: 1 }, { timeoutMS: 5_000 });
    expect(disconnectDatabase).toHaveBeenCalledExactlyOnceWith(connection);
  });

  it.each([
    { ...environment, NODE_ENV: 'production' },
    { ...environment, NODE_ENV: undefined },
    { ...environment, NODE_ENV: 'staging' },
    { ...environment, MONGODB_DB_NAME: 'another_database' },
    { ...environment, MONGODB_URI: 'mongodb+srv://example.invalid/another_database' },
    { ...environment, MONGODB_URI: 'mongodb+srv://example.invalid/' },
    {
      ...environment,
      MONGODB_URI: 'mongodb+srv://user:YOUR_PASSWORD@example.invalid/advanced_darvas_dev',
    },
    { ...environment, MONGODB_URI: 'mongodb+srv://YOUR_ATLAS_HOST/advanced_darvas_dev' },
    {
      ...environment,
      MONGODB_URI: 'mongodb+srv://example.invalid/advanced_darvas_dev?authSource=%3Cdatabase%3E',
    },
    { ...environment, MONGODB_URI: 'not-a-uri' },
    { ...environment, MONGODB_URI: 'mongodb+srv:///advanced_darvas_dev' },
    { ...environment, MONGODB_URI: undefined },
    { ...environment, MONGODB_DB_NAME: undefined },
  ])(
    'rejects unsafe or incomplete configuration before opening a connection %#',
    async (config) => {
      await expect(pingDevelopmentDatabase(config)).rejects.toThrow();
      expect(connectDatabase).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
    },
  );

  it('closes the connection when the ping fails', async () => {
    command.mockRejectedValue(new Error('Injected driver failure'));
    await expect(pingDevelopmentDatabase(environment)).rejects.toThrow();
    expect(disconnectDatabase).toHaveBeenCalledExactlyOnceWith(connection);
  });

  it('treats an unacknowledged ping as a failure and closes the connection', async () => {
    command.mockResolvedValue({ ok: 0 });
    await expect(pingDevelopmentDatabase(environment)).rejects.toThrow();
    expect(disconnectDatabase).toHaveBeenCalledExactlyOnceWith(connection);
  });

  it('returns a nonzero exit code without exposing driver exception details', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    command.mockRejectedValue(new Error('canary-private-driver-details'));
    expect(await main(environment)).toBe(1);
    expect(output).toHaveBeenCalledExactlyOnceWith(
      'MongoDB ping failed. Check the local development configuration, Atlas access, and credentials.',
    );
    expect(JSON.stringify(output.mock.calls)).not.toContain('canary-private-driver-details');
    expect(disconnectDatabase).toHaveBeenCalledExactlyOnceWith(connection);
  });

  it('reports success without printing connection settings', async () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(await main(environment)).toBe(0);
    expect(output).toHaveBeenCalledExactlyOnceWith(
      'MongoDB ping succeeded (database: advanced_darvas_dev).',
    );
    expect(JSON.stringify(output.mock.calls)).not.toContain(environment.MONGODB_URI);
  });
});

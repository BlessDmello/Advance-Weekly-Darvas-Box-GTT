import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectDatabase,
  createAuthRepository,
  disconnectDatabase,
  verifyAuthStorage,
} from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import type * as Database from '@darvas/database';
import { createAuthRuntime } from './runtime.js';

vi.mock('@darvas/database', async (original) => ({
  ...(await original<typeof Database>()),
  connectDatabase: vi.fn(),
  createAuthRepository: vi.fn(),
  disconnectDatabase: vi.fn(),
  verifyAuthStorage: vi.fn(),
}));
const connection = {} as DatabaseConnection;
const config = { MONGODB_URI: 'mongodb://example.invalid/fixture', MONGODB_DB_NAME: 'fixture' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectDatabase).mockReset().mockResolvedValue(connection);
  vi.mocked(verifyAuthStorage).mockReset().mockResolvedValue(undefined);
  vi.mocked(disconnectDatabase).mockResolvedValue(undefined);
});
describe('explicit auth runtime lifecycle', () => {
  it('connects lazily once, verifies existing indexes without provisioning, and closes its connection', async () => {
    const runtime = createAuthRuntime(config);
    expect(connectDatabase).not.toHaveBeenCalled();
    await Promise.all([runtime.repository(), runtime.repository()]);
    expect(connectDatabase).toHaveBeenCalledOnce();
    expect(verifyAuthStorage).toHaveBeenCalledOnce();
    await runtime.close();
    expect(disconnectDatabase).toHaveBeenCalledWith(connection);
    await expect(runtime.repository()).rejects.toThrow('unavailable');
  });
  it('refuses repository access when index verification fails, then permits a repaired retry', async () => {
    vi.mocked(verifyAuthStorage).mockRejectedValueOnce(new Error('Index unavailable'));
    const runtime = createAuthRuntime(config);
    await expect(runtime.repository()).rejects.toThrow();
    expect(createAuthRepository).not.toHaveBeenCalled();
    await runtime.repository();
    expect(verifyAuthStorage).toHaveBeenCalledTimes(2);
    await runtime.close();
  });
  it('does not require MongoDB configuration until auth is requested', async () => {
    const runtime = createAuthRuntime({});
    await runtime.close();
    expect(connectDatabase).not.toHaveBeenCalled();
    await expect(createAuthRuntime({}).repository()).rejects.toThrow('Valid MONGODB_URI');
  });
});

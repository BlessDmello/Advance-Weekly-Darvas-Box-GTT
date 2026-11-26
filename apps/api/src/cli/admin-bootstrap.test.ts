import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { input, password } from '@inquirer/prompts';
import { BootstrapError } from '@darvas/database';
import type { DatabaseConnection } from '@darvas/database';
import { promptAdminInput, readBootstrapConfig, runBootstrapCli } from './admin-bootstrap.js';

vi.mock('@inquirer/prompts', () => ({ input: vi.fn(), password: vi.fn() }));
const environment = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb+srv://example.invalid/advanced_darvas_dev',
  MONGODB_DB_NAME: 'advanced_darvas_dev',
};
const terminal = { stdinIsTTY: true, stdoutIsTTY: true, args: [] as string[] };
const values = {
  workspaceName: 'Workspace',
  email: 'admin@example.com',
  displayName: 'Test Admin',
  password: 'synthetic-passphrase',
  confirmPassword: 'synthetic-passphrase',
};
const connection = {} as DatabaseConnection;
const dependencies = () => ({
  connectDatabase: vi.fn().mockResolvedValue(connection),
  disconnectDatabase: vi.fn().mockResolvedValue(undefined),
  prepareAuthStorage: vi.fn().mockResolvedValue(undefined),
  bootstrapAdmin: vi.fn().mockResolvedValue(undefined),
  promptAdminInput: vi.fn().mockResolvedValue(values),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('development-only bootstrap CLI', () => {
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { NODE_ENV: undefined },
    { MONGODB_DB_NAME: 'production' },
    { MONGODB_URI: 'mongodb+srv://example.invalid/production' },
    { MONGODB_URI: 'mongodb+srv://YOUR_ATLAS_HOST/advanced_darvas_dev' },
    { MONGODB_URI: undefined },
  ])('rejects unsafe configuration before prompts or connection %#', async (changes) => {
    const deps = dependencies();
    expect(() => readBootstrapConfig({ ...environment, ...changes })).toThrow();
    expect(await runBootstrapCli({ ...environment, ...changes }, terminal, deps)).toBe(1);
    expect(deps.promptAdminInput).not.toHaveBeenCalled();
    expect(deps.connectDatabase).not.toHaveBeenCalled();
  });
  it.each([
    { ...terminal, stdinIsTTY: false },
    { ...terminal, stdoutIsTTY: false },
    { ...terminal, args: ['--password=synthetic-canary'] },
  ])('rejects noninteractive or argument-based credential entry %#', async (context) => {
    const deps = dependencies();
    expect(await runBootstrapCli(environment, context, deps)).toBe(1);
    expect(deps.connectDatabase).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('synthetic-canary');
  });
  it('prepares explicit storage, runs bootstrap, and closes the owned connection', async () => {
    const deps = dependencies();
    expect(await runBootstrapCli(environment, terminal, deps)).toBe(0);
    expect(deps.prepareAuthStorage).toHaveBeenCalledWith(connection);
    expect(deps.bootstrapAdmin).toHaveBeenCalledWith(connection, values);
    expect(deps.disconnectDatabase).toHaveBeenCalledWith(connection);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      'Initial Family and Admin created. No login session was created.',
    );
  });
  it.each(['connectDatabase', 'prepareAuthStorage', 'bootstrapAdmin'] as const)(
    'sanitizes %s failures and closes any opened connection',
    async (method) => {
      const deps = dependencies();
      deps[method].mockRejectedValue(new Error('synthetic-private-driver-canary'));
      expect(await runBootstrapCli(environment, terminal, deps)).toBe(1);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        'synthetic-private-driver-canary',
      );
      if (method !== 'connectDatabase')
        expect(deps.disconnectDatabase).toHaveBeenCalledWith(connection);
    },
  );
  it('reports a refused second bootstrap without exposing input', async () => {
    const deps = dependencies();
    deps.bootstrapAdmin.mockRejectedValue(new BootstrapError('ALREADY_INITIALIZED'));
    expect(await runBootstrapCli(environment, terminal, deps)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('already complete'));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(values.password);
  });
  it('handles cancellation and invalid prompt input before connecting', async () => {
    const deps = dependencies();
    deps.promptAdminInput.mockRejectedValueOnce(new Error('Cancelled'));
    expect(await runBootstrapCli(environment, terminal, deps)).toBe(1);
    deps.promptAdminInput.mockResolvedValueOnce({ ...values, confirmPassword: 'mismatch' });
    expect(await runBootstrapCli(environment, terminal, deps)).toBe(1);
    expect(deps.connectDatabase).not.toHaveBeenCalled();
  });
  it('fails truthfully on shutdown errors after initialization', async () => {
    const deps = dependencies();
    deps.disconnectDatabase.mockRejectedValue(new Error('synthetic-close-canary'));
    expect(await runBootstrapCli(environment, terminal, deps)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      'Database shutdown failed. Check initialization state before retrying.',
    );
  });
  it('uses hidden password prompts with reveal disabled for both entries', async () => {
    vi.mocked(input)
      .mockResolvedValueOnce('Workspace')
      .mockResolvedValueOnce('test@example.com')
      .mockResolvedValueOnce('Test');
    vi.mocked(password).mockResolvedValue(values.password);
    await promptAdminInput();
    expect(password).toHaveBeenCalledTimes(2);
    for (const [options] of vi.mocked(password).mock.calls) {
      expect(options).toMatchObject({ mask: false, toggleMask: false });
    }
  });
});

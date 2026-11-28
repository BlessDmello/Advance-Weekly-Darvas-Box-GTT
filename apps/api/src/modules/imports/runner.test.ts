import { expect, it, vi } from 'vitest';
import { createImportRunner, runnerConfig } from './runner.js';
it('bounds execution configuration and leaves both startup scanning and execution disabled by default', async () => {
  expect(runnerConfig({})).toMatchObject({
    enabled: false,
    resumeOnStartup: false,
    chunkRows: 100,
    leaseMs: 60_000,
    sliceMs: 20_000,
    maxRecoveries: 5,
  });
  for (const environment of [
    { IMPORT_RUNNER_CHUNK_ROWS: '101' },
    { IMPORT_RUNNER_LEASE_MS: '5' },
    { IMPORT_RUNNER_SLICE_MS: '999999' },
    { IMPORT_RUNNER_ENABLED: 'yes' },
  ])
    expect(() => runnerConfig(environment)).toThrow();
  const repository = vi.fn();
  const runner = createImportRunner(
    { repository, policy: () => ({ stocks: [], calendars: [], priceSources: [] }) },
    runnerConfig({}),
  );
  runner.kick('a'.repeat(24));
  await runner.start();
  await runner.stop();
  expect(repository).not.toHaveBeenCalled();
});
it('does not connect or scan old jobs merely because execution of new confirmations is enabled', async () => {
  const repository = vi.fn();
  const runner = createImportRunner(
    { repository, policy: () => ({ stocks: [], calendars: [], priceSources: [] }) },
    runnerConfig({ IMPORT_RUNNER_ENABLED: 'true' }),
  );
  await runner.start();
  await runner.stop();
  expect(repository).not.toHaveBeenCalled();
});

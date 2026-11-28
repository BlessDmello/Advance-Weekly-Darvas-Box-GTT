import { randomUUID } from 'node:crypto';
import { marketObjectIdSchema } from '@darvas/contracts';
import {
  connectDatabase,
  disconnectDatabase,
  createImportRunnerRepository,
  verifyMarketStorage,
} from '@darvas/database';
import { marketPreparationConfig } from './market-data-prepare.js';
import { readMarketReferencePolicy } from '../modules/imports/service.js';
import { runnerConfig, runImportSlice } from '../modules/imports/runner.js';

export function resumeOptions(environment: Record<string, string | undefined>, args: string[]) {
  const apply = args.includes('--apply');
  const jobIndex = args.indexOf('--job');
  const jobId = marketObjectIdSchema.parse(jobIndex < 0 ? undefined : args[jobIndex + 1]);
  const expected = ['--job', jobId, ...(apply ? ['--apply'] : [])];
  if (args.length !== expected.length || args.some((value) => !expected.includes(value)))
    throw new Error('Invalid arguments.');
  return { ...marketPreparationConfig(environment, apply ? ['--apply'] : []), jobId };
}
export async function main(environment: Record<string, string | undefined>, args: string[]) {
  let connection;
  try {
    const options = resumeOptions(environment, args);
    connection = await connectDatabase(options.config);
    await verifyMarketStorage(connection);
    const repository = createImportRunnerRepository(connection);
    const before = await repository.view(options.jobId);
    console.info(
      JSON.stringify({
        status: before.job.status,
        phase: before.job.phase,
        processed: before.job.cursor,
        total: before.job.total,
        apply: options.apply,
      }),
    );
    if (!options.apply) {
      console.info('Inspection only. Use --apply for one bounded execution slice.');
      return 0;
    }
    if (before.job.status !== 'COMPLETED' && before.job.attempts < 100)
      await repository.requestRetry(
        await repository.operatorUser(options.jobId),
        options.jobId,
        randomUUID(),
        'Explicit operator resume',
      );
    const config = { ...runnerConfig(environment), enabled: true, resumeOnStartup: false };
    const result = await runImportSlice(
      { repository: async () => repository, policy: () => readMarketReferencePolicy(environment) },
      config,
      options.jobId,
      randomUUID(),
    );
    if (result.fence)
      await repository.pause(
        result.fence,
        'OPERATOR_SLICE_ENDED',
        true,
        config.maxRecoveries,
        (await repository.view(options.jobId)).checkpoint,
      );
    const after = await repository.view(options.jobId);
    console.info(
      JSON.stringify({
        status: after.job.status,
        phase: after.job.phase,
        processed: after.job.cursor,
        total: after.job.total,
      }),
    );
    return after.job.status === 'FAILED' ? 1 : 0;
  } catch {
    console.error(
      'Import inspection/resume failed. Check job eligibility, development configuration and prepared storage.',
    );
    return 1;
  } finally {
    if (connection) await disconnectDatabase(connection).catch(() => {});
  }
}
if (import.meta.main) process.exitCode = await main(process.env, process.argv.slice(2));

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MarketReferencePolicy, PublicUser } from '@darvas/contracts';
import { GenerationStorageError } from '@darvas/database';
import type { GenerationFence, ImportRunnerRepository } from '@darvas/database';
import { ImportError } from './service.js';

const configSchema = z.object({
  enabled: z.boolean(),
  resumeOnStartup: z.boolean(),
  chunkRows: z.number().int().min(1).max(100),
  leaseMs: z.number().int().min(30_000).max(300_000),
  sliceMs: z.number().int().min(100).max(20_000),
  maxRecoveries: z.number().int().min(0).max(10),
});
export type RunnerConfig = z.infer<typeof configSchema>;
export function runnerConfig(env: Record<string, string | undefined>): RunnerConfig {
  const flag = (name: string) => z.enum(['true', 'false']).parse(env[name] ?? 'false') === 'true';
  const number = (name: string, fallback: number) =>
    env[name] === undefined ? fallback : Number(env[name]);
  return configSchema.parse({
    enabled: flag('IMPORT_RUNNER_ENABLED'),
    resumeOnStartup: flag('IMPORT_RUNNER_RESUME_ON_STARTUP'),
    chunkRows: number('IMPORT_RUNNER_CHUNK_ROWS', 100),
    leaseMs: number('IMPORT_RUNNER_LEASE_MS', 60_000),
    sliceMs: number('IMPORT_RUNNER_SLICE_MS', 20_000),
    maxRecoveries: number('IMPORT_RUNNER_MAX_RECOVERIES', 5),
  });
}
export interface RunnerDependencies {
  repository(): Promise<ImportRunnerRepository>;
  policy(): MarketReferencePolicy;
}
export interface SliceResult {
  fence: GenerationFence | null;
  finished: boolean;
}
/** A cooperative slice: each atomic operation finishes before shutdown or a yield. */
export async function runImportSlice(
  dependencies: RunnerDependencies,
  config: RunnerConfig,
  jobId: string,
  owner: string,
  previous: GenerationFence | null = null,
  stopped: () => boolean = () => false,
): Promise<SliceResult> {
  const repository = await dependencies.repository();
  let fence = previous;
  let checkpoint: string | undefined;
  const deadline = Date.now() + config.sliceMs;
  try {
    let state = await repository.view(jobId);
    if (state.job.status === 'COMPLETED') {
      await repository.retire(jobId);
      return { fence: null, finished: true };
    }
    if (state.job.status === 'FAILED') return { fence: null, finished: true };
    if (
      state.job.status === 'RETRY' &&
      state.job.attempts < 100 &&
      state.job.execution?.mode === 'MANUAL' &&
      !state.job.execution.retryRequested
    )
      return { fence: null, finished: true };
    fence ??= await repository.claim(jobId, owner, config.leaseMs, config.maxRecoveries);
    if (!fence) return { fence: null, finished: false };
    while (!stopped() && Date.now() < deadline) {
      state = await repository.view(jobId);
      checkpoint = state.checkpoint;
      if (state.job.status === 'COMPLETED') {
        await repository.retire(jobId);
        return { fence: null, finished: true };
      }
      await repository.renew(fence, checkpoint, config.leaseMs);
      const policy = dependencies.policy();
      switch (state.job.phase) {
        case 'VALIDATING':
          if (!state.job.generation) await repository.reserveCandidate(fence, policy, checkpoint);
          else await repository.advance(fence, checkpoint, 'UPSERTING');
          break;
        case 'UPSERTING':
          await repository.writeChunk(fence, checkpoint, policy, config.chunkRows);
          break;
        case 'CHECKING_QUALITY':
          if (!state.job.generation?.assessment)
            await repository.assessCandidate(fence, policy, checkpoint);
          else await repository.advance(fence, checkpoint, 'READY_TO_PUBLISH');
          break;
        case 'READY_TO_PUBLISH':
          await repository.publish(fence, policy, checkpoint);
          break;
        default:
          throw new GenerationStorageError('INVALID_PHASE');
      }
    }
    if (stopped()) {
      await repository.pause(
        fence,
        'SHUTDOWN',
        false,
        config.maxRecoveries,
        (await repository.view(jobId)).checkpoint,
      );
      fence = null;
    }
    return { fence, finished: false };
  } catch (error) {
    // Always reread majority durable state before any recovery, including an unknown commit.
    let durable;
    try {
      durable = await repository.view(jobId);
    } catch {
      return { fence: null, finished: false };
    }
    if (durable.job.status === 'COMPLETED') {
      try {
        await repository.retire(jobId);
      } catch {
        /* idempotent retirement on next explicit recovery */
      }
      return { fence: null, finished: true };
    }
    if (
      !fence ||
      durable.job.leaseOwner !== fence.leaseOwner ||
      durable.job.leaseVersion !== fence.leaseVersion ||
      durable.job.status !== 'RUNNING'
    )
      return { fence: null, finished: durable.job.status === 'FAILED' };
    if (checkpoint && durable.checkpoint !== checkpoint) return { fence, finished: false };
    if (error instanceof GenerationStorageError && error.message === 'STALE_FENCE')
      return { fence: null, finished: false };
    try {
      const invalid =
        error instanceof Error &&
        ['ZodError', 'ValidationError', 'DocumentNotFoundError', 'CastError'].includes(error.name);
      if (
        (error instanceof GenerationStorageError && error.message !== 'CHECKPOINT_CHANGED') ||
        invalid
      ) {
        await repository.abandonCandidate(
          fence,
          error instanceof GenerationStorageError && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.message)
            ? error.message
            : 'VALIDATION_FAILED',
          durable.checkpoint,
        );
        return { fence: null, finished: true };
      }
      await repository.pause(
        fence,
        'EXECUTION_UNAVAILABLE',
        error instanceof ImportError,
        config.maxRecoveries,
        durable.checkpoint,
      );
    } catch {
      /* Lost ownership or unavailable database: expiry, never an unfenced write. */
    }
    return { fence: null, finished: false };
  }
}

export function createImportRunner(dependencies: RunnerDependencies, config: RunnerConfig) {
  configSchema.parse(config);
  const owner = randomUUID();
  const pending = new Map<string, GenerationFence | null>();
  let stopping = false,
    active: Promise<void> | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let scanCursor = 0;
  function schedule() {
    if (!config.enabled || stopping || timer || active) return;
    timer = setTimeout(() => {
      timer = undefined;
      active = drain().finally(() => {
        active = undefined;
        if (pending.size) schedule();
      });
    }, 1000);
    timer.unref();
  }
  async function drain() {
    const next = pending.entries().next().value as [string, GenerationFence | null] | undefined;
    if (!next || stopping) return;
    const [jobId, fence] = next;
    pending.delete(jobId);
    const result = await runImportSlice(
      dependencies,
      config,
      jobId,
      owner,
      fence,
      () => stopping,
    ).catch(() => ({ fence: null, finished: false }));
    if (result.fence) {
      try {
        const repository = await dependencies.repository();
        const state = await repository.view(jobId);
        await repository.pause(
          result.fence,
          stopping ? 'SHUTDOWN' : 'SLICE_YIELD',
          false,
          config.maxRecoveries,
          state.checkpoint,
        );
      } catch {
        /* Database fencing/expiry handles an interrupted yield. */
      }
      result.fence = null;
    }
    if (!result.finished && !stopping) pending.set(jobId, result.fence);
    // Round-robin bounded set. A durable scan happens only when explicitly enabled.
    if (config.resumeOnStartup && ++scanCursor % 10 === 0) await scan();
  }
  async function scan() {
    if (!config.enabled || stopping) return;
    try {
      for (const id of await (await dependencies.repository()).listRunnable(100))
        if (pending.size < 100 && !pending.has(id)) pending.set(id, null);
    } catch {
      /* Storage readiness is operator-controlled; login/health remain independent. */
    }
  }
  return {
    enabled: config.enabled,
    kick(jobId: string) {
      if (config.enabled && !stopping && pending.size < 100 && !pending.has(jobId)) {
        pending.set(jobId, null);
        schedule();
      }
    },
    async start() {
      if (config.enabled && config.resumeOnStartup) {
        await scan();
        schedule();
      }
    },
    async retry(actor: PublicUser, jobId: string, key: string, reason: string) {
      if (!config.enabled || stopping)
        throw new ImportError(503, 'RUNNER_DISABLED', 'Import execution is not enabled.');
      try {
        const result = await (
          await dependencies.repository()
        ).requestRetry(actor, jobId, key, reason);
        this.kick(jobId);
        return result;
      } catch (error) {
        if (!(error instanceof GenerationStorageError))
          throw new ImportError(503, 'EXECUTION_UNAVAILABLE', 'Import execution is unavailable.');
        const status =
          error.message === 'JOB_NOT_FOUND' ? 404 : error.message === 'ADMIN_REQUIRED' ? 403 : 409;
        throw new ImportError(
          status,
          error.message,
          'The import cannot be retried in its current state.',
        );
      }
    },
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      const owned = [...pending.values()].filter(
        (value): value is GenerationFence => value !== null,
      );
      pending.clear();
      await active;
      for (const fence of owned) {
        try {
          const repository = await dependencies.repository();
          const state = await repository.view(fence.jobId);
          await repository.pause(fence, 'SHUTDOWN', false, config.maxRecoveries, state.checkpoint);
        } catch {
          /* Expiry remains the fallback if shutdown cannot release ownership. */
        }
      }
    },
  };
}
export type ImportRunner = ReturnType<typeof createImportRunner>;

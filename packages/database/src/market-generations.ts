import { importJobRecordSchema } from '@darvas/contracts';
import { marketFingerprint } from './market-content.js';
import { recordInput } from './models/market-options.js';
import type { Connection } from 'mongoose';
import { z } from 'zod';
import { GENERATION_LIMITS } from '@darvas/contracts';
import type { MarketReferencePolicy } from '@darvas/contracts';
import { createGenerationContext } from './generation-context.js';
import type { GenerationFence } from './generation-context.js';
export type { GenerationFence } from './generation-context.js';

export function createGenerationRepository(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  return generationOperations(createGenerationContext(connection, clock));
}
export function generationOperations(context: ReturnType<typeof createGenerationContext>) {
  const { fail, fenced, stillLive, plan, capacity, assess, transaction, abandon } = context;
  return {
    capacity,
    reserveCandidate: (fence: GenerationFence, policy: MarketReferencePolicy, expected?: string) =>
      transaction(async (session) => {
        const job = await fenced(fence, session);
        if (expected !== undefined) {
          const state = importJobRecordSchema.parse(recordInput(job));
          if (
            marketFingerprint({
              phase: state.phase,
              cursor: state.cursor,
              counts: state.counts,
              generation: state.generation,
            }) !== expected
          )
            fail('CHECKPOINT_CHANGED');
        }
        if (job.get('phase') !== 'VALIDATING') fail('INVALID_PHASE');
        if (job.get('generation')) fail('ALREADY_RESERVED');
        const state = await plan(job, policy, session);
        if (
          !['PUBLISHED', 'UNAVAILABLE'].includes(state.stock.publication.state) ||
          state.stock.publication.activeJobId ||
          state.stock.publication.revision !== state.batch.preview.baseRevision
        )
          fail('STALE_BASE_REVISION');
        if (
          (await capacity(state.scope.stockId, session)).retainedBytes +
            (state.candidate.noop ? 0 : state.candidate.capacity.bytes) >
          GENERATION_LIMITS.stockBytes
        )
          fail('STOCK_CAPACITY');
        const candidateRevision = state.candidate.noop
          ? null
          : state.stock.publication.revision + 1;
        job.set('generation', {
          basePublishedRevision: state.stock.publication.publishedRevision,
          candidateRevision,
          build: { lastSession: null, rows: 0, bytes: 0 },
          assessment: null,
        });
        await stillLive(fence, session);
        await job.save({ session });
        if (candidateRevision !== null) {
          state.stockDocument.set('publication', {
            ...state.stock.publication,
            state: 'IMPORTING',
            revision: candidateRevision,
            activeJobId: job.id,
          });
          await state.stockDocument.save({ session });
        }
        return { generation: job.get('generation'), plan: state.candidate };
      }),
    assessCandidate: (fence: GenerationFence, policy: MarketReferencePolicy, expected?: string) =>
      transaction(async (session) => {
        const job = await fenced(fence, session);
        if (expected !== undefined) {
          const state = importJobRecordSchema.parse(recordInput(job));
          if (
            marketFingerprint({
              phase: state.phase,
              cursor: state.cursor,
              counts: state.counts,
              generation: state.generation,
            }) !== expected
          )
            fail('CHECKPOINT_CHANGED');
        }
        if (
          !['CHECKING_QUALITY', 'READY_TO_PUBLISH'].includes(String(job.get('phase'))) ||
          job.get('cursor') !== job.get('total')
        )
          fail('INVALID_PHASE');
        const { assessment } = await assess(job, policy, session);
        await stillLive(fence, session);
        job.set('generation.assessment', assessment);
        await job.save({ session });
        return assessment;
      }),
    publish: (fence: GenerationFence, policy: MarketReferencePolicy, expected?: string) =>
      transaction(async (session) => {
        const job = await fenced(fence, session);
        if (expected !== undefined) {
          const state = importJobRecordSchema.parse(recordInput(job));
          if (
            marketFingerprint({
              phase: state.phase,
              cursor: state.cursor,
              counts: state.counts,
              generation: state.generation,
            }) !== expected
          )
            fail('CHECKPOINT_CHANGED');
        }
        if (
          job.get('phase') !== 'READY_TO_PUBLISH' ||
          job.get('cursor') !== job.get('total') ||
          !job.get('generation.assessment')
        )
          fail('ASSESSMENT_REQUIRED');
        const { state, assessment } = await assess(job, policy, session);
        await stillLive(fence, session);
        if (
          state.scope.counts.inserted !== state.candidate.counts.inserted ||
          state.scope.counts.updated !== state.candidate.counts.updated ||
          state.scope.counts.unchanged !== state.candidate.counts.unchanged
        )
          fail('COUNTER_MISMATCH');
        job.set({
          status: 'COMPLETED',
          phase: 'COMPLETED',
          leaseOwner: null,
          leaseUntil: null,
          finishedAt: new Date(),
          'generation.assessment': assessment,
        });
        await job.save({ session });
        if (state.scope.generation!.candidateRevision !== null) {
          state.stockDocument.set('publication', {
            ...state.stock.publication,
            state: 'PUBLISHED',
            publishedRevision: state.scope.generation!.candidateRevision,
            activeJobId: null,
            asOfSession: assessment.latestSession,
            sourceRevisionKey: assessment.contentHash,
          });
          await state.stockDocument.save({ session });
        }
        return {
          datasetRevision:
            state.scope.generation!.candidateRevision ??
            state.scope.generation!.basePublishedRevision,
          noop: state.scope.generation!.candidateRevision === null,
          screeningEligible: false as const,
        };
      }),
    abandonCandidate: (fence: GenerationFence, errorCode: string, expected?: string) =>
      transaction(async (session) => {
        z.string()
          .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
          .parse(errorCode);
        const job = await fenced(fence, session, false);
        if (expected !== undefined) {
          const state = importJobRecordSchema.parse(recordInput(job));
          if (
            marketFingerprint({
              phase: state.phase,
              cursor: state.cursor,
              counts: state.counts,
              generation: state.generation,
            }) !== expected
          )
            fail('CHECKPOINT_CHANGED');
        }
        await abandon(job, errorCode, session);
      }),
  };
}

import type { Connection, ClientSession } from 'mongoose';
import { z } from 'zod';
import {
  initialImportExecution,
  importExecutionSchema,
  importJobRecordSchema,
  dailyOhlcvSchema,
  marketObjectIdSchema,
  GENERATION_LIMITS,
} from '@darvas/contracts';
import type {
  ImportExecution,
  ImportJobRecord,
  MarketReferencePolicy,
  PublicUser,
} from '@darvas/contracts';
import { createGenerationContext } from './generation-context.js';
import type { GenerationFence } from './generation-context.js';
import { generationOperations } from './market-generations.js';
import { generationCapacity, priceBson } from './market-generation-plan.js';
import { recordInput } from './models/market-options.js';
import { marketFingerprint } from './market-content.js';
import { toPublicUser } from './models/index.js';

export function importCheckpoint(job: ImportJobRecord) {
  return marketFingerprint({
    phase: job.phase,
    cursor: job.cursor,
    counts: job.counts,
    generation: job.generation,
  });
}
export function createImportRunnerRepository(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const context = createGenerationContext(connection, clock);
  const { models, auth, id, fail, fenced, stillLive, plan, transaction, capacity } = context;
  const generations = generationOperations(context);
  const execution = (job: ImportJobRecord) =>
    importExecutionSchema.parse(job.execution ?? initialImportExecution());
  async function serverNow() {
    const response = await connection.db!.command({ hello: 1, maxTimeMS: 5000 });
    if (!(response.localTime instanceof Date)) fail('CLOCK_UNAVAILABLE');
    return response.localTime as Date;
  }
  async function view(jobId: string) {
    marketObjectIdSchema.parse(jobId);
    return transaction(async (session) => {
      const document = await models.ImportJob.findById(jobId)
        .session(session)
        .maxTimeMS(5000)
        .orFail();
      const job = importJobRecordSchema.parse(recordInput(document));
      return { jobId: document.id, job, checkpoint: importCheckpoint(job) };
    });
  }
  function current(job: Awaited<ReturnType<typeof fenced>>, expected: string) {
    const state = importJobRecordSchema.parse(recordInput(job));
    if (importCheckpoint(state) !== expected) fail('CHECKPOINT_CHANGED');
    return state;
  }
  async function saveExecution(jobId: string, value: ImportExecution, session: ClientSession) {
    // Technical retry controls do not reopen a terminal job or alter any checkpoint.
    const record = await models.ImportJob.findById(jobId).session(session).orFail();
    record.set('execution', importExecutionSchema.parse(value));
    importJobRecordSchema.parse(recordInput(record));
    const changed = await models.ImportJob.collection.updateOne(
      { _id: record._id, __v: record.get('__v') },
      {
        $set: { execution: record.toObject({ transform: false }).execution, updatedAt: new Date() },
        $inc: { __v: 1 },
      },
      { session },
    );
    if (changed.modifiedCount !== 1) fail('CHECKPOINT_CHANGED');
  }
  return {
    ...generations,
    view,
    async operatorUser(jobId: string) {
      const state = await view(jobId);
      const user = await auth.User.findOne({
        _id: id(state.job.uploadedBy),
        familyId: id(state.job.familyId),
        role: 'ADMIN',
        status: 'ACTIVE',
      }).orFail();
      return toPublicUser(user.toObject());
    },
    async listRunnable(limit = 100) {
      z.number().int().min(1).max(100).parse(limit);
      const now = await serverNow();
      const jobs = await models.ImportJob.find({
        $or: [
          { status: 'QUEUED' },
          { status: 'RUNNING', leaseUntil: { $lte: now } },
          { status: 'RETRY', 'execution.mode': 'AUTO', 'execution.nextAttemptAt': { $lte: now } },
          { status: 'RETRY', 'execution.mode': 'AUTO', 'execution.nextAttemptAt': null },
          { status: 'RETRY', execution: null },
          { status: 'RETRY', 'execution.retryRequested': true },
          { status: 'COMPLETED', 'execution.retiredAt': null },
        ],
      })
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit)
        .select('_id')
        .maxTimeMS(5000);
      return jobs.map((job) => job.id as string);
    },
    async claim(jobId: string, worker: string, leaseMs: number, maxRecoveries: number) {
      marketObjectIdSchema.parse(jobId);
      z.string().min(1).max(120).parse(worker);
      z.number().int().min(1000).max(300_000).parse(leaseMs);
      z.number().int().min(0).max(10).parse(maxRecoveries);
      const now = await serverNow();
      return transaction(async (session) => {
        const job = await models.ImportJob.findById(jobId)
          .session(session)
          .maxTimeMS(5000)
          .orFail();
        const state = importJobRecordSchema.parse(recordInput(job));
        if (['COMPLETED', 'FAILED'].includes(state.status)) return null;
        if (state.status === 'RUNNING' && Date.parse(state.leaseUntil!) > now.getTime())
          return null;
        if (state.attempts >= 100) {
          // Claim exhaustion can only finalize an unowned/expired job. The versioned
          // job write conflicts with any old worker and releases no price data.
          job.set('leaseVersion', state.leaseVersion + 1);
          await context.abandon(job, 'ATTEMPT_LIMIT', session);
          return null;
        }
        const control = execution(state);
        const continuation = state.status === 'RETRY' && state.errorCode === 'SLICE_YIELD';
        if (
          state.status !== 'QUEUED' &&
          !control.retryRequested &&
          (control.mode !== 'AUTO' ||
            (control.nextAttemptAt && Date.parse(control.nextAttemptAt) > now.getTime()))
        )
          return null;
        if (
          state.status !== 'QUEUED' &&
          !control.retryRequested &&
          !continuation &&
          control.autoRecoveries >= maxRecoveries
        ) {
          if (state.status === 'RUNNING') {
            job.set({
              status: 'RETRY',
              errorCode: 'RECOVERY_LIMIT',
              leaseOwner: null,
              leaseUntil: null,
            });
            await job.save({ session });
          }
          await saveExecution(jobId, { ...control, mode: 'MANUAL', nextAttemptAt: null }, session);
          return null;
        }
        if (state.status === 'RUNNING') {
          job.set({
            status: 'RETRY',
            errorCode: 'LEASE_EXPIRED',
            leaseOwner: null,
            leaseUntil: null,
          });
          await job.save({ session });
        }
        const manual = control.retryRequested;
        job.set({
          status: 'RUNNING',
          phase: state.phase === 'QUEUED' ? 'VALIDATING' : state.phase,
          attempts: state.attempts + 1,
          leaseVersion: state.leaseVersion + 1,
          leaseOwner: worker,
          leaseUntil: new Date(now.getTime() + leaseMs),
          startedAt: state.startedAt ?? now,
          errorCode: null,
          execution: {
            ...control,
            blocked: false,
            retryRequested: false,
            autoRecoveries: manual
              ? 0
              : control.autoRecoveries + (state.status === 'QUEUED' || continuation ? 0 : 1),
            nextAttemptAt: null,
            mode: 'AUTO',
          },
        });
        await job.save({ session });
        const fence = {
          jobId,
          familyId: state.familyId,
          uploadedBy: state.uploadedBy,
          leaseOwner: worker,
          leaseVersion: state.leaseVersion + 1,
        };
        await stillLive(fence, session);
        return fence;
      });
    },
    async renew(fence: GenerationFence, expected: string, leaseMs: number) {
      z.number().int().min(1000).max(300_000).parse(leaseMs);
      const now = await serverNow();
      return transaction(async (session) => {
        const job = await fenced(fence, session);
        current(job, expected);
        job.set('leaseUntil', new Date(now.getTime() + leaseMs));
        await job.save({ session });
        await stillLive(fence, session);
      });
    },
    async advance(
      fence: GenerationFence,
      expected: string,
      phase: 'UPSERTING' | 'READY_TO_PUBLISH',
    ) {
      return transaction(async (session) => {
        const job = await fenced(fence, session);
        const state = current(job, expected);
        if (phase === 'UPSERTING' && (!state.generation || state.phase !== 'VALIDATING'))
          fail('GENERATION_REQUIRED');
        if (
          phase === 'READY_TO_PUBLISH' &&
          (state.phase !== 'CHECKING_QUALITY' || !state.generation?.assessment)
        )
          fail('ASSESSMENT_REQUIRED');
        job.set('phase', phase);
        await stillLive(fence, session);
        await job.save({ session });
      });
    },
    async writeChunk(
      fence: GenerationFence,
      expected: string,
      policy: MarketReferencePolicy,
      chunkRows: number,
    ) {
      z.number().int().min(1).max(100).parse(chunkRows);
      return transaction(async (session) => {
        const job = await fenced(fence, session);
        const state = current(job, expected);
        if (state.phase !== 'UPSERTING' || !state.generation) fail('INVALID_PHASE');
        const prepared = await plan(job, policy, session);
        const generation = state.generation!;
        if (generation.basePublishedRevision !== prepared.stock.publication.publishedRevision)
          fail('BASE_REVISION_CHANGED');
        let processedDates: Set<string>, end: number;
        if (generation.candidateRevision === null) {
          if (!prepared.candidate.noop || prepared.stock.publication.activeJobId !== null)
            fail('NOT_A_NOOP');
          end = Math.min(state.total, state.cursor + chunkRows);
          processedDates = new Set(prepared.rows.slice(0, end).map((row) => row.sessionDate));
        } else {
          if (
            prepared.stock.publication.activeJobId !== job.id ||
            prepared.stock.publication.revision !== generation.candidateRevision ||
            prepared.stock.publication.state !== 'IMPORTING'
          )
            fail('RESERVATION_CHANGED');
          const existing = await models.DailyPrice.find({
            stockId: job.get('stockId'),
            datasetRevision: generation.candidateRevision,
          })
            .sort({ sessionDate: 1 })
            .limit(GENERATION_LIMITS.rows + 1)
            .session(session)
            .maxTimeMS(5000);
          const prefix = existing.map((row) => dailyOhlcvSchema.parse(recordInput(row)));
          const usage = generationCapacity(prefix);
          if (
            prefix.length !== generation.build.rows ||
            usage.bytes !== generation.build.bytes ||
            (prefix.at(-1)?.sessionDate ?? null) !== generation.build.lastSession ||
            marketFingerprint(prefix) !==
              marketFingerprint(prepared.candidate.rows.slice(0, prefix.length))
          )
            fail('CHECKPOINT_INTEGRITY');
          const rows = prepared.candidate.rows.slice(prefix.length, prefix.length + chunkRows);
          if (!rows.length) fail('CHECKPOINT_INTEGRITY');
          const now = new Date();
          await models.DailyPrice.collection.insertMany(
            rows.map((row) => ({
              ...priceBson(row),
              _id: new connection.base.Types.ObjectId(),
              createdAt: now,
              updatedAt: now,
              __v: 0,
            })),
            { session, ordered: true, maxTimeMS: 5000 },
          );
          const dates = new Set(rows.map((row) => row.sessionDate));
          const audits = prepared.candidate.revisions.filter((audit) =>
            dates.has(audit.sessionDate),
          );
          if (audits.length) {
            const documents = [];
            for (const audit of audits) {
              const document = new models.PriceRevision(audit);
              await document.validate();
              documents.push({
                ...document.toObject({ transform: false }),
                createdAt: now,
                updatedAt: now,
                __v: 0,
              });
            }
            await models.PriceRevision.collection.insertMany(documents, {
              session,
              ordered: true,
              maxTimeMS: 5000,
            });
          }
          end = prefix.length + rows.length;
          const after = prepared.candidate.rows.slice(0, end);
          job.set('generation.build', {
            rows: end,
            bytes: generationCapacity(after).bytes,
            lastSession: after.at(-1)!.sessionDate,
          });
          processedDates = new Set(
            prepared.rows
              .filter((row) => row.sessionDate <= after.at(-1)!.sessionDate)
              .map((row) => row.sessionDate),
          );
          if ((await capacity(state.stockId, session)).retainedBytes > GENERATION_LIMITS.stockBytes)
            fail('STOCK_CAPACITY');
          const touched = await models.Stock.collection.updateOne(
            {
              _id: prepared.stockDocument._id,
              __v: prepared.stockDocument.get('__v'),
              'publication.activeJobId': job._id,
            },
            { $inc: { __v: 1 } },
            { session },
          );
          if (touched.modifiedCount !== 1) fail('RESERVATION_CHANGED');
        }
        const base = new Set(prepared.base?.rows.map((row) => row.sessionDate));
        const corrections = new Set(prepared.candidate.revisions.map((row) => row.sessionDate));
        const counts = { inserted: 0, updated: 0, unchanged: 0 };
        for (const date of processedDates) {
          if (!base.has(date)) counts.inserted++;
          else if (corrections.has(date)) counts.updated++;
          else counts.unchanged++;
        }
        const complete =
          generation.candidateRevision === null
            ? end === state.total
            : end === prepared.candidate.rows.length;
        job.set({
          cursor: processedDates.size,
          counts,
          phase: complete ? 'CHECKING_QUALITY' : 'UPSERTING',
        });
        await stillLive(fence, session);
        await job.save({ session });
      });
    },
    async pause(
      fence: GenerationFence,
      code: string,
      blocked: boolean,
      maxRecoveries: number,
      expected?: string,
    ) {
      z.string()
        .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
        .parse(code);
      const now = await serverNow();
      return transaction(async (session) => {
        const job = await fenced(fence, session, false);
        if (expected !== undefined) current(job, expected);
        const state = importJobRecordSchema.parse(recordInput(job!));
        const control = execution(state);
        const manual =
          blocked || (code !== 'SLICE_YIELD' && control.autoRecoveries >= maxRecoveries);
        job.set({
          status: 'RETRY',
          errorCode: code,
          leaseOwner: null,
          leaseUntil: null,
          execution: {
            ...control,
            blocked,
            mode: manual ? 'MANUAL' : 'AUTO',
            nextAttemptAt:
              manual || code === 'SLICE_YIELD'
                ? null
                : new Date(
                    now.getTime() + Math.min(30_000, 1000 * 2 ** control.autoRecoveries),
                  ).toISOString(),
          },
        });
        await job.save({ session });
      });
    },
    async requestRetry(actor: PublicUser, jobId: string, key: string, reason: string) {
      marketObjectIdSchema.parse(jobId);
      z.uuid().parse(key);
      z.string().trim().min(1).max(500).parse(reason);
      const now = await serverNow();
      return transaction(async (session) => {
        if (
          !(await auth.User.exists({
            _id: id(actor.id),
            familyId: id(actor.familyId),
            role: 'ADMIN',
            status: 'ACTIVE',
          }).session(session)) ||
          !(await auth.Family.exists({ _id: id(actor.familyId), status: 'ACTIVE' }).session(
            session,
          ))
        )
          fail('ADMIN_REQUIRED');
        const job = await models.ImportJob.findOne({
          _id: id(jobId),
          familyId: id(actor.familyId),
        }).session(session);
        if (!job) fail('JOB_NOT_FOUND');
        const state = importJobRecordSchema.parse(recordInput(job!));
        const control = execution(state);
        const keyHash = marketFingerprint({ actor: actor.id, key });
        const requestHash = marketFingerprint({ jobId, reason: reason.trim() });
        const prior = control.receipts.find((receipt) => receipt.keyHash === keyHash);
        if (prior) {
          if (prior.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT');
          return { jobId, resumeRequested: true as const };
        }
        if (
          ['COMPLETED', 'FAILED'].includes(state.status) ||
          state.attempts >= 100 ||
          control.receipts.length >= 100
        )
          fail('JOB_NOT_RETRYABLE');
        if (state.status === 'RUNNING' && Date.parse(state.leaseUntil!) > now.getTime())
          fail('JOB_BUSY');
        await saveExecution(
          jobId,
          {
            ...control,
            retryRequested: true,
            autoRecoveries: 0,
            mode: 'AUTO',
            nextAttemptAt: null,
            receipts: [
              ...control.receipts,
              {
                keyHash,
                requestHash,
                actor: actor.id,
                reason: reason.trim(),
                acceptedAt: now.toISOString(),
              },
            ],
          },
          session,
        );
        return { jobId, resumeRequested: true as const };
      });
    },
    async retire(jobId: string) {
      marketObjectIdSchema.parse(jobId);
      return transaction(async (session) => {
        const job = await models.ImportJob.findById(jobId).session(session).orFail();
        const state = importJobRecordSchema.parse(recordInput(job));
        if (state.status !== 'COMPLETED') fail('JOB_NOT_COMPLETED');
        const control = execution(state);
        if (control.retiredAt) return;
        const batch = await models.ImportBatch.findById(job.get('importBatchId'))
          .session(session)
          .orFail();
        const rows = await models.ImportStaging.find({ stagingId: batch.get('stagingId') }).session(
          session,
        );
        const manifest = rows.find((row) => row.get('kind') === 'MANIFEST');
        if (
          !manifest ||
          rows.length !== (manifest.get('chunkCount') ?? 0) + 1 ||
          rows.some(
            (row) =>
              row.get('state') !== 'ATTACHED' ||
              row.get('expiresAt') ||
              String(row.get('jobId')) !== jobId ||
              String(row.get('stockId')) !== state.stockId ||
              String(row.get('familyId')) !== state.familyId ||
              String(row.get('uploadedBy')) !== state.uploadedBy,
          )
        )
          fail('STAGING_INTEGRITY');
        const now = new Date();
        await models.ImportStaging.collection.updateMany(
          {
            stagingId: batch.get('stagingId'),
            jobId: job._id,
            state: 'ATTACHED',
            expiresAt: { $exists: false },
          },
          {
            $set: {
              state: 'PURGEABLE',
              expiresAt: new Date(now.getTime() + 7 * 86400_000),
              updatedAt: now,
            },
            $inc: { __v: 1 },
          },
          { session },
        );
        await saveExecution(jobId, { ...control, retiredAt: now.toISOString() }, session);
      });
    },
  };
}
export type ImportRunnerRepository = ReturnType<typeof createImportRunnerRepository>;

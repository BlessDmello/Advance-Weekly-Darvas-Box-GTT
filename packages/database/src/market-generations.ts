import type { ClientSession, Connection } from 'mongoose';
import { z } from 'zod';
import {
  GENERATION_LIMITS,
  dailyOhlcvSchema,
  generationAssessmentSchema,
  importBatchMetadataSchema,
  importJobRecordSchema,
  marketObjectIdSchema,
  normalizedPriceRowSchema,
  stockRecordSchema,
} from '@darvas/contracts';
import type {
  DailyOhlcv,
  GenerationAssessment,
  MarketReferencePolicy,
  NormalizedPriceRow,
} from '@darvas/contracts';
import { createMarketModels } from './market-models.js';
import { createAuthModels } from './models/index.js';
import { recordInput } from './models/market-options.js';
import { createMarketRepository, marketFingerprint } from './market-repository.js';
import { readPublishedPrices } from './published-prices.js';
import {
  generationCapacity,
  GenerationStorageError,
  planCandidateGeneration,
} from './market-generation-plan.js';
import { priceRevisionContract } from './models/price-revision.js';

const fenceSchema = z
  .object({
    jobId: marketObjectIdSchema,
    familyId: marketObjectIdSchema,
    uploadedBy: marketObjectIdSchema,
    leaseOwner: z.string().min(1).max(120),
    leaseVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type GenerationFence = z.infer<typeof fenceSchema>;
/** Storage primitives only. Nothing claims a job, writes price chunks or schedules execution. */
export function createGenerationRepository(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const models = createMarketModels(connection);
  const auth = createAuthModels(connection);
  const reference = createMarketRepository(connection);
  const id = (text: string) => new connection.base.Types.ObjectId(text);
  function fail(code: string): never {
    throw new GenerationStorageError(code);
  }
  async function fenced(fenceInput: GenerationFence, session: ClientSession) {
    const fence = fenceSchema.parse(fenceInput);
    // This actual write serializes takeover/publication; a read-only lease check is insufficient.
    const locked = await models.ImportJob.collection.findOneAndUpdate(
      {
        _id: id(fence.jobId),
        familyId: id(fence.familyId),
        uploadedBy: id(fence.uploadedBy),
        status: 'RUNNING',
        leaseOwner: fence.leaseOwner,
        leaseVersion: fence.leaseVersion,
        $expr: { $gt: ['$leaseUntil', '$$NOW'] },
      },
      { $inc: { __v: 1 } },
      { session, returnDocument: 'after' },
    );
    if (!locked) fail('STALE_FENCE');
    if (
      !(await auth.User.exists({
        _id: id(fence.uploadedBy),
        familyId: id(fence.familyId),
        role: 'ADMIN',
        status: 'ACTIVE',
      }).session(session)) ||
      !(await auth.Family.exists({ _id: id(fence.familyId), status: 'ACTIVE' }).session(session))
    )
      fail('ADMIN_UNAVAILABLE');
    return models.ImportJob.findById(fence.jobId).session(session).orFail();
  }
  async function stillLive(fence: GenerationFence, session: ClientSession) {
    if (
      !(await models.ImportJob.exists({
        _id: id(fence.jobId),
        status: 'RUNNING',
        familyId: id(fence.familyId),
        uploadedBy: id(fence.uploadedBy),
        leaseOwner: fence.leaseOwner,
        leaseVersion: fence.leaseVersion,
        $expr: { $gt: ['$leaseUntil', '$$NOW'] },
      }).session(session))
    )
      fail('STALE_FENCE');
  }
  async function inputFor(job: Awaited<ReturnType<typeof fenced>>, session: ClientSession) {
    const scope = importJobRecordSchema.parse(recordInput(job));
    const batchDocument = await models.ImportBatch.findOne({
      _id: job.get('importBatchId'),
      stockId: job.get('stockId'),
      familyId: job.get('familyId'),
      uploadedBy: job.get('uploadedBy'),
    })
      .session(session)
      .orFail();
    const batch = importBatchMetadataSchema.parse(recordInput(batchDocument));
    const manifest = await models.ImportStaging.findOne({
      _id: id(batch.stagingId),
      kind: 'MANIFEST',
      state: 'ATTACHED',
      jobId: job._id,
      stockId: job.get('stockId'),
      familyId: job.get('familyId'),
      uploadedBy: job.get('uploadedBy'),
      expiresAt: { $exists: false },
    })
      .session(session)
      .orFail();
    const metadata = (recordInput(manifest) as { metadata: unknown }).metadata;
    if (marketFingerprint(metadata) !== marketFingerprint(batch.preview) || !batch.preview.context)
      fail('PAYLOAD_INTEGRITY');
    const chunks = await models.ImportStaging.find({ stagingId: manifest._id, kind: 'CHUNK' })
      .sort({ ordinal: 1 })
      .session(session);
    if (chunks.length !== manifest.get('chunkCount')) fail('PAYLOAD_INTEGRITY');
    const rows: NormalizedPriceRow[] = [];
    for (const [ordinal, chunk] of chunks.entries()) {
      const record = recordInput(chunk) as { rows: NormalizedPriceRow[] };
      if (
        chunk.get('ordinal') !== ordinal ||
        chunk.get('state') !== 'ATTACHED' ||
        chunk.get('expiresAt') ||
        String(chunk.get('jobId')) !== job.id ||
        String(chunk.get('stockId')) !== scope.stockId ||
        String(chunk.get('familyId')) !== scope.familyId ||
        String(chunk.get('uploadedBy')) !== scope.uploadedBy ||
        record.rows.length !== Math.min(100, scope.total - rows.length) ||
        marketFingerprint(record.rows) !== chunk.get('chunkHash')
      )
        fail('PAYLOAD_INTEGRITY');
      for (const value of record.rows) {
        const row = normalizedPriceRowSchema.parse(value);
        if (
          marketFingerprint(row.provenance) !== marketFingerprint(batch.preview.source) ||
          row.sessionDate < batch.preview.range.from ||
          row.sessionDate > batch.preview.range.to ||
          (rows.length > 0 && row.sessionDate <= rows.at(-1)!.sessionDate)
        )
          fail('PAYLOAD_INTEGRITY');
        rows.push(row);
      }
    }
    if (
      rows.length !== scope.total ||
      rows.length !== manifest.get('rowCount') ||
      marketFingerprint(rows) !== batch.preview.normalizedHash
    )
      fail('PAYLOAD_INTEGRITY');
    return { batch, rows, scope };
  }
  async function plan(
    job: Awaited<ReturnType<typeof fenced>>,
    policy: MarketReferencePolicy,
    session: ClientSession,
  ) {
    const input = await inputFor(job, session);
    const stockDocument = await models.Stock.findById(input.scope.stockId)
      .session(session)
      .orFail();
    const stock = stockRecordSchema.parse(recordInput(stockDocument));
    const refs = await reference.references(
      input.scope.stockId,
      input.batch.preview.range,
      policy,
      session,
    );
    const context = input.batch.preview.context!;
    if (
      !refs.approved ||
      !refs.calendar ||
      refs.approvalHash !== context.referenceApprovalHash ||
      refs.dataHash !== context.referenceDataHash ||
      marketFingerprint(context.stockIdentity) !==
        marketFingerprint({
          exchange: stock.exchange,
          symbol: stock.symbol,
          series: stock.series,
        }) ||
      !policy.priceSources.some(
        (source) =>
          source.provider === input.batch.preview.source.provider &&
          source.reference === input.batch.preview.source.reference &&
          source.basis === input.batch.preview.source.basis &&
          source.adjustmentVersion === input.batch.preview.source.adjustmentVersion,
      )
    )
      fail('REFERENCE_CHANGED');
    const base = await readPublishedPrices(connection, input.scope.stockId, session);
    const target = input.scope.generation?.candidateRevision ?? stock.publication.revision + 1;
    const candidate = planCandidateGeneration(base?.rows ?? [], input.rows, {
      stockId: input.scope.stockId,
      datasetRevision: target,
      importBatchId: String(job.get('importBatchId')),
      changedBy: input.scope.uploadedBy,
      correctionReason: input.batch.correctionReason,
      confirmedAt: input.batch.confirmedAt,
    });
    if (
      candidate.counts.inserted !== input.batch.preview.rows.new ||
      candidate.counts.updated !== input.batch.preview.rows.changed ||
      candidate.counts.unchanged !== input.batch.preview.rows.unchanged
    )
      fail('PREVIEW_COUNTS_CHANGED');
    return { ...input, stock, stockDocument, candidate, base };
  }
  async function capacity(stockId: string, session?: ClientSession) {
    marketObjectIdSchema.parse(stockId);
    let bytes = 0,
      rows = 0;
    for (const model of [models.DailyPrice, models.PriceRevision]) {
      const result = await model.collection
        .aggregate<{ bytes: number; rows: number }>(
          [
            { $match: { stockId: id(stockId) } },
            { $group: { _id: null, bytes: { $sum: { $bsonSize: '$$ROOT' } }, rows: { $sum: 1 } } },
          ],
          { ...(session ? { session } : {}), maxTimeMS: 5000 },
        )
        .next();
      bytes += result?.bytes ?? 0;
      rows += result?.rows ?? 0;
    }
    return {
      retainedBytes: bytes,
      retainedRecords: rows,
      stockByteLimit: GENERATION_LIMITS.stockBytes,
      generationRowLimit: GENERATION_LIMITS.rows,
      generationByteLimit: GENERATION_LIMITS.bytes,
      pruningAvailable: false as const,
    };
  }
  async function assess(
    job: Awaited<ReturnType<typeof fenced>>,
    policy: MarketReferencePolicy,
    session: ClientSession,
  ) {
    const state = await plan(job, policy, session);
    const generation = state.scope.generation;
    if (
      !generation ||
      generation.basePublishedRevision !== state.stock.publication.publishedRevision
    )
      fail('BASE_REVISION_CHANGED');
    let rows: DailyOhlcv[];
    if (generation.candidateRevision === null) {
      if (!state.candidate.noop || state.stock.publication.activeJobId !== null) fail('NOT_A_NOOP');
      rows = state.base!.rows;
    } else {
      if (
        state.stock.publication.activeJobId !== job.id ||
        state.stock.publication.revision !== generation.candidateRevision ||
        !['IMPORTING', 'UNPUBLISHED'].includes(state.stock.publication.state)
      )
        fail('RESERVATION_CHANGED');
      const stored = await models.DailyPrice.find({
        stockId: job.get('stockId'),
        datasetRevision: generation.candidateRevision,
      })
        .sort({ sessionDate: 1 })
        .limit(GENERATION_LIMITS.rows + 1)
        .session(session)
        .maxTimeMS(5000);
      rows = stored.map((row) => dailyOhlcvSchema.parse(recordInput(row)));
      const usage = generationCapacity(rows);
      if (
        marketFingerprint(rows) !== state.candidate.contentHash ||
        generation.build.rows !== rows.length ||
        generation.build.bytes !== usage.bytes ||
        generation.build.lastSession !== rows.at(-1)?.sessionDate
      )
        fail('INCOMPLETE_CANDIDATE');
      const audits = await models.PriceRevision.find({
        stockId: job.get('stockId'),
        datasetRevision: generation.candidateRevision,
      })
        .sort({ sessionDate: 1 })
        .limit(5001)
        .session(session);
      if (
        marketFingerprint(
          audits.map((entry) => priceRevisionContract.parse(recordInput(entry))),
        ) !== marketFingerprint(state.candidate.revisions)
      )
        fail('AUDIT_INCOMPLETE');
    }
    if ((await capacity(state.scope.stockId, session)).retainedBytes > GENERATION_LIMITS.stockBytes)
      fail('STOCK_CAPACITY');
    const from = [rows[0]!.sessionDate, state.batch.preview.range.from].sort()[0]!;
    const to = [rows.at(-1)!.sessionDate, state.batch.preview.range.to].sort().at(-1)!;
    const refs = await reference.references(state.scope.stockId, { from, to }, policy, session);
    const calendar = refs.calendar;
    if (
      !refs.approved ||
      !calendar ||
      calendar.days.length !==
        (Date.parse(calendar.to) - Date.parse(calendar.from)) / 86400_000 + 1 ||
      calendar.days.some(
        (day, index) =>
          day.sessionDate !==
          new Date(Date.parse(calendar.from) + index * 86400_000).toISOString().slice(0, 10),
      )
    )
      fail('CALENDAR_INCOMPLETE');
    const open = new Set(calendar.days.filter((day) => day.isOpen).map((day) => day.sessionDate));
    const observed = new Set(rows.map((row) => row.sessionDate));
    if (
      rows.some((row) => !open.has(row.sessionDate)) ||
      [...open].some((date) => date >= from && date <= to && !observed.has(date))
    )
      fail('MISSING_SESSIONS');
    const basis = rows[0]!.provenance;
    if (
      rows.some(
        (row) =>
          row.provenance.basis !== basis.basis ||
          row.provenance.adjustmentVersion !== basis.adjustmentVersion ||
          !policy.priceSources.some(
            (source) =>
              source.provider === row.provenance.provider &&
              source.reference === row.provenance.reference &&
              source.basis === row.provenance.basis &&
              source.adjustmentVersion === row.provenance.adjustmentVersion,
          ),
      )
    )
      fail('PRICE_BASIS_CONFLICT');
    const now = clock();
    const india = new Date(now.getTime() + 330 * 60_000).toISOString();
    const today = india.slice(0, 10),
      time = india.slice(11, 16);
    const expected =
      calendar.from <= today && calendar.to >= today
        ? (calendar.days
            .filter(
              (day) =>
                day.isOpen &&
                (day.sessionDate < today ||
                  (day.sessionDate === today && day.closeTimeLocal! <= time)),
            )
            .at(-1)?.sessionDate ?? null)
        : null;
    const latest = rows.at(-1)!.sessionDate;
    if (expected && latest > expected) fail('FUTURE_SESSION');
    const warnings: GenerationAssessment['warnings'] = [];
    if (basis.basis === 'RAW') warnings.push('RAW_ONLY');
    if (rows.length < state.batch.preview.context!.minimumHistorySessions)
      warnings.push('SHORT_HISTORY');
    if (rows.some((row) => row.provenance.verification === 'DECLARED'))
      warnings.push('DECLARED_SOURCE');
    const freshness = !expected ? 'UNKNOWN' : latest === expected ? 'FRESH' : 'STALE';
    if (freshness === 'STALE') warnings.push('STALE_DATA');
    if (freshness === 'UNKNOWN') warnings.push('UNKNOWN_FRESHNESS');
    return {
      state,
      assessment: generationAssessmentSchema.parse({
        contentHash: marketFingerprint(rows),
        referenceApprovalHash: refs.approvalHash,
        referenceDataHash: refs.dataHash,
        range: { from, to },
        rowCount: rows.length,
        valid: true,
        complete: true,
        freshness,
        expectedSession: expected,
        latestSession: latest,
        calendarVersion: calendar.version,
        warnings,
        assessedAt: now.toISOString(),
        screeningEligible: false,
      }),
    };
  }
  async function transaction<T>(operation: (session: ClientSession) => Promise<T>) {
    return connection.transaction(operation, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  }
  return {
    capacity,
    reserveCandidate: (fence: GenerationFence, policy: MarketReferencePolicy) =>
      transaction(async (session) => {
        const job = await fenced(fence, session);
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
    assessCandidate: (fence: GenerationFence, policy: MarketReferencePolicy) =>
      transaction(async (session) => {
        const job = await fenced(fence, session);
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
    publish: (fence: GenerationFence, policy: MarketReferencePolicy) =>
      transaction(async (session) => {
        const job = await fenced(fence, session);
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
    abandonCandidate: (fence: GenerationFence, errorCode: string) =>
      transaction(async (session) => {
        z.string()
          .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
          .parse(errorCode);
        const job = await fenced(fence, session);
        const generation = job.get('generation');
        const stock = await models.Stock.findById(job.get('stockId')).session(session).orFail();
        if (
          generation?.candidateRevision !== null &&
          generation &&
          (stock.get('publication.activeJobId')?.toString() !== job.id ||
            stock.get('publication.revision') !== generation.candidateRevision ||
            stock.get('publication.publishedRevision') !== generation.basePublishedRevision)
        )
          fail('RESERVATION_CHANGED');
        job.set({
          status: 'FAILED',
          errorCode,
          leaseOwner: null,
          leaseUntil: null,
          finishedAt: new Date(),
        });
        await job.save({ session });
        if (generation?.candidateRevision) {
          const publication = stockRecordSchema.parse(recordInput(stock)).publication;
          stock.set('publication', {
            ...publication,
            state: publication.publishedRevision > 0 ? 'PUBLISHED' : 'UNAVAILABLE',
            activeJobId: null,
          });
          await stock.save({ session });
        }
      }),
  };
}

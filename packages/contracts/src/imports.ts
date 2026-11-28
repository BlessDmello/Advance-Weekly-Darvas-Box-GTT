import { z } from 'zod';
import { jobGenerationSchema } from './market-generations.js';
import { importExecutionSchema } from './import-execution.js';
import {
  dataQualitySchema,
  marketHashSchema,
  marketObjectIdSchema,
  marketTimestampSchema,
  sessionDateSchema,
  sourceProvenanceSchema,
  stockIdentitySchema,
} from './market-data.js';

export const IMPORT_LIMITS = Object.freeze({
  fileBytes: 3 * 1024 * 1024,
  rows: 5000,
  columns: 32,
  chunkRows: 100,
  chunks: 50,
  diagnostics: 100,
  previewMilliseconds: 30 * 60 * 1000,
});
const count = z.number().int().min(0).max(IMPORT_LIMITS.rows);
export const importDiagnosticSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    severity: z.enum(['ERROR', 'WARNING']),
    row: z
      .number()
      .int()
      .min(1)
      .max(IMPORT_LIMITS.rows + 1)
      .nullable(),
    field: z
      .enum(['file', 'symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'source'])
      .nullable(),
    message: z.string().min(1).max(240),
  })
  .strict();
export const importRowCountsSchema = z
  .object({
    read: count,
    valid: count,
    new: count,
    changed: count,
    unchanged: count,
    rejected: count,
  })
  .strict()
  .refine(
    (value) =>
      value.valid + value.rejected === value.read &&
      value.new + value.changed + value.unchanged === value.valid,
  );
export const importPreviewMetadataSchema = z
  .object({
    stockId: marketObjectIdSchema,
    familyId: marketObjectIdSchema,
    uploadedBy: marketObjectIdSchema,
    fileName: z
      .string()
      .min(1)
      .max(160)
      .refine(
        (value) =>
          !/[\\/]/.test(value) &&
          Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
      ),
    fileBytes: z.number().int().min(1).max(IMPORT_LIMITS.fileBytes),
    sha256: marketHashSchema,
    normalizedHash: marketHashSchema,
    fileFormat: z.enum(['CSV', 'XLSX']),
    mode: z.enum(['INITIAL', 'INCREMENTAL']),
    columnMapping: z
      .object({
        date: z.string().min(1).max(120),
        open: z.string().min(1).max(120),
        high: z.string().min(1).max(120),
        low: z.string().min(1).max(120),
        close: z.string().min(1).max(120),
        volume: z.string().min(1).max(120).nullable(),
        symbol: z.string().min(1).max(120).nullable(),
      })
      .strict(),
    parserVersion: z.string().min(1).max(80),
    mappingVersion: z.string().min(1).max(80),
    source: sourceProvenanceSchema,
    range: z
      .object({ from: sessionDateSchema, to: sessionDateSchema })
      .strict()
      .refine((value) => value.from <= value.to),
    rows: importRowCountsSchema,
    quality: dataQualitySchema,
    diagnostics: z.array(importDiagnosticSchema).max(IMPORT_LIMITS.diagnostics),
    baseRevision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    context: z
      .object({
        stockIdentity: stockIdentitySchema,
        referenceApprovalHash: marketHashSchema,
        referenceDataHash: marketHashSchema,
        dateMode: z.enum(['ISO', 'EXCEL_SERIAL']),
        minimumHistorySessions: count,
        expectedCompletedSession: sessionDateSchema.nullable(),
      })
      .strict()
      .optional(),
    expiresAt: marketTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.rows.rejected > 0 && value.quality.blockingErrorCount === 0)
      ctx.addIssue({
        code: 'custom',
        message: 'Rejected rows must be reported as blocking errors.',
      });
    if (value.source.basis === 'UNKNOWN' && value.quality.blockingErrorCount === 0)
      ctx.addIssue({ code: 'custom', message: 'An unknown price basis is not committable.' });
    if (value.quality.calendarVersion === null && value.quality.blockingErrorCount === 0)
      ctx.addIssue({ code: 'custom', message: 'Unknown calendar coverage is not committable.' });
    const errors = value.diagnostics.filter((entry) => entry.severity === 'ERROR').length;
    const warnings = value.diagnostics.length - errors;
    if (errors > value.quality.blockingErrorCount || warnings > value.quality.warningCount)
      ctx.addIssue({ code: 'custom', message: 'Diagnostic samples exceed total counts.' });
  });
export function isImportPreviewCommittable(value: unknown, now: Date): boolean {
  const result = importPreviewMetadataSchema.safeParse(value);
  return (
    result.success &&
    result.data.source.basis !== 'UNKNOWN' &&
    result.data.quality.calendarVersion !== null &&
    result.data.rows.valid > 0 &&
    result.data.rows.rejected === 0 &&
    result.data.quality.valid &&
    result.data.quality.blockingErrorCount === 0 &&
    Date.parse(result.data.expiresAt) > now.getTime()
  );
}
export const importBatchMetadataSchema = z
  .object({
    stockId: marketObjectIdSchema,
    familyId: marketObjectIdSchema,
    uploadedBy: marketObjectIdSchema,
    stagingId: marketObjectIdSchema,
    idempotencyKey: z.uuid(),
    requestHash: marketHashSchema,
    status: z.literal('CONFIRMED'),
    preview: importPreviewMetadataSchema,
    correctionReason: z.string().trim().min(1).max(500).nullable(),
    confirmedAt: marketTimestampSchema,
    processingScope: z.literal('PRICE_IMPORT'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.stockId !== value.preview.stockId ||
      value.familyId !== value.preview.familyId ||
      value.uploadedBy !== value.preview.uploadedBy
    )
      ctx.addIssue({ code: 'custom', message: 'Batch scope must match its preview.' });
    if (!isImportPreviewCommittable(value.preview, new Date(value.confirmedAt)))
      ctx.addIssue({
        code: 'custom',
        message: 'Confirmation requires a valid, unexpired preview.',
      });
    if (value.preview.rows.changed > 0 && !value.correctionReason)
      ctx.addIssue({ code: 'custom', message: 'Historical corrections require a reason.' });
  });

export const importJobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'RETRY', 'COMPLETED', 'FAILED']);
export const publicImportJobStatusSchema = z.enum([
  'QUEUED',
  'VALIDATING',
  'UPSERTING',
  'COMPLETED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
]);
export const importJobPhaseSchema = z.enum([
  'QUEUED',
  'VALIDATING',
  'UPSERTING',
  'CHECKING_QUALITY',
  'READY_TO_PUBLISH',
  'COMPLETED',
]);
export const importJobRecordSchema = z
  .object({
    generation: jobGenerationSchema.nullable().default(null),
    execution: importExecutionSchema.nullable().optional(),
    importBatchId: marketObjectIdSchema,
    stockId: marketObjectIdSchema,
    familyId: marketObjectIdSchema,
    uploadedBy: marketObjectIdSchema,
    status: importJobStatusSchema,
    phase: importJobPhaseSchema,
    processingScope: z.literal('PRICE_IMPORT'),
    derivedStatus: z.literal('DEFERRED'),
    total: z.number().int().min(1).max(IMPORT_LIMITS.rows),
    cursor: count,
    counts: z.object({ inserted: count, updated: count, unchanged: count }).strict(),
    attempts: z.number().int().min(0).max(100),
    leaseVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    leaseOwner: z.string().min(1).max(120).nullable(),
    leaseUntil: marketTimestampSchema.nullable(),
    startedAt: marketTimestampSchema.nullable(),
    finishedAt: marketTimestampSchema.nullable(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: 'custom', message: 'Job lifecycle or checkpoint is inconsistent.' });
    if (
      value.cursor !== value.counts.inserted + value.counts.updated + value.counts.unchanged ||
      value.cursor > value.total
    )
      fail();
    if (value.status === 'RUNNING') {
      if (
        !value.leaseOwner ||
        !value.leaseUntil ||
        !value.startedAt ||
        value.finishedAt ||
        value.attempts < 1 ||
        value.leaseVersion < 1 ||
        ['QUEUED', 'COMPLETED'].includes(value.phase)
      )
        fail();
    } else if (value.leaseOwner || value.leaseUntil) fail();
    if (
      value.status === 'QUEUED' &&
      (value.phase !== 'QUEUED' ||
        value.cursor !== 0 ||
        value.attempts !== 0 ||
        value.leaseVersion !== 0 ||
        value.startedAt ||
        value.finishedAt ||
        value.errorCode)
    )
      fail();
    if (
      value.status === 'COMPLETED' &&
      (value.phase !== 'COMPLETED' ||
        value.cursor !== value.total ||
        !value.startedAt ||
        !value.finishedAt ||
        value.errorCode)
    )
      fail();
    if (
      ['RETRY', 'FAILED'].includes(value.status) &&
      (!value.errorCode || value.phase === 'COMPLETED')
    )
      fail();
    if (value.status === 'RETRY' && (!value.startedAt || value.finishedAt)) fail();
    if (value.status === 'FAILED' && !value.finishedAt) fail();
    if (
      value.startedAt &&
      value.finishedAt &&
      Date.parse(value.finishedAt) < Date.parse(value.startedAt)
    )
      fail();
    if (
      value.status === 'RUNNING' &&
      value.leaseUntil &&
      value.startedAt &&
      Date.parse(value.leaseUntil) <= Date.parse(value.startedAt)
    )
      fail();
  });

export function assertImportJobTransition(previous: ImportJobRecord, next: ImportJobRecord): void {
  importJobRecordSchema.parse(previous);
  importJobRecordSchema.parse(next);
  const allowed: Record<ImportJobStatus, ImportJobStatus[]> = {
    QUEUED: ['RUNNING', 'FAILED'],
    RUNNING: ['RUNNING', 'RETRY', 'COMPLETED', 'FAILED'],
    RETRY: ['RUNNING', 'FAILED'],
    COMPLETED: [],
    FAILED: [],
  };
  if (
    !allowed[previous.status].includes(next.status) ||
    previous.total !== next.total ||
    next.cursor < previous.cursor ||
    next.attempts < previous.attempts ||
    next.leaseVersion < previous.leaseVersion ||
    (next.status === 'COMPLETED' && previous.phase !== 'READY_TO_PUBLISH')
  )
    throw new Error('Invalid import job transition.');
  for (const field of ['importBatchId', 'stockId', 'familyId', 'uploadedBy'] as const)
    if (previous[field] !== next[field]) throw new Error('Import job scope is immutable.');
  for (const field of ['inserted', 'updated', 'unchanged'] as const)
    if (next.counts[field] < previous.counts[field])
      throw new Error('Committed counters cannot move backward.');
  if (
    previous.generation &&
    (!next.generation ||
      previous.generation.basePublishedRevision !== next.generation.basePublishedRevision ||
      previous.generation.candidateRevision !== next.generation.candidateRevision ||
      next.generation.build.rows < previous.generation.build.rows ||
      next.generation.build.bytes < previous.generation.build.bytes ||
      (previous.generation.build.lastSession &&
        (!next.generation.build.lastSession ||
          next.generation.build.lastSession < previous.generation.build.lastSession)))
  )
    throw new Error('Generation identity and durable build progress cannot rewind.');
  if (
    previous.startedAt &&
    (!next.startedAt || Date.parse(previous.startedAt) !== Date.parse(next.startedAt))
  )
    throw new Error('The original start timestamp is immutable.');
  if (
    next.cursor > previous.cursor &&
    (previous.phase !== 'UPSERTING' || !['UPSERTING', 'CHECKING_QUALITY'].includes(next.phase))
  )
    throw new Error('Only price writes advance the checkpoint.');
  if (['CHECKING_QUALITY', 'READY_TO_PUBLISH'].includes(next.phase) && next.cursor !== next.total)
    throw new Error('All rows must be committed before final checks.');
  if (
    next.status === 'RUNNING' &&
    previous.status !== 'RUNNING' &&
    (next.leaseVersion !== previous.leaseVersion + 1 || next.attempts !== previous.attempts + 1)
  )
    throw new Error('A new claim requires a fresh fencing version.');
  if (
    previous.status === 'RUNNING' &&
    next.status === 'RUNNING' &&
    (previous.leaseOwner !== next.leaseOwner ||
      previous.leaseVersion !== next.leaseVersion ||
      previous.attempts !== next.attempts)
  )
    throw new Error('Lease takeover requires an explicit retry transition.');
  const phases = importJobPhaseSchema.options;
  const delta = phases.indexOf(next.phase) - phases.indexOf(previous.phase);
  if (next.status === 'RUNNING' && (delta < 0 || delta > 1))
    throw new Error('Processing phases cannot be skipped.');
}
export function publicImportJobStatus(job: ImportJobRecord): PublicImportJobStatus {
  importJobRecordSchema.parse(job);
  if (job.status === 'RETRY') return 'FAILED_RETRYABLE';
  if (job.status === 'FAILED') return 'FAILED_FINAL';
  if (job.status === 'RUNNING') return job.phase === 'VALIDATING' ? 'VALIDATING' : 'UPSERTING';
  return job.status;
}
export const stagingRetentionSchema = z
  .object({
    state: z.enum(['PREVIEW', 'ATTACHED', 'PURGEABLE']),
    jobId: marketObjectIdSchema.nullable(),
    expiresAt: marketTimestampSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.state === 'ATTACHED'
        ? value.jobId !== null && value.expiresAt === undefined
        : value.expiresAt !== undefined && (value.state !== 'PREVIEW' || value.jobId === null),
    'Attached payloads must have a job and no TTL deadline.',
  );

export type ImportDiagnostic = z.infer<typeof importDiagnosticSchema>;
export type ImportPreviewMetadata = z.infer<typeof importPreviewMetadataSchema>;
export type ImportBatchMetadata = z.infer<typeof importBatchMetadataSchema>;
export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;
export type PublicImportJobStatus = z.infer<typeof publicImportJobStatusSchema>;
export type ImportJobPhase = z.infer<typeof importJobPhaseSchema>;
export type ImportJobRecord = z.infer<typeof importJobRecordSchema>;
export type StagingRetention = z.infer<typeof stagingRetentionSchema>;

import { expect, it } from 'vitest';
import {
  IMPORT_LIMITS,
  assertImportJobTransition,
  importBatchMetadataSchema,
  importJobRecordSchema,
  importPreviewMetadataSchema,
  isImportPreviewCommittable,
  publicImportJobStatus,
  stagingRetentionSchema,
} from './imports.js';
import {
  marketIds,
  runningJob,
  syntheticBatch,
  syntheticJob,
  syntheticPreview,
} from '../../../tests/support/market-records.js';

it('requires bounded, unexpired previews with explicit source and coherent row counts', () => {
  const preview = syntheticPreview();
  expect(isImportPreviewCommittable(preview, new Date())).toBe(true);
  expect(
    isImportPreviewCommittable({ ...preview, expiresAt: new Date(0).toISOString() }, new Date()),
  ).toBe(false);
  for (const changes of [
    { fileBytes: IMPORT_LIMITS.fileBytes + 1 },
    { fileName: '../bad.csv' },
    { rows: { ...preview.rows, rejected: 1 } },
    { source: { ...preview.source, basis: 'UNKNOWN' } },
  ])
    expect(importPreviewMetadataSchema.safeParse({ ...preview, ...changes }).success).toBe(false);
  const unknown = {
    ...preview,
    source: { ...preview.source, basis: 'UNKNOWN' },
    quality: { ...preview.quality, valid: false, complete: false, blockingErrorCount: 1 },
  };
  expect(importPreviewMetadataSchema.safeParse(unknown).success).toBe(true);
  expect(isImportPreviewCommittable(unknown, new Date())).toBe(false);
  const unknownCalendar = {
    ...preview,
    quality: {
      ...preview.quality,
      calendarVersion: null,
      valid: false,
      complete: false,
      blockingErrorCount: 1,
    },
  };
  expect(importPreviewMetadataSchema.safeParse(unknownCalendar).success).toBe(true);
  expect(isImportPreviewCommittable(unknownCalendar, new Date())).toBe(false);
});
it('binds confirmation to preview family/actor/stock and requires correction reasons', () => {
  const batch = syntheticBatch();
  expect(importBatchMetadataSchema.safeParse(batch).success).toBe(true);
  for (const field of ['stockId', 'familyId', 'uploadedBy'] as const)
    expect(importBatchMetadataSchema.safeParse({ ...batch, [field]: 'f'.repeat(24) }).success).toBe(
      false,
    );
  const correction = {
    ...batch,
    preview: { ...batch.preview, rows: { ...batch.preview.rows, new: 1, changed: 1 } },
  };
  expect(importBatchMetadataSchema.safeParse(correction).success).toBe(false);
  expect(
    importBatchMetadataSchema.safeParse({ ...correction, correctionReason: 'Synthetic correction' })
      .success,
  ).toBe(true);
});
it('enforces claim fencing, monotonic checkpoints and ordered processing phases', () => {
  const queued = syntheticJob();
  const running = runningJob();
  expect(() => assertImportJobTransition(queued, running)).not.toThrow();
  expect(() =>
    assertImportJobTransition(queued, { ...running, phase: 'READY_TO_PUBLISH' }),
  ).toThrow();
  expect(() => assertImportJobTransition(queued, { ...running, leaseVersion: 0 })).toThrow();
  const retry = {
    ...running,
    status: 'RETRY' as const,
    leaseOwner: null,
    leaseUntil: null,
    errorCode: 'TRANSIENT_FAILURE',
  };
  expect(() => assertImportJobTransition(running, retry)).not.toThrow();
  expect(publicImportJobStatus(retry)).toBe('FAILED_RETRYABLE');
  expect(() => assertImportJobTransition(retry, running)).toThrow();
  expect(() =>
    assertImportJobTransition(retry, { ...running, attempts: 2, leaseVersion: 2 }),
  ).not.toThrow();
  expect(() =>
    assertImportJobTransition(running, { ...running, familyId: 'f'.repeat(24) }),
  ).toThrow();
});
it('cannot claim completion or release a lease while a job is incomplete', () => {
  const job = runningJob();
  expect(importJobRecordSchema.safeParse({ ...job, cursor: 1 }).success).toBe(false);
  expect(importJobRecordSchema.safeParse({ ...job, leaseOwner: null }).success).toBe(false);
  expect(
    importJobRecordSchema.safeParse({ ...job, status: 'COMPLETED', phase: 'COMPLETED' }).success,
  ).toBe(false);
  const ready = {
    ...job,
    phase: 'READY_TO_PUBLISH' as const,
    cursor: 2,
    counts: { inserted: 2, updated: 0, unchanged: 0 },
  };
  const completed = {
    ...ready,
    status: 'COMPLETED' as const,
    phase: 'COMPLETED' as const,
    leaseOwner: null,
    leaseUntil: null,
    finishedAt: new Date().toISOString(),
  };
  expect(() => assertImportJobTransition(ready, completed)).not.toThrow();
  expect(publicImportJobStatus(completed)).toBe('COMPLETED');
  expect(completed.derivedStatus).toBe('DEFERRED');
  expect(() => assertImportJobTransition(completed, completed)).toThrow();
});
it('keeps active staging payloads entirely outside TTL retention', () => {
  expect(
    stagingRetentionSchema.safeParse({ state: 'ATTACHED', jobId: marketIds.job }).success,
  ).toBe(true);
  expect(
    stagingRetentionSchema.safeParse({
      state: 'ATTACHED',
      jobId: marketIds.job,
      expiresAt: new Date().toISOString(),
    }).success,
  ).toBe(false);
  expect(stagingRetentionSchema.safeParse({ state: 'PREVIEW', jobId: null }).success).toBe(false);
  expect(
    stagingRetentionSchema.safeParse({
      state: 'PREVIEW',
      jobId: marketIds.job,
      expiresAt: new Date().toISOString(),
    }).success,
  ).toBe(false);
});

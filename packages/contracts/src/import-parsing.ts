import { z } from 'zod';
import { IMPORT_LIMITS, importDiagnosticSchema, importPreviewMetadataSchema } from './imports.js';
import {
  marketObjectIdSchema,
  ohlcSchema,
  sessionDateSchema,
  sourceProvenanceSchema,
  stockIdentitySchema,
  volumeTextSchema,
} from './market-data.js';

export const importColumnMappingSchema = importPreviewMetadataSchema.shape.columnMapping.refine(
  (mapping) => {
    const columns = Object.values(mapping).filter((column) => column !== null);
    return new Set(columns).size === columns.length;
  },
  'Each mapped field must use a distinct column.',
);

/** Observed prices retain their declared basis at result level, including UNKNOWN.
 * They are NOT stored daily-price records or proof of reference-data verification. */
export const parsedOhlcvSchema = z
  .object({
    sessionDate: sessionDateSchema,
    ohlc: ohlcSchema,
    volume: volumeTextSchema.nullable(),
  })
  .strict();
export const importParseOptionsSchema = z
  .object({
    stock: stockIdentitySchema.extend({ stockId: marketObjectIdSchema }),
    mapping: importColumnMappingSchema,
    source: sourceProvenanceSchema,
    dateMode: z.enum(['ISO', 'EXCEL_SERIAL']),
    requestedRange: importPreviewMetadataSchema.shape.range,
    minimumHistorySessions: z.number().int().min(0).max(IMPORT_LIMITS.rows),
    expectedCompletedSession: sessionDateSchema.nullable(),
  })
  .strict();

export const importSessionAssessmentSchema = z
  .object({
    coverage: z.enum(['UNAVAILABLE', 'PARTIAL', 'VERIFIED']),
    calendarVersion: z.string().min(1).max(120).nullable(),
    complete: z.boolean(),
    expectedSessionCount: z.number().int().min(0).max(20_000),
    missingSessions: z.array(sessionDateSchema).max(IMPORT_LIMITS.rows),
    missingSessionCount: z.number().int().min(0).max(20_000),
    latestSession: sessionDateSchema.nullable(),
    freshness: z.enum(['UNKNOWN', 'FRESH', 'STALE']),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.coverage !== 'UNAVAILABLE' && value.calendarVersion === null) ||
      (value.complete && (value.coverage !== 'VERIFIED' || value.missingSessionCount !== 0)) ||
      value.missingSessionCount < value.missingSessions.length ||
      (value.freshness !== 'UNKNOWN' && (value.coverage !== 'VERIFIED' || !value.latestSession))
    )
      ctx.addIssue({ code: 'custom', message: 'Session completeness metadata is inconsistent.' });
  });
export const importParseResultSchema = z
  .object({
    parserVersion: z.literal('market-parser-v1'),
    stock: importParseOptionsSchema.shape.stock,
    source: sourceProvenanceSchema,
    format: z.enum(['CSV', 'XLSX']).nullable(),
    records: z.array(parsedOhlcvSchema).max(IMPORT_LIMITS.rows),
    counts: z
      .object({
        original: z.number().int().min(0).max(IMPORT_LIMITS.rows),
        normalized: z.number().int().min(0).max(IMPORT_LIMITS.rows),
        invalid: z.number().int().min(0).max(IMPORT_LIMITS.rows),
        identicalDuplicates: z.number().int().min(0).max(IMPORT_LIMITS.rows),
        conflictingDuplicates: z.number().int().min(0).max(IMPORT_LIMITS.rows),
      })
      .strict(),
    diagnostics: z.array(importDiagnosticSchema).max(IMPORT_LIMITS.diagnostics),
    errorCount: z.number().int().min(0).max(100_000),
    warningCount: z.number().int().min(0).max(100_000),
    diagnosticsTruncated: z.boolean(),
    sessions: importSessionAssessmentSchema,
    eligibleForConfirmation: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.counts.normalized !== value.records.length ||
      (value.eligibleForConfirmation &&
        (value.errorCount > 0 ||
          value.records.length === 0 ||
          value.source.basis === 'UNKNOWN' ||
          value.source.basis === 'BOTH' ||
          value.sessions.coverage !== 'VERIFIED' ||
          !value.sessions.complete))
    )
      ctx.addIssue({ code: 'custom', message: 'Parser result readiness is inconsistent.' });
    if (
      value.counts.normalized +
        value.counts.invalid +
        value.counts.identicalDuplicates +
        value.counts.conflictingDuplicates >
        value.counts.original ||
      value.records.some(
        (row, index) => index > 0 && row.sessionDate <= value.records[index - 1]!.sessionDate,
      ) ||
      value.diagnostics.filter((entry) => entry.severity === 'ERROR').length > value.errorCount ||
      value.diagnostics.filter((entry) => entry.severity === 'WARNING').length >
        value.warningCount ||
      value.diagnosticsTruncated !==
        value.errorCount + value.warningCount > value.diagnostics.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Parser counts, order or diagnostics are inconsistent.',
      });
  });
export type ImportColumnMapping = z.infer<typeof importColumnMappingSchema>;
export type ParsedOhlcv = z.infer<typeof parsedOhlcvSchema>;
export type ImportParseOptions = z.infer<typeof importParseOptionsSchema>;
export type ImportSessionAssessment = z.infer<typeof importSessionAssessmentSchema>;
export type ImportParseResult = z.infer<typeof importParseResultSchema>;

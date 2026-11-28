import { z } from 'zod';
import {
  importColumnMappingSchema,
  importParseOptionsSchema,
  importParseResultSchema,
  importSessionAssessmentSchema,
} from './import-parsing.js';
import {
  importPreviewMetadataSchema,
  importRowCountsSchema,
  importDiagnosticSchema,
  publicImportJobStatusSchema,
  importJobPhaseSchema,
} from './imports.js';
import {
  marketHashSchema,
  marketObjectIdSchema,
  marketTimestampSchema,
  sessionDateSchema,
  sourceProvenanceSchema,
  stockIdentitySchema,
} from './market-data.js';

export const marketReferencePolicySchema = z
  .object({
    stocks: z
      .array(z.object({ stockId: marketObjectIdSchema, fingerprint: marketHashSchema }).strict())
      .max(1000),
    calendars: z
      .array(
        z
          .object({
            source: z.string().min(1).max(500),
            version: z.string().min(1).max(120),
            from: sessionDateSchema,
            to: sessionDateSchema,
            fingerprint: marketHashSchema,
          })
          .strict()
          .refine(
            (value) =>
              value.from <= value.to &&
              Date.parse(value.to) - Date.parse(value.from) < 20_000 * 86400_000,
          ),
      )
      .max(20),
    priceSources: z
      .array(
        z
          .object({
            provider: sourceProvenanceSchema.shape.provider,
            reference: sourceProvenanceSchema.shape.reference,
            basis: z.enum(['RAW', 'ADJUSTED']),
            adjustmentVersion: sourceProvenanceSchema.shape.adjustmentVersion,
          })
          .strict()
          .refine((value) => value.basis !== 'ADJUSTED' || value.adjustmentVersion !== null),
      )
      .max(1000),
  })
  .strict();
export const importPreviewInputSchema = z
  .object({
    stockSymbol: stockIdentitySchema.shape.symbol,
    series: stockIdentitySchema.shape.series.default('EQ'),
    mapping: importColumnMappingSchema,
    source: z
      .object({
        provider: sourceProvenanceSchema.shape.provider,
        reference: sourceProvenanceSchema.shape.reference,
        adjustmentVersion: sourceProvenanceSchema.shape.adjustmentVersion,
      })
      .strict(),
    adjustmentBasis: sourceProvenanceSchema.shape.basis,
    dateMode: importParseOptionsSchema.shape.dateMode,
    requestedRange: importParseOptionsSchema.shape.requestedRange.refine(
      (range) => Date.parse(range.to) - Date.parse(range.from) < 20_000 * 86400_000,
    ),
    minimumHistorySessions: importParseOptionsSchema.shape.minimumHistorySessions,
    expectedCompletedSession: sessionDateSchema.nullable(),
    mode: importPreviewMetadataSchema.shape.mode.default('INITIAL'),
  })
  .strict()
  .refine(
    (value) =>
      !['ADJUSTED', 'BOTH'].includes(value.adjustmentBasis) ||
      value.source.adjustmentVersion !== null,
    'Adjusted data requires its declared adjustment version.',
  );
export const importCommitInputSchema = z
  .object({
    previewToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    correctionReason: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .strict();
export const marketPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: marketObjectIdSchema.optional(),
  })
  .strict();
export const stockLookupQuerySchema = marketPageQuerySchema.extend({
  query: z.string().trim().max(80).default(''),
});
const queuedScope = {
  processingScope: z.literal('PRICE_IMPORT'),
  derivedStatus: z.literal('DEFERRED'),
  executionAvailable: z.literal(false),
};
const pagination = z.object({ nextCursor: marketObjectIdSchema.nullable() }).strict();
export const importPreviewResponseSchema = z
  .object({
    data: z
      .object({
        previewToken: importCommitInputSchema.shape.previewToken,
        symbol: stockIdentitySchema.shape.symbol,
        fileFormat: importPreviewMetadataSchema.shape.fileFormat,
        dateRange: importPreviewMetadataSchema.shape.range,
        rows: importRowCountsSchema,
        normalization: importParseResultSchema.shape.counts,
        missingSessions: z.array(sessionDateSchema).max(5000),
        blockingErrors: z.array(importDiagnosticSchema).max(100),
        warnings: z.array(importDiagnosticSchema).max(100),
        errorCount: z.number().int().min(0).max(100_000),
        warningCount: z.number().int().min(0).max(100_000),
        diagnosticsTruncated: z.boolean(),
        completeness: importSessionAssessmentSchema,
        correctionPreview: z
          .object({
            changed: z.number().int().min(0).max(5000),
            basisConflicts: z.number().int().min(0).max(5000),
            requiresReason: z.boolean(),
          })
          .strict(),
        committable: z.boolean(),
        expiresAt: marketTimestampSchema,
        processingScope: queuedScope.processingScope,
        derivedStatus: queuedScope.derivedStatus,
      })
      .strict()
      .refine(
        (value) =>
          !value.committable ||
          (value.errorCount === 0 && value.rows.valid > 0 && value.completeness.complete),
        'Blocked previews cannot be confirmed.',
      ),
  })
  .strict();
export const importConfirmationResponseSchema = z
  .object({
    data: z
      .object({
        batchId: marketObjectIdSchema,
        jobId: marketObjectIdSchema,
        status: publicImportJobStatusSchema,
        executionAvailable: z.literal(false),
      })
      .strict(),
  })
  .strict();
export const stockListResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: marketObjectIdSchema,
            ...stockIdentitySchema.shape,
            companyName: z.string().min(1).max(160),
            status: z.enum(['ACTIVE', 'INACTIVE']),
            referenceApproved: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    meta: pagination,
  })
  .strict();
const progressCount = z.number().int().min(0).max(5000);
export const importJobResponseSchema = z
  .object({
    data: z
      .object({
        jobId: marketObjectIdSchema,
        batchId: marketObjectIdSchema,
        status: publicImportJobStatusSchema,
        phase: importJobPhaseSchema,
        processed: progressCount,
        total: progressCount,
        inserted: progressCount,
        updated: progressCount,
        unchanged: progressCount,
        failed: progressCount,
        errors: z
          .array(z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/) }).strict())
          .max(100),
        startedAt: marketTimestampSchema.nullable(),
        finishedAt: marketTimestampSchema.nullable(),
        ...queuedScope,
      })
      .strict(),
  })
  .strict();
export const importBatchesResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            batchId: marketObjectIdSchema,
            jobId: marketObjectIdSchema,
            stockId: marketObjectIdSchema,
            symbol: stockIdentitySchema.shape.symbol.nullable(),
            fileFormat: importPreviewMetadataSchema.shape.fileFormat,
            dateRange: importPreviewMetadataSchema.shape.range,
            rows: importRowCountsSchema,
            confirmedAt: marketTimestampSchema,
            status: publicImportJobStatusSchema,
            ...queuedScope,
          })
          .strict(),
      )
      .max(100),
    meta: pagination,
  })
  .strict();
export type MarketReferencePolicy = z.infer<typeof marketReferencePolicySchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewInputSchema>;
export type ImportCommitInput = z.infer<typeof importCommitInputSchema>;
export type MarketPageQuery = z.infer<typeof marketPageQuerySchema>;
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;
export type ImportConfirmationResponse = z.infer<typeof importConfirmationResponseSchema>;
export type StockListResponse = z.infer<typeof stockListResponseSchema>;
export type ImportJobResponse = z.infer<typeof importJobResponseSchema>;
export type ImportBatchesResponse = z.infer<typeof importBatchesResponseSchema>;

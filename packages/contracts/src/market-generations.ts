import { z } from 'zod';
import { marketHashSchema, marketTimestampSchema, sessionDateSchema } from './market-data.js';

export const GENERATION_LIMITS = Object.freeze({
  rows: 20_000,
  bytes: 32 * 1024 * 1024,
  stockBytes: 128 * 1024 * 1024,
  rowBytes: 16 * 1024,
});
export const generationAssessmentSchema = z
  .object({
    contentHash: marketHashSchema,
    referenceApprovalHash: marketHashSchema,
    referenceDataHash: marketHashSchema,
    range: z.object({ from: sessionDateSchema, to: sessionDateSchema }).strict(),
    rowCount: z.number().int().min(1).max(GENERATION_LIMITS.rows),
    valid: z.literal(true),
    complete: z.literal(true),
    freshness: z.enum(['FRESH', 'STALE', 'UNKNOWN']),
    expectedSession: sessionDateSchema.nullable(),
    latestSession: sessionDateSchema,
    calendarVersion: z.string().min(1).max(120),
    warnings: z
      .array(
        z.enum(['RAW_ONLY', 'SHORT_HISTORY', 'STALE_DATA', 'UNKNOWN_FRESHNESS', 'DECLARED_SOURCE']),
      )
      .max(5),
    assessedAt: marketTimestampSchema,
    screeningEligible: z.literal(false),
  })
  .strict()
  .refine(
    (value) =>
      value.range.from <= value.range.to &&
      value.latestSession <= value.range.to &&
      (value.freshness === 'UNKNOWN'
        ? value.expectedSession === null
        : value.expectedSession !== null &&
          (value.freshness === 'FRESH'
            ? value.latestSession === value.expectedSession
            : value.latestSession < value.expectedSession)),
  );
export const jobGenerationSchema = z
  .object({
    basePublishedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    candidateRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable(),
    build: z
      .object({
        lastSession: sessionDateSchema.nullable(),
        rows: z.number().int().min(0).max(GENERATION_LIMITS.rows),
        bytes: z.number().int().min(0).max(GENERATION_LIMITS.bytes),
      })
      .strict(),
    assessment: generationAssessmentSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      (value.build.rows === 0) === (value.build.lastSession === null) &&
      (value.candidateRevision === null || value.candidateRevision > value.basePublishedRevision),
  );
export type GenerationAssessment = z.infer<typeof generationAssessmentSchema>;
export type JobGeneration = z.infer<typeof jobGenerationSchema>;

import { z } from 'zod';
import { marketHashSchema, marketObjectIdSchema, marketTimestampSchema } from './market-data.js';
export const importExecutionSchema = z
  .object({
    autoRecoveries: z.number().int().min(0).max(100),
    mode: z.enum(['AUTO', 'MANUAL']),
    nextAttemptAt: marketTimestampSchema.nullable(),
    blocked: z.boolean(),
    retryRequested: z.boolean(),
    retiredAt: marketTimestampSchema.nullable(),
    receipts: z
      .array(
        z
          .object({
            keyHash: marketHashSchema,
            requestHash: marketHashSchema,
            actor: marketObjectIdSchema,
            reason: z.string().trim().min(1).max(500),
            acceptedAt: marketTimestampSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export function initialImportExecution(): z.infer<typeof importExecutionSchema> {
  return {
    autoRecoveries: 0,
    mode: 'AUTO',
    nextAttemptAt: null,
    blocked: false,
    retryRequested: false,
    retiredAt: null,
    receipts: [],
  };
}
export const importRetryInputSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const importRetryResponseSchema = z
  .object({
    data: z.object({ jobId: marketObjectIdSchema, resumeRequested: z.literal(true) }).strict(),
  })
  .strict();
export const importRecoverySchema = z
  .object({
    retryAllowed: z.boolean(),
    blocked: z.boolean(),
    automaticRecoveries: z.number().int().min(0).max(100),
    nextAttemptAt: marketTimestampSchema.nullable(),
    payloadRetired: z.boolean(),
  })
  .strict();
export type ImportExecution = z.infer<typeof importExecutionSchema>;

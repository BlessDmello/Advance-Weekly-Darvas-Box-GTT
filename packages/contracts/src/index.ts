import { z } from 'zod';
export * from './auth.js';
export * from './invitations.js';
export * from './market-data.js';
export * from './imports.js';
export * from './import-parsing.js';
export * from './market-api.js';
export * from './market-generations.js';
export * from './import-execution.js';

export const nonEmptyStringSchema = z.string().trim().min(1);
export const portSchema = z.coerce.number().int().min(1).max(65535);

export function createSuccessSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({ success: z.literal(true), data: dataSchema });
}

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
]);

export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: apiErrorCodeSchema,
    message: nonEmptyStringSchema,
    requestId: z.string().uuid(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const healthResponseSchema = createSuccessSchema(
  z.object({ status: z.literal('ok'), service: z.literal('advanced-darvas-api') }),
);

export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

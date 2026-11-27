import { z } from 'zod';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
export const emailSchema = z.string().transform(normalizeEmail).pipe(z.email().max(254));
export const displayNameSchema = z.string().trim().min(1).max(100);
export const workspaceNameSchema = z.string().trim().min(1).max(100);
export const userRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export const accountStatusSchema = z.enum(['ACTIVE', 'DISABLED']);
export const invitationStatusSchema = z.enum(['PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED']);

// An allowlist: never serialize a persistence document as an API profile.
export const publicUserSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  familyId: z.string().regex(/^[a-f\d]{24}$/i),
  email: emailSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  status: accountStatusSchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const loginInputSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => Array.from(value).length <= 128 && !value.includes('\0')),
    rememberMe: z.boolean().default(false),
  })
  .strict();
export const authProfileSchema = z.object({ data: z.object({ user: publicUserSchema }) });
export const csrfResponseSchema = z.object({
  data: z.object({ csrfToken: z.string().min(1).max(512) }),
});
export const authErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CSRF_INVALID',
  'RATE_LIMITED',
  'AUTH_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export const authErrorSchema = z.object({
  error: z.object({
    code: authErrorCodeSchema,
    message: z.string(),
    requestId: z.string().uuid(),
  }),
});
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;

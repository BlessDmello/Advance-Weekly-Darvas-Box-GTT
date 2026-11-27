import { z } from 'zod';
import { displayNameSchema, emailSchema, invitationStatusSchema } from './auth.js';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const newPasswordSchema = z
  .string()
  .max(256)
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 15 && length <= 128 && !value.includes('\0');
  }, 'Use 15 to 128 characters.');
export const createInvitationSchema = z
  .object({ email: emailSchema, expiresInHours: z.literal(72).default(72) })
  .strict();
export const verifyInvitationSchema = z.object({ token: invitationTokenSchema }).strict();
export const acceptInvitationSchema = verifyInvitationSchema
  .extend({ displayName: displayNameSchema, password: newPasswordSchema })
  .strict();
export const deliveryStateSchema = z.enum(['PENDING', 'ACCEPTED', 'FAILED', 'UNCONFIRMED']);
export const invitationDtoSchema = z.object({
  invitationId: objectIdSchema,
  email: emailSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  delivery: deliveryStateSchema,
});
export type InvitationDto = z.infer<typeof invitationDtoSchema>;
export const invitationResponseSchema = z.object({ data: invitationDtoSchema });
export const invitationListQuerySchema = z
  .object({
    status: invitationStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export const invitationListSchema = z.object({
  data: z.array(invitationDtoSchema),
  meta: z.object({ nextCursor: z.string().nullable() }),
});
export const invitationVerificationSchema = z.object({
  data: z.discriminatedUnion('state', [
    z.object({
      state: z.literal('VALID'),
      email: emailSchema,
      familyName: z.string(),
      inviterName: z.string(),
      expiresAt: z.iso.datetime(),
    }),
    z.object({ state: z.enum(['INVALID', 'EXPIRED', 'CONSUMED', 'REVOKED']) }),
  ]),
});
export const invitationAcceptedSchema = z.object({ data: z.object({ userId: objectIdSchema }) });
export type InvitationVerification = z.infer<typeof invitationVerificationSchema>['data'];
export const invitationErrorCodeSchema = z.enum([
  'INVITATION_INVALID',
  'INVITATION_CONFLICT',
  'INVITATION_UNAVAILABLE',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CSRF_INVALID',
  'ALREADY_AUTHENTICATED',
]);
export type InvitationErrorCode = z.infer<typeof invitationErrorCodeSchema>;

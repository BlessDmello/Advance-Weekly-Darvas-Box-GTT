import { expect, it } from 'vitest';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  newPasswordSchema,
} from './invitations.js';
it('normalizes addresses and fixes the lifetime at 72 hours', () => {
  expect(createInvitationSchema.parse({ email: ' A+tag@Example.com ' })).toEqual({
    email: 'a+tag@example.com',
    expiresInHours: 72,
  });
  expect(
    createInvitationSchema.safeParse({ email: 'a@example.com', expiresInHours: 48 }).success,
  ).toBe(false);
});
it('rejects privilege/family/email substitution during acceptance', () => {
  const input = {
    token: 'a'.repeat(43),
    displayName: 'Name',
    password: 'safe synthetic passphrase',
  };
  expect(acceptInvitationSchema.safeParse(input).success).toBe(true);
  for (const extra of [
    { role: 'ADMIN' },
    { familyId: 'a'.repeat(24) },
    { email: 'other@example.com' },
  ])
    expect(acceptInvitationSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});
it('uses the existing password length policy without new composition requirements', () => {
  expect(newPasswordSchema.safeParse('a'.repeat(15)).success).toBe(true);
  expect(newPasswordSchema.safeParse('a'.repeat(14)).success).toBe(false);
  expect(newPasswordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  expect(newPasswordSchema.safeParse('a'.repeat(15) + '\0').success).toBe(false);
});

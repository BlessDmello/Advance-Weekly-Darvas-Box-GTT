import { describe, expect, it } from 'vitest';
import { accountStatusSchema, emailSchema, publicUserSchema, userRoleSchema } from './auth.js';

describe('identity contracts', () => {
  it('normalizes email consistently without rewriting plus tags or dots', () => {
    expect(emailSchema.parse('  Test.Member+Family@EXAMPLE.COM ')).toBe(
      'test.member+family@example.com',
    );
  });
  it.each(['', 'invalid', 'member@', 'a b@example.com'])('rejects invalid email %#', (email) => {
    expect(emailSchema.safeParse(email).success).toBe(false);
  });
  it('limits account states and roles to the approved values', () => {
    expect(accountStatusSchema.safeParse('INVITED').success).toBe(false);
    expect(userRoleSchema.safeParse('OWNER').success).toBe(false);
    expect(userRoleSchema.parse('ADMIN')).toBe('ADMIN');
    expect(accountStatusSchema.parse('DISABLED')).toBe('DISABLED');
  });
  it('drops secrets from a public profile allowlist', () => {
    const result = publicUserSchema.parse({
      id: 'a'.repeat(24),
      familyId: 'b'.repeat(24),
      email: 'test@example.com',
      displayName: 'Test',
      role: 'MEMBER',
      status: 'ACTIVE',
      passwordHash: 'private',
      tokenHash: 'private',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('tokenHash');
  });
});

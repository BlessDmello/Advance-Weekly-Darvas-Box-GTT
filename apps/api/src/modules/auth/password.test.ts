import { describe, expect, it } from 'vitest';
import { hashPassword, isPasswordAllowed, verifyPassword } from './password.js';

describe('Argon2id password storage', () => {
  it('uses the approved cost and distinct random salts, and verifies without changing whitespace', async () => {
    const password = '  synthetic test passphrase  ';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(first, password)).toBe(true);
    expect(await verifyPassword(first, password.trim())).toBe(false);
    expect(await verifyPassword('not-a-hash', password)).toBe(false);
  });
  it.each(['short', 'a'.repeat(129), 'a'.repeat(15) + '\0'])(
    'rejects invalid passwords %#',
    async (value) => {
      expect(isPasswordAllowed(value)).toBe(false);
      await expect(hashPassword(value)).rejects.toThrow('Password must contain');
    },
  );
  it('accepts passphrases and Unicode without composition rules', () => {
    expect(isPasswordAllowed('a'.repeat(15))).toBe(true);
    expect(isPasswordAllowed('🌿'.repeat(15))).toBe(true);
  });
});

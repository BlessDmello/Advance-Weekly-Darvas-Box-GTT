import { expect, it } from 'vitest';
import { createTokenMaterial, hashToken } from './tokens.js';

it('generates independent 256-bit opaque tokens and deterministic SHA-256 hashes', () => {
  const first = createTokenMaterial();
  const second = createTokenMaterial();
  expect(Buffer.from(first.token, 'base64url')).toHaveLength(32);
  expect(first.token).not.toBe(second.token);
  expect(first.hash).toMatch(/^[a-f\d]{64}$/);
  expect(hashToken(first.token)).toBe(first.hash);
  expect(first.hash).not.toBe(first.token);
});

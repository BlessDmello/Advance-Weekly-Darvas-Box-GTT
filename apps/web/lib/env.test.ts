import { expect, it } from 'vitest';
import { getApiOrigin } from './env';

it('uses the default local backend without database or authentication configuration', () => {
  expect(getApiOrigin({})).toBe('http://127.0.0.1:4000');
});

it.each([
  'ftp://example.invalid',
  'http://user:secret@example.invalid',
  'http://example.invalid/path',
  'invalid',
])('rejects invalid upstream %s', (origin) => {
  expect(() => getApiOrigin({ API_INTERNAL_ORIGIN: origin })).toThrow('must be an HTTP(S) origin');
});

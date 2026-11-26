import { afterEach, describe, expect, it, vi } from 'vitest';
import { signIn, signOut } from './auth';

const user = {
  id: 'a'.repeat(24),
  familyId: 'b'.repeat(24),
  email: 'test@example.com',
  displayName: 'Test',
  role: 'ADMIN',
  status: 'ACTIVE',
};
const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
afterEach(() => vi.unstubAllGlobals());
describe('same-origin auth client', () => {
  it('obtains CSRF, logs in and confirms the same profile before completing', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ data: { csrfToken: 'csrf-test' } }))
      .mockResolvedValueOnce(response({ data: { user } }))
      .mockResolvedValueOnce(response({ data: { user } }));
    vi.stubGlobal('fetch', fetch);
    await signIn(user.email, 'synthetic-password', false);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/auth/csrf',
      '/api/v1/auth/login',
      '/api/v1/auth/me',
    ]);
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-test' },
    });
  });
  it('rejects login when the follow-up session cannot be verified', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: { csrfToken: 'csrf' } }))
        .mockResolvedValueOnce(response({ data: { user } }))
        .mockResolvedValueOnce(response({}, 401)),
    );
    await expect(signIn(user.email, 'synthetic-password', false)).rejects.toThrow(
      'session could not be verified',
    );
  });
  it('does not reflect arbitrary backend error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: { csrfToken: 'csrf' } }))
        .mockResolvedValueOnce(
          response(
            {
              error: {
                code: 'INVALID_CREDENTIALS',
                message: 'private-canary',
                requestId: '123e4567-e89b-42d3-a456-426614174000',
              },
            },
            401,
          ),
        ),
    );
    await expect(signIn(user.email, 'synthetic-password', false)).rejects.toThrow(
      'Email or password is incorrect.',
    );
  });
  it('reports unsuccessful logout rather than a false completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ data: { csrfToken: 'csrf' } }))
        .mockResolvedValueOnce(response({}, 503)),
    );
    await expect(signOut()).rejects.toThrow('Sign-out could not be confirmed');
  });
  it('accepts only a successful or already invalidated logout result', async () => {
    for (const status of [204, 401]) {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(response({ data: { csrfToken: 'csrf' } }))
          .mockResolvedValueOnce(response({}, status)),
      );
      await signOut();
    }
  });
});

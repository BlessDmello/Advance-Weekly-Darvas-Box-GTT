import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUser, requireCurrentUser, WorkspaceUnavailableError } from './server';

const { cookies, redirect } = vi.hoisted(() => ({
  cookies: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies }));
vi.mock('next/navigation', () => ({ redirect }));
const user = {
  id: 'a'.repeat(24),
  familyId: 'b'.repeat(24),
  email: 'test@example.com',
  displayName: 'Verified user',
  role: 'MEMBER',
  status: 'ACTIVE',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_ORIGIN', 'http://127.0.0.1:4999');
  cookies.mockResolvedValue({ toString: () => 'adb_session=synthetic-test-cookie' });
  redirect.mockImplementation(() => {
    throw new Error('TEST_REDIRECT');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('server-side private page authentication', () => {
  it('does not grant access or call the API without cookies', async () => {
    cookies.mockResolvedValue({ toString: () => '' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(requireCurrentUser()).rejects.toThrow('TEST_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('forwards cookies only to the fixed API origin with no-store', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ data: { user } }));
    vi.stubGlobal('fetch', fetch);
    expect(await requireCurrentUser()).toEqual(user);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4999/api/v1/auth/me',
      expect.objectContaining({
        headers: { Cookie: 'adb_session=synthetic-test-cookie' },
        cache: 'no-store',
      }),
    );
  });
  it('redirects when Express rejects an expired, revoked or disabled session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)));
    await expect(requireCurrentUser()).rejects.toThrow('TEST_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
  it('fails closed even if an invalid backend profile says DISABLED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ data: { user: { ...user, status: 'DISABLED' } } })),
    );
    expect(await currentUser()).toBeNull();
  });
  it.each(['dependency', 'network', 'malformed'] as const)(
    'returns no identity for %s failures',
    async (mode) => {
      const fetch =
        mode === 'network'
          ? vi.fn().mockRejectedValue(new Error('private-canary'))
          : vi
              .fn()
              .mockResolvedValue(
                mode === 'dependency'
                  ? response({}, 503)
                  : response({ data: { user: { role: 'ADMIN' } } }),
              );
      vi.stubGlobal('fetch', fetch);
      await expect(requireCurrentUser()).rejects.toBeInstanceOf(WorkspaceUnavailableError);
      expect(redirect).not.toHaveBeenCalled();
    },
  );
});

import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { adminImportHistory, adminImportJob } from './server';
import { requireAdminUser, WorkspaceUnavailableError } from '../auth/server';
const fetchMock = vi.fn();
vi.mock('../auth/server', () => ({
  requireAdminUser: vi.fn(),
  WorkspaceUnavailableError: class extends Error {},
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => 'synthetic-cookie' }) }));
vi.mock('../env', () => ({ getApiOrigin: () => 'http://127.0.0.1:4000' }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error('notFound');
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it('requires an Admin before forwarding cookies to the fixed API origin', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: [], meta: { nextCursor: null } })),
  );
  await adminImportHistory();
  expect(requireAdminUser).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:4000/api/v1/imports/batches',
    expect.objectContaining({ headers: { Cookie: 'synthetic-cookie' }, cache: 'no-store' }),
  );
});
it('denies Members before any import data request', async () => {
  vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error('notFound'));
  await expect(adminImportHistory()).rejects.toThrow('notFound');
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([401, 403, 404, 503])('fails closed on backend %s', async (status) => {
  fetchMock.mockResolvedValue(new Response('{}', { status }));
  const result = adminImportJob('a'.repeat(24));
  if (status === 401) await expect(result).rejects.toThrow('redirect:/login');
  else if (status === 503) await expect(result).rejects.toBeInstanceOf(WorkspaceUnavailableError);
  else await expect(result).rejects.toThrow('notFound');
});
it('rejects malformed deep links and malformed backend data', async () => {
  await expect(adminImportJob('../private')).rejects.toThrow('notFound');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(new Response('{}'));
  await expect(adminImportHistory()).rejects.toBeInstanceOf(WorkspaceUnavailableError);
});

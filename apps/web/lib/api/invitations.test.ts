import { afterEach, expect, it, vi } from 'vitest';
import { acceptInvitation, verifyInvitation } from './invitations';
afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
it('sends the token only in a same-origin JSON body with CSRF protection', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json({ data: { csrfToken: 'csrf' } }))
    .mockResolvedValueOnce(json({ data: { state: 'INVALID' } }));
  vi.stubGlobal('fetch', fetch);
  await verifyInvitation('a'.repeat(43));
  expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/invitations/verify');
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    cache: 'no-store',
    credentials: 'same-origin',
    method: 'POST',
    headers: { 'X-CSRF-Token': 'csrf' },
  });
});
it('does not reflect provider/database errors to a registering user', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ data: { csrfToken: 'csrf' } }))
      .mockResolvedValueOnce(
        json({ error: { code: 'INVITATION_UNAVAILABLE', message: 'private-canary' } }, 503),
      ),
  );
  await expect(
    acceptInvitation({
      token: 'a'.repeat(43),
      displayName: 'Name',
      password: 'synthetic safe passphrase',
    }),
  ).rejects.toThrow('temporarily unavailable');
});

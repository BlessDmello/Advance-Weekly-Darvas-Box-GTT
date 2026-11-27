import { afterEach, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../config/env.js';
import { createInvitationSender } from './email.js';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const env = parseEnvironment({
  RESEND_API_KEY: 'synthetic-test-key',
  RESEND_FROM_EMAIL: 'invite@example.com',
});
const mail = {
  to: 'member@example.com',
  link: 'https://app.example/accept-invitation#token=synthetic',
  expiresAt: '2026-11-30T00:00:00.000Z',
  familyName: 'Synthetic family',
  inviterName: 'Synthetic Admin',
};
it('uses the canonical development sender with the exact application display name', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: 'development-mail-id' })));
  vi.stubGlobal('fetch', fetch);
  const development = parseEnvironment({
    NODE_ENV: 'development',
    RESEND_API_KEY: 'synthetic-test-key',
    RESEND_FROM_EMAIL: 'onboarding@resend.dev',
  });
  const sender = createInvitationSender(development);
  expect(sender.configured()).toBe(true);
  expect(await sender.send(mail, 'development-test')).toEqual({
    delivery: 'ACCEPTED',
    providerMessageId: 'development-mail-id',
  });
  expect(JSON.parse(fetch.mock.calls[0]?.[1].body).from).toBe(
    'Advanced Darvas Box <onboarding@resend.dev>',
  );
});
it.each([
  { RESEND_FROM_EMAIL: 'onboarding@resend.dev' },
  { RESEND_API_KEY: 'synthetic-test-key' },
  { RESEND_API_KEY: 'YOUR_RESEND_API_KEY', RESEND_FROM_EMAIL: 'onboarding@resend.dev' },
])(
  'does not report usable email configuration for missing or placeholder settings %#',
  (settings) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(createInvitationSender(parseEnvironment(settings)).configured()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('does not log credentials or private provider errors when the transport fails', async () => {
  const logs = [
    vi.spyOn(console, 'log'),
    vi.spyOn(console, 'info'),
    vi.spyOn(console, 'warn'),
    vi.spyOn(console, 'error'),
  ];
  for (const spy of logs) spy.mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('synthetic-private-provider-response')),
  );
  expect(await createInvitationSender(env).send(mail, 'private-failure-test')).toEqual({
    delivery: 'UNCONFIRMED',
  });
  for (const spy of logs) expect(spy).not.toHaveBeenCalled();
});
it('calls only Resend with an idempotency key and HTML/plain-text alternatives', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'mail-id' })));
  vi.stubGlobal('fetch', fetch);
  expect(await createInvitationSender(env).send(mail, 'id')).toEqual({
    delivery: 'ACCEPTED',
    providerMessageId: 'mail-id',
  });
  expect(fetch.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
  expect(fetch.mock.calls[0]?.[1].headers['Idempotency-Key']).toBe('invitation/id');
  expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toMatchObject({
    to: [mail.to],
    text: expect.stringContaining('72 hours'),
    html: expect.stringContaining('Accept invitation'),
  });
});
it('retries uncertainty with the same payload/key and never claims delivery', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('provider-private-canary'));
  vi.stubGlobal('fetch', fetch);
  expect(await createInvitationSender(env).send(mail, 'id')).toEqual({ delivery: 'UNCONFIRMED' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]?.[1].body).toBe(fetch.mock.calls[1]?.[1].body);
});
it('returns a safe failure on definitive provider rejection', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-error', { status: 403 })));
  expect(await createInvitationSender(env).send(mail, 'id')).toEqual({ delivery: 'FAILED' });
  expect(createInvitationSender(parseEnvironment({})).configured()).toBe(false);
});

import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('anonymous import API access is denied through the Next proxy', async ({ request }) => {
  expect((await request.get('/api/v1/stocks')).status()).toBe(401);
  expect((await request.get('/api/v1/imports/batches')).status()).toBe(401);
  expect(
    (
      await request.post('/api/v1/imports/preview', {
        multipart: {
          file: {
            name: 'synthetic.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Date,Open,High,Low,Close\n2026-01-01,10,11,9,10'),
          },
        },
      })
    ).status(),
  ).toBe(401);
});
test('Member with valid CSRF can read stock lookup but cannot preview or confirm imports', async ({
  request,
  baseURL,
}) => {
  await request.post('/api/v1/__test/session', { data: { role: 'MEMBER' } });
  const csrf = (await (await request.get('/api/v1/auth/csrf')).json()).data.csrfToken;
  const headers = { Origin: baseURL!, 'X-CSRF-Token': csrf };
  expect((await request.get('/api/v1/stocks')).status()).toBe(200);
  expect(
    (
      await request.post('/api/v1/imports/preview', {
        headers,
        multipart: {
          file: {
            name: 'synthetic.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('Date,Open,High,Low,Close'),
          },
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/v1/imports/commit', {
        headers,
        data: { previewToken: 'a'.repeat(43) },
      })
    ).status(),
  ).toBe(403);
  expect((await request.get('/api/v1/imports/batches')).status()).toBe(403);
  expect(
    (
      await request.post(`/api/v1/imports/jobs/${'a'.repeat(24)}/retry`, {
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        data: { reason: 'Synthetic retry' },
      })
    ).status(),
  ).toBe(403);
});
test('Admin previews, confirms and executes a price-only import through the compiled proxy', async ({
  request,
  baseURL,
  browser,
}, testInfo) => {
  await request.post('/api/v1/__test/session', { data: { role: 'ADMIN' } });
  const symbol = testInfo.project.name === 'desktop-chromium' ? 'SYNTH-DESK' : 'SYNTH-MOB';
  const csrf = (await (await request.get('/api/v1/auth/csrf')).json()).data.csrfToken;
  const headers = { Origin: baseURL!, 'X-CSRF-Token': csrf };
  const lookup = await request.get(`/api/v1/stocks?query=${symbol}`);
  expect(lookup.status()).toBe(200);
  expect((await lookup.json()).data[0]).toMatchObject({ symbol, referenceApproved: true });
  const preview = await request.post('/api/v1/imports/preview', {
    headers,
    multipart: {
      stockSymbol: symbol,
      mapping: JSON.stringify({
        date: 'Date',
        open: 'Open',
        high: 'High',
        low: 'Low',
        close: 'Close',
        volume: null,
        symbol: null,
      }),
      source: JSON.stringify({
        provider: 'Synthetic fixture',
        reference: 'Unit tests only',
        adjustmentVersion: null,
      }),
      adjustmentBasis: 'RAW',
      dateMode: 'ISO',
      requestedRange: JSON.stringify({ from: '2026-01-01', to: '2026-01-03' }),
      minimumHistorySessions: '3',
      expectedCompletedSession: JSON.stringify('2026-01-03'),
      file: {
        name: 'synthetic.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          'Date,Open,High,Low,Close\n2026-01-01,10.20,10.50,10.00,10.30\n2026-01-02,10.20,10.50,10.00,10.30\n2026-01-03,10.20,10.50,10.00,10.30',
        ),
      },
    },
  });
  expect(preview.status()).toBe(200);
  const data = (await preview.json()).data;
  expect(data).toMatchObject({ committable: true, rows: { valid: 3, new: 3 } });
  expect(data).not.toHaveProperty('records');
  expect(data).not.toHaveProperty('tokenHash');
  const key = randomUUID();
  const confirm = () =>
    request.post('/api/v1/imports/commit', {
      headers: { ...headers, 'Idempotency-Key': key },
      data: { previewToken: data.previewToken },
    });
  const result = await confirm();
  expect(result.status()).toBe(202);
  const queued = (await result.json()).data;
  expect(queued).toMatchObject({ status: 'QUEUED', executionAvailable: true });
  expect((await (await confirm()).json()).data).toMatchObject({
    jobId: queued.jobId,
    batchId: queued.batchId,
  });
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/v1/imports/jobs/${queued.jobId}`)).json()).data.status,
      { timeout: 30_000, intervals: [1000] },
    )
    .toBe('COMPLETED');
  const job = await request.get(`/api/v1/imports/jobs/${queued.jobId}`);
  expect(job.status()).toBe(200);
  expect(job.headers()['cache-control']).toBe('no-store');
  expect((await job.json()).data).toMatchObject({
    processed: 3,
    total: 3,
    status: 'COMPLETED',
    derivedStatus: 'DEFERRED',
    quality: { screeningEligible: false },
    recovery: { retryAllowed: false },
  });
  const batches = await request.get('/api/v1/imports/batches?limit=1');
  expect(batches.status()).toBe(200);
  expect((await batches.json()).data[0].batchId).toBe(queued.batchId);
  const other = await browser.newContext({ baseURL: baseURL! });
  try {
    await other.request.post('/api/v1/__test/session', { data: { role: 'ADMIN' } });
    expect((await other.request.get(`/api/v1/imports/jobs/${queued.jobId}`)).status()).toBe(404);
    const otherCsrf = (await (await other.request.get('/api/v1/auth/csrf')).json()).data.csrfToken;
    expect(
      (
        await other.request.post(`/api/v1/imports/jobs/${queued.jobId}/retry`, {
          headers: { Origin: baseURL!, 'X-CSRF-Token': otherCsrf, 'Idempotency-Key': randomUUID() },
          data: { reason: 'Synthetic retry' },
        })
      ).status(),
    ).toBe(404);
    expect((await other.request.get('/api/v1/imports/batches')).status()).toBe(200);
    expect((await (await other.request.get('/api/v1/imports/batches')).json()).data).toEqual([]);
  } finally {
    await other.close();
  }
});

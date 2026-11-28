import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { sheetXml, workbookParts, xlsxFile } from '../../apps/api/tests/parsing-fixtures.js';
import type { ImportJobResponse } from '@darvas/contracts';

for (const format of ['CSV', 'XLSX'] as const) {
  test(`Admin completes ${format} UI upload, explicit confirmation and family-scoped job history`, async ({
    page,
    context,
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    await context.request.post('/api/v1/__test/session', { data: { role: 'ADMIN' } });
    const symbol = `UI-${testInfo.project.name === 'desktop-chromium' ? 'DESK' : 'MOB'}-${format}`;
    await page.goto('/admin/imports');
    await expect(
      page.getByRole('heading', { name: 'Market Data Import', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Validate & preview' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Select an active');
    await page.getByLabel('Search approved NSE stocks').fill(symbol);
    await page.getByRole('button', { name: 'Search stocks' }).click();
    await expect(
      page
        .getByLabel('Approved NSE stocks', { exact: true })
        .getByRole('option', { name: new RegExp(symbol) }),
    ).toHaveCount(1);
    const option = page
      .getByLabel('Approved NSE stocks', { exact: true })
      .getByRole('option', { name: new RegExp(symbol) });
    await page
      .getByLabel('Approved NSE stocks', { exact: true })
      .selectOption((await option.getAttribute('value'))!);
    await page.getByLabel('Provider / source name').fill('Synthetic fixture');
    await page.getByLabel('Source reference').fill('Unit tests only');
    await page.getByLabel('Price basis', { exact: true }).selectOption('RAW');
    await page.getByLabel('Requested range from').fill('2026-01-01');
    await page.getByLabel('Requested range to').fill('2026-01-03');
    const headers = ['TradingDate', 'Open', 'High', 'Low', 'Close'];
    const rows = [1, 2, 3].map((day) => [`2026-01-0${day}`, '10.20', '10.50', '10.00', '10.30']);
    const workbook = xlsxFile(workbookParts({ sheet: sheetXml(rows, headers) }));
    const file = {
      name: `synthetic.${format.toLowerCase()}`,
      mimeType: format === 'CSV' ? 'text/csv' : workbook.mimeType,
      buffer:
        format === 'CSV'
          ? Buffer.from([headers, ...rows].map((row) => row.join(',')).join('\n'))
          : Buffer.from(workbook.bytes),
    };
    await page.getByLabel('Date column (required)').fill('TradingDate');
    if (format === 'CSV') {
      await page.getByLabel('CSV or XLSX file').setInputFiles({
        ...file,
        buffer: Buffer.from('TradingDate,Open,High,Low,Close\n2026-01-01,10,8,9,10'),
      });
      await page.getByRole('button', { name: 'Validate & preview' }).click();
      await expect(page.getByRole('button', { name: 'Review & confirm import' })).toBeDisabled();
      await expect(page.getByText(/Confirmation is blocked/)).toBeVisible();
    }
    await page.getByLabel('CSV or XLSX file').setInputFiles(file);
    if (format === 'CSV') {
      await page.route(
        '**/api/v1/imports/preview',
        async (route) => {
          const response = await route.fetch();
          const json = await response.json();
          json.data.expiresAt = new Date(Date.now() - 1000).toISOString();
          await route.fulfill({ response, json });
        },
        { times: 1 },
      );
      await page.getByRole('button', { name: 'Validate & preview' }).click();
      await expect(page.getByText(/This preview expired/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Review & confirm import' })).toBeDisabled();
      await page.getByRole('button', { name: 'Validate again' }).click();
    } else await page.getByRole('button', { name: 'Validate & preview' }).click();
    await expect(page.getByRole('button', { name: 'Review & confirm import' })).toBeEnabled();
    const preview = page.getByRole('region', { name: 'Import preview', exact: true });
    await expect(preview.getByRole('heading', { name: /Warnings/ })).toBeVisible();
    await expect(preview).toContainText('SHORT HISTORY');
    await expect(preview).not.toContainText('screening eligible');
    const keys: string[] = [];
    if (format === 'CSV') {
      let first = true;
      await page.route('**/api/v1/imports/commit', async (route) => {
        keys.push(route.request().headers()['idempotency-key']!);
        if (first) {
          first = false;
          await route.fetch();
          await route.abort('failed');
        } else await route.continue();
      });
    }
    await page.getByRole('button', { name: 'Review & confirm import' }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm price import' });
    await expect(dialog).toBeVisible();
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Review & confirm import' })).toBeFocused();
    await page.getByRole('button', { name: 'Review & confirm import' }).click();
    await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
    if (format === 'CSV') {
      await expect(page.getByText(/Confirmation outcome unknown/)).toBeVisible();
      await expect(page.getByLabel('Provider / source name')).toBeDisabled();
      await page.getByRole('button', { name: 'Check same confirmation' }).click();
      await page.getByRole('button', { name: 'Retry same confirmation' }).click();
    }
    await expect(page).toHaveURL(/\/admin\/imports\/jobs\/[a-f\d]{24}$/, { timeout: 20_000 });
    if (format === 'CSV') {
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    }
    await expect(page.getByText(/Price processing is complete/)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/No trading signals or screening eligibility were calculated/),
    ).toBeVisible();
    const jobUrl = page.url();
    await page.getByRole('link', { name: 'Back to imports' }).click();
    await expect(page.getByRole('region', { name: 'Import history' })).toContainText(symbol);
    await page.getByRole('link', { name: `View job details for ${symbol}` }).click();
    await expect(page).toHaveURL(jobUrl);
    const other = await browser.newContext({ baseURL: baseURL! });
    try {
      await other.request.post('/api/v1/__test/session', { data: { role: 'ADMIN' } });
      const foreign = await other.newPage();
      await foreign.goto(jobUrl);
      await expect(foreign.getByRole('heading', { name: 'Import Job Details' })).toHaveCount(0);
      expect(
        (await other.request.get(`/api/v1/imports/jobs/${jobUrl.split('/').at(-1)}`)).status(),
      ).toBe(404);
    } finally {
      await other.close();
    }
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'theme')),
    ).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({
      path: testInfo.outputPath(`import-${format}-completed.png`),
      fullPage: true,
    });
    if (format === 'CSV') {
      const id = jobUrl.split('/').at(-1)!;
      const completed = (await (await context.request.get(`/api/v1/imports/jobs/${id}`)).json())
        .data as ImportJobResponse['data'];
      let displayed: ImportJobResponse['data'] = {
        ...completed,
        status: 'QUEUED',
        phase: 'QUEUED',
        executionAvailable: false,
        processed: 0,
        inserted: 0,
        startedAt: null,
        finishedAt: null,
        quality: null,
      };
      await page.route(`**/api/v1/imports/jobs/${id}`, (route) =>
        route.fulfill({ json: { data: displayed } }),
      );
      await page.getByRole('button', { name: 'Refresh status' }).click();
      await expect(page.getByText(/Automatic processing has not started/)).toBeVisible();
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ['light', 'dark'] as const) {
          await page.getByRole('button', { name: `Use ${theme} theme` }).click();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.screenshot({
            path: testInfo.outputPath(`import-job-${width}-${theme}.png`),
            fullPage: true,
          });
        }
      }
      displayed = {
        ...completed,
        status: 'FAILED_RETRYABLE',
        phase: 'UPSERTING',
        recovery: {
          retryAllowed: true,
          blocked: false,
          automaticRecoveries: 1,
          nextAttemptAt: null,
          payloadRetired: false,
        },
      };
      await page.getByRole('button', { name: 'Refresh status' }).click();
      await page.getByLabel('Retry reason (required)').fill('Synthetic recovery review');
      const retryKeys: string[] = [];
      await page.route(`**/api/v1/imports/jobs/${id}/retry`, async (route) => {
        retryKeys.push(route.request().headers()['idempotency-key']!);
        if (retryKeys.length === 1) await route.abort('failed');
        else {
          displayed = completed;
          await route.fulfill({
            status: 202,
            json: { data: { jobId: id, resumeRequested: true } },
          });
        }
      });
      await page.getByRole('button', { name: 'Request eligible retry' }).click();
      await expect(page.getByText(/Retry outcome unknown/)).toBeVisible();
      await page.getByRole('button', { name: 'Retry same request' }).click();
      await expect(page.getByText(/Price processing is complete/)).toBeVisible();
      expect(retryKeys).toHaveLength(2);
      expect(retryKeys[0]).toBe(retryKeys[1]);
      await page.unroute(`**/api/v1/imports/jobs/${id}`);
      await page.route(`**/api/v1/imports/jobs/${id}`, (route) =>
        route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
      );
      // Remove the synthetic browser session as well; otherwise /login correctly redirects it back.
      await context.clearCookies();
      await page.getByRole('button', { name: 'Refresh status' }).click();
      await expect(page).toHaveURL(/\/login$/);
    }
  });
}

test('import pages deny anonymous and Member visitors before rendering private controls', async ({
  page,
  context,
}) => {
  await page.goto('/admin/imports');
  await expect(page).toHaveURL(/\/login$/);
  await context.request.post('/api/v1/__test/session', { data: { role: 'MEMBER' } });
  for (const route of ['/admin/imports', `/admin/imports/jobs/${'a'.repeat(24)}`]) {
    await page.goto(route);
    await expect(page.getByLabel('CSV or XLSX file')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Import Job Details' })).toHaveCount(0);
  }
});

test('import workspace fits all requested viewports and themes with accessible inputs', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await context.request.post('/api/v1/__test/session', { data: { role: 'ADMIN' } });
  await page.goto('/admin/imports');
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.getByRole('button', { name: `Use ${theme} theme` }).click();
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.locator('main')).toHaveCount(1);
      await page.getByLabel('Provider / source name').focus();
      await expect(page.getByLabel('Provider / source name')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Source reference')).toBeFocused();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({
        path: testInfo.outputPath(`import-upload-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
});

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

import { expect, test } from '@playwright/test';

const seedPath = '/api/v1/__test/session';

test('denies anonymous dashboard HTML without JavaScript and leaves the landing page public', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/dashboard`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toHaveCount(0);
    await page.goto(`${baseURL}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Smarter Stock Screening/);
  } finally {
    await context.close();
  }
});

for (const state of ['expired', 'revoked', 'disabled-user', 'disabled-family']) {
  test(`denies ${state} sessions at the private page and API`, async ({ context, page }) => {
    expect((await context.request.post(seedPath, { data: { state } })).status()).toBe(200);
    const denied = await context.request.get('/api/v1/auth/me');
    expect(denied.status()).toBe(401);
    expect(denied.headers()['cache-control']).toContain('no-store');
    // Reissue the invalid cookie after /me clears it, so SSR independently rejects it.
    expect((await context.request.post(seedPath, { data: { state } })).status()).toBe(200);
    const response = await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
    expect(await response!.text()).not.toContain('Synthetic Member');
    await page.goto('/login');
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible();
  });
}

for (const role of ['ADMIN', 'MEMBER']) {
  test(`renders the verified ${role} identity and enforces API permission through Next`, async ({
    context,
    page,
  }) => {
    expect((await context.request.post(seedPath, { data: { role } })).status()).toBe(200);
    const response = await page.goto('/dashboard');
    expect(response!.headers()['cache-control']).toContain('no-store');
    await expect(
      page.getByText(`Welcome back, Synthetic ${role === 'ADMIN' ? 'Admin' : 'Member'}.`),
    ).toBeVisible();
    await expect(
      page.getByText(`Role: ${role === 'ADMIN' ? 'Admin' : 'Member'}`, { exact: true }),
    ).toBeVisible();
    const admin = await context.request.get('/api/v1/__test/admin?role=ADMIN', {
      headers: { 'X-Role': 'ADMIN' },
    });
    expect(admin.status()).toBe(role === 'ADMIN' ? 200 : 403);
    expect(admin.headers()['cache-control']).toContain('no-store');
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('keeps the Dashboard responsive and themed without broken Admin links', async ({
  context,
  page,
}, testInfo) => {
  expect((await context.request.post(seedPath, { data: { role: 'ADMIN' } })).status()).toBe(200);
  await page.goto('/dashboard');
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.getByRole('button', { name: `Use ${theme} theme` }).click();
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/);
      await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      await page.screenshot({
        path: testInfo.outputPath(`workspace-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await expect(page.getByRole('link', { name: 'Family invitations' })).toHaveAttribute(
    'href',
    '/admin/invitations',
  );
});

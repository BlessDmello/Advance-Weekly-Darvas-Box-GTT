import { expect, test } from '@playwright/test';

test('public landing page renders without API or external data requests', async ({
  page,
  isMobile,
  baseURL,
}) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
  const errors: string[] = [];
  const dataRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/api\//.test(request.url())) dataRequests.push(request.url());
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== new URL(baseURL!).origin
    )
      externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Smarter Stock Screening\.\s*Disciplined Swing Trading\./,
  );
  await expect(
    page.getByRole('figure', { name: /Illustrative Preview — Not Live Market Data/ }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForLoadState('networkidle');
  expect(dataRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('landing-light.png'), fullPage: true });
});

test('retains the existing same-origin API proxy independently of the landing page', async ({
  request,
}) => {
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: { status: 'ok', service: 'advanced-darvas-api' },
  });
});

test('supports real section navigation, keyboard access, and safe Sign In controls', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const signIns = page.getByRole('link', { name: 'Sign In', exact: true });
  await expect(signIns).toHaveCount(2);
  await expect(signIns.nth(0)).toHaveAttribute('href', '/login');
  await expect(signIns.nth(1)).toHaveAttribute('href', '/login');
  await page.getByRole('link', { name: 'Explore Features', exact: true }).click();
  await expect(page).toHaveURL(/#features$/);
  if (isMobile) {
    await page.goto('/');
    await page.getByLabel('Open navigation').click();
    const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'How It Works' }).click();
  } else {
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'How It Works' })
      .click();
  }
  await expect(page).toHaveURL(/#how-it-works$/);
});

test('persists themes and fits mobile, tablet, and desktop layouts', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath('landing-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Use system theme' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `No page overflow at ${width}px`,
    ).toBe(true);
    if (width === 768)
      await page.screenshot({ path: test.info().outputPath('landing-tablet.png'), fullPage: true });
  }
});

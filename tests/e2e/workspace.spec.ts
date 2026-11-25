import { expect, test } from '@playwright/test';

test('loads the workspace and connects through the same-origin API rewrite', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'A little clarity. A better perspective.',
  );
  await expect(page.getByRole('status')).toHaveText('Service connected');
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: { status: 'ok', service: 'advanced-darvas-api' },
  });
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('workspace.png'), fullPage: true });
});

test('persists appearance and fits narrow viewports', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath('workspace-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Use light theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Use system theme' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  if (isMobile)
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

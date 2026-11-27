import { expect, test } from '@playwright/test';

for (const role of ['ADMIN', 'MEMBER'] as const) {
  test(`Dashboard unavailable states, responsive themes and keyboard access for ${role}`, async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(90_000);
    expect(
      (await context.request.post('/api/v1/__test/session', { data: { role } })).status(),
    ).toBe(200);
    const unexpectedRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        url.origin !== new URL(baseURL!).origin ||
        (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/v1/auth/'))
      ) {
        unexpectedRequests.push(url.origin + url.pathname);
      }
    });
    const response = await page.goto('/dashboard');
    expect(response!.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(
      page.getByText(`Welcome back, Synthetic ${role === 'ADMIN' ? 'Admin' : 'Member'}.`),
    ).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    const main = page.getByRole('main');
    await expect(main).toBeFocused();
    expect(await main.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('solid');
    await expect(
      main.locator('dl[aria-label="Dashboard metrics"]').getByText('Unavailable', { exact: true }),
    ).toHaveCount(6);
    await expect(main.getByRole('button', { name: /Record Trade.*Coming soon/ })).toBeDisabled();
    if (role === 'ADMIN') {
      const management = main.getByRole('link', { name: 'Family invitations' });
      await page.keyboard.press('Tab');
      await expect(management).toBeFocused();
      expect(await management.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe(
        'solid',
      );
    } else {
      await expect(main.getByRole('link')).toHaveCount(0);
      await expect(page.getByText('Administration', { exact: true })).toHaveCount(0);
    }
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark'] as const) {
        await page.getByRole('button', { name: `Use ${theme} theme` }).click();
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('main')).toHaveCount(1);
        for (const name of [
          'Portfolio Overview',
          'Eligible Stocks Summary',
          'Positions Approaching 6% Target',
          'Recent Activity',
          'Market Data Freshness',
        ]) {
          await expect(page.getByRole('region', { name })).toBeVisible();
        }
        await expect(main.getByText('Unknown', { exact: true })).toBeVisible();
        await expect(main.getByText(/No positions|No eligible stocks/)).toHaveCount(0);
        await expect(main.getByRole('table')).toHaveCount(width >= 640 ? 1 : 0);
        const metrics = main.locator('dl[aria-label="Dashboard metrics"]');
        const columns = await metrics.evaluate(
          (node) => getComputedStyle(node).gridTemplateColumns.split(' ').length,
        );
        expect(columns).toBe(width >= 1100 ? 3 : 2);
        await page.screenshot({
          path: testInfo.outputPath(`dashboard-${role.toLowerCase()}-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    expect(unexpectedRequests).toEqual([]);
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  });
}

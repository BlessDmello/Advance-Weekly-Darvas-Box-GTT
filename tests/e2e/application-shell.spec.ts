import { expect, test } from '@playwright/test';

for (const role of ['ADMIN', 'MEMBER'] as const) {
  test(`verified ${role} shell navigation, keyboard controls and logout`, async ({
    page,
    context,
  }) => {
    await context.request.post('/api/v1/__test/session', { data: { role } });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#workspace-content')).toBeFocused();
    const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const link of await sidebar.getByRole('link').all())
      expect(['/dashboard', '/admin/invitations']).toContain(await link.getAttribute('href'));
    await expect(
      sidebar.getByRole('button', { name: 'Stock Screener, Coming soon' }),
    ).toBeDisabled();
    await expect(sidebar.getByRole('button', { name: 'Settings, Coming soon' })).toBeDisabled();
    const collapse = sidebar.getByRole('button', { name: 'Collapse sidebar' });
    await collapse.focus();
    await page.keyboard.press('Enter');
    await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    if (role === 'ADMIN') {
      await sidebar.getByRole('link', { name: 'Family Management' }).click();
      await expect(page).toHaveURL(/\/admin\/invitations$/);
      await expect(
        page.getByRole('heading', { name: 'Family invitations', exact: true }),
      ).toBeVisible();
      await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
      await expect(sidebar.getByRole('link', { name: 'Family Management' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await sidebar.getByRole('link', { name: 'Dashboard', exact: true }).click();
    } else {
      await expect(page.getByText('Administration', { exact: true })).toHaveCount(0);
      await expect(sidebar.getByRole('link', { name: 'Family Management' })).toHaveCount(0);
      expect((await context.request.get('/api/v1/invitations')).status()).toBe(403);
    }
    await expect(page.locator('main')).toHaveCount(1);
    await page.reload();
    await expect(sidebar.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(sidebar).toBeHidden();
    const more = page.getByRole('button', { name: 'More navigation', exact: true });
    await more.click();
    const sheet = page.getByRole('dialog', { name: 'More navigation', exact: true });
    await expect(sheet).toBeVisible();
    if (role === 'ADMIN')
      await expect(sheet.getByRole('link', { name: 'Family Management' })).toBeVisible();
    else await expect(sheet.getByText('Administration', { exact: true })).toHaveCount(0);
    await expect(
      sheet.getByText(role === 'ADMIN' ? 'Admin' : 'Member', { exact: true }),
    ).toBeVisible();
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    if (role === 'ADMIN') {
      await more.click();
      await sheet.getByRole('link', { name: 'Family Management' }).click();
      await expect(page).toHaveURL(/\/admin\/invitations$/);
      await expect(sheet).toBeHidden();
      await expect(more).toHaveAttribute('data-active', '');
      await more.click();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(sheet).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open account menu' })).toBeFocused();
    }
    const account = page.getByRole('button', { name: 'Open account menu' });
    await account.click();
    const panel = page.getByRole('dialog', { name: 'Your account' });
    await expect(
      panel.getByText(`Synthetic ${role === 'ADMIN' ? 'Admin' : 'Member'}`, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(role === 'ADMIN' ? 'Admin' : 'Member', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'theme')),
    ).toEqual([]);
    if (role === 'MEMBER') {
      await more.click();
      await sheet.getByRole('button', { name: 'Sign Out' }).click();
    } else {
      await account.click();
      await panel.getByRole('button', { name: 'Sign Out' }).click();
    }
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('private pages and More sheet fit every requested viewport in both themes', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await context.request.post('/api/v1/__test/session', { data: { role: 'ADMIN' } });
  for (const route of ['/dashboard', '/admin/invitations']) {
    await page.goto(route);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark'] as const) {
        await page.getByRole('button', { name: `Use ${theme} theme` }).click();
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(
            `${route.includes('admin') ? 'invitations' : 'dashboard'}-${width}-${theme}.png`,
          ),
          fullPage: true,
        });
        const bottom = page.getByRole('navigation', { name: 'Mobile application navigation' });
        if (width < 1024) {
          await expect(bottom).toBeVisible();
          await expect(bottom.getByRole('button', { name: 'Alerts, Coming soon' })).toBeDisabled();
          await page.getByRole('button', { name: 'More navigation', exact: true }).click();
          const sheet = page.getByRole('dialog', { name: 'More navigation', exact: true });
          await expect(sheet).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(
              `more-${route.includes('admin') ? 'invitations' : 'dashboard'}-${width}-${theme}.png`,
            ),
            fullPage: true,
          });
          await page.keyboard.press('Escape');
          await expect(
            page.getByRole('button', { name: 'More navigation', exact: true }),
          ).toBeFocused();
        } else await expect(bottom).toBeHidden();
      }
    }
  }
});

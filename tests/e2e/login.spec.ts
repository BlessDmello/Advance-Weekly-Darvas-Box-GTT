import { expect, test } from '@playwright/test';

test('opens login from landing Sign In actions and navigates home', async ({ page, baseURL }) => {
  await page.goto('/');
  for (const index of [0, 1]) {
    await page.getByRole('link', { name: 'Sign In', exact: true }).nth(index).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back');
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(`${baseURL}/`);
  }
  await page.goto('/login');
  await page.getByRole('link', { name: 'Advanced Darvas Box home' }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
});

test('validates locally and shows a generic failed login without external requests or credential storage', async ({
  page,
  baseURL,
}) => {
  const unsafeRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin)
      unsafeRequests.push(request.url());
  });
  await page.goto('/login');
  const email = page.getByLabel('Email address', { exact: true });
  const password = page.getByLabel('Password', { exact: true });
  const submit = page.getByRole('button', { name: 'Sign In to Workspace' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(email).toHaveAccessibleDescription('Email address is required.');
  await expect(password).toHaveAccessibleDescription('Password is required.');
  await expect(email).toBeFocused();
  await email.fill('invalid-email');
  await password.fill('ui-only-passphrase');
  await submit.click();
  await expect(email).toHaveAccessibleDescription('Enter a valid email address.');
  await expect(password).toHaveValue('ui-only-passphrase');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  const remember = page.getByRole('checkbox', { name: 'Remember Me' });
  await remember.check();
  await expect(remember).toBeChecked();
  await remember.uncheck();
  await expect(remember).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Forgot Password?' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Forgot Password?' })).toHaveAccessibleDescription(
    'Coming soon',
  );
  await email.fill('preview@example.com');
  await password.press('Enter');
  await expect(page.getByRole('form', { name: 'Sign in' }).getByRole('alert')).toHaveText(
    'Email or password is incorrect.',
  );
  await expect(password).toHaveValue('');
  await expect(page).toHaveURL(/\/login$/);
  await expect(submit).toBeEnabled();
  await expect(email).toHaveValue('preview@example.com');
  await expect(password).toHaveValue('');
  const storedValues = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(storedValues).not.toContain('ui-only-passphrase');
  expect(storedValues).not.toContain('preview@example.com');
  expect((await page.context().cookies()).some((cookie) => cookie.name.endsWith('_session'))).toBe(
    false,
  );
  expect(unsafeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('supports themes, keyboard navigation, and responsive login layouts', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
  await page.goto('/login');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const preview = page.getByRole('figure', {
    name: /Illustrative Preview — Not Live Market Data/,
    includeHidden: true,
  });
  for (const theme of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: `Use ${theme} theme` }).click();
    await page.reload();
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    else await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: test.info().outputPath(`login-${theme}.png`), fullPage: true });
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `No overflow at ${width}px in ${theme}`,
      ).toBe(true);
      if (width < 1024) await expect(preview).toBeHidden();
      else await expect(preview).toBeVisible();
      if ([360, 390, 768, 1440].includes(width))
        await page.screenshot({
          path: test.info().outputPath(`login-${width}-${theme}.png`),
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
  }
  await page.getByRole('button', { name: 'Use system theme' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('keeps native credential submission disabled without JavaScript', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/login`);
    await expect(page.getByLabel('Email address', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign In to Workspace' })).toBeDisabled();
    // Playwright's text engine intentionally excludes the noscript element itself.
    await expect(page.locator('noscript p')).toBeVisible();
    await expect(page.locator('noscript p')).toHaveText(
      'JavaScript is required to sign in. No credentials are submitted without it.',
    );
  } finally {
    await context.close();
  }
});

test('supports the complete form by keyboard with visible focus', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 1000 });
  await page.goto('/login');
  const darkTheme = page.getByRole('button', { name: 'Use dark theme' });
  await darkTheme.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveClass(/dark/);

  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: `Use ${theme} theme` }).click();
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Back to Home' })).toBeFocused();
    await page.keyboard.press('Tab');
    const email = page.getByLabel('Email address', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await expect(email).toBeFocused();
    const focus = await email.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        visible: element.matches(':focus-visible'),
        width: parseFloat(style.outlineWidth),
        style: style.outlineStyle,
      };
    });
    expect(focus.visible).toBe(true);
    expect(focus.width).toBeGreaterThanOrEqual(2);
    expect(focus.style).not.toBe('none');
    await email.fill('preview@example.com');
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(password).toHaveAccessibleDescription('Password is required.');
    await expect(password).toBeFocused();
    await expect(email).toHaveValue('preview@example.com');
    await password.fill('ui-only-passphrase');
    await page.keyboard.press('Tab');
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      'none',
    );
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'text');
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'password');
    await page.keyboard.press('Tab');
    const remember = page.getByRole('checkbox', { name: 'Remember Me' });
    await expect(remember).toBeFocused();
    await page.keyboard.press('Space');
    await expect(remember).toBeChecked();
    await page.keyboard.press('Tab');
    const submit = page.getByRole('button', { name: 'Sign In to Workspace' });
    await expect(submit).toBeFocused();
    expect(await submit.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      'none',
    );
    await page.screenshot({
      path: test.info().outputPath(`login-keyboard-focus-${theme}.png`),
      fullPage: true,
    });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('form', { name: 'Sign in' }).getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    );
    await page.getByRole('link', { name: 'Back to Home' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Smarter Stock Screening/);
    await page.goto('/login');
  }
});

test('matches landing branding and keeps input boundaries distinguishable in both themes', async ({
  page,
}) => {
  function luminance(color: number[]) {
    const channels = color
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  }
  function contrast(first: number[], second: number[]) {
    const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (lighter! + 0.05) / (darker! + 0.05);
  }
  for (const theme of ['light', 'dark']) {
    await page.goto('/login');
    await page.getByRole('button', { name: `Use ${theme} theme` }).click();
    const design = async () => ({
      tokens: await page.locator('.public-page').evaluate((element) => {
        const style = getComputedStyle(element);
        return ['--landing-accent', '--landing-surface', '--landing-card', '--landing-border'].map(
          (token) => style.getPropertyValue(token),
        );
      }),
      brand: await page.locator('header .brand-mark').innerHTML(),
      type: await page
        .getByRole('heading', { level: 1 })
        .evaluate((element) => getComputedStyle(element).fontFamily),
    });
    const login = await design();
    for (const label of ['Email address', 'Password']) {
      const colors = await page.getByLabel(label, { exact: true }).evaluate((element) => {
        const style = getComputedStyle(element);
        // Resolve CSS color-mix()/color() values to rendered sRGB bytes.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const rgb = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        };
        return {
          border: rgb(style.borderTopColor),
          field: rgb(style.backgroundColor),
          card: rgb(getComputedStyle(element.closest('[data-slot="card"]')!).backgroundColor),
        };
      });
      expect(
        contrast(colors.border, colors.field),
        `${theme} input border against field`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(colors.border, colors.card),
        `${theme} input border against card`,
      ).toBeGreaterThanOrEqual(3);
    }
    await page.goto('/');
    expect(await design()).toEqual(login);
  }
});

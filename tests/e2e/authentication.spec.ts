import { expect, test } from '@playwright/test';
import { testCredentials } from '../support/credentials.js';

test('logs in and out through Next with a real isolated MongoDB session', async ({
  page,
  context,
  baseURL,
  browser,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  const external: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url());
  });
  await page.getByLabel('Email address', { exact: true }).fill(testCredentials.email);
  await page.getByLabel('Password', { exact: true }).fill(testCredentials.password);
  await page.getByRole('checkbox', { name: 'Remember Me' }).check();
  await page.getByRole('button', { name: 'Sign In to Workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Your workspace' })).toBeVisible();
  const session = (await context.cookies()).find((cookie) => cookie.name === 'adb_session')!;
  expect(session).toBeDefined();
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  expect(session.expires).toBeGreaterThan(Date.now() / 1000);
  const visibleCookies = await page.evaluate(() => document.cookie);
  expect(visibleCookies).not.toContain('adb_session');
  const profile = await context.request.get('/api/v1/auth/me');
  expect(profile.status()).toBe(200);
  expect(await profile.json()).toMatchObject({ data: { user: { role: 'ADMIN' } } });
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain(testCredentials.password);
  expect(storage).not.toContain(session.value);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your workspace' })).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('form', { name: 'Sign in' })).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign In', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const noJavaScript = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await context.storageState(),
  });
  try {
    const serverRedirect = await noJavaScript.newPage();
    await serverRedirect.goto(`${baseURL}/login`);
    await expect(serverRedirect).toHaveURL(/\/dashboard$/);
    await expect(serverRedirect.getByRole('form', { name: 'Sign in' })).toHaveCount(0);
  } finally {
    await noJavaScript.close();
  }
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  const replay = await page.request.get('/api/v1/auth/me', {
    headers: { Cookie: `adb_session=${session.value}` },
  });
  expect(replay.status()).toBe(401);
  await context.addCookies([
    {
      name: session.name,
      value: session.value,
      url: baseURL!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  expect(external).toEqual([]);
});

test('rejects missing CSRF and foreign Origin through the Next proxy', async ({
  request,
  baseURL,
}) => {
  const csrf = await request.get('/api/v1/auth/csrf');
  expect(csrf.status()).toBe(200);
  const token: string = (await csrf.json()).data.csrfToken;
  const missing = await request.post('/api/v1/auth/login', {
    headers: { Origin: new URL(baseURL!).origin },
    data: testCredentials,
  });
  expect(missing.status()).toBe(403);
  const foreign = await request.post('/api/v1/auth/login', {
    headers: { Origin: 'https://attacker.example', 'X-CSRF-Token': token },
    data: testCredentials,
  });
  expect(foreign.status()).toBe(403);
});

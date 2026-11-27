import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { testCredentials } from '../support/credentials.js';

test('completes Admin login, invitation creation, acceptance, Member login, protected workspace and logout', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(60_000);
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(testCredentials.email);
  await page.getByLabel('Password', { exact: true }).fill(testCredentials.password);
  await page.getByRole('button', { name: 'Sign In to Workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const adminProfile = await context.request.get('/api/v1/auth/me');
  expect(adminProfile.status()).toBe(200);
  const admin = (await adminProfile.json()).data.user;
  expect(admin.role).toBe('ADMIN');
  await page.getByRole('link', { name: 'Family invitations' }).click();
  await page.getByRole('button', { name: 'Invite Member', exact: true }).click();
  const email = `workflow-${randomUUID()}@example.com`;
  const password = 'synthetic invitation workflow passphrase';
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  const issuedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/invitations' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  const issued = await issuedResponse;
  expect(issued.status()).toBe(201);
  const invitation = (await issued.json()).data;
  await expect(page.getByRole('status')).toContainText('Inbox delivery is not confirmed');
  const capturePath = `/api/v1/__test/invitations/${invitation.invitationId}/email`;
  const capture = await context.request.get(capturePath, { maxRedirects: 0 });
  expect(capture.status()).toBe(303);
  expect(capture.headers()['cache-control']).toBe('no-store');
  const link = new URL(capture.headers().location!);
  expect(link.origin).toBe(new URL(baseURL!).origin);
  expect(link.pathname).toBe('/accept-invitation');
  const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
  expect(JSON.stringify(invitation)).not.toContain(token);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(link.href);
  await expect(page.getByRole('form', { name: 'Accept invitation' })).toBeVisible();
  await expect(page).toHaveURL(`${baseURL}/accept-invitation`);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByLabel('Display name').fill('Workflow Member');
  await page.getByLabel('Create password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accept Invitation & Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account has been created' })).toBeVisible();
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  await page.getByRole('link', { name: 'Sign In to Workspace' }).click();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In to Workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Signed in as Workflow Member.', { exact: true })).toBeVisible();
  await expect(page.getByText('Role: Member', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Family invitations' })).toHaveCount(0);
  const profile = await context.request.get('/api/v1/auth/me');
  expect(profile.status()).toBe(200);
  expect((await profile.json()).data.user).toMatchObject({
    email,
    role: 'MEMBER',
    familyId: admin.familyId,
  });
  expect((await context.request.get('/api/v1/invitations')).status()).toBe(403);
  expect((await context.request.get(capturePath)).status()).toBe(403);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(password);
  expect(stored).not.toContain(token);
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('Admin can invite Members while a Member cannot reach invitation administration', async ({
  page,
  context,
}, testInfo) => {
  await context.request.post('/api/v1/__test/session', { data: { role: 'MEMBER' } });
  const denied = await page.goto('/admin/invitations');
  expect(denied!.status()).toBe(404);
  expect((await context.request.get('/api/v1/invitations')).status()).toBe(403);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address', { exact: true }).fill(testCredentials.email);
  await page.getByLabel('Password', { exact: true }).fill(testCredentials.password);
  await page.getByRole('button', { name: 'Sign In to Workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: 'Family invitations' }).click();
  await expect(page.getByRole('heading', { name: 'Family invitations' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite Member', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: `Use ${theme} theme` }).click();
    await page.getByRole('button', { name: 'Invite Member', exact: true }).click();
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`invite-dialog-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await dialog.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a valid email address.');
  const email = `invite-${randomUUID()}@example.com`;
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Inbox delivery is not confirmed');
  await expect(page.getByRole('heading', { name: email })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  const row = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: email, exact: true }),
  });
  await row.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Invitation revoked.');
});

test('accepts a single-use invitation without login, token URL leakage or credential storage', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const token = randomBytes(32).toString('base64url'),
    email = `accepted-${randomUUID()}@example.com`;
  expect(
    (await context.request.post('/api/v1/__test/invitation', { data: { token, email } })).status(),
  ).toBe(200);
  const leaked: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(token)) leaked.push(request.url());
  });
  const response = await page.goto(`/accept-invitation#token=${token}`);
  expect(response!.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('form', { name: 'Accept invitation' })).toBeVisible();
  await expect(page).toHaveURL(`${baseURL}/accept-invitation`);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.getByRole('button', { name: `Use ${theme} theme` }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`accept-${width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole('button', { name: 'Accept Invitation & Create Account' }).click();
  await expect(page.getByLabel('Display name')).toBeFocused();
  await page.getByLabel('Display name').fill('Invited Member');
  await page
    .getByLabel('Create password', { exact: true })
    .fill('synthetic family invitation password');
  await page.getByLabel('Confirm password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Accept Invitation & Create Account' }).click();
  await expect(page.getByText('Passwords must match.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show passwords' }).click();
  await expect(page.getByLabel('Create password', { exact: true })).toHaveAttribute('type', 'text');
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('synthetic family invitation password');
  await page.getByRole('button', { name: 'Accept Invitation & Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account has been created' })).toBeVisible();
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toMatch(/synthetic family invitation password/);
  expect(leaked).toEqual([]);
  await page.goto(`/accept-invitation#token=${token}`);
  await expect(page.getByRole('heading', { name: 'Invitation already accepted' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Sign In' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic family invitation password');
  await page.getByRole('button', { name: 'Sign In to Workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Signed in as Invited Member.', { exact: true })).toBeVisible();
  await expect(page.getByText('Role: Member', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Family invitations' })).toHaveCount(0);
  const profile = await context.request.get('/api/v1/auth/me');
  expect(profile.status()).toBe(200);
  expect(await profile.json()).toMatchObject({ data: { user: { email, role: 'MEMBER' } } });
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

for (const [state, title] of [
  ['EXPIRED', 'Invitation expired'],
  ['CONSUMED', 'Invitation already accepted'],
  ['REVOKED', 'Invitation revoked'],
] as const) {
  test(`shows the real ${state} invitation state`, async ({ page, context }) => {
    const token = randomBytes(32).toString('base64url');
    await context.request.post('/api/v1/__test/invitation', {
      data: { token, email: `state-${randomUUID()}@example.com`, state },
    });
    await page.goto(`/accept-invitation#token=${token}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);
  });
}
test('invalid links and no-JavaScript visits never expose a credential form', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/accept-invitation#token=invalid');
  await expect(page.getByRole('heading', { name: 'Invalid invitation' })).toBeVisible();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const noScript = await context.newPage();
    await noScript.goto(`${baseURL}/accept-invitation#token=${'a'.repeat(43)}`);
    await expect(noScript.getByRole('form')).toHaveCount(0);
    await expect(noScript.locator('noscript p')).toContainText('JavaScript is required');
  } finally {
    await context.close();
  }
});

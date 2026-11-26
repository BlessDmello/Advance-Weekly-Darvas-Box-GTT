import { defineConfig, devices } from '@playwright/test';

const production = process.env.E2E_PRODUCTION === '1';
const webPort = Number(process.env.E2E_WEB_PORT ?? '3000');
const apiPort = Number(process.env.E2E_API_PORT ?? '4000');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm test:auth-server',
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 600_000,
      env: {
        NODE_ENV: production ? 'production' : 'test',
        LOG_LEVEL: 'silent',
        PORT: '4000',
        HOST: '127.0.0.1',
      },
    },
    {
      // Production rewrites are baked into the build; both commands need the selected origin.
      command: production
        ? `pnpm --filter @darvas/web build && pnpm --filter @darvas/web exec next start --port ${webPort} --hostname 127.0.0.1`
        : `pnpm --filter @darvas/web exec next dev --port ${webPort} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: production ? 180_000 : 120_000,
      env: { API_INTERNAL_ORIGIN: `http://127.0.0.1:${apiPort}` },
    },
  ],
});

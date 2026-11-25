import { defineConfig, devices } from '@playwright/test';

const production = process.env.E2E_PRODUCTION === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: production ? 'pnpm --filter @darvas/api start' : 'pnpm --filter @darvas/api dev',
      url: 'http://127.0.0.1:4000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: production ? 'production' : 'test',
        LOG_LEVEL: 'silent',
        PORT: '4000',
        HOST: '127.0.0.1',
      },
    },
    {
      command: production ? 'pnpm --filter @darvas/web start' : 'pnpm --filter @darvas/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { API_INTERNAL_ORIGIN: 'http://127.0.0.1:4000' },
    },
  ],
});

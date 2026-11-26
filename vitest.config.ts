import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['apps/api/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'database-integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 30_000,
          // First-run Windows binary download can exceed three minutes.
          hookTimeout: 600_000,
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/', import.meta.url)) } },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/tests/setup.ts'],
        },
      },
    ],
  },
});

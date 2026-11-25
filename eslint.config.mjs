import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'docs/**',
      '.tools/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({ ...config, files: ['apps/web/**/*.{ts,tsx,js,mjs}'] })),
  ...nextTypeScript.map((config) => ({ ...config, files: ['apps/web/**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  prettier,
];

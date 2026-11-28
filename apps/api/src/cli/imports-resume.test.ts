import { expect, it } from 'vitest';
import { resumeOptions } from './imports-resume.js';
const environment = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/advanced_darvas_dev',
  MONGODB_DB_NAME: 'advanced_darvas_dev',
};
it('requires a specific job and defaults to read-only inspection', () => {
  expect(resumeOptions(environment, ['--job', 'a'.repeat(24)]).apply).toBe(false);
  expect(resumeOptions(environment, ['--job', 'a'.repeat(24), '--apply']).apply).toBe(true);
  for (const args of [
    [],
    ['--apply'],
    ['--job', 'invalid'],
    ['--job', 'a'.repeat(24), '--force'],
    ['--job', 'a'.repeat(24), '--apply', '--apply'],
  ])
    expect(() => resumeOptions(environment, args)).toThrow();
});
it('refuses production and non-development database targets before connecting', () => {
  expect(() =>
    resumeOptions({ ...environment, NODE_ENV: 'production' }, ['--job', 'a'.repeat(24)]),
  ).toThrow();
  expect(() =>
    resumeOptions({ ...environment, MONGODB_DB_NAME: 'other' }, ['--job', 'a'.repeat(24)]),
  ).toThrow();
});

import { expect, it } from 'vitest';
import { preparationConfig } from './invitations-prepare.js';
const environment = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1/advanced_darvas_dev',
  MONGODB_DB_NAME: 'advanced_darvas_dev',
};
it('defaults to a read-only preparation report and requires an explicit apply argument', () => {
  expect(preparationConfig(environment, []).apply).toBe(false);
  expect(preparationConfig(environment, ['--apply']).apply).toBe(true);
});
it.each([
  { NODE_ENV: 'production' },
  { MONGODB_DB_NAME: 'production' },
  { MONGODB_URI: 'mongodb://localhost/production' },
])('refuses unsafe preparation settings %#', (changes) => {
  expect(() => preparationConfig({ ...environment, ...changes }, [])).toThrow();
});
it('refuses unknown or repeated options', () => {
  expect(() => preparationConfig(environment, ['--force'])).toThrow();
  expect(() => preparationConfig(environment, ['--apply', '--apply'])).toThrow();
});

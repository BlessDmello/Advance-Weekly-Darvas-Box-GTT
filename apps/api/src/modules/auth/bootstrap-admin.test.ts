import { describe, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '@darvas/database';
import { createInitialAdmin } from '@darvas/database';
import { bootstrapAdmin } from './bootstrap-admin.js';

vi.mock('@darvas/database', () => ({ createInitialAdmin: vi.fn() }));
const values = {
  workspaceName: 'Workspace',
  email: 'admin@example.com',
  displayName: 'Test Admin',
  password: 'synthetic-passphrase',
  confirmPassword: 'synthetic-passphrase',
};
describe('bootstrap input boundary', () => {
  it.each([
    { email: 'invalid' },
    { displayName: '' },
    { workspaceName: ' ' },
    { password: 'short' },
    { confirmPassword: 'mismatch' },
    { role: 'ADMIN' },
  ])('rejects invalid input without hashing or database writes %#', async (changes) => {
    await expect(
      bootstrapAdmin({} as DatabaseConnection, { ...values, ...changes }),
    ).rejects.toThrow('Invalid bootstrap input.');
    expect(createInitialAdmin).not.toHaveBeenCalled();
  });
});

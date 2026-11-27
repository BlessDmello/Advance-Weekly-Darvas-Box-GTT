import type { PublicUser } from '@darvas/contracts';
import { describe, expect, it } from 'vitest';
import { authorizeOwnedResource, privateResourceScope } from './authorization.js';

const user: PublicUser = {
  id: 'a'.repeat(24),
  familyId: 'b'.repeat(24),
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'MEMBER',
  status: 'ACTIVE',
};
describe('private resource policy', () => {
  it.each(['ADMIN', 'MEMBER'] as const)('allows %s access only to their own resource', (role) => {
    const actor = { ...user, role };
    const resource = { ownerId: user.id, familyId: user.familyId, value: 'private' };
    expect(authorizeOwnedResource(actor, resource)).toBe(resource);
    expect(privateResourceScope(actor)).toEqual({ ownerId: user.id });
    expect(() => authorizeOwnedResource(actor, { ...resource, ownerId: 'c'.repeat(24) })).toThrow(
      expect.objectContaining({ status: 404, code: 'NOT_FOUND' }),
    );
  });
  it('denies mismatched server-loaded family metadata even with the same owner ID', () => {
    expect(() =>
      authorizeOwnedResource(user, { ownerId: user.id, familyId: 'c'.repeat(24) }),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });
  it('does not require a new family field on existing owner-only contracts', () => {
    expect(authorizeOwnedResource(user, { ownerId: user.id })).toEqual({ ownerId: user.id });
  });
  it('returns the same denial for a missing resource', () => {
    expect(() => authorizeOwnedResource(user, null)).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });
  it('never builds a scope for disabled identities', () => {
    expect(() => privateResourceScope({ ...user, status: 'DISABLED' })).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });
});

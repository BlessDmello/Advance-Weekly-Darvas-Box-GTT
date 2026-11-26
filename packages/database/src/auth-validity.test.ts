import { describe, expect, it } from 'vitest';
import { isInvitationValid, isSessionValid } from './auth-validity.js';

const now = new Date('2026-11-26T10:00:00Z');
const future = new Date(now.getTime() + 1_000);
describe('token validity independent of TTL deletion', () => {
  it('rejects expired, boundary-expired and revoked sessions', () => {
    expect(isSessionValid({ expiresAt: future }, now)).toBe(true);
    expect(isSessionValid({ expiresAt: now }, now)).toBe(false);
    expect(isSessionValid({ expiresAt: new Date(0) }, now)).toBe(false);
    expect(isSessionValid({ expiresAt: future, revokedAt: now }, now)).toBe(false);
    expect(isSessionValid({ expiresAt: new Date('invalid') }, now)).toBe(false);
  });
  it('accepts only pending, unconsumed, unexpired invitations', () => {
    expect(isInvitationValid({ expiresAt: future, status: 'PENDING' }, now)).toBe(true);
    for (const status of ['CONSUMED', 'REVOKED', 'EXPIRED']) {
      expect(isInvitationValid({ expiresAt: future, status }, now)).toBe(false);
    }
    expect(isInvitationValid({ expiresAt: now, status: 'PENDING' }, now)).toBe(false);
    expect(isInvitationValid({ expiresAt: future, status: 'PENDING', consumedAt: now }, now)).toBe(
      false,
    );
    expect(
      isInvitationValid({ expiresAt: future, status: 'PENDING', consumedBy: 'user-id' }, now),
    ).toBe(false);
  });
});

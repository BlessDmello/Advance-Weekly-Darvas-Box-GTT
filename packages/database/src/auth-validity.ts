export function isSessionValid(
  session: { expiresAt: Date; revokedAt?: Date | null },
  now = new Date(),
): boolean {
  return (
    Number.isFinite(session.expiresAt.getTime()) &&
    session.expiresAt > now &&
    session.revokedAt == null
  );
}

export function isInvitationValid(
  invitation: {
    expiresAt: Date;
    status: string;
    consumedAt?: Date | null;
    consumedBy?: unknown;
    revokedAt?: Date | null;
  },
  now = new Date(),
): boolean {
  return (
    invitation.status === 'PENDING' &&
    invitation.consumedAt == null &&
    invitation.consumedBy == null &&
    invitation.revokedAt == null &&
    Number.isFinite(invitation.expiresAt.getTime()) &&
    invitation.expiresAt > now
  );
}

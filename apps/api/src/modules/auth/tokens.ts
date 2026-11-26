import { createHash, randomBytes } from 'node:crypto';

// For future session/invitation issuance; this milestone never issues a session.
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createTokenMaterial(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

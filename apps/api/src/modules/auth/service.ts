import type { AuthErrorCode } from '@darvas/contracts';
import type { AuthRepository } from './types.js';
import { hashPassword, verifyPassword } from './password.js';
import { createTokenMaterial } from './tokens.js';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
  }
}
// Generated only for comparable verification work; never an account or accepted credential.
let dummyHash: Promise<string> | undefined;
export async function login(
  repository: AuthRepository,
  email: string,
  password: string,
  rememberMe: boolean,
  previousTokenHash?: string,
) {
  const credentials = await repository.findCredentials(email);
  const candidateHash =
    credentials?.passwordHash ?? (await (dummyHash ??= hashPassword(createTokenMaterial().token)));
  const valid = await verifyPassword(candidateHash, password);
  if (!valid || !credentials || credentials.user.status !== 'ACTIVE' || !credentials.familyActive) {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const material = createTokenMaterial();
  const lifetime = rememberMe ? 7 * 24 * 60 * 60 : 8 * 60 * 60;
  const expiresAt = new Date(Date.now() + lifetime * 1000);
  await repository.createSession({
    userId: credentials.user.id,
    tokenHash: material.hash,
    expiresAt,
    ...(previousTokenHash ? { previousTokenHash } : {}),
  });
  return {
    user: credentials.user,
    token: material.token,
    hash: material.hash,
    expiresAt,
    lifetime,
  };
}

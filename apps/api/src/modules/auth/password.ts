import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

export const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} satisfies argon2.HashOptions;

export function isPasswordAllowed(password: string): boolean {
  const length = Array.from(password).length;
  return (
    length >= 15 &&
    length <= 128 &&
    Buffer.byteLength(password, 'utf8') <= 1024 &&
    !password.includes('\0')
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (!isPasswordAllowed(password))
    throw new Error('Password must contain 15 to 128 characters without null characters.');
  return argon2.hash(password, { ...passwordHashOptions, salt: randomBytes(16) });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  // Login bounds are distinct from the policy for creating a new password.
  if (
    !hash.startsWith('$argon2id$') ||
    !password ||
    Array.from(password).length > 128 ||
    password.includes('\0')
  )
    return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

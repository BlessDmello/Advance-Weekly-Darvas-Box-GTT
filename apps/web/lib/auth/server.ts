import { cookies } from 'next/headers';
import { authProfileSchema } from '@darvas/contracts';
import { getApiOrigin } from '../env';

// next/headers enforces the server-component boundary. Never import this into client code.
export async function currentUser() {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  const response = await fetch(`${getApiOrigin()}/api/v1/auth/me`, {
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Workspace unavailable.');
  return authProfileSchema.parse(await response.json()).data.user;
}

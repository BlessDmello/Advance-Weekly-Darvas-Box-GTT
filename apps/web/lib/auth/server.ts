import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { authProfileSchema, invitationListSchema } from '@darvas/contracts';
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
  const user = authProfileSchema.parse(await response.json()).data.user;
  return user.status === 'ACTIVE' ? user : null;
}

// Call at each private page/data boundary; layouts alone do not gate child rendering.
export class WorkspaceUnavailableError extends Error {}

export async function requireCurrentUser() {
  let user;
  try {
    user = await currentUser();
  } catch {
    throw new WorkspaceUnavailableError('Workspace unavailable.');
  }
  if (!user) redirect('/login');
  return user;
}

export async function requireAdminUser() {
  const user = await requireCurrentUser();
  if (user.role !== 'ADMIN') notFound();
  return user;
}

export async function adminInvitationData() {
  const user = await requireAdminUser();
  try {
    const response = await fetch(`${getApiOrigin()}/api/v1/invitations`, {
      headers: { Cookie: (await cookies()).toString() },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new WorkspaceUnavailableError('Invitations unavailable.');
    return { user, invitations: invitationListSchema.parse(await response.json()) };
  } catch {
    throw new WorkspaceUnavailableError('Invitations unavailable.');
  }
}

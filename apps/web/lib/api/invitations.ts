import {
  invitationAcceptedSchema,
  invitationListSchema,
  invitationResponseSchema,
  invitationVerificationSchema,
} from '@darvas/contracts';
import { csrfToken } from './auth';

export class InvitationRequestError extends Error {}
async function request(path: string, body?: unknown) {
  const response = await fetch(`/api/v1/invitations${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken() },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const code =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      data.error &&
      typeof data.error === 'object' &&
      'code' in data.error
        ? data.error.code
        : '';
    throw new InvitationRequestError(
      code === 'INVITATION_INVALID'
        ? 'This invitation is no longer valid. Ask your family Admin for a new invitation.'
        : code === 'INVITATION_CONFLICT'
          ? 'An account or pending invitation already exists, or this invitation has changed. Refresh the list.'
          : code === 'RATE_LIMITED'
            ? 'Please wait before requesting another invitation.'
            : code === 'ALREADY_AUTHENTICATED'
              ? 'Sign out before accepting an invitation.'
              : response.status === 401
                ? 'Please sign in again.'
                : response.status === 403
                  ? 'You do not have permission to perform this action.'
                  : 'Invitations are temporarily unavailable. Please try again.',
    );
  }
  return response.status === 204 ? null : response.json();
}
export async function verifyInvitation(token: string) {
  return invitationVerificationSchema.parse(await request('/verify', { token })).data;
}
export async function acceptInvitation(input: {
  token: string;
  displayName: string;
  password: string;
}) {
  return invitationAcceptedSchema.parse(await request('/accept', input)).data;
}
export async function listInvitations(cursor?: string) {
  return invitationListSchema.parse(
    await request(cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
  );
}
export async function sendInvitation(email: string) {
  return invitationResponseSchema.parse(await request('', { email, expiresInHours: 72 })).data;
}
export async function resendInvitation(id: string) {
  return invitationResponseSchema.parse(await request(`/${encodeURIComponent(id)}/resend`, {}))
    .data;
}
export async function revokeInvitation(id: string) {
  await request(`/${encodeURIComponent(id)}/revoke`, {});
}

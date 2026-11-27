import type { InvitationDto, PublicUser } from '@darvas/contracts';
import { InvitationStorageError } from '@darvas/database';
import { createTokenMaterial, hashToken } from '../auth/tokens.js';
import { hashPassword } from '../auth/password.js';
import { InvitationError } from './types.js';
import type { InvitationDependencies } from './types.js';

export async function invitationOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InvitationError) throw error;
    if (error instanceof InvitationStorageError) {
      const table = {
        INVALID: [422, 'INVITATION_INVALID'],
        CONFLICT: [409, 'INVITATION_CONFLICT'],
        NOT_FOUND: [404, 'NOT_FOUND'],
        RATE_LIMITED: [429, 'RATE_LIMITED'],
        FORBIDDEN: [403, 'FORBIDDEN'],
      } as const;
      const [status, code] = table[error.code];
      throw new InvitationError(
        status,
        code,
        status === 422
          ? 'This invitation is no longer valid.'
          : status === 429
            ? 'Please wait before requesting another invitation.'
            : 'The invitation operation could not be completed.',
      );
    }
    throw new InvitationError(
      503,
      'INVITATION_UNAVAILABLE',
      'Invitations are temporarily unavailable.',
    );
  }
}
export async function issueInvitation(
  dependencies: InvitationDependencies,
  actor: PublicUser,
  email: string | undefined,
  origin: string,
  previousId?: string,
): Promise<InvitationDto> {
  if (!dependencies.sender.configured())
    throw new InvitationError(503, 'INVITATION_UNAVAILABLE', 'Invitation email is not configured.');
  return invitationOperation(async () => {
    const repository = await dependencies.repository();
    const recipient = previousId ? await repository.emailForResend(actor, previousId) : email!;
    const material = createTokenMaterial();
    const invite = await repository.issue(actor, recipient, material.hash, previousId);
    const details = await repository.verify(material.hash);
    if (details.state !== 'VALID') {
      await repository.markDelivery(invite.invitationId, 'FAILED');
      return { ...invite, delivery: 'FAILED' };
    }
    let result: Awaited<ReturnType<typeof dependencies.sender.send>>;
    try {
      result = await dependencies.sender.send(
        {
          to: recipient,
          link: `${origin}/accept-invitation#token=${material.token}`,
          expiresAt: invite.expiresAt,
          familyName: details.familyName,
          inviterName: details.inviterName,
        },
        invite.invitationId,
      );
    } catch {
      result = { delivery: 'UNCONFIRMED' };
    }
    try {
      await repository.markDelivery(invite.invitationId, result.delivery, result.providerMessageId);
    } catch {
      result = { delivery: 'UNCONFIRMED' };
    }
    return { ...invite, delivery: result.delivery };
  });
}
export async function acceptInvitation(
  dependencies: InvitationDependencies,
  input: { token: string; password: string; displayName: string },
) {
  return invitationOperation(async () => {
    const repository = await dependencies.repository();
    const hash = hashToken(input.token);
    if ((await repository.verify(hash)).state !== 'VALID')
      throw new InvitationStorageError('INVALID');
    const passwordHash = await hashPassword(input.password);
    try {
      return await repository.accept(hash, input.displayName, passwordHash);
    } catch (error) {
      if (error instanceof InvitationStorageError && error.code === 'CONFLICT')
        throw new InvitationStorageError('INVALID');
      throw error;
    }
  });
}

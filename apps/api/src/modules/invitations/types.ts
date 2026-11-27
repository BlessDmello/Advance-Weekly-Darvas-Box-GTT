import type { InvitationRepository } from '@darvas/database';
import type { InvitationErrorCode } from '@darvas/contracts';

export class InvitationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: InvitationErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export interface InvitationMail {
  to: string;
  link: string;
  expiresAt: string;
  familyName: string;
  inviterName: string;
}
export interface InvitationSender {
  configured(): boolean;
  send(
    mail: InvitationMail,
    id: string,
  ): Promise<{ delivery: 'ACCEPTED' | 'FAILED' | 'UNCONFIRMED'; providerMessageId?: string }>;
}
export interface InvitationDependencies {
  repository(): Promise<InvitationRepository>;
  sender: InvitationSender;
}

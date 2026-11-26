import type { PublicUser } from '@darvas/contracts';

export interface AuthRepository {
  findCredentials(
    email: string,
  ): Promise<{ user: PublicUser; passwordHash: string; familyActive: boolean } | null>;
  findSession(hash: string, now: Date): Promise<{ id: string; user: PublicUser } | null>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    previousTokenHash?: string;
  }): Promise<void>;
  revokeSession(hash: string): Promise<void>;
}
export interface AuthRuntime {
  repository(): Promise<AuthRepository>;
  close(): Promise<void>;
}

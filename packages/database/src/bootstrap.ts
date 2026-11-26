import { Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { assertAuthIndexes, assertTransactionSupport } from './auth-indexes.js';
import { createAuthModels } from './models/index.js';

export class BootstrapError extends Error {
  constructor(public readonly code: 'ALREADY_INITIALIZED' | 'BOOTSTRAP_FAILED') {
    super(
      code === 'ALREADY_INITIALIZED'
        ? 'Initialization is already complete or identity data exists. Bootstrap was refused.'
        : 'Bootstrap outcome could not be confirmed. Initialization is atomic; check existing state before retrying.',
    );
    this.name = 'BootstrapError';
  }
}

export interface InitialAdminRecord {
  workspaceName: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

/** No prompts, logging, index creation or external side effects inside the transaction. */
export async function createInitialAdmin(
  connection: Connection,
  input: InitialAdminRecord,
): Promise<void> {
  try {
    await assertTransactionSupport(connection);
    const models = createAuthModels(connection);
    await assertAuthIndexes(models);
    const familyId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    await connection.transaction(
      async (session) => {
        if (
          (await models.Family.exists({}).session(session)) ||
          (await models.User.exists({}).session(session)) ||
          (await models.Session.exists({}).session(session)) ||
          (await models.Invitation.exists({}).session(session))
        ) {
          throw new BootstrapError('ALREADY_INITIALIZED');
        }
        // Unique marker arbitrates concurrent transactions, including different Admin emails.
        await models.Family.create(
          [
            {
              _id: familyId,
              name: input.workspaceName,
              createdBy: userId,
              status: 'ACTIVE',
              initialBootstrapKey: 'INITIAL_ADMIN',
            },
          ],
          { session },
        );
        await models.User.create(
          [
            {
              _id: userId,
              familyId,
              emailNormalized: input.email,
              displayName: input.displayName,
              passwordHash: input.passwordHash,
              role: 'ADMIN',
              status: 'ACTIVE',
            },
          ],
          { session },
        );
      },
      {
        readPreference: 'primary',
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      throw new BootstrapError('ALREADY_INITIALIZED');
    }
    // Never retain driver causes or validation values in a public error.
    throw new BootstrapError('BOOTSTRAP_FAILED');
  }
}

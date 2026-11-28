import type { ClientSession, Connection } from 'mongoose';
export function transactionLabel(error: unknown, label: string): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'hasErrorLabel' in error &&
    typeof error.hasErrorLabel === 'function' &&
    error.hasErrorLabel(label) === true
  );
}
/** Fresh documents on each callback attempt. No external effects; uncertainty is resolved by durable readers. */
export async function marketTransaction<T>(
  connection: Connection,
  operation: (session: ClientSession) => Promise<T>,
) {
  const deadline = Date.now() + 10_000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = await connection.startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        maxCommitTimeMS: 5000,
      });
      const result = await operation(session);
      if (Date.now() >= deadline) throw new Error('TRANSACTION_BUDGET');
      for (let commit = 0; ; commit++) {
        try {
          await session.commitTransaction();
          return result;
        } catch (error) {
          if (
            !transactionLabel(error, 'UnknownTransactionCommitResult') ||
            commit >= 2 ||
            Date.now() >= deadline
          )
            throw error;
        }
      }
    } catch (error) {
      if (!transactionLabel(error, 'UnknownTransactionCommitResult') && session.inTransaction())
        await session.abortTransaction().catch(() => {});
      if (
        !transactionLabel(error, 'UnknownTransactionCommitResult') &&
        transactionLabel(error, 'TransientTransactionError') &&
        attempt < 2 &&
        Date.now() < deadline
      )
        continue;
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new Error('TRANSACTION_BUDGET');
}

import type { Connection } from 'mongoose';
import { expect, it, vi } from 'vitest';
import { marketTransaction } from './market-transaction.js';
function setup() {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn(),
    endSession: vi.fn(),
    inTransaction: () => true,
  };
  const connection = { startSession: async () => session } as unknown as Connection;
  return { session, connection };
}
const uncertain = () =>
  Object.assign(new Error('uncertain'), {
    hasErrorLabel: (name: string) => name === 'UnknownTransactionCommitResult',
  });
it('retries uncertain commit only, never the callback, and bounds commit attempts', async () => {
  const { connection, session } = setup();
  session.commitTransaction.mockRejectedValue(uncertain());
  const callback = vi.fn().mockResolvedValue('done');
  await expect(marketTransaction(connection, callback)).rejects.toThrow('uncertain');
  expect(callback).toHaveBeenCalledTimes(1);
  expect(session.commitTransaction).toHaveBeenCalledTimes(3);
  expect(session.abortTransaction).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);
});
it('retries a transient transaction with fresh callback reads and no partial commit', async () => {
  const { connection, session } = setup();
  session.abortTransaction.mockResolvedValue(undefined);
  const callback = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('conflict'), {
        hasErrorLabel: (name: string) => name === 'TransientTransactionError',
      }),
    )
    .mockResolvedValue('done');
  expect(await marketTransaction(connection, callback)).toBe('done');
  expect(callback).toHaveBeenCalledTimes(2);
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);
});

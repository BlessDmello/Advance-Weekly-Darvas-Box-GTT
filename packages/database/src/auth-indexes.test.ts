import { afterEach, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import { prepareAuthStorage } from './auth-indexes.js';

afterEach(() => vi.restoreAllMocks());
it('refuses a standalone deployment before creating collections or indexes', async () => {
  const command = vi.fn().mockResolvedValue({ isWritablePrimary: true });
  const model = vi.fn();
  const connection = {
    db: { admin: () => ({ command }) },
    model,
  } as unknown as Connection;
  await expect(prepareAuthStorage(connection)).rejects.toThrow(
    'requires MongoDB transaction support',
  );
  expect(command).toHaveBeenCalledExactlyOnceWith({ hello: 1 });
  expect(model).not.toHaveBeenCalled();
});

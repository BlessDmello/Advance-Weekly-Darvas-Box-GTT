import { expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, readDatabaseConfig } from './index.js';

it('does not open a connection when imported or when reading configuration', () => {
  const connect = vi.spyOn(mongoose, 'createConnection');
  expect(
    readDatabaseConfig({
      MONGODB_URI: 'mongodb+srv://example.invalid/',
      MONGODB_DB_NAME: 'darvas_test',
    }).databaseName,
  ).toBe('darvas_test');
  expect(connect).not.toHaveBeenCalled();
  connect.mockRestore();
});

it('reports missing database configuration without exposing supplied credentials', () => {
  expect(() => readDatabaseConfig({ MONGODB_URI: 'secret-value' })).toThrow(
    'Valid MONGODB_URI and MONGODB_DB_NAME are required',
  );
});

it('closes a failed owned connection and redacts driver errors', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const connection = {
    asPromise: vi.fn().mockRejectedValue(new Error('synthetic-private-driver-canary')),
    close,
  };
  const create = vi
    .spyOn(mongoose, 'createConnection')
    .mockReturnValue(connection as unknown as mongoose.Connection);
  try {
    await expect(
      connectDatabase({
        uri: 'mongodb://example.invalid/isolated_test',
        databaseName: 'isolated_test',
      }),
    ).rejects.toThrow('MongoDB connection failed. Check server configuration and Atlas access.');
    expect(close).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ autoCreate: false, autoIndex: false }),
    );
  } finally {
    create.mockRestore();
  }
});

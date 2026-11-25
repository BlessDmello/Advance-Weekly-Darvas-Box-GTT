import { expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { readDatabaseConfig } from './index.js';

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

import mongoose, { Types } from 'mongoose';
import { afterAll, expect, it } from 'vitest';
import { createMarketModels } from '../market-models.js';
import { decimalToPlain } from './market-options.js';
import {
  marketIds,
  syntheticJob,
  syntheticManifest,
  syntheticPreview,
  syntheticRevision,
  syntheticRow,
  syntheticSession,
  syntheticStock,
} from '../../../../tests/support/market-records.js';

const connection = mongoose.createConnection();
const models = createMarketModels(connection);
it('accepts nullable diagnostic row references while retaining integer and range validation', async () => {
  const manifest = syntheticManifest();
  manifest.metadata.diagnostics = [
    {
      code: 'TEST_WARNING',
      severity: 'WARNING',
      row: null,
      field: 'file',
      message: 'Synthetic diagnostic.',
    },
  ];
  await expect(new models.ImportStaging(manifest).validate()).resolves.toBeUndefined();
  manifest.metadata.diagnostics[0]!.row = 0;
  await expect(new models.ImportStaging(manifest).validate()).rejects.toThrow();
  manifest.metadata.diagnostics[0]!.row = 1.5;
  await expect(new models.ImportStaging(manifest).validate()).rejects.toThrow();
});
afterAll(() => connection.close());
it('registers seven explicit collections without opening a connection or enabling DDL', () => {
  expect(connection.readyState).toBe(0);
  expect(createMarketModels(connection).Stock).toBe(models.Stock);
  expect(Object.values(models).map((model) => model.collection.collectionName)).toEqual([
    'stocks',
    'tradingSessions',
    'dailyPrices',
    'priceRevisions',
    'importBatches',
    'importJobs',
    'importStaging',
  ]);
  for (const model of Object.values(models)) {
    expect(model.schema.options.autoCreate).toBe(false);
    expect(model.schema.options.autoIndex).toBe(false);
    expect(model.schema.options.strict).toBe('throw');
    expect(model.schema.options.optimisticConcurrency).toBe(true);
  }
});
it('accepts explicit synthetic stock/session definitions and rejects invented publication readiness', async () => {
  await expect(new models.Stock(syntheticStock()).validate()).resolves.toBeUndefined();
  await expect(new models.TradingSession(syntheticSession()).validate()).resolves.toBeUndefined();
  await expect(
    new models.Stock({
      ...syntheticStock(),
      publication: { ...syntheticStock().publication, state: 'PUBLISHED' },
    }).validate(),
  ).rejects.toThrow();
  expect(() => new models.Stock({ ...syntheticStock(), familyId: marketIds.family })).toThrow();
});
it('uses Decimal128 and rejects JS Number coercion, unsupported precision and invalid OHLC', async () => {
  const data = {
    ...syntheticRow(),
    stockId: marketIds.stock,
    datasetRevision: 1,
    revision: 1,
    sourceImportBatchId: marketIds.batch,
  };
  const price = new models.DailyPrice(data);
  await price.validate();
  expect(price.raw?.close).toBeInstanceOf(Types.Decimal128);
  expect(price.raw?.close.toString()).toBe('10.30');
  for (const close of [1.5, 'NaN', '0.12345678901234567890123456789012345'])
    await expect(
      new models.DailyPrice({ ...data, raw: { ...data.raw, close } }).validate(),
    ).rejects.toThrow();
  await expect(
    new models.DailyPrice({ ...data, raw: { ...data.raw, high: '9' } }).validate(),
  ).rejects.toThrow();
  expect(decimalToPlain(Types.Decimal128.fromString('1E-20'))).toBe(`0.${'0'.repeat(19)}1`);
  expect(decimalToPlain(Types.Decimal128.fromString('1E+70'))).toBe(`1${'0'.repeat(70)}`);
});
it('requires audited consecutive revision identities', async () => {
  await expect(new models.PriceRevision(syntheticRevision()).validate()).resolves.toBeUndefined();
  await expect(
    new models.PriceRevision({ ...syntheticRevision(), newRevision: 8 }).validate(),
  ).rejects.toThrow();
  await expect(
    new models.PriceRevision({ ...syntheticRevision(), reason: ' ' }).validate(),
  ).rejects.toThrow();
});
it('requires queued initial jobs and bounded staging payloads', async () => {
  await expect(new models.ImportJob(syntheticJob()).validate()).resolves.toBeUndefined();
  const manifest = syntheticManifest();
  await expect(new models.ImportStaging(manifest).validate()).resolves.toBeUndefined();
  const value = new models.ImportStaging(manifest).toJSON();
  expect(value).not.toHaveProperty('tokenHash');
  await expect(
    new models.ImportStaging({ ...manifest, chunkCount: 51 }).validate(),
  ).rejects.toThrow();
  const chunk = {
    stagingId: marketIds.staging,
    stockId: marketIds.stock,
    familyId: marketIds.family,
    uploadedBy: marketIds.user,
    kind: 'CHUNK',
    state: 'PREVIEW',
    jobId: null,
    expiresAt: syntheticPreview().expiresAt,
    ordinal: 0,
    chunkHash: 'a'.repeat(64),
    rows: [syntheticRow()],
  };
  await expect(new models.ImportStaging(chunk).validate()).resolves.toBeUndefined();
  await expect(
    new models.ImportStaging({
      ...chunk,
      rows: Array.from({ length: 101 }, syntheticRow),
    }).validate(),
  ).rejects.toThrow();
});

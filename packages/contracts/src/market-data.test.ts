import { expect, it } from 'vitest';
import {
  assertDatasetTransition,
  compareDecimalText,
  dailyOhlcvSchema,
  datasetPublicationSchema,
  isDatasetPublished,
  priceTextSchema,
  stockRecordSchema,
  tradingSessionSchema,
} from './market-data.js';
import {
  marketIds,
  syntheticQuality,
  syntheticRow,
  syntheticSession,
  syntheticStock,
  unavailablePublication,
} from '../../../tests/support/market-records.js';
import { dataQualitySchema } from './market-data.js';

it('validates stock identity without inventing membership or rejecting NSE punctuation', () => {
  for (const symbol of ['SYNTHETIC', 'M&M', 'BAJAJ-AUTO'])
    expect(stockRecordSchema.safeParse({ ...syntheticStock(), symbol }).success).toBe(true);
  for (const symbol of ['NSE:SYNTHETIC', 'synthetic', '<script>', 'A B'])
    expect(stockRecordSchema.safeParse({ ...syntheticStock(), symbol }).success).toBe(false);
  expect(
    stockRecordSchema.safeParse({ ...syntheticStock(), familyId: marketIds.family }).success,
  ).toBe(false);
});
it.each([
  '0',
  '-1',
  '1e2',
  'NaN',
  'Infinity',
  '1,000',
  '0.12345678901234567890123456789012345',
  1.25,
])('rejects unsupported price input %s', (price) => {
  expect(priceTextSchema.safeParse(price).success).toBe(false);
});
it('compares and preserves exact decimal precision without a Number conversion', () => {
  const small = '1.000000000000000000000000000000001';
  expect(priceTextSchema.parse(small)).toBe(small);
  expect(compareDecimalText(small, '1')).toBe(1);
  expect(compareDecimalText('10.0', '10.000')).toBe(0);
  expect(priceTextSchema.safeParse(`1${'0'.repeat(70)}`).success).toBe(true);
});
it('validates OHLC, optional volume and the supplied basis separately', () => {
  const row = {
    ...syntheticRow(),
    stockId: marketIds.stock,
    revision: 1,
    sourceImportBatchId: marketIds.batch,
  };
  expect(dailyOhlcvSchema.parse({ ...row, volume: null }).volume).toBeNull();
  for (const changes of [
    { raw: { ...row.raw, high: '10.1' } },
    { raw: { ...row.raw, close: 'bad' } },
    { volume: '1.5' },
    { provenance: { ...row.provenance, basis: 'UNKNOWN' } },
    { adjusted: row.raw },
    { provenance: { ...row.provenance, basis: 'ADJUSTED' }, raw: null, adjusted: row.raw },
  ])
    expect(dailyOhlcvSchema.safeParse({ ...row, ...changes }).success).toBe(false);
});
it('validates real dates and explicitly sourced exchange sessions', () => {
  expect(tradingSessionSchema.parse(syntheticSession()).sessionType).toBe('SPECIAL');
  for (const changes of [
    { sessionDate: '2026-02-30' },
    { sessionDate: '26/11/2026' },
    { isOpen: false },
    { calendarSource: '' },
    { timezone: 'UTC' },
  ])
    expect(tradingSessionSchema.safeParse({ ...syntheticSession(), ...changes }).success).toBe(
      false,
    );
});
it('does not equate imported, incomplete or unverified data with publication/freshness', () => {
  expect(isDatasetPublished(unavailablePublication())).toBe(false);
  expect(isDatasetPublished({ ...unavailablePublication(), state: 'PUBLISHED' })).toBe(false);
  const published = {
    ...unavailablePublication(),
    state: 'PUBLISHED',
    revision: 1,
    publishedRevision: 1,
    sourceRevisionKey: 'a'.repeat(64),
    asOfSession: '2026-11-26',
  };
  expect(isDatasetPublished(published)).toBe(true);
  expect(
    datasetPublicationSchema.safeParse({ ...published, activeJobId: marketIds.job }).success,
  ).toBe(false);
  expect(dataQualitySchema.safeParse({ ...syntheticQuality(), freshness: 'FRESH' }).success).toBe(
    false,
  );
  expect(
    dataQualitySchema.safeParse({ ...syntheticQuality(), calendarVersion: null }).success,
  ).toBe(false);
  expect(
    dataQualitySchema.safeParse({ ...syntheticQuality(), missingSessionCount: 1 }).success,
  ).toBe(false);
});
it('reserves a new working revision and never rewinds incomplete publication', () => {
  const unavailable = unavailablePublication();
  const importing = {
    ...unavailable,
    state: 'IMPORTING' as const,
    revision: 1,
    activeJobId: marketIds.job,
  };
  expect(() => assertDatasetTransition(unavailable, importing)).not.toThrow();
  expect(() => assertDatasetTransition(importing, unavailable)).toThrow();
  expect(() => assertDatasetTransition(importing, { ...importing, revision: 2 })).toThrow();
  expect(() =>
    assertDatasetTransition(importing, { ...importing, activeJobId: 'f'.repeat(24) }),
  ).toThrow();
  expect(() =>
    assertDatasetTransition(importing, { ...importing, state: 'UNPUBLISHED' }),
  ).not.toThrow();
});

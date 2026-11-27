import { describe, expect, it } from 'vitest';
import {
  importColumnMappingSchema,
  importParseResultSchema,
  normalizedPriceRowSchema,
} from '@darvas/contracts';
import {
  csvFile,
  dataRows,
  header,
  parseOptions,
  syntheticCalendar,
  workbookParts,
  xlsxFile,
  sheetXml,
} from '../../../../tests/parsing-fixtures.js';
import { parseInProcess } from './parser-core.js';
import { excelSessionDate } from './normalize.js';
import { ParseBudget } from './limits.js';

const parse = (
  rows: string[][],
  options = parseOptions,
  calendar: typeof syntheticCalendar | null = syntheticCalendar,
) => parseInProcess(csvFile(rows), options, calendar);
describe('pure market import normalization', () => {
  it('preserves exact decimals, sorts ascending, validates the typed result and uses explicit provenance', async () => {
    const result = await parse([...dataRows].reverse());
    expect(result.eligibleForConfirmation).toBe(true);
    expect(result.records.map((row) => row.sessionDate)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(result.records[0]?.ohlc.open).toBe(dataRows[0]?.[1]);
    expect(result.sessions).toMatchObject({
      coverage: 'VERIFIED',
      complete: true,
      freshness: 'FRESH',
    });
    expect(importParseResultSchema.safeParse(result).success).toBe(true);
    expect(result.diagnostics.some((item) => item.code === 'SPECIAL_SESSION_VERIFIED')).toBe(true);
  });
  it('supports explicit alternate headers with no automatic mapping', async () => {
    const file = csvFile(dataRows, ['Session', ...header.slice(1)]);
    const result = await parseInProcess(
      file,
      { ...parseOptions, mapping: { ...parseOptions.mapping, date: 'Session' } },
      syntheticCalendar,
    );
    expect(result.eligibleForConfirmation).toBe(true);
    const wrong = await parseInProcess(file, parseOptions, syntheticCalendar);
    expect(wrong.diagnostics.some((entry) => entry.code === 'MISSING_COLUMNS')).toBe(true);
  });
  it('rejects mapping the same column to different OHLC fields', () => {
    expect(
      importColumnMappingSchema.safeParse({ ...parseOptions.mapping, high: 'Open' }).success,
    ).toBe(false);
  });
  it.each([
    ['zero', 1, '0'],
    ['negative', 1, '-1'],
    ['scientific', 1, '1e2'],
    ['currency', 1, '₹100'],
    ['separator', 1, '1,000'],
    ['nan', 1, 'NaN'],
    ['infinity', 1, 'Infinity'],
    ['overprecision', 1, '100.00000000000000000000000000000001'],
    ['high below close', 2, '100'],
    ['low above open', 3, '101'],
    ['negative volume', 5, '-1'],
    ['fractional volume', 5, '1.1'],
    ['missing price', 4, ''],
    ['invalid date', 0, '2026-02-30'],
    ['ambiguous date', 0, '01/02/2026'],
    ['timestamp', 0, '2026-01-01T00:00:00Z'],
    ['multiple symbols', 6, 'OTHER'],
    ['alias', 6, 'NSE:SYNTH&TEST'],
  ])('blocks %s without exposing uploaded values', async (_name, index, value) => {
    const rows = structuredClone(dataRows);
    rows[0]![Number(index)] = String(value);
    const result = await parse(rows);
    expect(result.eligibleForConfirmation).toBe(false);
    expect(result.counts.invalid).toBe(1);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(JSON.stringify(result.diagnostics)).not.toContain('OTHER');
  });
  it('preserves ticker punctuation and normalizes case without stripping punctuation', async () => {
    const rows = dataRows.map((row) => [...row.slice(0, 6), 'synth&test']);
    expect((await parse(rows)).eligibleForConfirmation).toBe(true);
  });
  it('keeps missing optional volume as null, not zero', async () => {
    const rows = dataRows.map((row) => [...row.slice(0, 5), '', row[6]!]);
    expect((await parse(rows)).records[0]?.volume).toBeNull();
  });
  it('supports files without optional symbol and volume columns', async () => {
    const options = {
      ...parseOptions,
      mapping: { ...parseOptions.mapping, volume: null, symbol: null },
    };
    const result = await parseInProcess(
      csvFile(
        dataRows.map((row) => row.slice(0, 5)),
        header.slice(0, 5),
      ),
      options,
      syntheticCalendar,
    );
    expect(result.eligibleForConfirmation).toBe(true);
    expect(result.records.every((row) => row.volume === null)).toBe(true);
  });
  it('collapses numerically identical duplicates without rounding or selecting corrections', async () => {
    const row = [...dataRows[1]!];
    row[2] = '102.00';
    row[5] = '1000';
    const result = await parse([...dataRows, row]);
    expect(result.counts).toMatchObject({ original: 4, normalized: 3, identicalDuplicates: 1 });
    expect(result.eligibleForConfirmation).toBe(true);
  });
  it('blocks conflicting dates and removes the ambiguous date entirely', async () => {
    const row = [...dataRows[0]!];
    row[4] = '100';
    const result = await parse([...dataRows, row, dataRows[0]!]);
    expect(result.counts.conflictingDuplicates).toBe(2);
    expect(result.records.some((entry) => entry.sessionDate === '2026-01-01')).toBe(false);
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('retains unknown-basis preview observations without producing storable prices', async () => {
    const result = await parse(dataRows, {
      ...parseOptions,
      source: { ...parseOptions.source, basis: 'UNKNOWN' },
    });
    expect(result.records).toHaveLength(3);
    expect(result.eligibleForConfirmation).toBe(false);
    expect(normalizedPriceRowSchema.safeParse(result.records[0]).success).toBe(false);
  });
  it('accepts an explicitly declared adjusted series without inventing raw prices', async () => {
    const result = await parse(dataRows, {
      ...parseOptions,
      source: { ...parseOptions.source, basis: 'ADJUSTED', adjustmentVersion: 'synthetic-v1' },
    });
    expect(result.eligibleForConfirmation).toBe(true);
    expect(result.source.basis).toBe('ADJUSTED');
    expect(result.records[0]).not.toHaveProperty('raw');
  });
  it('does not infer adjusted basis from an Adjusted Close column', async () => {
    const result = await parseInProcess(
      csvFile(dataRows, [...header.slice(0, 4), 'Adjusted Close', ...header.slice(5)]),
      {
        ...parseOptions,
        mapping: { ...parseOptions.mapping, close: 'Adjusted Close' },
        source: { ...parseOptions.source, basis: 'UNKNOWN' },
      },
      syntheticCalendar,
    );
    expect(result.source.basis).toBe('UNKNOWN');
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('refuses to label one supplied OHLC series as BOTH', async () => {
    const result = await parse(dataRows, {
      ...parseOptions,
      source: { ...parseOptions.source, basis: 'BOTH', adjustmentVersion: 'v1' },
    });
    expect(result.diagnostics.some((entry) => entry.code === 'BOTH_SERIES_UNSUPPORTED')).toBe(true);
  });
  it('blocks unknown calendar coverage and preserves unavailable freshness', async () => {
    const result = await parse(dataRows, parseOptions, null);
    expect(result.sessions).toMatchObject({
      coverage: 'UNAVAILABLE',
      complete: false,
      freshness: 'UNKNOWN',
    });
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('reports partial calendar coverage', async () => {
    const options = { ...parseOptions, requestedRange: { from: '2025-12-31', to: '2026-01-03' } };
    const result = await parse(dataRows, options);
    expect(result.sessions.coverage).toBe('PARTIAL');
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('reports missing sessions and short history without filling prices', async () => {
    const result = await parse([dataRows[0]!, dataRows[2]!]);
    expect(result.sessions.missingSessions).toEqual(['2026-01-02']);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('SHORT_HISTORY');
    expect(result.records).toHaveLength(2);
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('rejects gaps or inconsistent provenance inside a supposedly verified calendar', async () => {
    const calendar = structuredClone(syntheticCalendar);
    calendar.days.splice(1, 1);
    expect((await parse(dataRows, parseOptions, calendar)).diagnostics[0]?.code).toBe(
      'INVALID_CALENDAR',
    );
  });
  it('rejects rows on verified closed dates instead of assuming weekdays are open', async () => {
    const calendar = structuredClone(syntheticCalendar);
    calendar.days[1] = {
      ...calendar.days[1]!,
      isOpen: false,
      sessionType: 'CLOSED',
      closeTimeLocal: null,
    };
    const result = await parse(dataRows, parseOptions, calendar);
    expect(result.diagnostics.map((entry) => entry.code)).toContain('NON_TRADING_SESSION');
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('reports stale session context without using upload timestamps', async () => {
    const result = await parse(dataRows.slice(0, 2));
    expect(result.sessions.freshness).toBe('STALE');
  });
  it('blocks observations after the explicitly expected completed session', async () => {
    const result = await parse(dataRows, {
      ...parseOptions,
      expectedCompletedSession: '2026-01-02',
    });
    expect(result.diagnostics.map((entry) => entry.code)).toContain('AFTER_COMPLETED_SESSION');
  });
  it('bounds diagnostic samples while retaining actual total counts', async () => {
    const rows = Array.from({ length: 150 }, () => {
      const row = [...dataRows[0]!];
      row[1] = '';
      return row;
    });
    const result = await parse(rows);
    expect(result.diagnostics).toHaveLength(100);
    expect(result.errorCount).toBeGreaterThan(150);
    expect(result.diagnosticsTruncated).toBe(true);
  });
  it('reports an expired cooperative execution budget safely', async () => {
    const result = await parseInProcess(
      csvFile(),
      parseOptions,
      syntheticCalendar,
      new ParseBudget(-1),
    );
    expect(result.diagnostics[0]?.code).toBe('PARSER_TIMEOUT');
  });
  it.each([
    ['1900', '1', '1900-01-01'],
    ['1900', '59', '1900-02-28'],
    ['1900', '60', null],
    ['1900', '61', '1900-03-01'],
    ['1904', '0', '1904-01-01'],
    ['1904', '1', '1904-01-02'],
    ['1900', '61.5', null],
    ['1900', '-1', null],
    ['1900', '1e2', null],
  ] as const)('converts the explicit Excel %s date serial %s', (system, input, expected) => {
    expect(excelSessionDate(input, system)).toBe(expected);
  });
  it.each([false, true])('normalizes XLSX numeric dates using date1904=%s', async (date1904) => {
    const base = Date.parse(date1904 ? '1904-01-01' : '1899-12-30');
    const rows = dataRows.map((row) => [
      String((Date.parse(row[0]!) - base) / 86_400_000),
      ...row.slice(1),
    ]);
    const result = await parseInProcess(
      xlsxFile(workbookParts({ date1904, sheet: sheetXml(rows, header, true) })),
      { ...parseOptions, dateMode: 'EXCEL_SERIAL' },
      syntheticCalendar,
    );
    expect(result.eligibleForConfirmation).toBe(true);
    expect(result.records[0]?.sessionDate).toBe('2026-01-01');
  });
});

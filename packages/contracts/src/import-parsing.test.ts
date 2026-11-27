import { describe, expect, it } from 'vitest';
import {
  importColumnMappingSchema,
  importParseOptionsSchema,
  importSessionAssessmentSchema,
  parsedOhlcvSchema,
} from './import-parsing.js';

describe('additive browser-safe parsing contracts', () => {
  it('requires explicit, distinct column mappings and allows optional columns to be absent', () => {
    const mapping = {
      date: 'Date',
      open: 'Open',
      high: 'High',
      low: 'Low',
      close: 'Close',
      volume: null,
      symbol: null,
    };
    expect(importColumnMappingSchema.safeParse(mapping).success).toBe(true);
    expect(importColumnMappingSchema.safeParse({ ...mapping, high: 'Open' }).success).toBe(false);
    expect(importColumnMappingSchema.safeParse({ ...mapping, date: '' }).success).toBe(false);
  });
  it('rejects input without source, range, selected stock and explicit date handling', () => {
    expect(importParseOptionsSchema.safeParse({}).success).toBe(false);
  });
  it('reuses OHLC decimal validation without numeric coercion', () => {
    const row = {
      sessionDate: '2026-01-01',
      ohlc: { open: '1.000000000000000000000000000000001', high: '2', low: '1', close: '2' },
      volume: null,
    };
    expect(parsedOhlcvSchema.safeParse(row).success).toBe(true);
    expect(parsedOhlcvSchema.safeParse({ ...row, ohlc: { ...row.ohlc, open: 1 } }).success).toBe(
      false,
    );
  });
  it('cannot describe missing calendar coverage as complete or fresh', () => {
    const unavailable = {
      coverage: 'UNAVAILABLE',
      calendarVersion: null,
      complete: false,
      expectedSessionCount: 0,
      missingSessions: [],
      missingSessionCount: 0,
      latestSession: '2026-01-01',
      freshness: 'UNKNOWN',
    };
    expect(importSessionAssessmentSchema.safeParse(unavailable).success).toBe(true);
    expect(
      importSessionAssessmentSchema.safeParse({ ...unavailable, complete: true }).success,
    ).toBe(false);
    expect(
      importSessionAssessmentSchema.safeParse({ ...unavailable, freshness: 'FRESH' }).success,
    ).toBe(false);
  });
});

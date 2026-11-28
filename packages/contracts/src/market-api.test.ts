import { describe, expect, it } from 'vitest';
import {
  importCommitInputSchema,
  importPreviewInputSchema,
  marketReferencePolicySchema,
  marketPageQuerySchema,
  importConfirmationResponseSchema,
} from './market-api.js';

describe('import API boundaries', () => {
  it('defaults reference approvals to no authority rather than inventing data', () => {
    expect(
      marketReferencePolicySchema.parse({ stocks: [], calendars: [], priceSources: [] }),
    ).toEqual({ stocks: [], calendars: [], priceSources: [] });
    expect(
      marketReferencePolicySchema.safeParse({
        stocks: [{ stockId: 'a'.repeat(24), fingerprint: 'invalid' }],
        calendars: [],
        priceSources: [],
      }).success,
    ).toBe(false);
  });
  it('requires explicit preview metadata and rejects roles/identity supplied by clients', () => {
    expect(importPreviewInputSchema.safeParse({ stockSymbol: 'SYNTHETIC' }).success).toBe(false);
    expect(
      importCommitInputSchema.safeParse({ previewToken: 'a'.repeat(43), role: 'ADMIN' }).success,
    ).toBe(false);
  });
  it('requires an opaque bounded preview token and trims correction reasons', () => {
    expect(
      importCommitInputSchema.parse({
        previewToken: 'a'.repeat(43),
        correctionReason: '  Synthetic reason  ',
      }).correctionReason,
    ).toBe('Synthetic reason');
    expect(importCommitInputSchema.safeParse({ previewToken: 'a'.repeat(42) }).success).toBe(false);
    expect(
      importCommitInputSchema.safeParse({ previewToken: 'a'.repeat(43), correctionReason: ' ' })
        .success,
    ).toBe(false);
  });
  it('bounds list requests and does not accept MongoDB query operators', () => {
    expect(marketPageQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(marketPageQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(marketPageQuerySchema.safeParse({ cursor: { $ne: null } }).success).toBe(false);
  });
  it('confirmation responses cannot accidentally expose tokens or claim an executor exists', () => {
    const response = {
      data: {
        batchId: 'a'.repeat(24),
        jobId: 'b'.repeat(24),
        status: 'QUEUED',
        executionAvailable: false,
      },
    };
    expect(importConfirmationResponseSchema.safeParse(response).success).toBe(true);
    expect(
      importConfirmationResponseSchema.safeParse({
        data: { ...response.data, previewToken: 'a'.repeat(43) },
      }).success,
    ).toBe(false);
    expect(
      importConfirmationResponseSchema.safeParse({
        data: { ...response.data, executionAvailable: true },
      }).success,
    ).toBe(false);
  });
});

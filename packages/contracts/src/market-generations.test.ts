import { expect, it } from 'vitest';
import {
  jobGenerationSchema,
  generationAssessmentSchema,
  GENERATION_LIMITS,
} from './market-generations.js';
import { datasetPublicationSchema } from './market-data.js';
import { unavailablePublication } from '../../../tests/support/market-records.js';

it('keeps the revision allocator above an abandoned candidate without publishing it', () => {
  expect(
    datasetPublicationSchema.parse({ ...unavailablePublication(), revision: 4 }).publishedRevision,
  ).toBe(0);
  expect(
    datasetPublicationSchema.parse({
      ...unavailablePublication(),
      state: 'PUBLISHED',
      revision: 4,
      publishedRevision: 2,
      asOfSession: '2026-01-01',
      sourceRevisionKey: 'a'.repeat(64),
    }).revision,
  ).toBe(4);
});
it('bounds candidate progress and binds candidate revisions above the base', () => {
  const generation = {
    basePublishedRevision: 1,
    candidateRevision: 2,
    build: { lastSession: null, rows: 0, bytes: 0 },
    assessment: null,
  };
  expect(jobGenerationSchema.safeParse(generation).success).toBe(true);
  expect(jobGenerationSchema.safeParse({ ...generation, candidateRevision: 1 }).success).toBe(
    false,
  );
  expect(
    jobGenerationSchema.safeParse({
      ...generation,
      build: { lastSession: null, rows: 1, bytes: 1 },
    }).success,
  ).toBe(false);
  expect(
    jobGenerationSchema.safeParse({
      ...generation,
      build: { lastSession: '2026-01-01', rows: GENERATION_LIMITS.rows + 1, bytes: 1 },
    }).success,
  ).toBe(false);
});
it('price-only quality assessment cannot claim screening eligibility or contradictory freshness', () => {
  const assessment = {
    contentHash: 'a'.repeat(64),
    referenceApprovalHash: 'b'.repeat(64),
    referenceDataHash: 'c'.repeat(64),
    range: { from: '2026-01-01', to: '2026-01-02' },
    rowCount: 2,
    valid: true,
    complete: true,
    freshness: 'STALE',
    expectedSession: '2026-01-03',
    latestSession: '2026-01-02',
    calendarVersion: 'synthetic',
    warnings: ['RAW_ONLY', 'STALE_DATA'],
    assessedAt: '2026-01-03T12:00:00.000Z',
    screeningEligible: false,
  };
  expect(generationAssessmentSchema.safeParse(assessment).success).toBe(true);
  expect(
    generationAssessmentSchema.safeParse({ ...assessment, screeningEligible: true }).success,
  ).toBe(false);
  expect(generationAssessmentSchema.safeParse({ ...assessment, freshness: 'FRESH' }).success).toBe(
    false,
  );
});

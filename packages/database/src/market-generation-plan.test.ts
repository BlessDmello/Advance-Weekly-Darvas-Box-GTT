import { expect, it } from 'vitest';
import { generationCapacity, planCandidateGeneration } from './market-generation-plan.js';
import { marketIds, syntheticRow } from '../../../tests/support/market-records.js';
const context = {
  stockId: marketIds.stock,
  datasetRevision: 2,
  importBatchId: marketIds.batch,
  changedBy: marketIds.user,
  correctionReason: 'Synthetic correction',
  confirmedAt: '2026-01-03T12:00:00.000Z',
};
const base = () =>
  ['2026-01-01', '2026-01-02', '2026-01-03'].map((sessionDate) => ({
    ...syntheticRow(),
    sessionDate,
    stockId: marketIds.stock,
    datasetRevision: 1,
    revision: 1,
    sourceImportBatchId: marketIds.batch,
  }));
it('preserves every unaffected session and exact price when planning a partial correction', () => {
  const rows = base();
  const change = {
    ...syntheticRow(),
    sessionDate: '2026-01-02',
    raw: { ...syntheticRow().raw!, close: '10.40' },
  };
  const result = planCandidateGeneration(rows, [change], context);
  expect(result.rows).toHaveLength(3);
  expect(result.rows[0]!.raw!.close).toBe(rows[0]!.raw!.close);
  expect(result.rows[2]!.revision).toBe(1);
  expect(result.rows[1]!.revision).toBe(2);
  expect(result.revisions).toMatchObject([{ datasetRevision: 2, oldRevision: 1, newRevision: 2 }]);
  expect(rows[1]!.raw!.close).toBe('10.30');
});
it('identical reformatted reimports are no-ops preserving original provenance', () => {
  const row = {
    ...syntheticRow(),
    sessionDate: '2026-01-02',
    raw: { ...syntheticRow().raw!, close: '10.3000' },
  };
  const result = planCandidateGeneration(base(), [row], context);
  expect(result.noop).toBe(true);
  expect(result.revisions).toEqual([]);
  expect(result.counts).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
});
it('rejects duplicate source sessions, unsupported basis and corrections without reasons', () => {
  const row = { ...syntheticRow(), sessionDate: '2026-01-02' };
  expect(() => planCandidateGeneration(base(), [row, row], context)).toThrow('DUPLICATE');
  expect(() =>
    planCandidateGeneration(
      base(),
      [{ ...row, provenance: { ...row.provenance, adjustmentVersion: 'other' } }],
      context,
    ),
  ).toThrow('BASIS');
  expect(() =>
    planCandidateGeneration(base(), [{ ...row, volume: '101' }], {
      ...context,
      correctionReason: null,
    }),
  ).toThrow('REASON');
});
it('enforces row and BSON storage bounds before any write', () => {
  expect(() => generationCapacity(Array.from({ length: 20_001 }, () => base()[0]!))).toThrow(
    'ROW_LIMIT',
  );
  const large = { ...base()[0]!, qualityFlags: Array.from({ length: 32 }, () => 'X'.repeat(64)) };
  expect(() => generationCapacity(Array.from({ length: 20_000 }, () => large))).toThrow(
    'BYTE_LIMIT',
  );
}, 15_000);

import { mongo, Types } from 'mongoose';
import { dailyOhlcvSchema, normalizedPriceRowSchema, GENERATION_LIMITS } from '@darvas/contracts';
import type { DailyOhlcv, NormalizedPriceRow } from '@darvas/contracts';
import { marketFingerprint, sameMarketObservation } from './market-content.js';
import { priceRevisionContract } from './models/price-revision.js';
import type { PriceRevisionRecord } from './models/price-revision.js';

export class GenerationStorageError extends Error {}
export function priceBson(row: DailyOhlcv) {
  const bar = (value: DailyOhlcv['raw']) =>
    value &&
    Object.fromEntries(
      Object.entries(value).map(([key, text]) => [key, Types.Decimal128.fromString(text)]),
    );
  return {
    ...row,
    stockId: new Types.ObjectId(row.stockId),
    sourceImportBatchId: new Types.ObjectId(row.sourceImportBatchId),
    raw: bar(row.raw),
    adjusted: bar(row.adjusted),
    volume: row.volume === null ? null : Types.Decimal128.fromString(row.volume),
    provenance: { ...row.provenance, declaredAt: new Date(row.provenance.declaredAt) },
  };
}
export function generationCapacity(rows: DailyOhlcv[]) {
  if (rows.length > GENERATION_LIMITS.rows)
    throw new GenerationStorageError('GENERATION_ROW_LIMIT');
  let bytes = 0;
  for (const input of rows) {
    const row = dailyOhlcvSchema.parse(input);
    const size = mongo.BSON.calculateObjectSize({
      ...priceBson(row),
      _id: new Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    });
    if (size > GENERATION_LIMITS.rowBytes) throw new GenerationStorageError('GENERATION_ROW_BYTES');
    bytes += size;
    if (bytes > GENERATION_LIMITS.bytes) throw new GenerationStorageError('GENERATION_BYTE_LIMIT');
  }
  return {
    rows: rows.length,
    bytes,
    rowLimit: GENERATION_LIMITS.rows,
    byteLimit: GENERATION_LIMITS.bytes,
  };
}
/** Pure bounded merge plan, not a writer, checkpoint executor, or runner. */
export function planCandidateGeneration(
  baseInput: DailyOhlcv[],
  updatesInput: NormalizedPriceRow[],
  context: {
    stockId: string;
    datasetRevision: number;
    importBatchId: string;
    changedBy: string;
    correctionReason: string | null;
    confirmedAt: string;
  },
) {
  if (updatesInput.length > 5000) throw new GenerationStorageError('UPLOAD_ROW_LIMIT');
  generationCapacity(baseInput);
  const base = new Map<string, DailyOhlcv>();
  const seen = new Set<string>();
  const revisions: PriceRevisionRecord[] = [];
  let inserted = 0,
    updated = 0,
    unchanged = 0;
  let baseRevision: number | undefined;
  for (const input of baseInput) {
    const row = dailyOhlcvSchema.parse(input);
    baseRevision ??= row.datasetRevision;
    if (
      row.stockId !== context.stockId ||
      row.datasetRevision !== baseRevision ||
      row.datasetRevision >= context.datasetRevision ||
      base.has(row.sessionDate)
    )
      throw new GenerationStorageError('INVALID_BASE_GENERATION');
    base.set(row.sessionDate, row);
  }
  const candidate = new Map(
    [...base].map(([date, row]) => [date, { ...row, datasetRevision: context.datasetRevision }]),
  );
  for (const input of updatesInput) {
    const row = normalizedPriceRowSchema.parse(input);
    if (seen.has(row.sessionDate)) throw new GenerationStorageError('DUPLICATE_SOURCE_SESSION');
    seen.add(row.sessionDate);
    const old = base.get(row.sessionDate);
    if (
      old &&
      (old.provenance.basis !== row.provenance.basis ||
        old.provenance.adjustmentVersion !== row.provenance.adjustmentVersion)
    )
      throw new GenerationStorageError('PRICE_BASIS_CONFLICT');
    if (old && sameMarketObservation(old, row)) {
      unchanged++;
      continue;
    }
    const next = dailyOhlcvSchema.parse({
      ...row,
      stockId: context.stockId,
      datasetRevision: context.datasetRevision,
      revision: old ? old.revision + 1 : 1,
      sourceImportBatchId: context.importBatchId,
    });
    candidate.set(row.sessionDate, next);
    if (old) {
      if (!context.correctionReason) throw new GenerationStorageError('CORRECTION_REASON_REQUIRED');
      const observation = (value: DailyOhlcv) =>
        normalizedPriceRowSchema.parse({
          sessionDate: value.sessionDate,
          raw: value.raw,
          adjusted: value.adjusted,
          volume: value.volume,
          provenance: value.provenance,
          qualityFlags: value.qualityFlags,
        });
      revisions.push(
        priceRevisionContract.parse({
          stockId: context.stockId,
          datasetRevision: context.datasetRevision,
          sessionDate: row.sessionDate,
          oldPrice: observation(old),
          newPrice: row,
          oldRevision: old.revision,
          newRevision: next.revision,
          changedBy: context.changedBy,
          importBatchId: context.importBatchId,
          reason: context.correctionReason,
          changedAt: context.confirmedAt,
        }),
      );
      updated++;
    } else inserted++;
  }
  const rows = [...candidate.values()].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  return {
    rows,
    revisions,
    counts: { inserted, updated, unchanged },
    noop: base.size > 0 && inserted === 0 && updated === 0,
    contentHash: marketFingerprint(rows),
    capacity: generationCapacity(rows),
  };
}

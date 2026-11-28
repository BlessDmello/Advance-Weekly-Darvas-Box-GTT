import { createHash } from 'node:crypto';
import { compareDecimalText, stockRecordSchema } from '@darvas/contracts';
import type { NormalizedPriceRow, StockRecord } from '@darvas/contracts';

export function marketFingerprint(value: unknown): string {
  const canonical = (input: unknown): string =>
    Array.isArray(input)
      ? `[${input.map(canonical).join(',')}]`
      : input && typeof input === 'object'
        ? `{${Object.entries(input)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
            .join(',')}}`
        : (JSON.stringify(input) ?? 'null');
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function stockReferenceFingerprint(stock: StockRecord): string {
  return marketFingerprint(stockRecordSchema.omit({ publication: true }).strip().parse(stock));
}
export function sameMarketObservation(a: NormalizedPriceRow, b: NormalizedPriceRow): boolean {
  const bars = (left: NormalizedPriceRow['raw'], right: NormalizedPriceRow['raw']) =>
    left === null || right === null
      ? left === right
      : (['open', 'high', 'low', 'close'] as const).every(
          (key) => compareDecimalText(left[key], right[key]) === 0,
        );
  return (
    a.provenance.basis === b.provenance.basis &&
    a.provenance.adjustmentVersion === b.provenance.adjustmentVersion &&
    bars(a.raw, b.raw) &&
    bars(a.adjusted, b.adjusted) &&
    (a.volume === null || b.volume === null
      ? a.volume === b.volume
      : compareDecimalText(a.volume, b.volume) === 0)
  );
}

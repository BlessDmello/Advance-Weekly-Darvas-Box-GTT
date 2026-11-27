import { Schema, Types, type Document, type SchemaDefinition } from 'mongoose';
import type { z } from 'zod';
import { decimalTextSchema } from '@darvas/contracts';

export const marketModelOptions = {
  strict: 'throw' as const,
  autoCreate: false,
  autoIndex: false,
  timestamps: true,
  optimisticConcurrency: true,
  toJSON: {
    transform: (_doc: unknown, value: Record<string, unknown>) => {
      delete value.tokenHash;
      return value;
    },
  },
  toObject: {
    transform: (_doc: unknown, value: Record<string, unknown>) => {
      delete value.tokenHash;
      return value;
    },
  },
};
export const reference = () => ({ type: Schema.Types.ObjectId, required: true, immutable: true });
export const text = (max: number) => ({ type: String, required: true, maxlength: max });
export const integer = (min: number, max = Number.MAX_SAFE_INTEGER) => ({
  type: Number,
  required: true,
  min,
  max,
  validate: Number.isSafeInteger,
});
export const nullableDate = () => ({ type: Date, default: null });
export const nullableText = (max: number) => ({ type: String, default: null, maxlength: max });
export const hash = () => ({ type: String, required: true, match: /^[a-f\d]{64}$/ });

export function decimalToPlain(value: Types.Decimal128): string {
  const string = value.toString();
  if (!/[eE]/.test(string)) return string;
  const [coefficient = '', exponent = '0'] = string.split(/[eE]/);
  const [whole = '', fraction = ''] = coefficient.split('.');
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}
type DecimalField = {
  type: typeof Schema.Types.Decimal128;
  required: boolean;
  default?: null;
  set(value: unknown): Types.Decimal128 | null;
};
export function decimalField(nullable = false): DecimalField {
  return {
    type: Schema.Types.Decimal128,
    required: !nullable,
    ...(nullable ? { default: null } : {}),
    set(value: unknown) {
      if (value === null && nullable) return null;
      if (value instanceof Types.Decimal128) return value;
      if (typeof value !== 'string' || !decimalTextSchema.safeParse(value).success)
        throw new Error('Use an exact decimal string.');
      return Types.Decimal128.fromString(value);
    },
  };
}
export const ohlcDefinition: SchemaDefinition = {
  open: decimalField(),
  high: decimalField(),
  low: decimalField(),
  close: decimalField(),
};
export const ohlcSubSchema: Schema = new Schema(ohlcDefinition, { _id: false, strict: 'throw' });
export const provenanceSubSchema: Schema = new Schema(
  {
    provider: text(120),
    reference: text(500),
    basis: { type: String, required: true, enum: ['RAW', 'ADJUSTED', 'BOTH', 'UNKNOWN'] },
    adjustmentVersion: nullableText(120),
    declaredAt: { type: Date, required: true },
    verification: { type: String, required: true, enum: ['DECLARED', 'VERIFIED'] },
  },
  { _id: false, strict: 'throw' },
);
export const rowDefinition: SchemaDefinition = {
  sessionDate: text(10),
  raw: { type: ohlcSubSchema, default: null },
  adjusted: { type: ohlcSubSchema, default: null },
  volume: decimalField(true),
  provenance: { type: provenanceSubSchema, required: true },
  qualityFlags: { type: [String], required: true, default: undefined },
};
export const rowSubSchema: Schema = new Schema(rowDefinition, { _id: false, strict: 'throw' });

export function validationValue(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value instanceof Types.Decimal128) return decimalToPlain(value);
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.toISOString() : 'invalid date';
  if (Array.isArray(value)) return value.map(validationValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(key))
        .map(([key, entry]) => [key, validationValue(entry)]),
    );
  return value;
}
export function recordInput(document: Document<unknown>): unknown {
  return validationValue(document.toObject({ transform: false, depopulate: true }));
}
export function validateMarketRecord(
  schema: Schema,
  contract: z.ZodType | ((document: Document<unknown>) => z.ZodType),
) {
  schema.pre('validate', function () {
    const validator = typeof contract === 'function' ? contract(this) : contract;
    const result = validator.safeParse(recordInput(this));
    if (!result.success)
      this.invalidate('marketRecord', 'Market record violates the approved contract.');
  });
}

// Updates bypass document validation/state snapshots; 8C must add explicit transactional
// adapters rather than silently permitting unvalidated query/bulk updates here.
export function guardMarketUpdates(schema: Schema, appendOnly = false) {
  schema.pre(
    [
      'updateOne',
      'updateMany',
      'findOneAndUpdate',
      'replaceOne',
      'findOneAndReplace',
      'deleteMany',
      'findOneAndDelete',
    ],
    function () {
      throw new Error(
        'Use a validated market document or an explicitly audited transaction adapter.',
      );
    },
  );
  schema.pre('deleteOne', { document: true, query: true }, function () {
    throw new Error('Market records are not deleted through models.');
  });
  schema.pre('bulkWrite', function () {
    throw new Error('Use an explicitly audited market transaction adapter.');
  });
  schema.pre('insertMany', function () {
    throw new Error('Use validated market document creation.');
  });
  if (appendOnly)
    schema.pre('save', function () {
      if (!this.isNew) throw new Error('Market audit records are append-only.');
    });
}

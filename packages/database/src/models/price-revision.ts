import { Schema } from 'mongoose';
import { z } from 'zod';
import {
  normalizedPriceRowSchema,
  marketObjectIdSchema,
  marketTimestampSchema,
  sessionDateSchema,
} from '@darvas/contracts';
import {
  marketModelOptions,
  rowSubSchema,
  reference,
  integer,
  text,
  validateMarketRecord,
  guardMarketUpdates,
} from './market-options.js';
import type { Stored } from '../market-types.js';
export const priceRevisionContract = z
  .object({
    stockId: marketObjectIdSchema,
    sessionDate: sessionDateSchema,
    oldPrice: normalizedPriceRowSchema,
    newPrice: normalizedPriceRowSchema,
    oldRevision: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER - 1),
    newRevision: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER),
    changedBy: marketObjectIdSchema,
    importBatchId: marketObjectIdSchema,
    reason: z.string().trim().min(1).max(500),
    changedAt: marketTimestampSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.newRevision === value.oldRevision + 1 &&
      value.oldPrice.sessionDate === value.sessionDate &&
      value.newPrice.sessionDate === value.sessionDate &&
      JSON.stringify(value.oldPrice) !== JSON.stringify(value.newPrice),
  );
export type PriceRevisionRecord = z.infer<typeof priceRevisionContract>;
export const priceRevisionSchema: Schema<Stored<PriceRevisionRecord>> = new Schema(
  {
    stockId: reference(),
    sessionDate: text(10),
    oldPrice: { type: rowSubSchema, required: true },
    newPrice: { type: rowSubSchema, required: true },
    oldRevision: integer(1, Number.MAX_SAFE_INTEGER - 1),
    newRevision: integer(2),
    changedBy: reference(),
    importBatchId: reference(),
    reason: text(500),
    changedAt: { type: Date, required: true },
  },
  { ...marketModelOptions, collection: 'priceRevisions' },
);
priceRevisionSchema.index(
  { stockId: 1, sessionDate: 1, newRevision: 1 },
  { name: 'price_revision_identity', unique: true },
);
priceRevisionSchema.index(
  { stockId: 1, sessionDate: 1, changedAt: -1 },
  { name: 'price_revision_history' },
);
validateMarketRecord(priceRevisionSchema, priceRevisionContract);
guardMarketUpdates(priceRevisionSchema, true);

import { Schema } from 'mongoose';
import { dailyOhlcvSchema, type DailyOhlcv } from '@darvas/contracts';
import type { Stored } from '../market-types.js';
import {
  marketModelOptions,
  rowDefinition,
  reference,
  integer,
  validateMarketRecord,
  guardMarketUpdates,
  guardCandidateInsertion,
} from './market-options.js';
export const dailyPriceSchema: Schema<Stored<DailyOhlcv>> = new Schema(
  {
    stockId: reference(),
    datasetRevision: { ...integer(1), immutable: true },
    ...rowDefinition,
    revision: integer(1),
    sourceImportBatchId: reference(),
  },
  { ...marketModelOptions, collection: 'dailyPrices' },
);
dailyPriceSchema.index(
  { stockId: 1, datasetRevision: 1, sessionDate: 1 },
  { name: 'stock_generation_session', unique: true },
);
dailyPriceSchema.index(
  { stockId: 1, datasetRevision: 1, sessionDate: -1 },
  { name: 'generation_history' },
);
validateMarketRecord(dailyPriceSchema, dailyOhlcvSchema);
guardCandidateInsertion(dailyPriceSchema);
// Price/chunk orchestration is deferred; model inserts require a matching candidate.
guardMarketUpdates(dailyPriceSchema, true);

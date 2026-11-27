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
} from './market-options.js';
export const dailyPriceSchema: Schema<Stored<DailyOhlcv>> = new Schema(
  {
    stockId: reference(),
    ...rowDefinition,
    revision: integer(1),
    sourceImportBatchId: reference(),
  },
  { ...marketModelOptions, collection: 'dailyPrices' },
);
dailyPriceSchema.index({ stockId: 1, sessionDate: 1 }, { name: 'stock_session', unique: true });
dailyPriceSchema.index({ stockId: 1, sessionDate: -1 }, { name: 'stock_history' });
validateMarketRecord(dailyPriceSchema, dailyOhlcvSchema);
// Corrections are deliberately unavailable until 8C provides atomic audit+price writes.
guardMarketUpdates(dailyPriceSchema, true);

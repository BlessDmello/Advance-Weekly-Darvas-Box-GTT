import { Schema } from 'mongoose';
import { tradingSessionSchema as contract, type TradingSession } from '@darvas/contracts';
import type { Stored } from '../market-types.js';
import {
  marketModelOptions,
  validateMarketRecord,
  guardMarketUpdates,
  text,
} from './market-options.js';
export const tradingSessionSchema: Schema<Stored<TradingSession>> = new Schema(
  {
    exchange: { type: String, required: true, enum: ['NSE'], immutable: true },
    sessionDate: { ...text(10), immutable: true },
    isOpen: { type: Boolean, required: true },
    sessionType: { type: String, required: true, enum: ['REGULAR', 'SPECIAL', 'CLOSED'] },
    closeTimeLocal: { type: String, default: null },
    timezone: { type: String, required: true, enum: ['Asia/Kolkata'] },
    calendarSource: text(500),
    calendarVersion: text(120),
  },
  { ...marketModelOptions, collection: 'tradingSessions' },
);
tradingSessionSchema.index(
  { exchange: 1, sessionDate: 1 },
  { name: 'exchange_session', unique: true },
);
validateMarketRecord(tradingSessionSchema, contract);
guardMarketUpdates(tradingSessionSchema);

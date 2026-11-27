import type { Connection, Model } from 'mongoose';
import type {
  StockRecord,
  TradingSession,
  DailyOhlcv,
  ImportBatchMetadata,
  ImportJobRecord,
} from '@darvas/contracts';
import type { Stored } from './market-types.js';
import type { PriceRevisionRecord } from './models/price-revision.js';
import type { ImportStagingRecord } from './models/import-staging.js';
import { stockSchema } from './models/stock.js';
import { tradingSessionSchema } from './models/trading-session.js';
import { dailyPriceSchema } from './models/daily-price.js';
import { priceRevisionSchema } from './models/price-revision.js';
import { importBatchSchema } from './models/import-batch.js';
import { importJobSchema } from './models/import-job.js';
import { importStagingSchema } from './models/import-staging.js';

/** Registration only: no connections, DDL, seed data, API routes or processing. */
export type MarketModels = {
  Stock: Model<Stored<StockRecord>>;
  TradingSession: Model<Stored<TradingSession>>;
  DailyPrice: Model<Stored<DailyOhlcv>>;
  PriceRevision: Model<Stored<PriceRevisionRecord>>;
  ImportBatch: Model<Stored<ImportBatchMetadata>>;
  ImportJob: Model<Stored<ImportJobRecord>>;
  ImportStaging: Model<Stored<ImportStagingRecord>>;
};
export function createMarketModels(connection: Connection): MarketModels {
  return {
    Stock: connection.model('MarketStock', stockSchema),
    TradingSession: connection.model('MarketTradingSession', tradingSessionSchema),
    DailyPrice: connection.model('MarketDailyPrice', dailyPriceSchema),
    PriceRevision: connection.model('MarketPriceRevision', priceRevisionSchema),
    ImportBatch: connection.model('MarketImportBatch', importBatchSchema),
    ImportJob: connection.model('MarketImportJob', importJobSchema),
    ImportStaging: connection.model('MarketImportStaging', importStagingSchema),
  };
}

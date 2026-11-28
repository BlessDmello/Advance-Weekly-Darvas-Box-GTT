import type { ClientSession, Connection } from 'mongoose';
import {
  dailyOhlcvSchema,
  stockRecordSchema,
  GENERATION_LIMITS,
  marketObjectIdSchema,
} from '@darvas/contracts';
import { createMarketModels } from './market-models.js';
import { recordInput } from './models/market-options.js';
import { marketFingerprint } from './market-content.js';
import { generationCapacity, GenerationStorageError } from './market-generation-plan.js';

/** All rows and the pointer are read from the same majority snapshot. No candidate fallback. */
export async function readPublishedPrices(
  connection: Connection,
  stockId: string,
  session?: ClientSession,
) {
  marketObjectIdSchema.parse(stockId);
  const read = async (owned: ClientSession) => {
    const models = createMarketModels(connection);
    const document = await models.Stock.findById(stockId).session(owned);
    if (!document) throw new GenerationStorageError('STOCK_NOT_FOUND');
    const stock = stockRecordSchema.parse(recordInput(document));
    const revision = stock.publication.publishedRevision;
    if (revision === 0) return null;
    if (!stock.publication.sourceRevisionKey || !stock.publication.asOfSession)
      throw new GenerationStorageError('PUBLICATION_INCONSISTENT');
    const documents = await models.DailyPrice.find({
      stockId: document._id,
      datasetRevision: revision,
    })
      .sort({ sessionDate: 1 })
      .limit(GENERATION_LIMITS.rows + 1)
      .session(owned)
      .maxTimeMS(5000);
    const rows = documents.map((entry) => dailyOhlcvSchema.parse(recordInput(entry)));
    const capacity = generationCapacity(rows);
    if (
      !rows.length ||
      marketFingerprint(rows) !== stock.publication.sourceRevisionKey ||
      rows.at(-1)!.sessionDate !== stock.publication.asOfSession
    )
      throw new GenerationStorageError('PUBLICATION_INCONSISTENT');
    return {
      stockId,
      datasetRevision: revision,
      rows,
      capacity,
      contentHash: stock.publication.sourceRevisionKey,
      screeningEligible: false as const,
    };
  };
  if (session) {
    if (!session.inTransaction()) throw new GenerationStorageError('SNAPSHOT_REQUIRED');
    return read(session);
  }
  return connection.transaction(read, {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary',
  });
}

import { Schema } from 'mongoose';
import {
  stockRecordSchema,
  datasetPublicationSchema,
  assertDatasetTransition,
  type StockRecord,
} from '@darvas/contracts';
import type { Stored } from '../market-types.js';
import {
  marketModelOptions,
  validateMarketRecord,
  guardMarketUpdates,
  text,
  integer,
  recordInput,
} from './market-options.js';

const publication = new Schema(
  {
    state: {
      type: String,
      required: true,
      enum: ['UNAVAILABLE', 'IMPORTING', 'UNPUBLISHED', 'PUBLISHED'],
    },
    revision: integer(0),
    publishedRevision: integer(0),
    activeJobId: { type: Schema.Types.ObjectId, default: null },
    asOfSession: { type: String, default: null },
    sourceRevisionKey: { type: String, default: null },
    derivedStatus: { type: String, required: true, enum: ['DEFERRED'] },
  },
  { _id: false, strict: 'throw' },
);
export const stockSchema: Schema<Stored<StockRecord>> = new Schema(
  {
    exchange: { type: String, required: true, enum: ['NSE'], immutable: true },
    symbol: { ...text(30), immutable: true },
    series: { ...text(8), immutable: true },
    companyName: text(160),
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'] },
    nifty100Membership: {
      type: [
        new Schema(
          { from: text(10), to: { type: String, default: null }, source: text(500) },
          { _id: false, strict: 'throw' },
        ),
      ],
      required: true,
      default: undefined,
    },
    publication: { type: publication, required: true },
  },
  { ...marketModelOptions, collection: 'stocks' },
);
// No membership, calendar or publication defaults invent reference data.
stockSchema.index({ exchange: 1, symbol: 1, series: 1 }, { unique: true, name: 'stock_identity' });
validateMarketRecord(stockSchema, stockRecordSchema);
stockSchema.post('init', (document) => {
  document.$locals.publicationOriginal = (
    recordInput(document) as { publication?: unknown }
  ).publication;
});
stockSchema.post('save', (document) => {
  document.$locals.publicationOriginal = (
    recordInput(document) as { publication?: unknown }
  ).publication;
});
stockSchema.pre('validate', async function () {
  const next = datasetPublicationSchema.safeParse(
    (recordInput(this) as { publication?: unknown }).publication,
  );
  if (!next.success) return;
  if (this.isNew) {
    if (next.data.state !== 'UNAVAILABLE')
      this.invalidate('publication', 'New stocks have no published dataset.');
    return;
  }
  const previous = datasetPublicationSchema.safeParse(this.$locals.publicationOriginal);
  if (!previous.success) {
    this.invalidate('publication', 'A loaded publication snapshot is required.');
    return;
  }
  try {
    assertDatasetTransition(previous.data, next.data);
  } catch {
    this.invalidate('publication', 'Invalid dataset transition.');
    return;
  }
  if (JSON.stringify(previous.data) === JSON.stringify(next.data)) return;
  const session = this.$session();
  if (!session?.inTransaction()) {
    this.invalidate('publication', 'Dataset publication changes require an explicit transaction.');
    return;
  }
  const publishing = next.data.state === 'PUBLISHED';
  const job = await this.db
    .model('MarketImportJob')
    .findOne({
      _id: publishing ? previous.data.activeJobId : next.data.activeJobId,
      stockId: this._id,
      status: { $in: publishing ? ['COMPLETED'] : ['QUEUED', 'RUNNING', 'RETRY', 'FAILED'] },
    })
    .session(session)
    .lean();
  if (!job) this.invalidate('publication', 'A matching job is required for dataset publication.');
});
guardMarketUpdates(stockSchema);
// Keep this module free of connections and reference-data loading.

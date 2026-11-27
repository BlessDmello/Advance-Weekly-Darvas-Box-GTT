import { Schema } from 'mongoose';
import {
  importJobRecordSchema,
  assertImportJobTransition,
  type ImportJobRecord,
} from '@darvas/contracts';
import type { Stored } from '../market-types.js';
import { metadataSchema } from './market-contract-schema.js';
import {
  marketModelOptions,
  validateMarketRecord,
  guardMarketUpdates,
  recordInput,
} from './market-options.js';
export const importJobSchema: Schema<Stored<ImportJobRecord>> = new Schema(
  metadataSchema(importJobRecordSchema).obj,
  { ...marketModelOptions, collection: 'importJobs' },
);
importJobSchema.index({ importBatchId: 1 }, { unique: true, name: 'one_job_per_batch' });
importJobSchema.index(
  { stockId: 1 },
  {
    unique: true,
    name: 'one_active_import_per_stock',
    partialFilterExpression: { status: { $in: ['QUEUED', 'RUNNING', 'RETRY'] } },
  },
);
importJobSchema.index({ status: 1, leaseUntil: 1 }, { name: 'import_job_recovery' });
importJobSchema.index({ familyId: 1, createdAt: -1, _id: -1 }, { name: 'family_job_history' });
validateMarketRecord(importJobSchema, importJobRecordSchema);
importJobSchema.post('init', (document) => {
  document.$locals.marketOriginal = recordInput(document);
});
importJobSchema.post('save', (document) => {
  document.$locals.marketOriginal = recordInput(document);
});
importJobSchema.pre('validate', function () {
  const next = importJobRecordSchema.safeParse(recordInput(this));
  if (!next.success) return;
  if (this.isNew) {
    if (next.data.status !== 'QUEUED') this.invalidate('status', 'Jobs start queued.');
    return;
  }
  const previous = importJobRecordSchema.safeParse(this.$locals.marketOriginal);
  if (!previous.success) {
    this.invalidate('status', 'A loaded job snapshot is required.');
    return;
  }
  try {
    assertImportJobTransition(previous.data, next.data);
  } catch {
    this.invalidate('status', 'Invalid job transition or checkpoint.');
  }
});
guardMarketUpdates(importJobSchema);

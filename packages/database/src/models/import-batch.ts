import { Schema } from 'mongoose';
import { importBatchMetadataSchema, type ImportBatchMetadata } from '@darvas/contracts';
import type { Stored } from '../market-types.js';
import { metadataSchema } from './market-contract-schema.js';
import { marketModelOptions, validateMarketRecord, guardMarketUpdates } from './market-options.js';
export const importBatchSchema: Schema<Stored<ImportBatchMetadata>> = new Schema(
  metadataSchema(importBatchMetadataSchema).obj,
  { ...marketModelOptions, collection: 'importBatches' },
);
importBatchSchema.index(
  { uploadedBy: 1, idempotencyKey: 1 },
  { unique: true, name: 'import_commit_identity' },
);
importBatchSchema.index({ familyId: 1, createdAt: -1, _id: -1 }, { name: 'family_import_history' });
importBatchSchema.index(
  { familyId: 1, stockId: 1, createdAt: -1, _id: -1 },
  { name: 'family_stock_import_history' },
);
importBatchSchema.index(
  { uploadedBy: 1, stockId: 1, 'preview.sha256': 1 },
  { name: 'import_file_history' },
);
validateMarketRecord(importBatchSchema, importBatchMetadataSchema);
guardMarketUpdates(importBatchSchema, true);

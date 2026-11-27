import { Schema } from 'mongoose';
import { z } from 'zod';
import {
  IMPORT_LIMITS,
  importPreviewMetadataSchema,
  stagingRetentionSchema,
  marketObjectIdSchema,
  marketHashSchema,
  normalizedPriceRowSchema,
} from '@darvas/contracts';
import { metadataSchema } from './market-contract-schema.js';
import {
  marketModelOptions,
  reference,
  hash,
  integer,
  rowSubSchema,
  validateMarketRecord,
  guardMarketUpdates,
  recordInput,
} from './market-options.js';
import type { Stored } from '../market-types.js';

const common = stagingRetentionSchema.safeExtend({
  stagingId: marketObjectIdSchema,
  stockId: marketObjectIdSchema,
  familyId: marketObjectIdSchema,
  uploadedBy: marketObjectIdSchema,
});
const manifestShape = common.safeExtend({
  kind: z.literal('MANIFEST'),
  tokenHash: marketHashSchema.optional(),
  metadata: importPreviewMetadataSchema,
  chunkCount: z.number().int().min(0).max(IMPORT_LIMITS.chunks),
  rowCount: z.number().int().min(0).max(IMPORT_LIMITS.rows),
});
const validManifest = (value: z.infer<typeof manifestShape>) =>
  value.stockId === value.metadata.stockId &&
  value.familyId === value.metadata.familyId &&
  value.uploadedBy === value.metadata.uploadedBy &&
  value.rowCount === value.metadata.rows.valid &&
  value.chunkCount === Math.ceil(value.rowCount / IMPORT_LIMITS.chunkRows) &&
  (value.state !== 'PREVIEW' || value.expiresAt === value.metadata.expiresAt);
export const stagingManifestContract = manifestShape
  .safeExtend({ tokenHash: marketHashSchema })
  .refine(validManifest);
const manifestWithoutHash = manifestShape.refine(validManifest);
export const stagingChunkContract = common.safeExtend({
  kind: z.literal('CHUNK'),
  ordinal: z
    .number()
    .int()
    .min(0)
    .max(IMPORT_LIMITS.chunks - 1),
  chunkHash: marketHashSchema,
  rows: z.array(normalizedPriceRowSchema).min(1).max(IMPORT_LIMITS.chunkRows),
});
export const importStagingContract = z.union([stagingManifestContract, stagingChunkContract]);
export type ImportStagingRecord = z.infer<typeof importStagingContract>;
export const importStagingSchema: Schema<Stored<ImportStagingRecord>> = new Schema(
  {
    stagingId: reference(),
    stockId: reference(),
    familyId: reference(),
    uploadedBy: reference(),
    kind: { type: String, required: true, enum: ['MANIFEST', 'CHUNK'], immutable: true },
    state: { type: String, required: true, enum: ['PREVIEW', 'ATTACHED', 'PURGEABLE'] },
    jobId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date },
    tokenHash: { ...hash(), required: false, select: false, immutable: true },
    metadata: {
      type: metadataSchema(importPreviewMetadataSchema),
      default: undefined,
      immutable: true,
    },
    chunkCount: { ...integer(0, IMPORT_LIMITS.chunks), required: false, immutable: true },
    rowCount: { ...integer(0, IMPORT_LIMITS.rows), required: false, immutable: true },
    ordinal: { ...integer(0, IMPORT_LIMITS.chunks - 1), required: false, immutable: true },
    chunkHash: { ...hash(), required: false, immutable: true },
    rows: { type: [rowSubSchema], default: undefined, immutable: true },
  },
  { ...marketModelOptions, collection: 'importStaging' },
);
importStagingSchema.index(
  { tokenHash: 1 },
  { unique: true, name: 'preview_token_hash', partialFilterExpression: { kind: 'MANIFEST' } },
);
importStagingSchema.index(
  { stagingId: 1, ordinal: 1 },
  { unique: true, name: 'staging_chunk_identity', partialFilterExpression: { kind: 'CHUNK' } },
);
importStagingSchema.index({ familyId: 1, uploadedBy: 1, state: 1 }, { name: 'family_staging' });
importStagingSchema.index(
  { expiresAt: 1 },
  {
    name: 'inactive_staging_expiry',
    expireAfterSeconds: 0,
    partialFilterExpression: { state: { $in: ['PREVIEW', 'PURGEABLE'] } },
  },
);
validateMarketRecord(importStagingSchema, (document) => {
  if (document.get('kind') === 'CHUNK') return stagingChunkContract;
  if (!document.isNew && !document.isSelected('tokenHash')) {
    // Default-excluded hash stays in MongoDB; document saves need not read it.
    return manifestWithoutHash;
  }
  return stagingManifestContract;
});
importStagingSchema.post('init', (document) => {
  document.$locals.marketOriginal = recordInput(document);
});
importStagingSchema.post('save', (document) => {
  document.$locals.marketOriginal = recordInput(document);
});
importStagingSchema.pre('validate', async function () {
  if (this.isNew) {
    if (this.get('state') !== 'PREVIEW')
      this.invalidate('state', 'Staging starts as an expiring preview.');
    if (this.get('kind') === 'MANIFEST' && String(this.get('stagingId')) !== String(this._id))
      this.invalidate('stagingId', 'Manifest identity must match staging identity.');
    const expires = this.get('expiresAt') as Date | undefined;
    if (
      !expires ||
      expires.getTime() <= Date.now() ||
      expires.getTime() > Date.now() + IMPORT_LIMITS.previewMilliseconds
    )
      this.invalidate('expiresAt', 'Preview lifetime exceeds its bound.');
  } else {
    const previous = this.$locals.marketOriginal as
      { state?: string; jobId?: string | null; expiresAt?: string } | undefined;
    const allowed: Record<string, string[]> = {
      PREVIEW: ['PREVIEW', 'ATTACHED', 'PURGEABLE'],
      ATTACHED: ['ATTACHED', 'PURGEABLE'],
      PURGEABLE: ['PURGEABLE'],
    };
    if (!previous?.state || !allowed[previous.state]?.includes(String(this.get('state'))))
      this.invalidate('state', 'Invalid staging transition.');
    if (previous?.jobId && String(this.get('jobId')) !== previous.jobId)
      this.invalidate('jobId', 'An attached payload cannot change jobs.');
    const attaching = previous?.state === 'PREVIEW' && this.get('state') === 'ATTACHED';
    const releasing = previous?.state === 'ATTACHED' && this.get('state') === 'PURGEABLE';
    if (attaching || releasing) {
      const session = this.$session();
      if (!session?.inTransaction()) {
        this.invalidate('state', 'Payload attachment/release requires an explicit transaction.');
        return;
      }
      if (attaching && (!previous?.expiresAt || Date.parse(previous.expiresAt) <= Date.now())) {
        this.invalidate('state', 'The preview has expired.');
        return;
      }
      const job = await this.db
        .model('MarketImportJob')
        .findOne({
          _id: this.get('jobId'),
          stockId: this.get('stockId'),
          familyId: this.get('familyId'),
          uploadedBy: this.get('uploadedBy'),
          status: { $in: releasing ? ['COMPLETED', 'FAILED'] : ['QUEUED', 'RUNNING', 'RETRY'] },
        })
        .session(session)
        .lean();
      if (!job)
        this.invalidate('state', 'A matching job in the required lifecycle state is required.');
    }
  }
});
guardMarketUpdates(importStagingSchema);

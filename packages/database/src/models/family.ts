import { Schema } from 'mongoose';
import { modelOptions } from './options.js';

export const familySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', required: true },
    // Permanent completion marker, not a lease. Never expire or unset it.
    initialBootstrapKey: { type: String, enum: ['INITIAL_ADMIN'], immutable: true, select: false },
  },
  { ...modelOptions, timestamps: true, collection: 'families' },
);
familySchema.index({ createdBy: 1 }, { name: 'family_creator' });
familySchema.index(
  { initialBootstrapKey: 1 },
  {
    name: 'one_initial_bootstrap',
    unique: true,
    partialFilterExpression: { initialBootstrapKey: { $type: 'string' } },
  },
);

import { Schema } from 'mongoose';
import { modelOptions, tokenHashPattern } from './options.js';

export const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    sessionTokenHash: {
      type: String,
      required: true,
      match: tokenHashPattern,
      select: false,
      immutable: true,
    },
    createdAt: { type: Date, required: true, default: Date.now, immutable: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date },
    revokedAt: { type: Date },
    deviceLabel: { type: String, maxlength: 100 },
  },
  { ...modelOptions, collection: 'sessions' },
);
sessionSchema.index({ sessionTokenHash: 1 }, { name: 'unique_session_token', unique: true });
sessionSchema.index({ userId: 1 }, { name: 'user_sessions' });
sessionSchema.index({ expiresAt: 1 }, { name: 'session_expiry', expireAfterSeconds: 0 });

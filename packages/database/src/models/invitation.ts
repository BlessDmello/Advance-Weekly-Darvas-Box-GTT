import { emailSchema, invitationStatusSchema, normalizeEmail } from '@darvas/contracts';
import { Schema } from 'mongoose';
import { modelOptions, tokenHashPattern } from './options.js';

export const invitationSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true, immutable: true },
    emailNormalized: {
      type: String,
      required: true,
      set: normalizeEmail,
      validate: {
        validator: (value: string) => emailSchema.safeParse(value).success,
        message: 'Invalid email address.',
      },
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    tokenHash: {
      type: String,
      required: true,
      match: tokenHashPattern,
      select: false,
      immutable: true,
    },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: invitationStatusSchema.options,
      required: true,
      default: 'PENDING',
    },
    consumedAt: { type: Date },
    consumedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { ...modelOptions, timestamps: true, collection: 'invitations' },
);
invitationSchema.index({ tokenHash: 1 }, { name: 'unique_invitation_token', unique: true });
invitationSchema.index({ expiresAt: 1 }, { name: 'invitation_expiry', expireAfterSeconds: 0 });
invitationSchema.index(
  { familyId: 1, emailNormalized: 1, status: 1 },
  { name: 'family_invitations' },
);

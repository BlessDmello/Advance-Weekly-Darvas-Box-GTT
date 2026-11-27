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
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'Invitation' },
    delivery: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'FAILED', 'UNCONFIRMED'],
      default: 'PENDING',
      required: true,
    },
    providerMessageId: { type: String, select: false },
    sendWindowStartedAt: { type: Date },
    sendCount: { type: Number, min: 0, max: 3, default: 0 },
    nextSendAt: { type: Date },
    purgeAt: {
      type: Date,
      required: true,
      default: function (this: { expiresAt?: Date }) {
        return this.expiresAt ? new Date(this.expiresAt.getTime() + 90 * 86400_000) : undefined;
      },
    },
  },
  { ...modelOptions, timestamps: true, collection: 'invitations' },
);
invitationSchema.index({ tokenHash: 1 }, { name: 'unique_invitation_token', unique: true });
invitationSchema.index({ purgeAt: 1 }, { name: 'invitation_cleanup', expireAfterSeconds: 0 });
invitationSchema.index(
  { familyId: 1, emailNormalized: 1 },
  {
    name: 'unique_pending_invitation',
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
  },
);
invitationSchema.index({ familyId: 1, _id: -1 }, { name: 'invitation_listing' });
invitationSchema.index(
  { familyId: 1, emailNormalized: 1, status: 1 },
  { name: 'family_invitations' },
);

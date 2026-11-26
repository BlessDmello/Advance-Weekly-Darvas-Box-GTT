import {
  accountStatusSchema,
  emailSchema,
  normalizeEmail,
  publicUserSchema,
  userRoleSchema,
} from '@darvas/contracts';
import type { PublicUser } from '@darvas/contracts';
import { Schema } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';
import { modelOptions } from './options.js';

export const userSchema = new Schema(
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
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    passwordHash: {
      type: String,
      required: true,
      select: false,
      match: /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    },
    role: { type: String, enum: userRoleSchema.options, required: true },
    status: { type: String, enum: accountStatusSchema.options, required: true, default: 'ACTIVE' },
    emailVerifiedAt: { type: Date },
  },
  { ...modelOptions, timestamps: true, collection: 'users' },
);
userSchema.index({ emailNormalized: 1 }, { name: 'unique_user_email', unique: true });
userSchema.index({ familyId: 1, role: 1 }, { name: 'family_roles' });

export function toPublicUser(
  user: InferSchemaType<typeof userSchema> & { _id: Types.ObjectId },
): PublicUser {
  return publicUserSchema.parse({
    id: user._id.toHexString(),
    familyId: user.familyId.toHexString(),
    email: user.emailNormalized,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  });
}

import { createHmac } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { authenticatedUser } from './auth.js';
import { InvitationError } from '../modules/invitations/types.js';

export function invitationRateLimits(secret: string) {
  const handler = () => {
    throw new InvitationError(
      429,
      'RATE_LIMITED',
      'Too many invitation requests. Try again later.',
    );
  };
  return {
    public: rateLimit({
      windowMs: 15 * 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler,
    }),
    admin: rateLimit({
      windowMs: 3600_000,
      limit: 20,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler,
      keyGenerator: (_request, response) =>
        createHmac('sha256', secret).update(authenticatedUser(response).familyId).digest('hex'),
    }),
  };
}

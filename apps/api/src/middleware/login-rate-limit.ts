import { createHmac } from 'node:crypto';
import { normalizeEmail } from '@darvas/contracts';
import { rateLimit } from 'express-rate-limit';
import { AuthError } from '../modules/auth/service.js';

export function loginRateLimits(secret: string) {
  const handler = () => {
    throw new AuthError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
  };
  return [
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 50,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler,
    }),
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      handler,
      keyGenerator: (request) => {
        const body: unknown = request.body;
        const email =
          body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
            ? normalizeEmail(body.email)
            : 'invalid';
        return createHmac('sha256', secret).update(email).digest('hex');
      },
    }),
  ];
}

import { pino } from 'pino';
import type { ApiEnvironment } from './env.js';

export function createLogger(level: ApiEnvironment['LOG_LEVEL']) {
  return pino({
    level,
    base: { service: 'advanced-darvas-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
  });
}

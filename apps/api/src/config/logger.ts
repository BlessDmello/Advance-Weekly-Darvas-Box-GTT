import { pino } from 'pino';
import type { ApiEnvironment } from './env.js';

export function createLogger(level: ApiEnvironment['LOG_LEVEL']) {
  return pino({
    level,
    base: { service: 'advanced-darvas-api' },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]',
    },
  });
}

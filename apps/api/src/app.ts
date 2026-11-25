import { randomUUID } from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { ApiEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { errorHandler, notFoundHandler, sendError } from './middleware/error-handler.js';
import { healthRouter } from './routes/v1/health.js';

export function createApp(environment: ApiEnvironment) {
  const app = express();
  app.disable('x-powered-by');
  // No proxy trust is enabled implicitly. Deployment must configure trusted hops explicitly.
  app.use(
    pinoHttp({
      logger: createLogger(environment.LOG_LEVEL),
      genReqId: (_request, response) => {
        const id = randomUUID();
        response.setHeader('x-request-id', id);
        return id;
      },
      serializers: {
        req: (request) => ({ id: request.id, method: request.method }),
        res: (response) => ({ statusCode: response.statusCode }),
        err: () => ({ type: 'RequestError' }),
      },
    }),
  );
  app.use(helmet());
  app.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (request) => request.path === '/api/v1/health',
      handler: (_request, response) => {
        sendError(response, 429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.');
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

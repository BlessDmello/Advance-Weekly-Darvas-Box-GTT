import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { ApiEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { errorHandler, notFoundHandler, sendError } from './middleware/error-handler.js';
import { healthRouter } from './routes/v1/health.js';
import { authRouter } from './routes/v1/auth.js';
import type { AuthRuntime } from './modules/auth/types.js';
import type { InvitationDependencies } from './modules/invitations/types.js';
import { invitationsRouter } from './routes/v1/invitations.js';
import { createInvitationSender } from './modules/invitations/email.js';
import { createCsrf } from './middleware/csrf.js';
import { marketRouters } from './routes/v1/imports.js';
import type { MarketDependencies } from './modules/imports/service.js';

export function createApp(
  environment: ApiEnvironment,
  auth: AuthRuntime = {
    repository: async () => {
      throw new Error('Auth unavailable.');
    },
    close: async () => {},
  },
  invitations: InvitationDependencies = {
    repository: async () => {
      throw new Error('Invitations unavailable.');
    },
    sender: createInvitationSender(environment),
  },
  market: MarketDependencies = {
    repository: async () => {
      throw new Error('Market storage unavailable.');
    },
    policy: () => ({ stocks: [], calendars: [], priceSources: [] }),
  },
) {
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
  app.use(cookieParser());
  app.use('/api/v1', healthRouter);
  const secret = environment.CSRF_SECRET ?? randomBytes(32).toString('base64url');
  const security = { secret, csrf: createCsrf(environment, secret) };
  app.use('/api/v1/auth', authRouter(environment, auth, security));
  app.use('/api/v1/invitations', invitationsRouter(environment, auth, invitations, security));
  const marketRoutes = marketRouters(environment, auth, market, security);
  app.use('/api/v1/imports', marketRoutes.imports);
  app.use('/api/v1/stocks', marketRoutes.stocks);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

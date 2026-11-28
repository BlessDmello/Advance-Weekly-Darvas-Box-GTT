import { createHmac } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  importPreviewInputSchema,
  importCommitInputSchema,
  marketObjectIdSchema,
  marketPageQuerySchema,
  stockLookupQuerySchema,
  importPreviewResponseSchema,
  importConfirmationResponseSchema,
  stockListResponseSchema,
  importJobResponseSchema,
  importBatchesResponseSchema,
  importRetryInputSchema,
  importRetryResponseSchema,
} from '@darvas/contracts';
import type { ApiEnvironment } from '../../config/env.js';
import type { AuthRuntime } from '../../modules/auth/types.js';
import {
  authenticatedUser,
  requireAuthenticated,
  requireActiveAccount,
  requireAdmin,
} from '../../middleware/auth.js';
import type { createCsrf } from '../../middleware/csrf.js';
import {
  confirmImport,
  ImportError,
  importOperation,
  previewImport,
} from '../../modules/imports/service.js';
import type { MarketDependencies } from '../../modules/imports/service.js';
import { readImportUpload } from '../../modules/imports/upload.js';

export function marketRouters(
  environment: ApiEnvironment,
  auth: AuthRuntime,
  dependencies: MarketDependencies,
  security: { secret: string; csrf: ReturnType<typeof createCsrf> },
) {
  const imports = Router(),
    stocks = Router();
  const configured = () => {
    const origin = new URL(environment.WEB_ORIGIN);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      (environment.NODE_ENV === 'production' &&
        (!environment.CSRF_SECRET || origin.protocol !== 'https:'))
    )
      throw new ImportError(
        503,
        'MARKET_CONFIGURATION_UNAVAILABLE',
        'Market access requires valid same-origin authentication configuration.',
      );
  };
  imports.use((_request, _response, next) => {
    configured();
    next();
  });
  stocks.use((_request, _response, next) => {
    configured();
    next();
  });
  const authenticated = [requireAuthenticated(environment, auth), requireActiveAccount];
  const admin = [...authenticated, requireAdmin];
  const mutation = [security.csrf.checkOrigin, security.csrf.bind, security.csrf.protect];
  const limit = rateLimit({
    windowMs: 3600_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_request, response) =>
      createHmac('sha256', security.secret)
        .update(authenticatedUser(response).familyId)
        .digest('hex'),
    handler: () => {
      throw new ImportError(429, 'RATE_LIMITED', 'Too many import requests. Try again later.');
    },
  });
  imports.post('/preview', ...admin, ...mutation, limit, async (request, response) => {
    const upload = await readImportUpload(request);
    const fields: Record<string, unknown> = { ...upload.fields };
    for (const name of ['mapping', 'source', 'requestedRange', 'expectedCompletedSession'])
      if (typeof fields[name] === 'string') {
        try {
          fields[name] = JSON.parse(fields[name]);
        } catch {
          throw new ImportError(
            422,
            'VALIDATION_ERROR',
            'Structured multipart fields must contain valid JSON.',
          );
        }
      }
    if (
      typeof fields.minimumHistorySessions === 'string' &&
      /^\d{1,4}$/.test(fields.minimumHistorySessions)
    )
      fields.minimumHistorySessions = Number(fields.minimumHistorySessions);
    const input = importPreviewInputSchema.parse(fields);
    response.json(
      importPreviewResponseSchema.parse({
        data: await previewImport(dependencies, authenticatedUser(response), upload.file, input),
      }),
    );
  });
  imports.post('/commit', ...admin, ...mutation, limit, async (request, response) => {
    const input = importCommitInputSchema.parse(request.body);
    const key = z.uuid().parse(request.get('Idempotency-Key'));
    response.status(202).json(
      importConfirmationResponseSchema.parse({
        data: await confirmImport(dependencies, authenticatedUser(response), input, key),
      }),
    );
  });
  imports.get('/jobs/:jobId', ...admin, async (request, response) => {
    const jobId = marketObjectIdSchema.parse(request.params.jobId);
    response.json(
      importJobResponseSchema.parse({
        data: {
          ...(await importOperation(async () =>
            (await dependencies.repository()).job(authenticatedUser(response), jobId),
          )),
          executionAvailable: dependencies.runner?.enabled ?? false,
        },
      }),
    );
  });
  imports.post('/jobs/:jobId/retry', ...admin, ...mutation, limit, async (request, response) => {
    const jobId = marketObjectIdSchema.parse(request.params.jobId);
    const key = z.uuid().parse(request.get('Idempotency-Key'));
    const input = importRetryInputSchema.parse(request.body);
    if (!dependencies.runner)
      throw new ImportError(503, 'RUNNER_DISABLED', 'Import execution is not enabled.');
    response.status(202).json(
      importRetryResponseSchema.parse({
        data: await dependencies.runner.retry(
          authenticatedUser(response),
          jobId,
          key,
          input.reason,
        ),
      }),
    );
  });
  imports.get('/batches', ...admin, async (request, response) => {
    const query = marketPageQuerySchema.parse(request.query);
    response.json(
      importBatchesResponseSchema.parse(
        await importOperation(async () => {
          const result = await (
            await dependencies.repository()
          ).batches(authenticatedUser(response), query);
          return {
            ...result,
            data: result.data.map((row) => ({
              ...row,
              executionAvailable: dependencies.runner?.enabled ?? false,
            })),
          };
        }),
      ),
    );
  });
  stocks.get('/', ...authenticated, async (request, response) => {
    const query = stockLookupQuerySchema.parse(request.query);
    response.json(
      stockListResponseSchema.parse(
        await importOperation(async () =>
          (await dependencies.repository()).listStocks(query, dependencies.policy()),
        ),
      ),
    );
  });
  return { imports, stocks };
}

import type { HealthResponse } from '@darvas/contracts';
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_request, response) => {
  const body: HealthResponse = {
    success: true,
    data: { status: 'ok', service: 'advanced-darvas-api' },
  };
  response.json(body);
});

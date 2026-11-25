import { healthResponseSchema, type HealthResponse } from '@darvas/contracts';

export async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('The service is unavailable.');
  return healthResponseSchema.parse(await response.json());
}

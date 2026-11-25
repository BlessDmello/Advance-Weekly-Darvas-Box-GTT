import { describe, expect, it } from 'vitest';
import { apiErrorSchema, createSuccessSchema, healthResponseSchema, portSchema } from './index.js';
import { z } from 'zod';

describe('HTTP contracts', () => {
  it('accepts the documented health response', () => {
    expect(
      healthResponseSchema.parse({
        success: true,
        data: { status: 'ok', service: 'advanced-darvas-api' },
      }).data.status,
    ).toBe('ok');
  });

  it.each([
    { success: false, data: { status: 'ok', service: 'advanced-darvas-api' } },
    { success: true, data: { status: 'degraded', service: 'advanced-darvas-api' } },
    { success: true, data: { status: 'ok', service: 'another-service' } },
  ])('rejects a response that violates the health contract', (response) => {
    expect(healthResponseSchema.safeParse(response).success).toBe(false);
  });

  it('validates the generic success payload rather than just the envelope', () => {
    const schema = createSuccessSchema(z.object({ name: z.string() }));
    expect(schema.safeParse({ success: true, data: { name: 12 } }).success).toBe(false);
  });

  it('requires an error code and a traceable request ID', () => {
    expect(
      apiErrorSchema.safeParse({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Request failed', requestId: 'invalid' },
      }).success,
    ).toBe(false);
  });

  it.each(['0', '65536', '3000.5', 'abc'])('rejects invalid port %s', (port) => {
    expect(portSchema.safeParse(port).success).toBe(false);
  });
});

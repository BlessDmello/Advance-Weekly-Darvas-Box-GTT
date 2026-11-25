import { apiErrorSchema, healthResponseSchema } from '@darvas/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';

const app = createApp(parseEnvironment({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));

describe('API foundation', () => {
  it('serves the exact health response without MongoDB configuration', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok', service: 'advanced-darvas-api' },
    });
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a typed 404 with a generated request ID', async () => {
    const response = await request(app).get('/api/v1/stocks').expect(404);
    const error = apiErrorSchema.parse(response.body);
    expect(error.error.code).toBe('NOT_FOUND');
    expect(error.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('does not reflect an untrusted request ID', async () => {
    const response = await request(app).get('/api/v1/health').set('x-request-id', 'untrusted');
    expect(response.headers['x-request-id']).not.toBe('untrusted');
  });

  it('handles malformed JSON through the common error envelope', async () => {
    const response = await request(app)
      .post('/api/v1/missing')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects oversized request bodies', async () => {
    const response = await request(app)
      .post('/api/v1/missing')
      .send({ text: 'x'.repeat(40_000) })
      .expect(413);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('uses valid defaults without future feature secrets', () => {
    expect(parseEnvironment({}).PORT).toBe(4000);
    expect(() => parseEnvironment({ PORT: 'not-a-port', WEB_ORIGIN: 'a-secret' })).toThrow(
      'Invalid API environment fields: PORT, WEB_ORIGIN',
    );
  });
});

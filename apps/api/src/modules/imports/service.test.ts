import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { parseEnvironment } from '../../config/env.js';
import { readMarketReferencePolicy } from './service.js';

it('keeps absent reference approvals empty and rejects malformed/oversized operator configuration without exposing it', () => {
  expect(readMarketReferencePolicy({})).toEqual({ stocks: [], calendars: [], priceSources: [] });
  expect(() => readMarketReferencePolicy({ MARKET_REFERENCE_APPROVALS: 'invalid' })).toThrow(
    'Market reference approvals are unavailable.',
  );
  expect(() =>
    readMarketReferencePolicy({ MARKET_REFERENCE_APPROVALS: 'x'.repeat(32769) }),
  ).toThrow('Market reference approvals are unavailable.');
});
it.each([
  { NODE_ENV: 'production', WEB_ORIGIN: 'http://localhost:3000', CSRF_SECRET: 's'.repeat(64) },
  { NODE_ENV: 'production', WEB_ORIGIN: 'https://workspace.example' },
  { NODE_ENV: 'test', WEB_ORIGIN: 'https://workspace.example/untrusted-path' },
])(
  'fails closed for invalid production/origin configuration without breaking health: %s',
  async (settings) => {
    const app = createApp(parseEnvironment({ ...settings, LOG_LEVEL: 'silent' }));
    for (const path of ['/api/v1/stocks', '/api/v1/imports/batches']) {
      const result = await request(app).get(path).expect(503);
      expect(result.body.error.code).toBe('MARKET_CONFIGURATION_UNAVAILABLE');
      expect(result.headers['cache-control']).toBe('no-store');
    }
    await request(app).get('/api/v1/health').expect(200);
  },
);

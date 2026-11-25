import { expect, it } from 'vitest';
import * as strategy from '@darvas/strategy-core';

it('resolves the built package and exposes all reserved strategy boundaries', () => {
  expect(Object.keys(strategy).sort()).toEqual([
    'capitalAllocation',
    'car',
    'darvas',
    'dma',
    'suitability',
  ]);
  for (const boundary of Object.values(strategy)) {
    expect(boundary.status).toBe('not-implemented');
    expect(Object.values(boundary).some((value) => typeof value === 'function')).toBe(false);
  }
});

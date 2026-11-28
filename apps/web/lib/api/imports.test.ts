import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  confirmImport,
  getImportHistory,
  getImportJob,
  ImportRequestError,
  previewImport,
  retryImport,
  searchStocks,
} from './imports';
import { csrfToken } from './auth';
import type { ImportPreviewInput } from '@darvas/contracts';

vi.mock('./auth', () => ({ csrfToken: vi.fn() }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(csrfToken).mockResolvedValue('synthetic-csrf');
});
afterEach(() => vi.unstubAllGlobals());
const input: ImportPreviewInput = {
  stockSymbol: 'SYNTH',
  series: 'EQ',
  mapping: {
    date: 'Date',
    open: 'Open',
    high: 'High',
    low: 'Low',
    close: 'Close',
    volume: null,
    symbol: null,
  },
  source: { provider: 'Synthetic', reference: 'Tests only', adjustmentVersion: null },
  adjustmentBasis: 'RAW',
  dateMode: 'ISO',
  requestedRange: { from: '2026-01-01', to: '2026-01-03' },
  minimumHistorySessions: 200,
  expectedCompletedSession: null,
  mode: 'INITIAL',
};
it('serializes multipart metadata without overriding the browser boundary', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 422 }));
  await expect(
    previewImport(input, new File(['synthetic'], 'synthetic.csv')),
  ).rejects.toBeInstanceOf(ImportRequestError);
  const [path, options] = fetchMock.mock.calls[0]!;
  expect(path).toBe('/api/v1/imports/preview');
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-CSRF-Token': 'synthetic-csrf' },
  });
  expect(options.headers).not.toHaveProperty('Content-Type');
  expect(options.body.get('expectedCompletedSession')).toBe('null');
  expect(JSON.parse(options.body.get('mapping'))).toEqual(input.mapping);
  expect(JSON.parse(options.body.get('source'))).toEqual(input.source);
});
it('preserves caller keys and reports uncertain mutation network outcomes', async () => {
  fetchMock.mockRejectedValue(new TypeError('Synthetic network loss'));
  const body = { previewToken: 'a'.repeat(43), correctionReason: 'Reviewed correction' };
  for (let index = 0; index < 2; index++)
    await expect(confirmImport(body, 'stable-key')).rejects.toMatchObject({ uncertain: true });
  expect(fetchMock.mock.calls.map(([, options]) => options.headers['Idempotency-Key'])).toEqual([
    'stable-key',
    'stable-key',
  ]);
  expect(fetchMock.mock.calls[0]![1].body).toBe(JSON.stringify(body));
});
it.each([401, 403, 404, 409, 422, 429, 503])(
  'sanitizes HTTP %s without reflecting provider details',
  async (status) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'PRIVATE INTERNAL DETAILS' } }), { status }),
    );
    await expect(getImportJob('a'.repeat(24))).rejects.not.toThrow('PRIVATE INTERNAL DETAILS');
    await expect(getImportJob('a'.repeat(24))).rejects.toMatchObject({ status, uncertain: false });
  },
);
it('treats malformed success responses as uncertain rather than repeating with a fresh key', async () => {
  fetchMock.mockResolvedValue(new Response('{}'));
  await expect(retryImport('a'.repeat(24), 'Reviewed', 'same-key')).rejects.toMatchObject({
    uncertain: true,
  });
  await expect(
    confirmImport({ previewToken: 'a'.repeat(43), correctionReason: null }, 'same-key'),
  ).rejects.toMatchObject({ uncertain: true });
});
it('uses encoded, no-store same-origin reads with cursors', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ data: [], meta: { nextCursor: null } }))),
  );
  await searchStocks('SYNTH&TEST', 'a'.repeat(24));
  await getImportHistory('b'.repeat(24));
  expect(fetchMock.mock.calls[0]![0]).toContain('query=SYNTH%26TEST');
  expect(fetchMock.mock.calls[1]![0]).toContain('?cursor=');
  expect(csrfToken).not.toHaveBeenCalled();
});
it('does not send a mutation if CSRF acquisition fails', async () => {
  vi.mocked(csrfToken).mockRejectedValue(new Error('unavailable'));
  await expect(retryImport('a'.repeat(24), 'Reviewed', 'same-key')).rejects.toMatchObject({
    uncertain: false,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

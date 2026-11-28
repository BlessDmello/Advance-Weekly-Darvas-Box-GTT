import {
  importBatchesResponseSchema,
  importConfirmationResponseSchema,
  importJobResponseSchema,
  importPreviewResponseSchema,
  importRetryResponseSchema,
  stockListResponseSchema,
  type ImportCommitInput,
  type ImportPreviewInput,
} from '@darvas/contracts';
import { csrfToken } from './auth';

export class ImportRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly uncertain = false,
  ) {
    super(
      status === 401
        ? 'Your session has expired. Sign in again.'
        : status === 403
          ? 'Admin access is required. Refresh to verify your permissions.'
          : status === 404
            ? 'This import is unavailable or inaccessible.'
            : status === 409
              ? 'The preview or action has changed. Check history before creating another preview.'
              : status === 422
                ? 'Validation or reference data prevents this action. Review your inputs and contact the operator if needed.'
                : status === 429
                  ? 'Too many requests. Wait before trying again.'
                  : uncertain
                    ? 'The outcome could not be confirmed. Check history or retry this same action safely.'
                    : 'Import services are unavailable. Try refreshing.',
    );
  }
}

async function request(
  path: string,
  options: { body?: FormData | object; key?: string; signal?: AbortSignal } = {},
) {
  const mutation = options.body !== undefined;
  // Failure before sending the mutation is known not to have submitted it.
  const csrf = mutation
    ? await csrfToken().catch(() => {
        throw new ImportRequestError(503);
      })
    : null;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: mutation ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
      ...(mutation
        ? {
            headers: {
              'X-CSRF-Token': csrf!,
              ...(options.key ? { 'Idempotency-Key': options.key } : {}),
              ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            },
            body: options.body instanceof FormData ? options.body : JSON.stringify(options.body),
          }
        : {}),
    });
  } catch {
    throw new ImportRequestError(0, mutation);
  }
  if (!response.ok)
    throw new ImportRequestError(response.status, mutation && response.status >= 500);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ImportRequestError(0, mutation);
  }
}

export async function searchStocks(query: string, cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ query, limit: '100', ...(cursor ? { cursor } : {}) });
  return stockListResponseSchema.parse(
    await request(`/stocks?${params}`, { ...(signal ? { signal } : {}) }),
  );
}
export async function previewImport(input: ImportPreviewInput, file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.set('file', file);
  for (const [key, value] of Object.entries(input))
    body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  return importPreviewResponseSchema.parse(
    await request('/imports/preview', { body, ...(signal ? { signal } : {}) }),
  ).data;
}
export async function confirmImport(input: ImportCommitInput, key: string) {
  const data = await request('/imports/commit', { body: input, key });
  const parsed = importConfirmationResponseSchema.safeParse(data);
  if (!parsed.success) throw new ImportRequestError(0, true);
  return parsed.data.data;
}
export async function getImportJob(id: string, signal?: AbortSignal) {
  return importJobResponseSchema.parse(
    await request(`/imports/jobs/${encodeURIComponent(id)}`, { ...(signal ? { signal } : {}) }),
  ).data;
}
export async function getImportHistory(cursor?: string, signal?: AbortSignal) {
  return importBatchesResponseSchema.parse(
    await request(`/imports/batches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
      ...(signal ? { signal } : {}),
    }),
  );
}
export async function retryImport(id: string, reason: string, key: string) {
  const result = importRetryResponseSchema.safeParse(
    await request(`/imports/jobs/${encodeURIComponent(id)}/retry`, { body: { reason }, key }),
  );
  if (!result.success) throw new ImportRequestError(0, true);
  return result.data.data;
}

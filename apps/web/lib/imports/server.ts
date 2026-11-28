import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  importBatchesResponseSchema,
  importJobResponseSchema,
  marketObjectIdSchema,
} from '@darvas/contracts';
import { requireAdminUser, WorkspaceUnavailableError } from '../auth/server';
import { getApiOrigin } from '../env';

async function read(path: string) {
  const response = await fetch(`${getApiOrigin()}/api/v1/imports${path}`, {
    headers: { Cookie: (await cookies()).toString() },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new WorkspaceUnavailableError('Imports unavailable.');
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 403 || response.status === 404) notFound();
  if (!response.ok) throw new WorkspaceUnavailableError('Imports unavailable.');
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new WorkspaceUnavailableError('Imports unavailable.');
  }
}
export async function adminImportHistory() {
  await requireAdminUser();
  const result = importBatchesResponseSchema.safeParse(await read('/batches'));
  if (!result.success) throw new WorkspaceUnavailableError('Imports unavailable.');
  return result.data;
}
export async function adminImportJob(id: string) {
  await requireAdminUser();
  if (!marketObjectIdSchema.safeParse(id).success) notFound();
  const result = importJobResponseSchema.safeParse(await read(`/jobs/${id}`));
  if (!result.success) throw new WorkspaceUnavailableError('Imports unavailable.');
  return result.data.data;
}

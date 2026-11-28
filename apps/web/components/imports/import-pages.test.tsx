import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ImportsPage from '@/app/(private)/admin/imports/page';
import ImportJobPage from '@/app/(private)/admin/imports/jobs/[jobId]/page';
import { adminImportHistory, adminImportJob } from '@/lib/imports/server';
import { WorkspaceUnavailableError } from '@/lib/auth/server';
vi.mock('@/lib/imports/server', () => ({ adminImportHistory: vi.fn(), adminImportJob: vi.fn() }));
vi.mock('@/components/imports/import-workspace', () => ({
  ImportWorkspace: () => <div>Verified Admin workspace</div>,
}));
vi.mock('@/components/imports/import-job', () => ({ ImportJob: () => <div>Verified job</div> }));
beforeEach(() => vi.clearAllMocks());
it('renders only after the guarded history load resolves', async () => {
  vi.mocked(adminImportHistory).mockResolvedValue({ data: [], meta: { nextCursor: null } });
  render(await ImportsPage());
  expect(screen.getByText('Verified Admin workspace')).toBeVisible();
});
it('renders unavailable feedback without private controls on an outage', async () => {
  vi.mocked(adminImportHistory).mockRejectedValue(new WorkspaceUnavailableError());
  render(await ImportsPage());
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.queryByText('Verified Admin workspace')).not.toBeInTheDocument();
});
it('propagates framework authentication/authorization redirects', async () => {
  vi.mocked(adminImportHistory).mockRejectedValue(new Error('NEXT_REDIRECT'));
  await expect(ImportsPage()).rejects.toThrow('NEXT_REDIRECT');
  vi.mocked(adminImportJob).mockRejectedValue(new Error('NEXT_NOT_FOUND'));
  await expect(
    ImportJobPage({ params: Promise.resolve({ jobId: 'a'.repeat(24) }) }),
  ).rejects.toThrow('NEXT_NOT_FOUND');
});

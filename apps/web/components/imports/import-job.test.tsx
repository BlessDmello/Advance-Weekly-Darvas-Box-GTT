import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ImportJobResponse } from '@darvas/contracts';
import type * as ImportsApi from '@/lib/api/imports';
import { ImportJob } from './import-job';
import { getImportJob, ImportRequestError, retryImport } from '@/lib/api/imports';
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api/imports', async (original) => ({
  ...(await original<typeof ImportsApi>()),
  getImportJob: vi.fn(),
  retryImport: vi.fn(),
}));
function job(patch: Partial<ImportJobResponse['data']> = {}): ImportJobResponse['data'] {
  return {
    jobId: 'a'.repeat(24),
    batchId: 'b'.repeat(24),
    status: 'QUEUED',
    phase: 'QUEUED',
    processed: 0,
    total: 3,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
    startedAt: null,
    finishedAt: null,
    processingScope: 'PRICE_IMPORT',
    derivedStatus: 'DEFERRED',
    executionAvailable: true,
    quality: null,
    recovery: {
      retryAllowed: false,
      blocked: false,
      automaticRecoveries: 0,
      nextAttemptAt: null,
      payloadRetired: false,
    },
    ...patch,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getImportJob).mockResolvedValue(job());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('shows a disabled-runner queue honestly and only refreshes on request', async () => {
  vi.useFakeTimers();
  render(<ImportJob initial={job({ executionAvailable: false })} />);
  expect(screen.getByText(/Automatic processing has not started/)).toBeVisible();
  await act(async () => {
    vi.advanceTimersByTime(20_000);
  });
  expect(getImportJob).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
  });
  expect(getImportJob).toHaveBeenCalledOnce();
});
it('serializes polling, stops on completion and aborts on unmount', async () => {
  vi.useFakeTimers();
  let resolve!: (value: ImportJobResponse['data']) => void;
  vi.mocked(getImportJob).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { unmount } = render(<ImportJob initial={job()} />);
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  await act(async () => {
    vi.advanceTimersByTime(20_000);
  });
  expect(getImportJob).toHaveBeenCalledOnce();
  await act(async () => resolve(job({ status: 'COMPLETED', phase: 'COMPLETED', processed: 3 })));
  await act(async () => {
    vi.advanceTimersByTime(20_000);
  });
  expect(getImportJob).toHaveBeenCalledOnce();
  expect(screen.getByText(/Price processing is complete/)).toBeVisible();
  const signal = vi.mocked(getImportJob).mock.calls[0]![1]!;
  unmount();
  expect(signal.aborted).toBe(true);
});
it('pauses polling when hidden and refreshes on visibility return', async () => {
  vi.useFakeTimers();
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  render(<ImportJob initial={job()} />);
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    vi.advanceTimersByTime(15_000);
  });
  expect(getImportJob).not.toHaveBeenCalled();
  hidden = false;
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'));
  });
  expect(getImportJob).toHaveBeenCalledOnce();
});
it.each([401, 403, 404])('clears job data and stops polling after HTTP %s', async (status) => {
  vi.mocked(getImportJob).mockRejectedValueOnce(new ImportRequestError(status));
  render(<ImportJob initial={job()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
  expect(await screen.findByRole('heading', { name: 'Import unavailable' })).toBeVisible();
  expect(screen.queryByText('Dataset quality')).not.toBeInTheDocument();
  if (status === 401) expect(router.replace).toHaveBeenCalledWith('/login');
});
it('keeps a network read error separate from recorded job failure', async () => {
  vi.mocked(getImportJob).mockRejectedValueOnce(new ImportRequestError(503));
  render(<ImportJob initial={job()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('not a new job failure');
  expect(screen.getByText(/Queued · QUEUED/)).toBeVisible();
});
it('reuses retry key and reason after an uncertain response, without overlapping calls', async () => {
  const user = userEvent.setup();
  const current = job({
    status: 'FAILED_RETRYABLE',
    phase: 'UPSERTING',
    recovery: {
      retryAllowed: true,
      blocked: false,
      automaticRecoveries: 1,
      nextAttemptAt: null,
      payloadRetired: false,
    },
  });
  vi.mocked(getImportJob).mockResolvedValue(current);
  vi.mocked(retryImport)
    .mockRejectedValueOnce(new ImportRequestError(0, true))
    .mockResolvedValueOnce({ jobId: current.jobId, resumeRequested: true });
  render(<ImportJob initial={current} />);
  await user.type(screen.getByLabelText('Retry reason (required)'), 'Reviewed interruption');
  await user.click(screen.getByRole('button', { name: 'Request eligible retry' }));
  expect(await screen.findByText(/Retry outcome unknown/)).toBeVisible();
  expect(screen.getByLabelText('Retry reason (required)')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Retry same request' }));
  await waitFor(() => expect(retryImport).toHaveBeenCalledTimes(2));
  expect(vi.mocked(retryImport).mock.calls[0]).toEqual(vi.mocked(retryImport).mock.calls[1]);
  expect(await screen.findByText(/Resume request accepted/)).toBeVisible();
});
it('validates reasons and uses backend eligibility rather than a status-based shortcut', async () => {
  const current = job({
    recovery: {
      retryAllowed: true,
      blocked: false,
      automaticRecoveries: 0,
      nextAttemptAt: null,
      payloadRetired: false,
    },
  });
  const { unmount } = render(<ImportJob initial={current} />);
  await userEvent.click(screen.getByRole('button', { name: 'Request eligible retry' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a retry reason');
  expect(retryImport).not.toHaveBeenCalled();
  unmount();
  render(<ImportJob initial={job({ status: 'FAILED_RETRYABLE' })} />);
  expect(screen.queryByRole('button', { name: 'Request eligible retry' })).not.toBeInTheDocument();
});
it('never offers retry for permanent failures or completed jobs', () => {
  const { unmount } = render(
    <ImportJob initial={job({ status: 'FAILED_FINAL', phase: 'VALIDATING' })} />,
  );
  expect(screen.getByText(/permanently failed/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Request eligible retry' })).not.toBeInTheDocument();
  unmount();
  render(<ImportJob initial={job({ status: 'COMPLETED', phase: 'COMPLETED' })} />);
  expect(screen.getByText(/No trading signals/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Request eligible retry' })).not.toBeInTheDocument();
});

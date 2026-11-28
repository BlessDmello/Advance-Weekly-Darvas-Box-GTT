import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ImportPreviewResponse } from '@darvas/contracts';
import type * as ImportsApi from '@/lib/api/imports';
import { ImportWorkspace } from './import-workspace';
import { emptyDraft, validateDraft } from './import-upload-form';
import { ImportPreview } from './import-preview';
import {
  confirmImport,
  getImportHistory,
  ImportRequestError,
  previewImport,
  searchStocks,
} from '@/lib/api/imports';
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api/imports', async (original) => ({
  ...(await original<typeof ImportsApi>()),
  confirmImport: vi.fn(),
  getImportHistory: vi.fn(),
  previewImport: vi.fn(),
  searchStocks: vi.fn(),
}));
const stock = {
  id: 'a'.repeat(24),
  exchange: 'NSE' as const,
  symbol: 'SYNTH',
  series: 'EQ',
  companyName: 'Synthetic company',
  status: 'ACTIVE' as const,
  referenceApproved: true,
};
const history = { data: [], meta: { nextCursor: null } };
function preview(): ImportPreviewResponse['data'] {
  return {
    previewToken: 'a'.repeat(43),
    symbol: 'SYNTH',
    fileFormat: 'CSV',
    dateRange: { from: '2026-01-01', to: '2026-01-03' },
    rows: { read: 3, valid: 3, new: 3, changed: 0, unchanged: 0, rejected: 0 },
    normalization: {
      original: 3,
      normalized: 3,
      invalid: 0,
      identicalDuplicates: 0,
      conflictingDuplicates: 0,
    },
    missingSessions: [],
    blockingErrors: [],
    warnings: [
      {
        code: 'SHORT_HISTORY',
        severity: 'WARNING',
        row: null,
        field: null,
        message: 'Synthetic short history warning.',
      },
    ],
    errorCount: 0,
    warningCount: 1,
    diagnosticsTruncated: false,
    completeness: {
      coverage: 'VERIFIED',
      calendarVersion: 'synthetic-1',
      complete: true,
      expectedSessionCount: 3,
      missingSessions: [],
      missingSessionCount: 0,
      latestSession: '2026-01-03',
      freshness: 'UNKNOWN',
    },
    correctionPreview: { changed: 0, basisConflicts: 0, requiresReason: false },
    committable: true,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    processingScope: 'PRICE_IMPORT',
    derivedStatus: 'DEFERRED',
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchStocks).mockResolvedValue({
    data: [
      stock,
      { ...stock, id: 'b'.repeat(24), symbol: 'INACTIVE', status: 'INACTIVE' },
      { ...stock, id: 'c'.repeat(24), symbol: 'UNAPPROVED', referenceApproved: false },
    ],
    meta: { nextCursor: null },
  });
  vi.mocked(previewImport).mockResolvedValue(preview());
  vi.mocked(getImportHistory).mockResolvedValue(history);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function fill(fileName = 'synthetic.csv') {
  const user = userEvent.setup();
  render(<ImportWorkspace initial={history} />);
  await user.click(screen.getByRole('button', { name: 'Search stocks' }));
  await user.selectOptions(screen.getByLabelText('Approved NSE stocks'), stock.id);
  fireEvent.change(screen.getByLabelText('Provider / source name'), {
    target: { value: 'Synthetic' },
  });
  fireEvent.change(screen.getByLabelText('Source reference'), { target: { value: 'Tests only' } });
  await user.selectOptions(screen.getByLabelText('Price basis'), 'RAW');
  fireEvent.change(screen.getByLabelText('Requested range from'), {
    target: { value: '2026-01-01' },
  });
  fireEvent.change(screen.getByLabelText('Requested range to'), {
    target: { value: '2026-01-03' },
  });
  await user.upload(
    screen.getByLabelText('CSV or XLSX file'),
    new File(['synthetic'], fileName, {
      type: fileName.endsWith('csv')
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  return user;
}
it.each(['synthetic.csv', 'synthetic.xlsx'])(
  'validates %s with explicit provenance, canonical mappings and unknown expected session',
  async (name) => {
    const user = await fill(name);
    expect(screen.queryByRole('option', { name: /INACTIVE|UNAPPROVED/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Validate & preview' }));
    expect(previewImport).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumHistorySessions: 200,
        expectedCompletedSession: null,
        mapping: expect.objectContaining({ date: 'Date', volume: null }),
        source: { provider: 'Synthetic', reference: 'Tests only', adjustmentVersion: null },
      }),
      expect.any(File),
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('Synthetic short history warning.')).toBeVisible();
    expect(screen.getByText('Calendar coverage')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review & confirm import' })).toBeEnabled();
  },
);
it('shows required input errors without sending a preview', async () => {
  render(<ImportWorkspace initial={history} />);
  await userEvent.click(screen.getByRole('button', { name: 'Validate & preview' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Select an active');
  expect(previewImport).not.toHaveBeenCalled();
});
it('invalidates previews on a mapping change and blocks invalid duplicate mappings', async () => {
  const user = await fill();
  await user.click(screen.getByRole('button', { name: 'Validate & preview' }));
  await screen.findByRole('button', { name: 'Review & confirm import' });
  await user.clear(screen.getByLabelText('Open column (required)'));
  await user.type(screen.getByLabelText('Open column (required)'), 'Date');
  expect(screen.queryByRole('region', { name: 'Import preview' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Validate & preview' }));
  expect(screen.getByRole('alert')).toHaveTextContent('distinct column mappings');
  expect(previewImport).toHaveBeenCalledOnce();
});
it('uses the same key and payload after uncertain confirmation and prevents duplicate submission', async () => {
  const user = await fill();
  vi.mocked(confirmImport)
    .mockRejectedValueOnce(new ImportRequestError(0, true))
    .mockResolvedValueOnce({
      jobId: 'b'.repeat(24),
      batchId: 'c'.repeat(24),
      status: 'QUEUED',
      executionAvailable: false,
    });
  await user.click(screen.getByRole('button', { name: 'Validate & preview' }));
  await user.click(await screen.findByRole('button', { name: 'Review & confirm import' }));
  await user.click(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(/Confirmation outcome unknown/);
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Provider / source name')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Check same confirmation' }));
  await user.click(screen.getByRole('button', { name: 'Retry same confirmation' }));
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(`/admin/imports/jobs/${'b'.repeat(24)}`),
  );
  expect(vi.mocked(confirmImport).mock.calls[0]).toEqual(vi.mocked(confirmImport).mock.calls[1]);
  expect(vi.mocked(confirmImport).mock.calls[0]![1]).toMatch(/^[a-f0-9-]{36}$/);
});
it('admits only one preview request while a response is pending', async () => {
  const user = await fill();
  let resolve!: (value: ImportPreviewResponse['data']) => void;
  vi.mocked(previewImport).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const form = screen.getByRole('form', { name: 'Prepare import preview' });
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(previewImport).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Request in progress…' })).toBeDisabled();
  await act(async () => resolve(preview()));
  expect(await screen.findByRole('button', { name: 'Validate again' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Refresh history' }));
});
it('requires a correction reason and shows blocking diagnostics honestly', async () => {
  const result = preview();
  result.correctionPreview = { changed: 1, basisConflicts: 0, requiresReason: true };
  const onConfirm = vi.fn(async () => {}),
    onReason = vi.fn();
  const { rerender } = render(
    <div className="public-page">
      <ImportPreview
        preview={result}
        pending={false}
        uncertain={false}
        reason=""
        onReason={onReason}
        onConfirm={onConfirm}
      />
    </div>,
  );
  expect(screen.getByRole('button', { name: 'Review & confirm import' })).toBeDisabled();
  rerender(
    <ImportPreview
      preview={result}
      pending={false}
      uncertain={false}
      reason="Reviewed"
      onReason={onReason}
      onConfirm={onConfirm}
    />,
  );
  expect(screen.getByRole('button', { name: 'Review & confirm import' })).toBeEnabled();
  result.committable = false;
  result.errorCount = 1;
  result.blockingErrors = [
    {
      code: 'MISSING_SESSIONS',
      severity: 'ERROR',
      row: null,
      field: 'date',
      message: 'Synthetic missing calendar sessions.',
    },
  ];
  rerender(
    <ImportPreview
      preview={result}
      pending={false}
      uncertain={false}
      reason="Reviewed"
      onReason={onReason}
      onConfirm={onConfirm}
    />,
  );
  expect(screen.getByText('Synthetic missing calendar sessions.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review & confirm import' })).toBeDisabled();
});
it('expires a preview on the clock and preserves same-action recovery after expiry', async () => {
  vi.useFakeTimers();
  const result = preview();
  result.expiresAt = new Date(Date.now() + 1000).toISOString();
  const props = {
    preview: result,
    pending: false,
    uncertain: false,
    reason: '',
    onReason: vi.fn(),
    onConfirm: vi.fn(async () => {}),
  };
  const { rerender } = render(<ImportPreview {...props} />);
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByRole('button', { name: 'Review & confirm import' })).toBeDisabled();
  rerender(<ImportPreview {...props} uncertain />);
  expect(screen.getByRole('button', { name: 'Check same confirmation' })).toBeEnabled();
});
it('clears private input and preview state on session expiry', async () => {
  const user = await fill();
  vi.mocked(previewImport).mockRejectedValueOnce(new ImportRequestError(401));
  await user.click(screen.getByRole('button', { name: 'Validate & preview' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  expect(screen.queryByLabelText('Provider / source name')).not.toBeInTheDocument();
});
it('uses safe deep links for scoped history and distinguishes unavailable history', async () => {
  const initial = {
    data: [
      {
        batchId: 'a'.repeat(24),
        jobId: 'b'.repeat(24),
        stockId: 'c'.repeat(24),
        symbol: 'SYNTH',
        fileFormat: 'CSV' as const,
        dateRange: { from: '2026-01-01', to: '2026-01-03' },
        rows: preview().rows,
        confirmedAt: '2026-01-04T00:00:00.000Z',
        status: 'QUEUED' as const,
        executionAvailable: false,
        processingScope: 'PRICE_IMPORT' as const,
        derivedStatus: 'DEFERRED' as const,
      },
    ],
    meta: { nextCursor: null },
  };
  render(<ImportWorkspace initial={initial} />);
  const region = within(screen.getByRole('region', { name: 'Import history' }));
  expect(region.getByRole('link', { name: /View job details/ })).toHaveAttribute(
    'href',
    `/admin/imports/jobs/${'b'.repeat(24)}`,
  );
  expect(region.getByText('Awaiting operator-controlled execution.')).toBeVisible();
});
it.each(['UNKNOWN', 'ADJUSTED', 'EXCEL_SERIAL', 'OVERSIZE'])(
  'blocks invalid %s inputs before upload',
  (kind) => {
    const draft = {
      ...emptyDraft(),
      stock,
      file: new File(['synthetic'], 'synthetic.csv'),
      provider: 'Synthetic',
      reference: 'Tests',
      basis: 'RAW',
      from: '2026-01-01',
      to: '2026-01-03',
    };
    if (kind === 'UNKNOWN' || kind === 'ADJUSTED') draft.basis = kind;
    if (kind === 'EXCEL_SERIAL') draft.dateMode = kind;
    if (kind === 'OVERSIZE')
      draft.file = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'synthetic.csv');
    expect(typeof validateDraft(draft)).toBe('string');
  },
);

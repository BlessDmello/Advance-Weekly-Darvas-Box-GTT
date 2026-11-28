'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  IMPORT_LIMITS,
  importPreviewInputSchema,
  type ImportPreviewInput,
  type StockListResponse,
} from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import { ImportRequestError, searchStocks } from '@/lib/api/imports';
import styles from './imports.module.css';

type Stock = StockListResponse['data'][number];
export type ImportDraft = {
  stock: Stock | null;
  file: File | null;
  provider: string;
  reference: string;
  adjustmentVersion: string;
  basis: string;
  dateMode: string;
  from: string;
  to: string;
  minimum: string;
  expected: string;
  mode: string;
  mapping: Record<keyof ImportPreviewInput['mapping'], string>;
};
export function emptyDraft(): ImportDraft {
  return {
    stock: null,
    file: null,
    provider: '',
    reference: '',
    adjustmentVersion: '',
    basis: 'UNKNOWN',
    dateMode: 'ISO',
    from: '',
    to: '',
    minimum: '200',
    expected: '',
    mode: 'INITIAL',
    mapping: {
      date: 'Date',
      open: 'Open',
      high: 'High',
      low: 'Low',
      close: 'Close',
      volume: '',
      symbol: '',
    },
  };
}
export function validateDraft(
  draft: ImportDraft,
): { input: ImportPreviewInput; file: File } | string {
  if (!draft.stock || draft.stock.status !== 'ACTIVE' || !draft.stock.referenceApproved)
    return 'Select an active, reference-approved NSE stock.';
  if (
    !draft.file ||
    !draft.file.size ||
    draft.file.size > IMPORT_LIMITS.fileBytes ||
    !/\.(csv|xlsx)$/i.test(draft.file.name)
  )
    return 'Choose one non-empty CSV or XLSX file up to 3 MiB.';
  if (
    draft.file.name.length > 160 ||
    /[\\/]/.test(draft.file.name) ||
    Array.from(draft.file.name).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return 'Use a filename of at most 160 characters without paths or control characters.';
  if (!['RAW', 'ADJUSTED'].includes(draft.basis))
    return 'Declare Raw or Adjusted price basis. Unknown basis cannot be confirmed.';
  if (draft.dateMode === 'EXCEL_SERIAL' && !/\.xlsx$/i.test(draft.file.name))
    return 'Excel serial dates require an XLSX workbook.';
  const result = importPreviewInputSchema.safeParse({
    stockSymbol: draft.stock.symbol,
    series: draft.stock.series,
    source: {
      provider: draft.provider,
      reference: draft.reference,
      adjustmentVersion: draft.adjustmentVersion.trim() || null,
    },
    adjustmentBasis: draft.basis,
    dateMode: draft.dateMode,
    requestedRange: { from: draft.from, to: draft.to },
    minimumHistorySessions: draft.minimum.trim() === '' ? NaN : Number(draft.minimum),
    expectedCompletedSession: draft.expected || null,
    mode: draft.mode,
    mapping: {
      ...draft.mapping,
      volume: draft.mapping.volume || null,
      symbol: draft.mapping.symbol || null,
    },
  });
  return result.success
    ? { input: result.data, file: draft.file }
    : 'Check the source, adjustment version, real session dates, range, history threshold (0–5,000), and distinct column mappings.';
}
export function ImportUploadForm({
  draft,
  disabled,
  onChange,
  onAccessLost,
}: {
  draft: ImportDraft;
  disabled: boolean;
  onChange(draft: ImportDraft): void;
  onAccessLost(error: ImportRequestError): void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<StockListResponse>({ data: [], meta: { nextCursor: null } });
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function change(patch: Partial<ImportDraft>) {
    onChange({ ...draft, ...patch });
  }
  async function search(cursor?: string) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setSearching(true);
    setError('');
    try {
      const next = await searchStocks(query, cursor, abort.signal);
      if (!abort.signal.aborted)
        setResult({ ...next, data: cursor ? [...result.data, ...next.data] : next.data });
    } catch (error) {
      if (!abort.signal.aborted) {
        if (error instanceof ImportRequestError && [401, 403].includes(error.status))
          onAccessLost(error);
        else setError('Stock references could not be loaded. Try searching again.');
      }
    } finally {
      if (!abort.signal.aborted) setSearching(false);
    }
  }
  const approved = result.data.filter(
    (stock) => stock.status === 'ACTIVE' && stock.referenceApproved,
  );
  return (
    <fieldset disabled={disabled} className={styles.grid}>
      <legend className="sr-only">Import inputs</legend>
      <section className={styles.panel} aria-label="Stock and source">
        <h2>1. Stock &amp; source</h2>
        <div className={styles.field}>
          <label htmlFor="stock-search">Search approved NSE stocks</label>
          <input
            id="stock-search"
            maxLength={80}
            value={query}
            onChange={(event) => {
              controller.current?.abort();
              setSearching(false);
              setQuery(event.target.value);
              setResult({ data: [], meta: { nextCursor: null } });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void search();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" disabled={searching} onClick={() => void search()}>
          {searching ? 'Searching…' : 'Search stocks'}
        </Button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.field}>
          <label htmlFor="stock-select">Approved NSE stocks</label>
          <select
            id="stock-select"
            value={draft.stock?.id ?? ''}
            onChange={(event) =>
              change({
                stock:
                  approved.find((stock) => stock.id === event.target.value) ??
                  (draft.stock?.id === event.target.value ? draft.stock : null),
              })
            }
          >
            <option value="">Select a stock</option>
            {draft.stock && !approved.some((stock) => stock.id === draft.stock!.id) && (
              <option value={draft.stock.id}>
                {draft.stock.symbol} · {draft.stock.companyName} ({draft.stock.series})
              </option>
            )}
            {approved.map((stock) => (
              <option key={stock.id} value={stock.id}>
                {stock.symbol} · {stock.companyName} ({stock.series})
              </option>
            ))}
          </select>
        </div>
        <p className={styles.muted} role="status">
          {searching
            ? 'Loading reference records.'
            : approved.length
              ? `${approved.length} approved records shown.`
              : 'Search to load active, reference-approved records. No verified Nifty 100 membership is claimed.'}
        </p>
        {result.meta.nextCursor && (
          <Button
            type="button"
            variant="outline"
            disabled={searching}
            onClick={() => void search(result.meta.nextCursor!)}
          >
            More stock results
          </Button>
        )}
        <div className={styles.field}>
          <label htmlFor="import-mode">Import mode</label>
          <select
            id="import-mode"
            value={draft.mode}
            onChange={(event) => change({ mode: event.target.value })}
          >
            <option value="INITIAL">Initial history</option>
            <option value="INCREMENTAL">Incremental update</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="provider">Provider / source name</label>
          <input
            id="provider"
            required
            maxLength={120}
            value={draft.provider}
            onChange={(event) => change({ provider: event.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="source-reference">Source reference</label>
          <input
            id="source-reference"
            required
            maxLength={500}
            value={draft.reference}
            onChange={(event) => change({ reference: event.target.value })}
          />
        </div>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="price-basis">Price basis</label>
            <select
              id="price-basis"
              value={draft.basis}
              onChange={(event) => change({ basis: event.target.value })}
            >
              <option value="UNKNOWN">Unknown — cannot confirm</option>
              <option value="RAW">Raw</option>
              <option value="ADJUSTED">Adjusted</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="adjustment-version">
              Adjustment version {draft.basis === 'ADJUSTED' ? '(required)' : '(optional)'}
            </label>
            <input
              id="adjustment-version"
              maxLength={120}
              value={draft.adjustmentVersion}
              onChange={(event) => change({ adjustmentVersion: event.target.value })}
            />
          </div>
        </div>
        <p className={styles.muted}>
          Source metadata is declared, not proof of verified prices. Backend reference and source
          approval is still required.
        </p>
      </section>
      <section className={styles.panel} aria-label="File and mapping">
        <h2>2. File &amp; mapping</h2>
        <div className={styles.upload}>
          <Upload aria-hidden="true" />
          <h3>Upload single-stock history</h3>
          <div className={styles.field}>
            <label htmlFor="import-file">CSV or XLSX file</label>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => change({ file: event.target.files?.[0] ?? null })}
              aria-describedby="file-help"
            />
          </div>
          <p id="file-help" className={styles.muted}>
            One file, up to 3 MiB and 5,000 rows. Files are validated on the server.
          </p>
          {draft.file && (
            <p className="break-all text-xs">
              Selected: {draft.file.name} · {draft.file.size} bytes
            </p>
          )}
        </div>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="range-from">Requested range from</label>
            <input
              id="range-from"
              type="date"
              required
              value={draft.from}
              onChange={(event) => change({ from: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="range-to">Requested range to</label>
            <input
              id="range-to"
              type="date"
              required
              value={draft.to}
              onChange={(event) => change({ to: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="date-mode">Date mode</label>
            <select
              id="date-mode"
              value={draft.dateMode}
              onChange={(event) => change({ dateMode: event.target.value })}
            >
              <option value="ISO">ISO (YYYY-MM-DD)</option>
              <option value="EXCEL_SERIAL">Excel serial (XLSX only)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="minimum-history">History-warning threshold (sessions)</label>
            <input
              id="minimum-history"
              type="number"
              min={0}
              max={5000}
              step={1}
              required
              value={draft.minimum}
              onChange={(event) => change({ minimum: event.target.value })}
              aria-describedby="history-help"
            />
          </div>
        </div>
        <p id="history-help" className={styles.muted}>
          The editable 200-session default is a history warning threshold, separate from screening
          eligibility and DMA requirements.
        </p>
        <div className={styles.field}>
          <label htmlFor="expected-session">Expected completed session (optional)</label>
          <input
            id="expected-session"
            type="date"
            value={draft.expected}
            onChange={(event) => change({ expected: event.target.value })}
            aria-describedby="expected-help"
          />
        </div>
        <p id="expected-help" className={styles.muted}>
          Leave blank for unknown (null). Session dates use Asia/Kolkata; the backend independently
          assesses publication freshness.
        </p>
        <h3>Column mapping</h3>
        <p className={styles.muted}>
          Editable canonical defaults, not automatic detection. Enter exact header names. Blank
          optional mappings are ignored.
        </p>
        <div className={styles.fields}>
          {(Object.keys(draft.mapping) as (keyof ImportDraft['mapping'])[]).map((field) => (
            <div className={styles.field} key={field}>
              <label htmlFor={`mapping-${field}`}>
                {field[0]!.toUpperCase() + field.slice(1)} column{' '}
                {['volume', 'symbol'].includes(field) ? '(optional)' : '(required)'}
              </label>
              <input
                id={`mapping-${field}`}
                maxLength={120}
                value={draft.mapping[field]}
                onChange={(event) =>
                  change({ mapping: { ...draft.mapping, [field]: event.target.value } })
                }
              />
            </div>
          ))}
        </div>
      </section>
    </fieldset>
  );
}

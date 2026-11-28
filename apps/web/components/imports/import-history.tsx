'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ImportBatchesResponse } from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import { getImportHistory, ImportRequestError } from '@/lib/api/imports';
import styles from './imports.module.css';

export const statusLabel = {
  QUEUED: 'Queued',
  VALIDATING: 'Validating',
  UPSERTING: 'Processing prices',
  COMPLETED: 'Price import complete',
  FAILED_RETRYABLE: 'Interrupted — recovery pending',
  FAILED_FINAL: 'Failed — final',
};
export function ImportHistory({
  initial,
  onAccessLost,
}: {
  initial: ImportBatchesResponse | null;
  onAccessLost(error: ImportRequestError): void;
}) {
  const [history, setHistory] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(more = false) {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setError('');
    try {
      const result = await getImportHistory(
        more ? (history?.meta.nextCursor ?? undefined) : undefined,
        abort.signal,
      );
      if (!abort.signal.aborted)
        setHistory({
          ...result,
          data: more
            ? [
                ...(history?.data ?? []),
                ...result.data.filter(
                  (row) => !history?.data.some((previous) => previous.jobId === row.jobId),
                ),
              ]
            : result.data,
        });
    } catch (error) {
      if (!abort.signal.aborted) {
        if (error instanceof ImportRequestError && [401, 403].includes(error.status)) {
          setHistory(null);
          onAccessLost(error);
        } else
          setError('History could not be refreshed. Any displayed entries may be out of date.');
      }
    } finally {
      if (!abort.signal.aborted) {
        controller.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section className={styles.panel} aria-label="Import history">
      <div className={styles.historyHeading}>
        <div>
          <h2>Import history</h2>
          <p className={styles.muted}>
            Your family’s confirmed imports. Preview counts are not final processing counts.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void load()}>
          {pending ? 'Refreshing history…' : 'Refresh history'}
        </Button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!history ? (
        <p className={styles.muted}>History is not connected. Refresh to try again.</p>
      ) : history.data.length === 0 ? (
        <p className={styles.muted}>No confirmed imports were returned for your family.</p>
      ) : (
        <ul className={styles.history}>
          {history.data.map((row) => (
            <li key={row.jobId}>
              <div className={styles.historyHeading}>
                <h3>
                  {row.symbol ?? 'Stock reference unavailable'} · {row.fileFormat}
                </h3>
                <span className={styles.badge}>{statusLabel[row.status]}</span>
              </div>
              <p className={styles.muted}>
                Uploaded range: {row.dateRange.from} – {row.dateRange.to} · Preview valid:{' '}
                {row.rows.valid} · Changed: {row.rows.changed}
              </p>
              <p className={styles.muted}>
                Confirmed:{' '}
                <time dateTime={row.confirmedAt}>
                  {row.confirmedAt.replace('T', ' ').replace('.000Z', ' UTC')}
                </time>
              </p>
              {row.status === 'QUEUED' && !row.executionAvailable && (
                <p className={styles.muted}>Awaiting operator-controlled execution.</p>
              )}
              {row.status === 'COMPLETED' && (
                <p className={styles.muted}>
                  Price processing complete. Indicator calculations remain deferred.
                </p>
              )}
              <Link href={`/admin/imports/jobs/${row.jobId}`}>
                View job details<span className="sr-only"> for {row.symbol ?? row.jobId}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {history?.meta.nextCursor && (
        <Button type="button" variant="outline" disabled={pending} onClick={() => void load(true)}>
          Load older imports
        </Button>
      )}
    </section>
  );
}

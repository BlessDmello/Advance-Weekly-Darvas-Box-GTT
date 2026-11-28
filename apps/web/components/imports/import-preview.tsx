'use client';
import { useEffect, useState } from 'react';
import type { ImportPreviewResponse } from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ImportCounts, ImportDiagnostics } from './import-diagnostics';
import styles from './imports.module.css';

export function ImportPreview({
  preview,
  pending,
  uncertain,
  reason,
  onReason,
  onConfirm,
}: {
  preview: ImportPreviewResponse['data'];
  pending: boolean;
  uncertain: boolean;
  reason: string;
  onReason(value: string): void;
  onConfirm(): Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired = Date.parse(preview.expiresAt) <= now;
  const canConfirm =
    preview.committable &&
    !expired &&
    (!preview.correctionPreview.requiresReason || Boolean(reason.trim()));
  return (
    <section className={styles.panel} aria-label="Import preview">
      <div className={styles.historyHeading}>
        <h2>3. Review preview</h2>
        <span className={styles.badge}>
          {expired ? 'Expired' : preview.committable ? 'Ready for confirmation' : 'Blocked'}
        </span>
      </div>
      <p className={styles.muted}>
        {preview.symbol} · {preview.fileFormat} · Requested range: {preview.dateRange.from} –{' '}
        {preview.dateRange.to}
      </p>
      <ImportCounts
        values={{
          'Rows read': preview.rows.read,
          'Valid rows': preview.rows.valid,
          'New rows': preview.rows.new,
          'Changed rows': preview.rows.changed,
          'Unchanged rows': preview.rows.unchanged,
          'Rejected rows': preview.rows.rejected,
        }}
      />
      <p className={styles.muted}>
        Original rows: {preview.normalization.original} · Normalized:{' '}
        {preview.normalization.normalized} · Identical duplicates:{' '}
        {preview.normalization.identicalDuplicates} · Conflicting duplicates:{' '}
        {preview.normalization.conflictingDuplicates}
      </p>
      <dl className={styles.details}>
        <div>
          <dt>Calendar coverage</dt>
          <dd>{preview.completeness.coverage}</dd>
        </div>
        <div>
          <dt>Calendar version</dt>
          <dd>{preview.completeness.calendarVersion ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>Session completeness</dt>
          <dd>{preview.completeness.complete ? 'Complete' : 'Incomplete'}</dd>
        </div>
        <div>
          <dt>Expected sessions in range</dt>
          <dd>{preview.completeness.expectedSessionCount}</dd>
        </div>
        <div>
          <dt>Missing sessions</dt>
          <dd>{preview.completeness.missingSessionCount}</dd>
        </div>
        <div>
          <dt>Latest uploaded session</dt>
          <dd>{preview.completeness.latestSession ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>Preview freshness</dt>
          <dd>{preview.completeness.freshness}</dd>
        </div>
        <div>
          <dt>Preview expires</dt>
          <dd>
            <time dateTime={preview.expiresAt}>
              {new Date(preview.expiresAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}
            </time>
          </dd>
        </div>
      </dl>
      {preview.missingSessions.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">Missing-session dates</summary>
          <p className={`${styles.muted} break-words`}>{preview.missingSessions.join(', ')}</p>
        </details>
      )}
      <ImportDiagnostics
        title="Blocking errors"
        entries={preview.blockingErrors}
        total={preview.errorCount}
      />
      <ImportDiagnostics title="Warnings" entries={preview.warnings} total={preview.warningCount} />
      {preview.diagnosticsTruncated && (
        <p className={styles.muted}>
          The backend returned bounded diagnostic samples. Totals may exceed visible entries.
        </p>
      )}
      {expired && (
        <p role="status" className={styles.notice}>
          This preview expired. Validate again before a new confirmation. An uncertain prior
          confirmation can still be checked using the same action.
        </p>
      )}
      {!preview.committable && (
        <p className={styles.error}>
          Confirmation is blocked. Resolve validation or missing reference data, then validate
          again.
        </p>
      )}
      {preview.correctionPreview.requiresReason && (
        <div className={styles.field}>
          <label htmlFor="correction-reason">Historical correction reason (required)</label>
          <textarea
            id="correction-reason"
            maxLength={500}
            value={reason}
            disabled={pending || uncertain}
            onChange={(event) => onReason(event.target.value)}
          />
          <p className={styles.muted}>
            {preview.correctionPreview.changed} historical records change. Basis conflicts:{' '}
            {preview.correctionPreview.basisConflicts}.
          </p>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" disabled={pending || (!uncertain && !canConfirm)}>
            {uncertain ? 'Check same confirmation' : 'Review & confirm import'}
          </Button>
        </DialogTrigger>
        <DialogContent
          className={`public-page fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-xl ${styles.workspace} ${styles.dialog}`}
        >
          <DialogTitle>Confirm price import</DialogTitle>
          <DialogDescription>
            Confirm {preview.rows.valid} validated rows for {preview.symbol}. This queues price
            processing only; indicator calculations remain deferred. Execution may require an
            operator.
          </DialogDescription>
          {uncertain && (
            <p className={styles.notice}>
              The previous response was uncertain. This request reuses the original key and payload;
              it cannot create a second logical confirmation.
            </p>
          )}
          <div className={styles.actions}>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={pending || (!uncertain && !canConfirm)}
              onClick={() => {
                void onConfirm().finally(() => setOpen(false));
              }}
            >
              {pending ? 'Confirming…' : uncertain ? 'Retry same confirmation' : 'Confirm import'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

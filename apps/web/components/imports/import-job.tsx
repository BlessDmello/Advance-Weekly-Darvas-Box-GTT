'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { importRetryInputSchema, type ImportJobResponse } from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import { getImportJob, ImportRequestError, retryImport } from '@/lib/api/imports';
import { ImportCounts, ImportScopeNotice } from './import-diagnostics';
import { statusLabel } from './import-history';
import styles from './imports.module.css';

type Job = ImportJobResponse['data'];
const phases = [
  ['QUEUED', 'Queued'],
  ['VALIDATING', 'Validate confirmed data'],
  ['UPSERTING', 'Build price generation'],
  ['CHECKING_QUALITY', 'Check dataset quality'],
  ['READY_TO_PUBLISH', 'Prepare atomic publication'],
  ['COMPLETED', 'Price processing complete'],
] as const;
const terminal = (job: Job) => ['COMPLETED', 'FAILED_FINAL'].includes(job.status);
export function ImportJob({ initial }: { initial: Job }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(initial);
  const latest = useRef<Job>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [denied, setDenied] = useState(false);
  const flight = useRef(false),
    alive = useRef(true),
    stopped = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<{ key: string; reason: string } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  function stop() {
    stopped.current = true;
    controller.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }
  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    if (
      alive.current &&
      !stopped.current &&
      !document.hidden &&
      !terminal(latest.current) &&
      latest.current.executionAvailable
    )
      timer.current = setTimeout(() => {
        void refreshRef.current();
      }, 5000);
  }
  async function refresh() {
    if (flight.current || stopped.current || !alive.current) return;
    if (timer.current) clearTimeout(timer.current);
    flight.current = true;
    setPending(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const next = await getImportJob(initial.jobId, abort.signal);
      if (alive.current && !abort.signal.aborted) {
        latest.current = next;
        setJob(next);
      }
    } catch (error) {
      if (alive.current && !abort.signal.aborted) {
        if (error instanceof ImportRequestError && [401, 403, 404].includes(error.status)) {
          stop();
          retry.current = null;
          setJob(null);
          setDenied(true);
          setReason('');
          setError(error.message);
          if (error.status === 401) router.replace('/login');
        } else
          setError(
            'Status could not be refreshed. Displayed information is the last verified response, not a new job failure.',
          );
      }
    } finally {
      flight.current = false;
      if (alive.current) {
        setPending(false);
        schedule();
      }
    }
  }
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    alive.current = true;
    stopped.current = false;
    const visibility = () => {
      if (document.hidden) {
        if (timer.current) clearTimeout(timer.current);
        controller.current?.abort();
      } else if (!terminal(latest.current) && latest.current.executionAvailable)
        void refreshRef.current();
    };
    document.addEventListener('visibilitychange', visibility);
    if (!terminal(latest.current) && latest.current.executionAvailable)
      timer.current = setTimeout(() => {
        void refreshRef.current();
      }, 5000);
    return () => {
      alive.current = false;
      stopped.current = true;
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function requestRetry() {
    if (flight.current || stopped.current || !job) return;
    if (!retry.current) {
      if (
        !job.executionAvailable ||
        !job.recovery?.retryAllowed ||
        job.recovery.blocked ||
        terminal(job)
      )
        return;
      const valid = importRetryInputSchema.safeParse({ reason });
      if (!valid.success) {
        setError('Enter a retry reason (1–500 characters).');
        return;
      }
      retry.current = { key: crypto.randomUUID(), reason: valid.data.reason };
    }
    if (timer.current) clearTimeout(timer.current);
    flight.current = true;
    setPending(true);
    setError('');
    setNotice('');
    let accepted = false;
    try {
      await retryImport(initial.jobId, retry.current.reason, retry.current.key);
      accepted = true;
      if (alive.current) {
        retry.current = null;
        setUncertain(false);
        setReason('');
        setNotice(
          'Resume request accepted. Refreshing verified status; processing completion is not yet confirmed.',
        );
      }
    } catch (error) {
      if (alive.current) {
        if (error instanceof ImportRequestError && [401, 403, 404].includes(error.status)) {
          stop();
          retry.current = null;
          setJob(null);
          setDenied(true);
          setError(error.message);
          if (error.status === 401) router.replace('/login');
        } else {
          setUncertain(error instanceof ImportRequestError ? error.uncertain : true);
          setError(
            error instanceof ImportRequestError
              ? error.message
              : 'Retry outcome is unknown. Retry the same action or refresh status.',
          );
        }
      }
    } finally {
      flight.current = false;
      if (alive.current) {
        setPending(false);
        if (!stopped.current) {
          if (accepted) await refreshRef.current();
          else schedule();
        }
      }
    }
  }
  if (!job || denied)
    return (
      <section className={styles.workspace}>
        <h1>Import unavailable</h1>
        <p role="alert">{error}</p>
        <Link href="/dashboard">Back to Workspace</Link>
      </section>
    );
  const canRetry =
    !terminal(job) && job.executionAvailable && job.recovery?.retryAllowed && !job.recovery.blocked;
  return (
    <section className={styles.workspace} aria-label="Import job details">
      <header className={styles.intro}>
        <Link href="/admin/imports">Back to imports</Link>
        <p className={styles.eyebrow}>Administration · Price processing</p>
        <h1>Import Job Details</h1>
        <p className={styles.muted}>
          Job <span className="break-all">{job.jobId}</span>
        </p>
        <div role="status">
          <span className={styles.badge}>
            {statusLabel[job.status]} · {job.phase.replaceAll('_', ' ')}
          </span>
        </div>
      </header>
      <ImportScopeNotice />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {job.status === 'QUEUED' && !job.executionAvailable && (
        <p className={styles.notice}>
          Queued — awaiting operator-controlled execution. The runner is disabled. Automatic
          processing has not started.
        </p>
      )}
      {job.status !== 'QUEUED' && !job.executionAvailable && !terminal(job) && (
        <p className={styles.notice}>
          Execution is currently unavailable. An operator must review this job. Manual refresh
          remains available.
        </p>
      )}
      {job.status === 'COMPLETED' && (
        <p className={styles.notice}>
          Price processing is complete. Indicator calculations remain deferred. No trading signals
          or screening eligibility were calculated.
        </p>
      )}
      {job.status === 'FAILED_FINAL' && (
        <p className={styles.error}>
          This job has permanently failed. It cannot be retried. Review diagnostics and operator
          guidance before creating a new preview. This job did not replace the previously published
          dataset.
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void refresh()}
        >
          {pending ? 'Request in progress…' : 'Refresh status'}
        </Button>
        <p className={styles.muted}>
          {!terminal(job) && job.executionAvailable
            ? 'Checks every 5 seconds while this page is visible.'
            : 'Automatic polling is paused. Use manual refresh.'}
        </p>
      </div>
      <ImportCounts
        values={{
          Processed: job.processed,
          Total: job.total,
          Inserted: job.inserted,
          Updated: job.updated,
          Unchanged: job.unchanged,
          Failed: job.failed,
        }}
      />
      <p className={styles.muted}>
        Processing counters describe the job checkpoint. Candidate writes do not imply published
        prices until the job completes.
      </p>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Processing stages</h2>
          <ol className={styles.timeline}>
            {phases.map(([phase, label]) => (
              <li key={phase} aria-current={job.phase === phase ? 'step' : undefined}>
                {label}
                {job.phase === phase ? ' · Current recorded phase' : ''}
              </li>
            ))}
          </ol>
          <dl className={styles.details}>
            <div>
              <dt>Started (UTC)</dt>
              <dd>{job.startedAt ?? 'Not started'}</dd>
            </div>
            <div>
              <dt>Finished (UTC)</dt>
              <dd>{job.finishedAt ?? 'Not finished'}</dd>
            </div>
          </dl>
        </section>
        <section className={styles.panel}>
          <h2>Dataset quality</h2>
          {job.quality ? (
            <>
              <p className={styles.muted}>
                Assessment covers the complete candidate generation, including retained history,
                rather than only the uploaded interval.
              </p>
              <dl className={styles.details}>
                <div>
                  <dt>Full dataset range</dt>
                  <dd>
                    {job.quality.range.from} – {job.quality.range.to}
                  </dd>
                </div>
                <div>
                  <dt>Dataset rows</dt>
                  <dd>{job.quality.rowCount}</dd>
                </div>
                <div>
                  <dt>Valid / complete</dt>
                  <dd>
                    {job.quality.valid ? 'Valid' : 'Invalid'} /{' '}
                    {job.quality.complete ? 'Complete' : 'Incomplete'}
                  </dd>
                </div>
                <div>
                  <dt>Freshness</dt>
                  <dd>{job.quality.freshness}</dd>
                </div>
                <div>
                  <dt>Latest session</dt>
                  <dd>{job.quality.latestSession}</dd>
                </div>
                <div>
                  <dt>Expected session</dt>
                  <dd>{job.quality.expectedSession ?? 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Calendar version</dt>
                  <dd>{job.quality.calendarVersion ?? 'Unknown'}</dd>
                </div>
              </dl>
              <h3>Quality warnings</h3>
              {job.quality.warnings.length ? (
                <ul className={styles.diagnostics}>
                  {job.quality.warnings.map((code) => (
                    <li key={code}>{code.replaceAll('_', ' ')}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>No warnings reported by the quality assessment.</p>
              )}
            </>
          ) : (
            <p className={styles.muted}>
              Final quality assessment is not available. Freshness is Unknown; completion and
              eligibility cannot be inferred.
            </p>
          )}
        </section>
      </div>
      <section className={styles.panel}>
        <h2>Recovery &amp; diagnostics</h2>
        {job.errors.length ? (
          <ul className={styles.diagnostics}>
            {job.errors.map((error, index) => (
              <li key={index}>{error.code.replaceAll('_', ' ')}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No diagnostic codes returned.</p>
        )}
        {job.recovery && (
          <dl className={styles.details}>
            <div>
              <dt>Automatic recoveries</dt>
              <dd>{job.recovery.automaticRecoveries}</dd>
            </div>
            <div>
              <dt>Next recorded attempt (UTC)</dt>
              <dd>{job.recovery.nextAttemptAt ?? 'Not scheduled'}</dd>
            </div>
            <div>
              <dt>Recovery blocked</dt>
              <dd>{job.recovery.blocked ? 'Yes — operator review required' : 'No'}</dd>
            </div>
            <div>
              <dt>Staging payload retired</dt>
              <dd>{job.recovery.payloadRetired ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
        )}
        {uncertain && (
          <p className={styles.notice}>
            Retry outcome unknown. The same key and reason are retained in memory. Check status or
            resend the same action. Navigation loses this recovery key.
          </p>
        )}
        {canRetry || uncertain ? (
          <div className="space-y-4">
            <div className={styles.field}>
              <label htmlFor="retry-reason">Retry reason (required)</label>
              <textarea
                id="retry-reason"
                value={reason}
                maxLength={500}
                disabled={pending || uncertain}
                onChange={(event) => {
                  setReason(event.target.value);
                  retry.current = null;
                }}
              />
            </div>
            <Button
              type="button"
              disabled={pending || (!uncertain && !canRetry)}
              onClick={() => void requestRetry()}
            >
              {uncertain ? 'Retry same request' : 'Request eligible retry'}
            </Button>
          </div>
        ) : (
          !terminal(job) && (
            <p className={styles.muted}>
              Manual retry is not currently available. Eligibility is determined by the backend;
              status alone does not grant retry permission.
            </p>
          )
        )}
      </section>
    </section>
  );
}

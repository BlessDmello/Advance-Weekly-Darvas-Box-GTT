'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ImportBatchesResponse,
  ImportPreviewResponse,
  ImportCommitInput,
} from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import { confirmImport, ImportRequestError, previewImport } from '@/lib/api/imports';
import {
  ImportUploadForm,
  emptyDraft,
  validateDraft,
  type ImportDraft,
} from './import-upload-form';
import { ImportPreview } from './import-preview';
import { ImportHistory } from './import-history';
import { ImportScopeNotice } from './import-diagnostics';
import styles from './imports.module.css';

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ImportWorkspace({ initial }: { initial: ImportBatchesResponse | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyDraft);
  const [preview, setPreview] = useState<ImportPreviewResponse['data'] | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const flight = useRef(false),
    alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const confirmation = useRef<{ key: string; input: ImportCommitInput } | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  function accessLost(error: ImportRequestError) {
    controller.current?.abort();
    confirmation.current = null;
    setPreview(null);
    setDraft(emptyDraft());
    setDenied(true);
    if (error.status === 401) router.replace('/login');
    else setError(error.message);
  }
  function change(next: ImportDraft) {
    if (flight.current || uncertain) return;
    setDraft(next);
    setPreview(null);
    setReason('');
    confirmation.current = null;
    setError('');
  }
  async function validate() {
    if (flight.current || denied || uncertain) return;
    setPreview(null);
    confirmation.current = null;
    setReason('');
    setError('');
    const validated = validateDraft(draft);
    if (typeof validated === 'string') {
      setError(validated);
      requestAnimationFrame(() => feedback.current?.focus());
      return;
    }
    flight.current = true;
    setPending(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await previewImport(validated.input, validated.file, abort.signal);
      if (alive.current && !abort.signal.aborted) setPreview(result);
    } catch (error) {
      if (alive.current && !abort.signal.aborted) {
        if (error instanceof ImportRequestError && [401, 403].includes(error.status))
          accessLost(error);
        else
          setError(
            error instanceof ImportRequestError && !error.uncertain
              ? error.message
              : 'Preview could not be validated. Validate again; no import confirmation was sent.',
          );
      }
    } finally {
      flight.current = false;
      if (alive.current) setPending(false);
    }
  }
  async function confirm() {
    if (flight.current || denied || !preview) return;
    if (!confirmation.current) {
      if (
        !preview.committable ||
        Date.parse(preview.expiresAt) <= Date.now() ||
        (preview.correctionPreview.requiresReason && !reason.trim())
      )
        return;
      confirmation.current = {
        key: crypto.randomUUID(),
        input: { previewToken: preview.previewToken, correctionReason: reason.trim() || null },
      };
    }
    flight.current = true;
    setPending(true);
    setError('');
    try {
      const result = await confirmImport(confirmation.current.input, confirmation.current.key);
      if (alive.current) {
        setPreview(null);
        confirmation.current = null;
        setUncertain(false);
        router.push(`/admin/imports/jobs/${result.jobId}`);
      }
    } catch (error) {
      if (alive.current) {
        if (error instanceof ImportRequestError && [401, 403].includes(error.status))
          accessLost(error);
        else {
          setUncertain(error instanceof ImportRequestError ? error.uncertain : true);
          setError(
            error instanceof ImportRequestError
              ? error.message
              : 'Confirmation outcome is unknown. Check history or retry the same confirmation.',
          );
        }
      }
    } finally {
      flight.current = false;
      if (alive.current) setPending(false);
    }
  }
  if (denied)
    return (
      <section className={styles.workspace}>
        <h1>Market data imports unavailable</h1>
        <p role="alert">{error || 'Your session has expired.'}</p>
        <Link href="/login">Sign in again</Link>
      </section>
    );
  return (
    <section className={styles.workspace} aria-label="Market data import workspace">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Administration · Historical prices</p>
        <h1>Market Data Import</h1>
        <p className={styles.muted}>
          Upload historical prices for one approved NSE stock at a time. Review validation before
          confirming any changes.
        </p>
      </header>
      <ImportScopeNotice />
      <ol className={styles.steps} aria-label="Import steps">
        <li aria-current={!preview ? 'step' : undefined}>
          <span>01</span> Stock &amp; file
        </li>
        <li aria-current={preview ? 'step' : undefined}>
          <span>02</span> Review preview
        </li>
        <li>
          <span>03</span> Price processing
        </li>
      </ol>
      {error && (
        <p
          id="import-form-error"
          ref={feedback}
          tabIndex={-1}
          role="alert"
          className={styles.error}
        >
          {error}
        </p>
      )}
      {uncertain && (
        <p className={styles.notice}>
          Confirmation outcome unknown. Inputs are locked to preserve this action. Check import
          history below or retry the same confirmation. Refreshing or leaving this page loses the
          in-memory recovery key; check history before starting again.
        </p>
      )}
      <form
        aria-label="Prepare import preview"
        aria-describedby={error ? 'import-form-error' : undefined}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void validate();
        }}
      >
        <ImportUploadForm
          draft={draft}
          disabled={!hydrated || pending || uncertain}
          onChange={change}
          onAccessLost={accessLost}
        />
        <div className={`${styles.actions} mt-5`}>
          <Button type="submit" disabled={!hydrated || pending || uncertain} aria-busy={pending}>
            {pending ? 'Request in progress…' : preview ? 'Validate again' : 'Validate & preview'}
          </Button>
          <p className={styles.muted}>
            Validation creates a temporary preview, not a published dataset.
          </p>
        </div>
      </form>
      {preview && (
        <ImportPreview
          key={preview.previewToken}
          preview={preview}
          pending={pending}
          uncertain={uncertain}
          reason={reason}
          onReason={(value) => {
            setReason(value);
            confirmation.current = null;
          }}
          onConfirm={confirm}
        />
      )}
      <ImportHistory initial={initial} onAccessLost={accessLost} />
    </section>
  );
}

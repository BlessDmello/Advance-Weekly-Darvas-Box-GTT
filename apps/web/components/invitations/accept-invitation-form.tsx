'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { acceptInvitationSchema, invitationTokenSchema } from '@darvas/contracts';
import type { InvitationVerification } from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LogoutButton } from '@/components/auth/logout-button';
import { acceptInvitation, InvitationRequestError, verifyInvitation } from '@/lib/api/invitations';
import styles from './invitations.module.css';

export function AcceptInvitationForm({ signedIn = false }: { signedIn?: boolean }) {
  const token = useRef('');
  const started = useRef(false);
  const verificationVersion = useRef(0);
  const name = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const [verification, setVerification] = useState<InvitationVerification | null>(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);
  useEffect(() => {
    const readLink = () => {
      if (started.current && !window.location.hash) return;
      started.current = true;
      const version = ++verificationVersion.current;
      token.current = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
      window.history.replaceState(null, '', window.location.pathname);
      setCreated(false);
      setVerification(null);
      setError('');
      setErrors({});
      setPending(false);
      setVisible(false);
      if (!invitationTokenSchema.safeParse(token.current).success) {
        setVerification({ state: 'INVALID' });
        return;
      }
      if (!signedIn)
        void verifyInvitation(token.current)
          .then((value) => {
            if (verificationVersion.current === version) setVerification(value);
          })
          .catch(() => {
            if (verificationVersion.current === version)
              setError(
                'This invitation could not be verified. Reopen the email link to try again.',
              );
          });
    };
    window.addEventListener('hashchange', readLink);
    readLink();
    return () => window.removeEventListener('hashchange', readLink);
  }, [signedIn]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || verification?.state !== 'VALID') return;
    const input = {
      token: token.current,
      displayName: name.current?.value ?? '',
      password: password.current?.value ?? '',
    };
    const parsed = acceptInvitationSchema.safeParse(input);
    const next: Record<string, string> = {};
    if (!input.displayName.trim() || input.displayName.trim().length > 100)
      next.name = 'Enter a display name of 1 to 100 characters.';
    if (!parsed.success && !next.name) next.password = 'Use a password of 15 to 128 characters.';
    if (!confirm.current?.value || input.password !== confirm.current.value)
      next.confirm = 'Passwords must match.';
    setErrors(next);
    setError('');
    if (Object.keys(next).length) {
      (next.name ? name.current : next.password ? password.current : confirm.current)?.focus();
      return;
    }
    setPending(true);
    const version = verificationVersion.current;
    try {
      await acceptInvitation(parsed.data!);
      if (verificationVersion.current === version) {
        token.current = '';
        setCreated(true);
      }
    } catch (error) {
      if (verificationVersion.current === version)
        setError(
          error instanceof InvitationRequestError
            ? error.message
            : 'Account creation could not be confirmed. Try signing in before requesting another invitation.',
        );
    } finally {
      if (verificationVersion.current === version) {
        if (password.current) password.current.value = '';
        if (confirm.current) confirm.current.value = '';
        setPending(false);
      }
    }
  }
  if (signedIn)
    return (
      <Card className="space-y-5 p-8">
        <h1 className="text-2xl font-semibold">You are already signed in</h1>
        <p>Sign out, then reopen the invitation email to create a new account.</p>
        <LogoutButton />
        <Link href="/dashboard" className={styles.link}>
          Back to your workspace
        </Link>
      </Card>
    );
  if (created)
    return (
      <Card className="space-y-5 p-8">
        <h1 className="text-2xl font-semibold">Your account has been created</h1>
        <p>You can now sign in with your new credentials.</p>
        <Link className={styles.link} href="/login">
          Sign In to Workspace
        </Link>
      </Card>
    );
  if (!verification || verification.state !== 'VALID') {
    const titles = {
      INVALID: 'Invalid invitation',
      EXPIRED: 'Invitation expired',
      CONSUMED: 'Invitation already accepted',
      REVOKED: 'Invitation revoked',
    };
    return (
      <Card className="space-y-5 p-8" aria-live="polite">
        <h1 className="text-2xl font-semibold">
          {verification
            ? titles[verification.state]
            : error
              ? 'Invitation unavailable'
              : 'Checking your invitation…'}
        </h1>
        <p>
          {error ||
            (verification?.state === 'CONSUMED'
              ? 'This link has already been used. Sign in to your account.'
              : verification
                ? 'Ask your family Admin for a new invitation.'
                : 'Please wait while your invitation is verified.')}
        </p>
        <Link href="/login" className={styles.link}>
          Back to Sign In
        </Link>
        <noscript>
          <p>
            JavaScript is required to verify and accept your invitation. No credentials are
            submitted without it.
          </p>
        </noscript>
      </Card>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-6 sm:p-8">
        <p className="mb-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          INVITE-ONLY · PRIVATE ACCESS
        </p>
        <h1 className="mb-3 text-3xl font-semibold">You’ve been invited</h1>
        <p className="mb-7">Create your account to join your family workspace.</p>
        <form noValidate onSubmit={submit} className={styles.form} aria-label="Accept invitation">
          <fieldset disabled={pending}>
            <legend className="sr-only">Create your member account</legend>
            <p className="break-all">
              Invited email: <strong>{verification.email}</strong>
            </p>
            <div className={styles.field}>
              <label htmlFor="accept-name">Display name</label>
              <input
                ref={name}
                id="accept-name"
                required
                autoComplete="name"
                maxLength={100}
                className={styles.input}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'accept-name-error' : undefined}
              />
              {errors.name && (
                <p id="accept-name-error" role="alert" className={styles.error}>
                  {errors.name}
                </p>
              )}
            </div>
            <div className={styles.field}>
              <label htmlFor="accept-password">Create password</label>
              <input
                ref={password}
                id="accept-password"
                type={visible ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className={styles.input}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'accept-password-error' : 'password-policy'}
              />
              <p id="password-policy" className="text-sm">
                Use 15 to 128 characters.
              </p>
              {errors.password && (
                <p id="accept-password-error" className={styles.error} role="alert">
                  {errors.password}
                </p>
              )}
              <Button
                variant="outline"
                type="button"
                aria-pressed={visible}
                aria-controls="accept-password accept-confirm"
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? 'Hide passwords' : 'Show passwords'}
              </Button>
            </div>
            <div className={styles.field}>
              <label htmlFor="accept-confirm">Confirm password</label>
              <input
                ref={confirm}
                id="accept-confirm"
                type={visible ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className={styles.input}
                aria-invalid={Boolean(errors.confirm)}
                aria-describedby={errors.confirm ? 'accept-confirm-error' : undefined}
              />
              {errors.confirm && (
                <p id="accept-confirm-error" className={styles.error} role="alert">
                  {errors.confirm}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
              {pending ? 'Creating your account…' : 'Accept Invitation & Create Account'}
            </Button>
          </fieldset>
        </form>
        <p className="mt-6 text-sm">
          Already have an account?{' '}
          <Link href="/login" className={styles.link}>
            Sign In
          </Link>
        </p>
      </Card>
      <Card className="h-fit space-y-5 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Your invitation</h2>
        <p className="break-words">
          <strong>Family:</strong> {verification.familyName}
        </p>
        <p className="break-words">
          <strong>Invited by:</strong> {verification.inviterName}
        </p>
        <p>
          <strong>Account role:</strong> Member
        </p>
        <p>
          <strong>Expires:</strong>{' '}
          <time dateTime={verification.expiresAt}>
            {new Date(verification.expiresAt).toLocaleString()}
          </time>
        </p>
        <p className="text-sm">
          Invitations are single use and valid for 72 hours. Your account is private; an Admin role
          does not grant access to another member’s portfolios.
        </p>
      </Card>
    </div>
  );
}

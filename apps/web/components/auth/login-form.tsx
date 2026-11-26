'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from './login.module.css';
import { useRouter } from 'next/navigation';
import { AuthRequestError, signIn } from '@/lib/api/auth';

type Field = 'email' | 'password';
type Errors = Partial<Record<Field, string>>;
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LoginForm() {
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();
  // Prevent native credential submission before hydration or when JavaScript is unavailable.
  const interactive = useSyncExternalStore(subscribe, clientReady, serverReady);

  function clearFeedback(field: Field) {
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setFeedback('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = emailRef.current;
    const password = passwordRef.current;
    if (!email || !password || pending) return;
    const nextErrors: Errors = {};
    if (!email.value.trim()) nextErrors.email = 'Email address is required.';
    else if (email.validity.typeMismatch) nextErrors.email = 'Enter a valid email address.';
    if (!password.value) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);
    if (nextErrors.email) email.focus();
    else if (nextErrors.password) password.focus();
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    setFeedback('');
    try {
      await signIn(email.value, password.value, rememberMe);
      password.value = '';
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof AuthRequestError
          ? error.message
          : 'Sign-in is temporarily unavailable. Please try again.',
      );
    } finally {
      password.value = '';
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Sign in" className={styles.form}>
      <p id="login-availability" className={styles.availability}>
        Sign in with your family workspace account.
      </p>
      <fieldset
        disabled={!interactive || pending}
        className={styles.fields}
        aria-describedby="login-availability"
      >
        <legend className="sr-only">Sign-in details</legend>
        <div className={styles.field}>
          <label htmlFor="login-email">Email address</label>
          <div className={styles.inputWrap}>
            <Mail size={18} aria-hidden="true" />
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              onChange={() => clearFeedback('email')}
            />
          </div>
          {errors.email && (
            <p id="login-email-error" className={styles.error} role="alert">
              {errors.email}
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="login-password">Password</label>
          <div className={styles.inputWrap}>
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              ref={passwordRef}
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              onChange={() => clearFeedback('password')}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={styles.visibility}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-controls="login-password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          {errors.password && (
            <p id="login-password-error" className={styles.error} role="alert">
              {errors.password}
            </p>
          )}
        </div>
        <div className={styles.options}>
          <label className={styles.remember}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              aria-describedby="remember-note"
            />
            Remember Me
          </label>
          <div className={styles.recovery}>
            <button type="button" disabled aria-describedby="recovery-note">
              Forgot Password?
            </button>
            <span id="recovery-note">Coming soon</span>
          </div>
        </div>
        <p id="remember-note" className={styles.rememberNote}>
          Keep me signed in for up to seven days.
        </p>
        <Button type="submit" className={styles.submit} aria-busy={pending}>
          <LockKeyhole aria-hidden="true" />
          {pending ? 'Signing in…' : 'Sign In to Workspace'}
        </Button>
      </fieldset>
      <noscript>
        <p>JavaScript is required to sign in. No credentials are submitted without it.</p>
      </noscript>
      {feedback && (
        <p role="alert" className={styles.notice}>
          {feedback}
        </p>
      )}
    </form>
  );
}

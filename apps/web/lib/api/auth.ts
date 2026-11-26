import { authErrorSchema, authProfileSchema, csrfResponseSchema } from '@darvas/contracts';

export class AuthRequestError extends Error {}
async function csrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new AuthRequestError('Sign-in is temporarily unavailable. Please try again.');
  return csrfResponseSchema.parse(await response.json()).data.csrfToken;
}
export async function signIn(email: string, password: string, rememberMe: boolean): Promise<void> {
  const token = await csrfToken();
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify({ email, password, rememberMe }),
  });
  if (!response.ok) {
    const error = authErrorSchema.safeParse(await response.json().catch(() => null));
    const code = error.success ? error.data.error.code : '';
    throw new AuthRequestError(
      code === 'INVALID_CREDENTIALS'
        ? 'Email or password is incorrect.'
        : code === 'RATE_LIMITED'
          ? 'Too many sign-in attempts. Please try again later.'
          : code === 'CSRF_INVALID'
            ? 'Request verification failed. Please try again.'
            : 'Sign-in is temporarily unavailable. Please try again.',
    );
  }
  const login = authProfileSchema.parse(await response.json());
  const current = await fetch('/api/v1/auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (
    !current.ok ||
    authProfileSchema.parse(await current.json()).data.user.id !== login.data.user.id
  ) {
    throw new AuthRequestError('Your session could not be verified. Please try again.');
  }
}
export async function signOut(): Promise<void> {
  const token = await csrfToken();
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: '{}',
  });
  if (response.status !== 204 && response.status !== 401)
    throw new AuthRequestError('Sign-out could not be confirmed. Please try again.');
}

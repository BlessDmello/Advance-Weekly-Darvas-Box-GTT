import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequestError, signIn } from '@/lib/api/auth';
import type * as AuthClient from '@/lib/api/auth';
import { LoginPage } from './login-page';
import { LoginForm } from './login-form';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api/auth', async (original) => ({
  ...(await original<typeof AuthClient>()),
  signIn: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(signIn).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('login UI', () => {
  it('renders the approved copy, shared navigation, themes, and illustrative preview', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to your trading workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Advanced Darvas Box home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('group', { name: 'Color theme' })).toBeInTheDocument();
    expect(
      screen.getByRole('figure', { name: /Illustrative Preview — Not Live Market Data/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('DMA Bull Run')).toHaveLength(2);
    expect(screen.getAllByText('CAR confirmed')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /sign up/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot Password?' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Forgot Password?' })).toHaveAccessibleDescription(
      'Coming soon',
    );
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
  });

  it('associates required errors with fields and focuses the first invalid input', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      'Email address is required.',
    );
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAccessibleDescription(
      'Password is required.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('requires the password and focuses it when the email is valid', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText('Email address'), 'preview@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAccessibleDescription(
      'Password is required.',
    );
    expect(screen.getByLabelText('Password', { exact: true })).toHaveFocus();
    expect(screen.getByLabelText('Email address')).toHaveValue('preview@example.com');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('validates email format without discarding either input', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText('Email address'), 'invalid-email');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'ui-only-passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(screen.getByLabelText('Email address')).toHaveValue('invalid-email');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('ui-only-passphrase');
    await user.clear(screen.getByLabelText('Email address'));
    await user.type(screen.getByLabelText('Email address'), 'preview@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows and hides the existing password value accessibly', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const password = screen.getByLabelText('Password', { exact: true });
    await user.type(password, 'ui-only-passphrase');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('ui-only-passphrase');
  });

  it('passes Remember Me to authentication without persisting credentials', async () => {
    const user = userEvent.setup();
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<LoginForm />);
    const remember = screen.getByRole('checkbox', { name: 'Remember Me' });
    expect(remember).not.toBeChecked();
    await user.click(remember);
    expect(remember).toBeChecked();
    await user.click(remember);
    expect(remember).not.toBeChecked();
    await user.click(remember);
    await user.type(screen.getByLabelText('Email address'), 'preview@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'ui-only-passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(signIn).toHaveBeenCalledWith('preview@example.com', 'ui-only-passphrase', true);
    expect(screen.getByRole('button', { name: 'Sign In to Workspace' })).toBeEnabled();
    expect(storageSpy).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Password', { exact: true }), 'x');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('preserves email, clears the password and shows an accessible generic backend error', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(
      new AuthRequestError('Email or password is incorrect.'),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText('Email address'), 'preview@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'wrong-passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(screen.getByLabelText('Email address')).toHaveValue('preview@example.com');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows loading only while authentication is genuinely pending', async () => {
    let resolve!: () => void;
    vi.mocked(signIn).mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText('Email address'), 'preview@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'test-passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign In to Workspace' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolve();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('disables native form submission until client interaction is available', () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(<LoginForm />),
      'text/html',
    );
    expect(document.querySelector('fieldset')?.hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('noscript')?.textContent).toContain(
      'No credentials are submitted without it.',
    );
  });
});

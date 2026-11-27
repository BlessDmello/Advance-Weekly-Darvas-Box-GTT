import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceptInvitationForm } from './accept-invitation-form';
import { InviteMemberDialog } from './invite-member-dialog';
import { InvitationManager } from './invitation-manager';
import type { InvitationDto } from '@darvas/contracts';
import {
  acceptInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  sendInvitation,
  verifyInvitation,
} from '@/lib/api/invitations';
vi.mock('@/lib/api/invitations', () => ({
  acceptInvitation: vi.fn(),
  verifyInvitation: vi.fn(),
  sendInvitation: vi.fn(),
  listInvitations: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  InvitationRequestError: class extends Error {},
}));
vi.mock('@/components/auth/logout-button', () => ({
  LogoutButton: () => <button>Sign Out</button>,
}));
const token = 'a'.repeat(43);
beforeEach(() => {
  window.history.replaceState(null, '', `/accept-invitation#token=${token}`);
  vi.mocked(verifyInvitation).mockResolvedValue({
    state: 'VALID',
    email: 'member@example.com',
    familyName: 'Family',
    inviterName: 'Admin',
    expiresAt: '2026-11-30T00:00:00.000Z',
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
describe('invitation registration', () => {
  it('re-verifies same-page invitation changes and ignores stale verification responses', async () => {
    let finishOld!: (value: Awaited<ReturnType<typeof verifyInvitation>>) => void;
    vi.mocked(verifyInvitation)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ state: 'CONSUMED' });
    render(<AcceptInvitationForm />);
    await act(async () => {
      window.location.hash = `token=${'b'.repeat(43)}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(
      await screen.findByRole('heading', { name: 'Invitation already accepted' }),
    ).toBeVisible();
    await act(async () => finishOld({ state: 'EXPIRED' }));
    expect(screen.getByRole('heading', { name: 'Invitation already accepted' })).toBeVisible();
    expect(window.location.hash).toBe('');
  });
  it('verifies from memory, removes the token URL, validates and confirms account creation without a session', async () => {
    const user = userEvent.setup();
    vi.mocked(acceptInvitation).mockResolvedValue({ userId: 'b'.repeat(24) });
    render(<AcceptInvitationForm />);
    const submit = await screen.findByRole('button', {
      name: 'Accept Invitation & Create Account',
    });
    expect(window.location.hash).toBe('');
    expect(verifyInvitation).toHaveBeenCalledWith(token);
    await user.click(submit);
    expect(screen.getByLabelText('Display name')).toHaveFocus();
    await user.type(screen.getByLabelText('Display name'), 'Member');
    await user.type(screen.getByLabelText('Create password'), 'synthetic family passphrase');
    await user.type(screen.getByLabelText('Confirm password'), 'wrong');
    await user.click(submit);
    expect(screen.getByText('Passwords must match.')).toBeVisible();
    expect(acceptInvitation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Show passwords' }));
    expect(screen.getByLabelText('Create password')).toHaveAttribute('type', 'text');
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'synthetic family passphrase');
    await user.click(submit);
    expect(
      await screen.findByRole('heading', { name: 'Your account has been created' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign In to Workspace' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(acceptInvitation).toHaveBeenCalledWith({
      token,
      displayName: 'Member',
      password: 'synthetic family passphrase',
    });
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(token);
  });
  it.each(['EXPIRED', 'CONSUMED', 'REVOKED', 'INVALID'] as const)(
    'does not show credentials for %s links',
    async (state) => {
      vi.mocked(verifyInvitation).mockResolvedValue({ state });
      render(<AcceptInvitationForm />);
      await waitFor(() => expect(screen.getByRole('heading')).not.toHaveTextContent('Checking'));
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Sign In' })).toHaveAttribute(
        'href',
        '/login',
      );
    },
  );
  it('requires an existing signed-in user to sign out and does not switch identity', async () => {
    render(<AcceptInvitationForm signedIn />);
    expect(await screen.findByRole('heading', { name: 'You are already signed in' })).toBeVisible();
    expect(verifyInvitation).not.toHaveBeenCalled();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
  it('keeps creation honest and clears attempted passwords on backend failure', async () => {
    vi.mocked(acceptInvitation).mockRejectedValue(new Error('private-canary'));
    const user = userEvent.setup();
    render(<AcceptInvitationForm />);
    await screen.findByLabelText('Display name');
    await user.type(screen.getByLabelText('Display name'), 'Member');
    for (const label of ['Create password', 'Confirm password'])
      await user.type(screen.getByLabelText(label), 'synthetic family passphrase');
    await user.click(screen.getByRole('button', { name: 'Accept Invitation & Create Account' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private-canary');
    expect(screen.getByLabelText('Create password')).toHaveValue('');
    expect(screen.getByLabelText('Display name')).toHaveValue('Member');
  });
  it('uses an accessible dialog with email validation and no role selector', async () => {
    const user = userEvent.setup();
    const sent = vi.fn();
    render(<InviteMemberDialog onSent={sent} />);
    await user.click(screen.getByRole('button', { name: 'Invite Member' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Invite a family member');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('invitation delivery feedback and recovery', () => {
  it.each(['FAILED', 'UNCONFIRMED'] as const)(
    'reports %s without claiming delivery and supports resend and revoke',
    async (delivery) => {
      const user = userEvent.setup();
      const invite: InvitationDto = {
        invitationId: 'c'.repeat(24),
        email: 'delivery-test@example.com',
        status: 'PENDING',
        delivery,
        createdAt: '2026-11-27T00:00:00.000Z',
        expiresAt: '2026-11-30T00:00:00.000Z',
      };
      const replacement: InvitationDto = {
        ...invite,
        invitationId: 'd'.repeat(24),
        delivery: 'ACCEPTED',
      };
      const list = (row: InvitationDto) => ({ data: [row], meta: { nextCursor: null } });
      vi.mocked(sendInvitation).mockResolvedValue(invite);
      vi.mocked(listInvitations)
        .mockResolvedValueOnce(list(invite))
        .mockResolvedValueOnce(list(replacement))
        .mockResolvedValueOnce(list({ ...replacement, status: 'REVOKED' }));
      vi.mocked(resendInvitation).mockResolvedValue(replacement);
      vi.mocked(revokeInvitation).mockResolvedValue(undefined);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<InvitationManager initial={{ data: [], meta: { nextCursor: null } }} />);
      await user.click(screen.getByRole('button', { name: 'Invite Member' }));
      await user.type(screen.getByLabelText('Email address'), invite.email);
      await user.click(screen.getByRole('button', { name: 'Send invitation' }));
      expect(await screen.findByRole('status')).toHaveTextContent(
        delivery === 'FAILED'
          ? 'Invitation created, but email delivery failed. You can resend after the cooldown.'
          : 'Invitation created; email delivery could not be confirmed. Refresh before trying again.',
      );
      expect(screen.getByRole('status')).not.toHaveTextContent(
        'Invitation accepted by the email provider',
      );
      expect(sendInvitation).toHaveBeenCalledExactlyOnceWith(invite.email);
      expect(await screen.findByRole('button', { name: 'Revoke' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Resend' }));
      expect(resendInvitation).toHaveBeenCalledExactlyOnceWith(invite.invitationId);
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Inbox delivery is not confirmed',
      );
      await waitFor(() => expect(listInvitations).toHaveBeenCalledTimes(2));
      await user.click(screen.getByRole('button', { name: 'Revoke' }));
      expect(revokeInvitation).toHaveBeenCalledExactlyOnceWith(replacement.invitationId);
      expect(await screen.findByRole('status')).toHaveTextContent('Invitation revoked.');
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Resend' })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
      expect(listInvitations).toHaveBeenCalledTimes(3);
    },
  );
});

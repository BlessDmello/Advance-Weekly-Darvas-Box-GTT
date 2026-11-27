'use client';
import { useState } from 'react';
import type { InvitationDto } from '@darvas/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  InvitationRequestError,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from '@/lib/api/invitations';
import { InviteMemberDialog } from './invite-member-dialog';

export function InvitationManager({
  initial,
}: {
  initial: { data: InvitationDto[]; meta: { nextCursor: string | null } };
}) {
  const [rows, setRows] = useState(initial.data);
  const [cursor, setCursor] = useState(initial.meta.nextCursor);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function refresh() {
    const result = await listInvitations();
    setRows(result.data);
    setCursor(result.meta.nextCursor);
  }
  function notice(invite: InvitationDto) {
    setMessage(
      invite.delivery === 'ACCEPTED'
        ? 'Invitation accepted by the email provider. Inbox delivery is not confirmed.'
        : invite.delivery === 'FAILED'
          ? 'Invitation created, but email delivery failed. You can resend after the cooldown.'
          : 'Invitation created; email delivery could not be confirmed. Refresh before trying again.',
    );
  }
  async function action(kind: 'resend' | 'revoke', row: InvitationDto) {
    if (
      pending ||
      (kind === 'revoke' &&
        !window.confirm(
          `Revoke the invitation for ${row.email}? This does not disable an existing account.`,
        ))
    )
      return;
    setPending(true);
    setError('');
    setMessage('');
    try {
      if (kind === 'resend') notice(await resendInvitation(row.invitationId));
      else {
        await revokeInvitation(row.invitationId);
        setMessage('Invitation revoked.');
      }
      await refresh();
    } catch (error) {
      setError(
        error instanceof InvitationRequestError
          ? error.message
          : 'The operation could not be confirmed. Refresh the list.',
      );
    } finally {
      setPending(false);
    }
  }
  async function loadMore() {
    if (!cursor || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await listInvitations(cursor);
      setRows((previous) => [...previous, ...result.data]);
      setCursor(result.meta.nextCursor);
    } catch {
      setError('Invitations could not be loaded. Try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="Family invitations" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p>Invitations expire after 72 hours. New accounts receive Member access.</p>
        <InviteMemberDialog
          onSent={(invite) => {
            notice(invite);
            void refresh().catch(() => setError('Refresh the page to see the updated list.'));
          }}
        />
      </div>
      {message && (
        <p role="status" className="rounded-xl border border-border p-4">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {!rows.length ? (
        <Card className="p-6">
          No invitations yet. Invite a trusted family member to get started.
        </Card>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.invitationId}>
              <Card className="flex flex-col justify-between gap-4 p-5 sm:flex-row">
                <div className="min-w-0 space-y-2">
                  <h2 className="break-all font-semibold">{row.email}</h2>
                  <p className="text-sm">{row.status} · Member</p>
                  <p className="text-sm">
                    Expires:{' '}
                    <time dateTime={row.expiresAt}>{new Date(row.expiresAt).toLocaleString()}</time>
                  </p>
                  <p className="text-sm">
                    Email:{' '}
                    {row.delivery === 'ACCEPTED'
                      ? 'Provider accepted'
                      : row.delivery === 'PENDING'
                        ? 'Not confirmed'
                        : row.delivery.toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {['PENDING', 'EXPIRED'].includes(row.status) && (
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => void action('resend', row)}
                    >
                      Resend
                    </Button>
                  )}
                  {row.status === 'PENDING' && (
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => void action('revoke', row)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="outline" disabled={pending} onClick={() => void loadMore()}>
          Load more
        </Button>
      )}
    </section>
  );
}

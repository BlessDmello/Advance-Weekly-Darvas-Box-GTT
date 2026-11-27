'use client';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createInvitationSchema } from '@darvas/contracts';
import type { InvitationDto } from '@darvas/contracts';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InvitationRequestError, sendInvitation } from '@/lib/api/invitations';
import styles from './invitations.module.css';

export function InviteMemberDialog({ onSent }: { onSent(invite: InvitationDto): void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const parsed = createInvitationSchema.safeParse({ email: input.current?.value ?? '' });
    if (!parsed.success) {
      setError('Enter a valid email address.');
      input.current?.focus();
      return;
    }
    setPending(true);
    setError('');
    try {
      const invite = await sendInvitation(parsed.data.email);
      onSent(invite);
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof InvitationRequestError
          ? error.message
          : 'Invitation could not be confirmed. Please refresh the list.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Invite Member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">Invite a family member</DialogTitle>
        <DialogDescription className="mt-2 text-sm">
          A single-use invitation grants Member access to your family workspace. It expires in 72
          hours.
        </DialogDescription>
        <form
          className={`${styles.form} mt-6`}
          noValidate
          onSubmit={submit}
          aria-label="Invite member"
        >
          <div className={styles.field}>
            <label htmlFor="invite-email">Email address</label>
            <input
              id="invite-email"
              ref={input}
              type="email"
              required
              autoComplete="email"
              className={styles.input}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'invite-error' : undefined}
              disabled={pending}
            />
          </div>
          {error && (
            <p id="invite-error" className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending} aria-busy={pending}>
              {pending ? 'Sending invitation…' : 'Send invitation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

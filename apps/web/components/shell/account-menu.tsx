'use client';
import { Popover } from 'radix-ui';
import { ChevronDown, UserRound, X } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import type { ShellUser } from './navigation';
import styles from './shell.module.css';

export function AccountMenu({ user }: { user: ShellUser }) {
  const role = user.role === 'ADMIN' ? 'Admin' : 'Member';
  return (
    <Popover.Root>
      <Popover.Trigger
        id="workspace-account-menu"
        className={styles.accountTrigger}
        aria-label="Open account menu"
      >
        <span className={styles.avatar}>
          <UserRound aria-hidden="true" />
        </span>
        <span className={styles.triggerIdentity}>
          <span>{user.displayName}</span>
          <small>{role}</small>
        </span>
        <ChevronDown className={styles.accountChevron} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Your account"
          align="end"
          sideOffset={10}
          collisionPadding={16}
          className={`public-page ${styles.accountPanel}`}
        >
          <div className={styles.panelHeading}>
            <h2>Your account</h2>
            <Popover.Close className={styles.iconButton} aria-label="Close account menu">
              <X aria-hidden="true" />
            </Popover.Close>
          </div>
          <p className={styles.accountName}>{user.displayName}</p>
          <p className={styles.accountRole}>{role}</p>
          <LogoutButton />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

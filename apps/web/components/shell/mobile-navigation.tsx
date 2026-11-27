'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { MoreHorizontal, X } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import { bottomNavigation, isActiveRoute } from './navigation';
import type { ShellUser } from './navigation';
import { NavigationGroups } from './sidebar';
import styles from './shell.module.css';

export function MobileNavigation({ user, pathname }: { user: ShellUser; pathname: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <nav className={styles.bottomNavigation} aria-label="Mobile application navigation">
        {bottomNavigation.map(({ label, href, icon: Icon }) =>
          href ? (
            <Link
              href={href}
              prefetch={false}
              key={label}
              aria-current={isActiveRoute(pathname, href) ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ) : (
            <button type="button" key={label} disabled aria-label={`${label}, Coming soon`}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              <small>Coming soon</small>
            </button>
          ),
        )}
        <Dialog.Trigger
          className={styles.moreTrigger}
          data-active={pathname !== '/dashboard' || open ? '' : undefined}
          aria-label="More navigation"
        >
          <MoreHorizontal aria-hidden="true" />
          <span>More</span>
        </Dialog.Trigger>
      </nav>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`public-page ${styles.sheet}`}
          onCloseAutoFocus={(event) => {
            if (window.matchMedia('(min-width: 1024px)').matches) {
              event.preventDefault();
              document.getElementById('workspace-account-menu')?.focus();
            }
          }}
        >
          <div className={styles.panelHeading}>
            <Dialog.Title>More navigation</Dialog.Title>
            <Dialog.Close className={styles.iconButton} aria-label="Close More navigation">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.sheetDescription}>
            Your workspace navigation. Unavailable features are marked Coming soon.
          </Dialog.Description>
          <nav aria-label="More application navigation">
            <NavigationGroups
              role={user.role}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </nav>
          <footer className={styles.sheetAccount}>
            <p className={styles.accountName}>{user.displayName}</p>
            <p className={styles.accountRole}>{user.role === 'ADMIN' ? 'Admin' : 'Member'}</p>
            <LogoutButton />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SiteBrand } from '@/components/site-brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccountMenu } from './account-menu';
import { MobileNavigation } from './mobile-navigation';
import { Sidebar } from './sidebar';
import { shellPageTitle } from './navigation';
import type { ShellUser } from './navigation';
import styles from './shell.module.css';

// Only navigation chrome is client-rendered; page children remain Server Components.
export function ApplicationShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const title = shellPageTitle(pathname);
  return (
    <div className={`public-page ${styles.root} ${collapsed ? styles.collapsed : ''}`}>
      <a className={styles.skipLink} href="#workspace-content">
        Skip to content
      </a>
      <Sidebar
        user={user}
        pathname={pathname}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <div className={styles.workspace}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.mobileBrand}>
              <SiteBrand href="/dashboard" />
            </div>
            <div className={styles.desktopTitle}>
              <p className={styles.eyebrow}>Workspace</p>
              <p className={styles.pageTitle}>{title}</p>
            </div>
            <div className={styles.headerActions}>
              <ThemeToggle />
              <AccountMenu key={pathname} user={user} />
            </div>
          </div>
          <p className={`${styles.pageTitle} ${styles.mobileTitle}`}>{title}</p>
        </header>
        <main id="workspace-content" tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
      <MobileNavigation key={pathname} user={user} pathname={pathname} />
    </div>
  );
}

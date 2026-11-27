import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SiteBrand } from '@/components/site-brand';
import { isActiveRoute, visibleGroups } from './navigation';
import type { ShellUser } from './navigation';
import styles from './shell.module.css';

export function NavigationGroups({
  role,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  role: ShellUser['role'];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return visibleGroups(role).map((group) => (
    <div className={styles.group} key={group.label}>
      <h2 className={styles.groupTitle}>{group.label}</h2>
      <ul>
        {group.items.map(({ label, href, icon: Icon }) => (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                prefetch={false}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={styles.navItem}
                aria-current={isActiveRoute(pathname, href) ? 'page' : undefined}
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
              >
                <Icon aria-hidden="true" />
                <span className={styles.itemLabel}>{label}</span>
              </Link>
            ) : (
              <button
                className={styles.navItem}
                type="button"
                disabled
                aria-label={`${label}, Coming soon`}
                title={`${label} — Coming soon`}
              >
                <Icon aria-hidden="true" />
                <span className={styles.itemLabel}>{label}</span>
                <span className={styles.soon}>Coming soon</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  ));
}
export function Sidebar({
  user,
  pathname,
  collapsed,
  onToggle,
}: {
  user: ShellUser;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside aria-label="Workspace sidebar" className={styles.sidebar}>
      <div className={styles.brand}>
        <SiteBrand href="/dashboard" />
      </div>
      <nav id="desktop-navigation" aria-label="Application navigation" className={styles.groups}>
        <NavigationGroups role={user.role} pathname={pathname} collapsed={collapsed} />
      </nav>
      <div className={styles.sidebarFooter}>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={onToggle}
          aria-controls="desktop-navigation"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          <span className={styles.itemLabel}>Collapse sidebar</span>
        </button>
      </div>
    </aside>
  );
}

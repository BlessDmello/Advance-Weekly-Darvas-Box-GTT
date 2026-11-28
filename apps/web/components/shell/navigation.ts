import {
  Bell,
  ChartNoAxesCombined,
  ClipboardList,
  Eye,
  House,
  ListFilter,
  Settings,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PublicUser } from '@darvas/contracts';

export type ShellUser = Pick<PublicUser, 'displayName' | 'role'>;
export type NavigationItem = { label: string; icon: LucideIcon; href?: string };
type NavigationGroup = { label: string; adminOnly?: boolean; items: NavigationItem[] };
const dashboard = { label: 'Dashboard', icon: House, href: '/dashboard' };
const screener = { label: 'Stock Screener', icon: ListFilter };
const portfolios = { label: 'Portfolios', icon: Wallet };
const alerts = { label: 'Alerts', icon: Bell };

export const navigationGroups: NavigationGroup[] = [
  { label: 'Overview', items: [dashboard] },
  {
    label: 'Analysis',
    items: [
      screener,
      { label: 'Eligible Stocks', icon: ChartNoAxesCombined },
      { label: 'Watchlists', icon: Eye },
    ],
  },
  { label: 'Trading', items: [portfolios, { label: 'Trade History', icon: ClipboardList }] },
  { label: 'Activity', items: [alerts] },
  {
    label: 'Administration',
    adminOnly: true,
    items: [
      { label: 'Market Data Import', icon: Upload, href: '/admin/imports' },
      { label: 'Family Management', icon: Users, href: '/admin/invitations' },
    ],
  },
  { label: 'Account', items: [{ label: 'Settings', icon: Settings }] },
];
export const bottomNavigation: NavigationItem[] = [
  dashboard,
  { ...screener, label: 'Screener' },
  portfolios,
  alerts,
];
export function visibleGroups(role: ShellUser['role']) {
  return navigationGroups.filter((group) => !group.adminOnly || role === 'ADMIN');
}
export function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
export function shellPageTitle(pathname: string) {
  if (isActiveRoute(pathname, '/admin/imports/jobs')) return 'Import job details';
  if (isActiveRoute(pathname, '/admin/imports')) return 'Market data import';
  if (isActiveRoute(pathname, '/admin/invitations')) return 'Family invitations';
  return pathname === '/dashboard' ? 'Dashboard' : 'Workspace';
}

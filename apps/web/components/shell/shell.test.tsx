import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApplicationShell } from './application-shell';
import { NavigationGroups } from './sidebar';
import { isActiveRoute } from './navigation';
import PrivateLayout from '@/app/(private)/layout';
import Workspace from '@/app/(private)/dashboard/page';
import { requireCurrentUser } from '@/lib/auth/server';

const route = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/auth/server', () => ({
  requireCurrentUser: vi.fn(),
  WorkspaceUnavailableError: class extends Error {},
}));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock('@/components/auth/logout-button', () => ({
  LogoutButton: () => <button>Sign Out</button>,
}));
const user = { displayName: 'Verified Person', role: 'ADMIN' as const };
beforeEach(() => {
  vi.clearAllMocks();
  route.pathname = '/dashboard';
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

it.each(['ADMIN', 'MEMBER'] as const)(
  'composes the real private layout and guarded %s page with one main landmark',
  async (role) => {
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: 'a'.repeat(24),
      familyId: 'b'.repeat(24),
      email: 'verified@example.com',
      displayName: 'Verified Person',
      role,
      status: 'ACTIVE',
    });
    const page = await Workspace();
    render(await PrivateLayout({ children: page }));
    expect(requireCurrentUser).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(screen.getByText('Welcome back, Verified Person.')).toBeVisible();
    const person = userEvent.setup();
    await person.click(screen.getByRole('button', { name: 'Open account menu' }));
    const account = await screen.findByRole('dialog', { name: 'Your account' });
    expect(within(account).getByText(role === 'ADMIN' ? 'Admin' : 'Member')).toBeVisible();
  },
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['ADMIN', 'MEMBER'] as const)(
  'renders only implemented destinations and permitted %s navigation',
  (role) => {
    render(
      <nav>
        <NavigationGroups role={role} pathname="/dashboard" />
      </nav>,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Stock Screener, Coming soon' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Settings, Coming soon' })).not.toHaveAttribute(
      'href',
    );
    if (role === 'ADMIN')
      expect(screen.getByRole('link', { name: 'Family Management' })).toHaveAttribute(
        'href',
        '/admin/invitations',
      );
    else {
      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Family Management' })).not.toBeInTheDocument();
      expect(screen.queryByText('Market Data Import')).not.toBeInTheDocument();
    }
    for (const link of screen.getAllByRole('link'))
      expect(['/dashboard', '/admin/invitations', '/admin/imports']).toContain(
        link.getAttribute('href'),
      );
    expect(isActiveRoute('/dashboard-extra', '/dashboard')).toBe(false);
  },
);
it('keeps collapse in the mounted shell across navigation without storage writes', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  const person = userEvent.setup();
  const { rerender, unmount } = render(
    <ApplicationShell user={user}>
      <h1>Page</h1>
    </ApplicationShell>,
  );
  await person.click(screen.getByLabelText('Collapse sidebar'));
  expect(screen.getByLabelText('Expand sidebar')).toHaveAttribute('aria-expanded', 'false');
  route.pathname = '/admin/invitations';
  rerender(
    <ApplicationShell user={user}>
      <h1>Invitations</h1>
    </ApplicationShell>,
  );
  expect(screen.getByLabelText('Expand sidebar')).toHaveAttribute('aria-expanded', 'false');
  expect(storage).not.toHaveBeenCalled();
  unmount();
  render(
    <ApplicationShell user={user}>
      <h1>Page</h1>
    </ApplicationShell>,
  );
  expect(screen.getByLabelText('Collapse sidebar')).toHaveAttribute('aria-expanded', 'true');
});
it('shows verified account controls and preserves Escape focus restoration', async () => {
  const person = userEvent.setup();
  render(
    <ApplicationShell user={user}>
      <h1>Page</h1>
    </ApplicationShell>,
  );
  const trigger = screen.getByRole('button', { name: 'Open account menu' });
  await person.click(trigger);
  const panel = await screen.findByRole('dialog', { name: 'Your account' });
  expect(within(panel).getByText('Verified Person')).toBeVisible();
  expect(within(panel).getByText('Admin')).toBeVisible();
  expect(within(panel).getByRole('button', { name: 'Sign Out' })).toBeVisible();
  await person.keyboard('{Escape}');
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('traps More-sheet focus, marks the active route and restores focus on Escape', async () => {
  route.pathname = '/admin/invitations';
  const person = userEvent.setup();
  render(
    <ApplicationShell user={user}>
      <h1>Page</h1>
    </ApplicationShell>,
  );
  const trigger = screen.getByRole('button', { name: 'More navigation' });
  await person.click(trigger);
  const sheet = await screen.findByRole('dialog', { name: 'More navigation' });
  expect(within(sheet).getByRole('link', { name: 'Family Management' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (let i = 0; i < 7; i++) {
    await person.tab();
    expect(sheet.contains(document.activeElement)).toBe(true);
  }
  await person.keyboard('{Escape}');
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('omits Admin destinations for Members in More and closes the sheet on navigation', async () => {
  const person = userEvent.setup();
  const member = { ...user, role: 'MEMBER' as const };
  const { rerender } = render(
    <ApplicationShell user={member}>
      <h1>Page</h1>
    </ApplicationShell>,
  );
  await person.click(screen.getByRole('button', { name: 'More navigation' }));
  const sheet = await screen.findByRole('dialog', { name: 'More navigation' });
  expect(within(sheet).queryByText('Administration')).not.toBeInTheDocument();
  expect(within(sheet).getByText('Member')).toBeVisible();
  const destination = within(sheet).getByRole('link', { name: 'Dashboard' });
  destination.addEventListener('click', (event) => event.preventDefault(), { once: true });
  await person.click(destination);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await person.click(screen.getByRole('button', { name: 'More navigation' }));
  route.pathname = '/another-private-page';
  rerender(
    <ApplicationShell user={member}>
      <h1>Next page</h1>
    </ApplicationShell>,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('closes the mobile sheet when crossing to the desktop breakpoint', async () => {
  let resize = () => {};
  const media = {
    matches: false,
    addEventListener: vi.fn((_event: string, callback: () => void) => {
      resize = callback;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  const person = userEvent.setup();
  render(
    <ApplicationShell user={user}>
      <h1>Page</h1>
    </ApplicationShell>,
  );
  await person.click(screen.getByRole('button', { name: 'More navigation' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  await act(async () => {
    media.matches = true;
    resize();
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open account menu' })).toHaveFocus(),
  );
});

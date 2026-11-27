import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import PrivateLayout from '@/app/(private)/layout';
import { requireCurrentUser, WorkspaceUnavailableError } from '@/lib/auth/server';
import { ApplicationShell } from './application-shell';
vi.mock('@/lib/auth/server', () => ({
  requireCurrentUser: vi.fn(),
  WorkspaceUnavailableError: class extends Error {},
}));
vi.mock('./application-shell', () => ({
  ApplicationShell: vi.fn(({ user, children }: { user: unknown; children: ReactNode }) => (
    <div data-testid="shell" data-user={JSON.stringify(user)}>
      {children}
    </div>
  )),
}));
afterEach(() => vi.clearAllMocks());
it.each(['ADMIN', 'MEMBER'] as const)(
  'passes only server-verified %s display identity to the shell',
  async (role) => {
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: 'a'.repeat(24),
      familyId: 'b'.repeat(24),
      email: 'private@example.com',
      displayName: 'Verified Name',
      role,
      status: 'ACTIVE',
    });
    render(await PrivateLayout({ children: <p>Private page content</p> }));
    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-user',
      JSON.stringify({ displayName: 'Verified Name', role }),
    );
    expect(screen.getByText('Private page content')).toBeVisible();
    expect(requireCurrentUser).toHaveBeenCalledOnce();
  },
);
it('renders no shell identity or children when server validation is unavailable', async () => {
  vi.mocked(requireCurrentUser).mockRejectedValue(new WorkspaceUnavailableError());
  render(await PrivateLayout({ children: <p>Private page content</p> }));
  expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
  expect(ApplicationShell).not.toHaveBeenCalled();
  expect(screen.queryByText('Private page content')).not.toBeInTheDocument();
});
it('preserves framework authentication redirects', async () => {
  const redirect = new Error('Framework redirect');
  vi.mocked(requireCurrentUser).mockRejectedValue(redirect);
  await expect(PrivateLayout({ children: null })).rejects.toBe(redirect);
  expect(ApplicationShell).not.toHaveBeenCalled();
});

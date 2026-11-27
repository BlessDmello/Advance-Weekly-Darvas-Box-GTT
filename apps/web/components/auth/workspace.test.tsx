import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Workspace from '@/app/(private)/dashboard/page';
import { requireCurrentUser, WorkspaceUnavailableError } from '@/lib/auth/server';

vi.mock('@/lib/auth/server', () => ({
  requireCurrentUser: vi.fn(),
  WorkspaceUnavailableError: class extends Error {},
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('protected Dashboard', () => {
  it.each(['ADMIN', 'MEMBER'] as const)('uses the verified %s profile', async (role) => {
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: 'a'.repeat(24),
      familyId: 'b'.repeat(24),
      email: 'verified@example.com',
      displayName: 'Verified Name',
      role,
      status: 'ACTIVE',
    });
    render(await Workspace());
    expect(screen.getByText('Welcome back, Verified Name.')).toBeVisible();
    expect(screen.getByText(`Role: ${role === 'ADMIN' ? 'Admin' : 'Member'}`)).toBeVisible();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    if (role === 'ADMIN')
      expect(screen.getByRole('link', { name: 'Family invitations' })).toHaveAttribute(
        'href',
        '/admin/invitations',
      );
    else expect(screen.queryByRole('link', { name: 'Family invitations' })).not.toBeInTheDocument();
  });
  it('renders only unavailable feedback when validation cannot complete', async () => {
    vi.mocked(requireCurrentUser).mockRejectedValue(new WorkspaceUnavailableError());
    render(await Workspace());
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace is temporarily unavailable');
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
  });
  it('preserves framework redirects rather than converting them to unavailable feedback', async () => {
    const redirect = new Error('Framework redirect');
    vi.mocked(requireCurrentUser).mockRejectedValue(redirect);
    await expect(Workspace()).rejects.toBe(redirect);
  });
});

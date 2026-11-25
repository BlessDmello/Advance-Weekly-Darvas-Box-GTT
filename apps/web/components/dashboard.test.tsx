import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard';

afterEach(() => vi.unstubAllGlobals());

describe('workspace placeholder', () => {
  it('renders the overview and labels unavailable features honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { status: 'ok', service: 'advanced-darvas-api' },
          }),
        ),
      ),
    );
    render(<Dashboard />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A little clarity.');
    expect(screen.getByText(/No market data is loaded yet/)).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(navigation).getByRole('button', { name: /Screener/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Service connected'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('shows unavailability when the API response violates the shared contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }))),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Service unavailable'),
    );
  });
});

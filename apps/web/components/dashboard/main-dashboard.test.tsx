import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { MainDashboard } from './main-dashboard';
import { MetricCard } from './metric-card';

afterEach(() => vi.unstubAllGlobals());

it.each(['ADMIN', 'MEMBER'] as const)(
  'renders all six unavailable metrics for a verified %s',
  (role) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<MainDashboard displayName="Verified Person" role={role} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    expect(screen.getByText('Welcome back, Verified Person.')).toBeVisible();
    expect(screen.getByText(`Role: ${role === 'ADMIN' ? 'Admin' : 'Member'}`)).toBeVisible();
    const list = within(screen.getByLabelText('Dashboard metrics'));
    for (const label of [
      'Eligible Stocks',
      'In Bull Run',
      'CAR Buy/Average Out',
      'Open Positions',
      'Total Invested',
      'Realized P&L',
    ]) {
      expect(list.getByText(label)).toBeVisible();
    }
    expect(list.getAllByText('Unavailable')).toHaveLength(6);
    expect(list.getAllByText('Not connected')).toHaveLength(6);
    expect(fetch).not.toHaveBeenCalled();
    const invite = screen.queryByRole('link', { name: 'Family invitations' });
    if (role === 'ADMIN') expect(invite).toHaveAttribute('href', '/admin/invitations');
    else expect(invite).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record Trade.*Coming soon/ })).toBeDisabled();
  },
);

it('distinguishes unavailable services from empty results and preserves trading boundaries', () => {
  const { container } = render(<MainDashboard displayName="Member" role="MEMBER" />);
  for (const name of [
    'Portfolio Overview',
    'Eligible Stocks Summary',
    'Positions Approaching 6% Target',
    'Recent Activity',
    'Market Data Freshness',
  ]) {
    expect(screen.getByRole('region', { name })).toBeInTheDocument();
  }
  expect(screen.getByText('Unknown')).toBeVisible();
  expect(screen.getByText('Not available')).toBeVisible();
  expect(
    screen.getByText(/Nifty 100 · Bull Run \+ CAR Buy\/Average Out \+ valid, fresh data/),
  ).toBeVisible();
  expect(screen.getByText(/weighted-average executed purchase price/)).toBeVisible();
  expect(screen.getByText(/Purchases and sales require manual confirmation/)).toBeVisible();
  expect(screen.getByText('Historical signal')).toBeVisible();
  expect(screen.getByText('Manually recorded trade')).toBeVisible();
  expect(container.textContent).not.toMatch(
    /No positions|No eligible stocks|₹|\+14\.2%|Arjun|profit locked/i,
  );
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByRole('main')).not.toBeInTheDocument();
  expect(screen.queryByRole('banner')).not.toBeInTheDocument();
});

it('renders content in server HTML with semantic stock headers and escaped identity', () => {
  const html = renderToStaticMarkup(
    <MainDashboard displayName="<script>example</script>" role="MEMBER" />,
  );
  expect(html).toContain('Market Data Freshness');
  expect(html).toContain('&lt;script&gt;example&lt;/script&gt;');
  render(<MainDashboard displayName="Member" role="MEMBER" />);
  // Both responsive representations are in server HTML; CSS selects the visible one.
  const table = screen.getByRole('table', { name: 'Eligible stock screening availability' });
  expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
  expect(within(table).getByText('Screening data not connected')).toBeInTheDocument();
});

it('requires explicit availability and provenance instead of converting missing metrics to zero', () => {
  const { rerender } = render(
    <dl>
      <MetricCard
        label="Example metric"
        icon={null}
        data={{ state: 'unavailable', reason: 'Source unavailable.' }}
      />
    </dl>,
  );
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  expect(screen.getByText('—')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByText('0')).not.toBeInTheDocument();
  // Synthetic presentation input, not a market fixture or a calculated financial value.
  rerender(
    <dl>
      <MetricCard
        label="Example metric"
        icon={null}
        data={{ state: 'available', value: 'Example value', asOfLabel: 'Synthetic source label' }}
      />
    </dl>,
  );
  expect(screen.getByText('Example value')).toBeVisible();
  expect(screen.getByText('Synthetic source label')).toBeVisible();
  expect(screen.queryByText('Not connected')).not.toBeInTheDocument();
});

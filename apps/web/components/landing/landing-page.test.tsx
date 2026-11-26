import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './landing-page';

afterEach(() => vi.unstubAllGlobals());

describe('public landing page', () => {
  it('renders the approved headline and supporting copy without fetching data', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<LandingPage />);
    const headline = screen.getByRole('heading', { level: 1 });
    expect(headline).toHaveTextContent('Smarter Stock Screening.');
    expect(headline).toHaveTextContent('Disciplined Swing Trading.');
    expect(
      screen.getByText(
        'DMA trend verification, CAR confirmation, and weekly Darvas trigger tracking for NSE Nifty 100 swing trading.',
      ),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Service connected')).not.toBeInTheDocument();
  });

  it('makes the illustrative data and educational limitations explicit', () => {
    render(<LandingPage />);
    const preview = screen.getByRole('figure', {
      name: /Illustrative Preview — Not Live Market Data/,
    });
    expect(
      within(preview).getByRole('article', { name: 'TRENT illustrative stock' }),
    ).toBeInTheDocument();
    expect(
      within(preview).getByRole('img', { name: 'Illustrative weekly price chart' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/For educational and analytical use only/)).toBeInTheDocument();
    expect(
      screen.getByText(/Screening and trading features are not available in this release/),
    ).toBeInTheDocument();
  });

  it('keeps Sign In disabled with an explanation and no nonexistent login link', () => {
    render(<LandingPage />);
    const signIns = screen.getAllByRole('button', { name: 'Sign In' });
    expect(signIns).toHaveLength(2);
    for (const button of signIns) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription('Coming soon');
    }
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
    expect(document.querySelector('a[href="/login"]')).toBeNull();
  });

  it('renders three features, four ordered steps, and real anchor destinations', () => {
    const { container } = render(<LandingPage />);
    const features = screen.getByRole('region', { name: 'Engineered for Signal Clarity' });
    expect(within(features).getAllByRole('heading', { level: 3 })).toHaveLength(3);
    const workflow = screen.getByRole('region', {
      name: /A disciplined process\.\s*Four clear steps\./,
    });
    expect(within(workflow).getAllByRole('listitem')).toHaveLength(4);
    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(container.querySelector(anchor.getAttribute('href')!)).not.toBeNull();
    }
  });
});

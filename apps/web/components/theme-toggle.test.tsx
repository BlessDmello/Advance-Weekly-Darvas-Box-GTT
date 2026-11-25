import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => ({ setTheme }) }));

it('lets the user select dark, light, and system appearance', async () => {
  const user = userEvent.setup();
  render(<ThemeToggle />);
  await user.click(screen.getByRole('button', { name: 'Use dark theme' }));
  await user.click(screen.getByRole('button', { name: 'Use light theme' }));
  await user.click(screen.getByRole('button', { name: 'Use system theme' }));
  expect(setTheme.mock.calls).toEqual([['dark'], ['light'], ['system']]);
});

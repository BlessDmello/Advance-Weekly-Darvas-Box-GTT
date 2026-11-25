'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1"
      role="group"
      aria-label="Color theme"
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-md"
        aria-label="Use light theme"
        onClick={() => setTheme('light')}
      >
        <Sun aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-md"
        aria-label="Use dark theme"
        onClick={() => setTheme('dark')}
      >
        <Moon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-md"
        aria-label="Use system theme"
        onClick={() => setTheme('system')}
      >
        <Monitor aria-hidden="true" />
      </Button>
    </div>
  );
}

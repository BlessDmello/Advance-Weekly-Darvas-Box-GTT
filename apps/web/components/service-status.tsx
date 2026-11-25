'use client';

import { useEffect, useState } from 'react';
import { getHealth } from '@/lib/api/health';

export function ServiceStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let active = true;
    void getHealth(controller.signal)
      .then(() => {
        if (active) setStatus('connected');
      })
      .catch(() => {
        if (active) setStatus('unavailable');
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);
  const label = {
    checking: 'Checking connection',
    connected: 'Service connected',
    unavailable: 'Service unavailable',
  }[status];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'unavailable' ? 'bg-amber-500' : 'bg-muted-foreground'}`}
      />
      {label}
    </span>
  );
}

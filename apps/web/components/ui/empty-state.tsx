import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// The caller supplies truthful copy: unavailable services are not empty results.
export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <span aria-hidden="true">{icon}</span>
      <p className="font-medium">{title}</p>
      <div>{children}</div>
    </div>
  );
}

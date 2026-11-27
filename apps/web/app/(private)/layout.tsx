import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import { ApplicationShell } from '@/components/shell/application-shell';
import { requireCurrentUser, WorkspaceUnavailableError } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (!(error instanceof WorkspaceUnavailableError)) throw error;
    return (
      <main className="public-page min-h-screen p-8">
        <p role="alert">Workspace is temporarily unavailable. Please try again.</p>
        <Link href="/login">Back to Sign In</Link>
      </main>
    );
  }
  // Page/data guards remain mandatory: layouts persist across client navigation.
  return (
    <ApplicationShell user={{ displayName: user.displayName, role: user.role }}>
      {children}
    </ApplicationShell>
  );
}

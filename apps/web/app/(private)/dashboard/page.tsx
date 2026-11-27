import Link from 'next/link';
import { requireCurrentUser, WorkspaceUnavailableError } from '@/lib/auth/server';
import { SiteBrand } from '@/components/site-brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Card } from '@/components/ui/card';
import { LogoutButton } from '@/components/auth/logout-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workspace · Advanced Darvas Box' };
export default async function Workspace() {
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
  return (
    <div className="public-page min-h-screen">
      <header className="landing-header">
        <div className="landing-container flex flex-wrap items-center justify-between gap-4 py-5">
          <SiteBrand />
          <ThemeToggle />
        </div>
      </header>
      <main className="landing-container py-12">
        <Card className="mx-auto max-w-xl space-y-5 p-8">
          <h1 className="text-2xl font-semibold">Your workspace</h1>
          <p className="break-words">Signed in as {user.displayName}.</p>
          <p>Role: {user.role === 'ADMIN' ? 'Admin' : 'Member'}</p>
          <p>The trading dashboard is not implemented yet.</p>
          {user.role === 'ADMIN' && (
            <Link href="/admin/invitations" className="block underline">
              Family invitations
            </Link>
          )}
          <LogoutButton />
          <Link href="/" className="block underline">
            Back to Home
          </Link>
        </Card>
      </main>
    </div>
  );
}

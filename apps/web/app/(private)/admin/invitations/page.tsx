import Link from 'next/link';
import { adminInvitationData, WorkspaceUnavailableError } from '@/lib/auth/server';
import { SiteBrand } from '@/components/site-brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { InvitationManager } from '@/components/invitations/invitation-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Family Invitations · Advanced Darvas Box' };
export default async function InvitationsPage() {
  // Redirect/notFound exceptions intentionally propagate; no private content renders first.
  let data;
  try {
    data = await adminInvitationData();
  } catch (error) {
    if (!(error instanceof WorkspaceUnavailableError)) throw error;
    return (
      <main className="public-page min-h-screen p-8">
        <p role="alert">
          Invitations are temporarily unavailable. Contact your Admin to check invitation storage
          and email configuration.
        </p>
        <Link href="/dashboard">Back to Workspace</Link>
      </main>
    );
  }
  const { user, invitations } = data;
  return (
    <div className="public-page min-h-screen">
      <header className="landing-header">
        <div className="landing-container flex flex-wrap items-center justify-between gap-4 py-5">
          <SiteBrand />
          <ThemeToggle />
        </div>
      </header>
      <main className="landing-container space-y-7 py-10">
        <Link href="/dashboard" className="underline">
          Back to Workspace
        </Link>
        <div className="space-y-3">
          <p className="text-sm">{user.displayName} · Admin</p>
          <h1 className="text-3xl font-semibold">Family invitations</h1>
          <p>
            Invite trusted family members to your private workspace. Admin access does not grant
            access to another member’s portfolios.
          </p>
        </div>
        <InvitationManager initial={invitations} />
      </main>
    </div>
  );
}

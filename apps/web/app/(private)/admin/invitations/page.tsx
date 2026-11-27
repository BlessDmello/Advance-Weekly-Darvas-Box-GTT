import Link from 'next/link';
import { adminInvitationData, WorkspaceUnavailableError } from '@/lib/auth/server';
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
      <section>
        <p role="alert">
          Invitations are temporarily unavailable. Contact your Admin to check invitation storage
          and email configuration.
        </p>
        <Link href="/dashboard">Back to Workspace</Link>
      </section>
    );
  }
  const { user, invitations } = data;
  return (
    <section className="space-y-7">
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
    </section>
  );
}

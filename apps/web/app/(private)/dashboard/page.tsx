import Link from 'next/link';
import { requireCurrentUser, WorkspaceUnavailableError } from '@/lib/auth/server';
import { MainDashboard } from '@/components/dashboard/main-dashboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard · Advanced Darvas Box' };
export default async function Workspace() {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (!(error instanceof WorkspaceUnavailableError)) throw error;
    return (
      <section>
        <p role="alert">Workspace is temporarily unavailable. Please try again.</p>
        <Link href="/login">Back to Sign In</Link>
      </section>
    );
  }
  return <MainDashboard displayName={user.displayName} role={user.role} />;
}

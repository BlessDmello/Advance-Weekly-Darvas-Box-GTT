import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteBrand } from '@/components/site-brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';
import { currentUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Accept Invitation · Advanced Darvas Box',
  referrer: 'no-referrer',
};
export default async function AcceptInvitationPage() {
  const user = await currentUser().catch(() => null);
  return (
    <div className="public-page min-h-screen">
      <header className="landing-header">
        <div className="landing-container flex flex-wrap items-center justify-between gap-4 py-5">
          <SiteBrand />
          <ThemeToggle />
        </div>
      </header>
      <main className="landing-container max-w-5xl space-y-6 py-10">
        <Link href="/" className="underline">
          Back to Home
        </Link>
        <AcceptInvitationForm signedIn={Boolean(user)} />
      </main>
    </div>
  );
}

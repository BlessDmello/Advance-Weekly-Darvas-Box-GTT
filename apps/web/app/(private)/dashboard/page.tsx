import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/server';
import { SiteBrand } from '@/components/site-brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Card } from '@/components/ui/card';
import { LogoutButton } from '@/components/auth/logout-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workspace · Advanced Darvas Box' };
export default async function Workspace() {
  let user;
  try {
    user = await currentUser();
  } catch {
    return (
      <main className="public-page min-h-screen p-8">
        <p role="alert">Workspace is temporarily unavailable. Please try again.</p>
        <Link href="/login">Back to Sign In</Link>
      </main>
    );
  }
  if (!user) redirect('/login');
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
          <p>Signed in as {user.displayName}.</p>
          <p>The trading dashboard is not implemented yet.</p>
          <LogoutButton />
          <Link href="/" className="block underline">
            Back to Home
          </Link>
        </Card>
      </main>
    </div>
  );
}

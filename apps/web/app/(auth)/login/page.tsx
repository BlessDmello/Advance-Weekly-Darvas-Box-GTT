import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/server';
import { LoginPage } from '@/components/auth/login-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign In · Advanced Darvas Box',
  description: 'Sign in to your invite-only Advanced Darvas Box workspace.',
};

export default async function LoginRoute() {
  // A cookie alone is not proof of authentication. Keep the public form available
  // when the API cannot verify a session; protected routes still fail closed.
  const user = await currentUser().catch(() => null);
  if (user) redirect('/dashboard');
  return <LoginPage />;
}

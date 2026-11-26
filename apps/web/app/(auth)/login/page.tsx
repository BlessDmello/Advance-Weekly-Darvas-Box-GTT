import type { Metadata } from 'next';
import { LoginPage } from '@/components/auth/login-page';

export const metadata: Metadata = {
  title: 'Sign In · Advanced Darvas Box',
  description: 'Sign in to your invite-only Advanced Darvas Box workspace.',
};

export default function LoginRoute() {
  return <LoginPage />;
}

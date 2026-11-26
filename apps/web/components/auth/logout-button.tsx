'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/api/auth';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function logout() {
    setPending(true);
    setError(false);
    try {
      await signOut();
      router.replace('/login');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <Button onClick={logout} disabled={pending} aria-busy={pending}>
        {pending ? 'Signing out…' : 'Sign Out'}
      </Button>
      {error && <p role="alert">Sign-out could not be confirmed. Please try again.</p>}
    </div>
  );
}

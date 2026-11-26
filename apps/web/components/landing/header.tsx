import { LockKeyhole, Menu } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { SiteBrand } from '@/components/site-brand';

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#preview', label: 'Preview' },
];

export function SignInLink({ hero = false }: { hero?: boolean }) {
  return (
    <div className={`landing-sign-in ${hero ? 'landing-sign-in-hero' : ''}`}>
      <Button asChild>
        <Link href="/login">
          <LockKeyhole aria-hidden="true" />
          Sign In
        </Link>
      </Button>
    </div>
  );
}

export function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <SiteBrand href="#main" />
        <span className="landing-private-label">Private / Invite-only</span>
        <nav className="landing-desktop-nav" aria-label="Main navigation">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-header-actions">
          <ThemeToggle />
          <SignInLink />
        </div>
        <details className="landing-mobile-menu">
          <summary aria-label="Open navigation">
            <Menu size={20} aria-hidden="true" />
            <span>Menu</span>
          </summary>
          <nav aria-label="Mobile navigation">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

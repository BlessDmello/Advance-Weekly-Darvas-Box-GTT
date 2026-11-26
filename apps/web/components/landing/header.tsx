import { LockKeyhole, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#preview', label: 'Preview' },
];

export function LandingBrand() {
  return (
    <a href="#main" className="landing-brand" aria-label="Advanced Darvas Box home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        Advanced <span className="landing-brand-second">Darvas Box</span>
      </span>
    </a>
  );
}

export function SignInPlaceholder({ hero = false }: { hero?: boolean }) {
  return (
    <div className={`landing-sign-in ${hero ? 'landing-sign-in-hero' : ''}`}>
      <Button disabled aria-describedby={hero ? 'hero-sign-in-note' : 'header-sign-in-note'}>
        <LockKeyhole aria-hidden="true" />
        Sign In
      </Button>
      <span id={hero ? 'hero-sign-in-note' : 'header-sign-in-note'}>Coming soon</span>
    </div>
  );
}

export function LandingHeader() {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <LandingBrand />
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
          <SignInPlaceholder />
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

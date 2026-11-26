import Link from 'next/link';
import { Home, LockKeyhole } from 'lucide-react';
import { SiteBrand } from '@/components/site-brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Card } from '@/components/ui/card';
import { LoginForm } from './login-form';
import { LoginPreview } from './login-preview';
import styles from './login.module.css';

export function LoginPage() {
  return (
    <div className={`public-page ${styles.page}`}>
      <a className="landing-skip-link" href="#main">
        Skip to content
      </a>
      <header className="landing-header">
        <div className={styles.header}>
          <SiteBrand />
          <span className="landing-private-label">Private / Invite-only</span>
          <div className={styles.theme}>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`landing-container ${styles.main}`}>
        <Link href="/" className={styles.back}>
          <Home size={16} aria-hidden="true" />
          Back to Home
        </Link>
        <Card className={styles.workspace}>
          <section className={styles.formPanel} aria-labelledby="login-title">
            <p className={styles.eyebrow}>
              <LockKeyhole size={14} aria-hidden="true" />
              Private workspace · Invite only
            </p>
            <h1 id="login-title">Welcome back</h1>
            <p className={styles.subtitle}>Sign in to your trading workspace</p>
            <LoginForm />
            <div className={styles.inviteNote}>
              <LockKeyhole size={18} aria-hidden="true" />
              <p>
                Access is by invitation only. Contact your family administrator for an invitation.
              </p>
            </div>
          </section>
          <LoginPreview />
        </Card>
      </main>
      <footer className={styles.footer}>
        <p>
          For educational and analytical use only. Not investment advice. No returns are guaranteed.
        </p>
      </footer>
    </div>
  );
}

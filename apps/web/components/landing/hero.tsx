import { Check, Database, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInPlaceholder } from './header';

export function LandingHero() {
  return (
    <section className="landing-hero landing-container" aria-labelledby="hero-title">
      <p className="landing-eyebrow landing-hero-eyebrow">
        <LockKeyhole size={13} aria-hidden="true" />
        Private platform · Invite only
      </p>
      <h1 id="hero-title">
        Smarter Stock Screening.
        <br />
        <span>Disciplined Swing Trading.</span>
      </h1>
      <p className="landing-hero-copy">
        DMA trend verification, CAR confirmation, and weekly Darvas trigger tracking for NSE Nifty
        100 swing trading.
      </p>
      <div className="landing-hero-actions">
        <SignInPlaceholder hero />
        <Button asChild variant="outline" className="landing-explore">
          <a href="#features">Explore Features</a>
        </Button>
      </div>
      <ul className="landing-principles" aria-label="Platform principles">
        <li>
          <Database size={15} aria-hidden="true" />
          EOD analysis
        </li>
        <li>
          <ShieldCheck size={15} aria-hidden="true" />
          Manual execution
        </li>
        <li>
          <Check size={15} aria-hidden="true" />A defined process
        </li>
      </ul>
    </section>
  );
}

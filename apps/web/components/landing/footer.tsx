import { LockKeyhole } from 'lucide-react';
import { SiteBrand } from '@/components/site-brand';

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="landing-footer-top">
          <div>
            <SiteBrand href="#main" />
            <p>A disciplined perspective on NSE swing trading.</p>
          </div>
          <span className="landing-footer-private">
            <LockKeyhole size={14} aria-hidden="true" />
            Private & invite-only
          </span>
        </div>
        <div className="landing-footer-bottom">
          <p>
            For educational and analytical use only. Not investment advice. Trading involves risk;
            no returns are guaranteed. All trades require manual execution and confirmation.
          </p>
          <a href="#main">Back to top</a>
        </div>
      </div>
    </footer>
  );
}

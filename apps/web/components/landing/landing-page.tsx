import { LandingHeader } from './header';
import { LandingHero } from './hero';
import { DashboardPreview } from './dashboard-preview';
import { LandingFeatures, LandingHowItWorks } from './content-sections';
import { LandingFooter } from './footer';

export function LandingPage() {
  return (
    <div className="public-page landing">
      <a className="landing-skip-link" href="#main">
        Skip to content
      </a>
      <LandingHeader />
      <main id="main" tabIndex={-1}>
        <LandingHero />
        <DashboardPreview />
        <LandingFeatures />
        <LandingHowItWorks />
      </main>
      <LandingFooter />
    </div>
  );
}

import {
  ChartNoAxesCombined,
  CheckCheck,
  CircleDollarSign,
  Filter,
  Layers3,
  ScanLine,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: SlidersHorizontal,
    title: 'Intelligent Stock Screening',
    description:
      'Bring DMA trend verification and CAR confirmation into one considered view of the Nifty 100. Focus on the rules behind each opportunity.',
    detail: 'DMA trends + CAR confirmation',
  },
  {
    icon: Target,
    title: 'Weekly Darvas Triggers',
    description:
      'Review the previous completed week’s high alongside the ±2.75% ignore band. Keep a trigger touch separate from a manually confirmed purchase.',
    detail: 'Prior-week highs · ±2.75% band',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Portfolio & Profit Tracking',
    description:
      'Keep confirmed trades, average purchase prices, and 6% target levels in perspective. Review one-third reinvestment after a profitable sequence closes.',
    detail: 'Your records. Your decisions.',
  },
];

const steps = [
  {
    icon: Filter,
    title: 'Screen',
    label: 'Start with the rules',
    description: 'Review valid, fresh historical data for Bull Run alignment and CAR confirmation.',
  },
  {
    icon: Layers3,
    title: 'Analyze',
    label: 'See the context',
    description:
      'Inspect the prior completed week’s high and the ignore band around the accepted trigger.',
  },
  {
    icon: ScanLine,
    title: 'Track',
    label: 'Keep execution distinct',
    description: 'Review trigger touches and record only the trades you have manually confirmed.',
  },
  {
    icon: CircleDollarSign,
    title: 'Review & Compound',
    label: 'Close the loop',
    description:
      'Review completed sequences and the one-third reinvestment of positive net realized gain.',
  },
];

export function LandingFeatures() {
  return (
    <section
      id="features"
      className="landing-section landing-container"
      aria-labelledby="features-title"
    >
      <div className="landing-section-heading">
        <p className="landing-eyebrow">A more considered perspective</p>
        <h2 id="features-title">Engineered for Signal Clarity</h2>
        <p>Three connected views. One disciplined approach to your decisions.</p>
      </div>
      <div className="landing-feature-grid">
        {features.map(({ icon: Icon, title, description, detail }) => (
          <Card key={title} className="landing-feature-card">
            <CardContent>
              <span className="landing-feature-icon">
                <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="landing-feature-detail">
                <CheckCheck size={15} aria-hidden="true" />
                {detail}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="landing-roadmap-note">
        A preview of the planned workflow. Screening and trading features are not available in this
        release.
      </p>
    </section>
  );
}

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="landing-section landing-container landing-workflow"
      aria-labelledby="workflow-title"
    >
      <div className="landing-section-heading">
        <p className="landing-eyebrow">From observation to review</p>
        <h2 id="workflow-title">
          A disciplined process.
          <br className="landing-mobile-break" /> Four clear steps.
        </h2>
        <p>A framework for deliberate review, with every trade in your hands.</p>
      </div>
      <ol className="landing-step-grid">
        {steps.map(({ icon: Icon, title, label, description }, index) => (
          <li key={title}>
            <div className="landing-step-top">
              <span className="landing-step-number">{String(index + 1).padStart(2, '0')}</span>
              <Icon size={21} strokeWidth={1.6} aria-hidden="true" />
            </div>
            <h3>{title}</h3>
            <span className="landing-step-label">{label}</span>
            <p>{description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

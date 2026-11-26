import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Advanced Darvas Box · A disciplined view of the market',
  description:
    'DMA trend verification, CAR confirmation, and weekly Darvas trigger tracking for NSE Nifty 100 swing trading.',
};

export default function HomePage() {
  return <LandingPage />;
}

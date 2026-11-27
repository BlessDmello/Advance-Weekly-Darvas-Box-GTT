import Link from 'next/link';
import {
  BadgeCheck,
  BriefcaseBusiness,
  CircleDollarSign,
  Info,
  ListFilter,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MetricCard, type UnavailableDashboardData } from './metric-card';
import {
  EligibleStocksSummary,
  MarketDataFreshness,
  PortfolioOverview,
  RecentActivity,
  TargetWatch,
} from './dashboard-panels';
import styles from './dashboard.module.css';

const screening: UnavailableDashboardData = {
  state: 'unavailable',
  reason: 'The screening service is not implemented yet.',
};
const portfolios: UnavailableDashboardData = {
  state: 'unavailable',
  reason: 'The portfolio service is not implemented yet.',
};
const activity: UnavailableDashboardData = {
  state: 'unavailable',
  reason: 'Trading and signal history are not connected yet.',
};
const market: UnavailableDashboardData = {
  state: 'unavailable',
  reason: 'Market-data ingestion is not implemented yet.',
};

export function MainDashboard({
  displayName,
  role,
}: {
  displayName: string;
  role: 'ADMIN' | 'MEMBER';
}) {
  return (
    <div className={styles.dashboard}>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Your workspace</p>
          <h1>Dashboard</h1>
          <p className={styles.greeting}>Welcome back, {displayName}.</p>
          <Badge className={styles.badge}>Role: {role === 'ADMIN' ? 'Admin' : 'Member'}</Badge>
        </div>
        <div className={styles.actions}>
          <Button disabled variant="outline" className={styles.futureAction}>
            <Plus aria-hidden="true" />
            Record Trade <span>Coming soon</span>
          </Button>
          {role === 'ADMIN' && (
            <Link href="/admin/invitations" className={styles.managementLink}>
              Family invitations
            </Link>
          )}
        </div>
      </div>
      <div className={styles.notice}>
        <Info aria-hidden="true" />
        <p>
          <strong>Data connections pending.</strong> Screening, portfolio and trading values are
          unavailable. This is not an empty-result report or a live market view.
        </p>
      </div>
      <dl className={styles.metrics} aria-label="Dashboard metrics">
        <MetricCard label="Eligible Stocks" icon={<BadgeCheck />} data={screening} />
        <MetricCard label="In Bull Run" icon={<TrendingUp />} data={screening} />
        <MetricCard label="CAR Buy/Average Out" icon={<ListFilter />} data={screening} />
        <MetricCard label="Open Positions" icon={<BriefcaseBusiness />} data={portfolios} />
        <MetricCard label="Total Invested" icon={<Wallet />} data={portfolios} />
        <MetricCard label="Realized P&L" icon={<CircleDollarSign />} data={portfolios} />
      </dl>
      <div className={styles.panels}>
        <div className={styles.primaryColumn}>
          <PortfolioOverview data={portfolios} />
          <EligibleStocksSummary data={screening} />
        </div>
        <div className={styles.secondaryColumn}>
          <TargetWatch data={portfolios} />
          <RecentActivity data={activity} />
          <MarketDataFreshness data={market} />
        </div>
      </div>
    </div>
  );
}

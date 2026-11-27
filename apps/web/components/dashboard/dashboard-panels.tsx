import type { ReactNode } from 'react';
import { Activity, ChartNoAxesCombined, Database, ListFilter, Target } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { UnavailableDashboardData } from './metric-card';
import styles from './dashboard.module.css';

function Panel({
  id,
  title,
  icon,
  description,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <Card className={styles.panel}>
        <CardHeader className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelIcon} aria-hidden="true">
              {icon}
            </span>
            <h2 id={id}>{title}</h2>
          </div>
          <p className={styles.description}>{description}</p>
        </CardHeader>
        <CardContent className={styles.panelContent}>{children}</CardContent>
      </Card>
    </section>
  );
}

export function PortfolioOverview({ data }: { data: UnavailableDashboardData }) {
  return (
    <Panel
      id="portfolio-overview"
      title="Portfolio Overview"
      icon={<ChartNoAxesCombined />}
      description="Your private portfolios and manually recorded investments."
    >
      <EmptyState
        icon={<ChartNoAxesCombined />}
        title="Portfolio data not connected"
        className={styles.overviewState}
      >
        <p>
          {data.reason} Balances and performance will appear when stored portfolio data is
          available.
        </p>
      </EmptyState>
      <p className={styles.footnote}>
        Only your own portfolios belong in this overview, regardless of your role.
      </p>
    </Panel>
  );
}

export function EligibleStocksSummary({ data }: { data: UnavailableDashboardData }) {
  return (
    <Panel
      id="eligible-summary"
      title="Eligible Stocks Summary"
      icon={<ListFilter />}
      description="Nifty 100 · Bull Run + CAR Buy/Average Out + valid, fresh data."
    >
      <div className={styles.stockTable}>
        <table>
          <caption className="sr-only">Eligible stock screening availability</caption>
          <thead>
            <tr>
              <th scope="col">Stock</th>
              <th scope="col">Bull Run</th>
              <th scope="col">CAR status</th>
              <th scope="col">Weekly trigger</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4}>
                <EmptyState
                  icon={<ListFilter />}
                  title="Screening data not connected"
                  className={styles.emptyState}
                >
                  <p>{data.reason}</p>
                </EmptyState>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.stockMobile}>
        <EmptyState
          icon={<ListFilter />}
          title="Screening data not connected"
          className={styles.emptyState}
        >
          <p>{data.reason}</p>
        </EmptyState>
      </div>
      <p className={styles.footnote}>
        Weekly triggers use the previous completed week’s highest daily high. A signal is not an
        executed trade.
      </p>
    </Panel>
  );
}

export function TargetWatch({ data }: { data: UnavailableDashboardData }) {
  return (
    <Panel
      id="target-watch"
      title="Positions Approaching 6% Target"
      icon={<Target />}
      description="A target is 6% above the weighted-average executed purchase price."
    >
      <EmptyState
        icon={<Target />}
        title="Position data not connected"
        className={styles.emptyState}
      >
        <p>{data.reason}</p>
      </EmptyState>
      <p className={styles.footnote}>
        Target touches are signals. Purchases and sales require manual confirmation; no automatic
        sale or stop-loss is applied.
      </p>
    </Panel>
  );
}

export function RecentActivity({ data }: { data: UnavailableDashboardData }) {
  return (
    <Panel
      id="recent-activity"
      title="Recent Activity"
      icon={<Activity />}
      description="Historical strategy signals and manually recorded transactions."
    >
      <EmptyState
        icon={<Activity />}
        title="Activity data not connected"
        className={styles.emptyState}
      >
        <p>{data.reason}</p>
      </EmptyState>
      <div className={styles.legend} aria-label="Future activity categories">
        <Badge className={styles.badge}>Historical signal</Badge>
        <Badge className={styles.badge}>Manually recorded trade</Badge>
      </div>
    </Panel>
  );
}

export function MarketDataFreshness({ data }: { data: UnavailableDashboardData }) {
  return (
    <Panel
      id="market-data-freshness"
      title="Market Data Freshness"
      icon={<Database />}
      description="EOD source status, separate from application availability."
    >
      <dl className={styles.freshness}>
        <div>
          <dt>Universe</dt>
          <dd>Nifty 100</dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd>Unknown</dd>
        </div>
        <div>
          <dt>Last data refresh</dt>
          <dd>Not available</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>
            <Badge className={styles.badge}>Not connected</Badge>
          </dd>
        </div>
      </dl>
      <p className={styles.footnote}>{data.reason} Freshness cannot be verified yet.</p>
    </Panel>
  );
}

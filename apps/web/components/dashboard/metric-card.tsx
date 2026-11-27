import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import styles from './dashboard.module.css';

// Presentation state only. A future API adapter must supply values and provenance.
// Missing data must never be coerced into a zero or a successful empty result.
export type DashboardAvailability<T> =
  { state: 'unavailable'; reason: string } | { state: 'available'; value: T; asOfLabel: string };

export type UnavailableDashboardData = Extract<
  DashboardAvailability<never>,
  { state: 'unavailable' }
>;

export function MetricCard({
  label,
  icon,
  data,
}: {
  label: string;
  icon: ReactNode;
  data: DashboardAvailability<string>;
}) {
  return (
    <Card className={styles.metric}>
      <dt className={styles.metricLabel}>
        {label}
        <span className={styles.metricIcon} aria-hidden="true">
          {icon}
        </span>
      </dt>
      <dd className={styles.metricValue}>
        {data.state === 'available' ? (
          data.value
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Unavailable</span>
          </>
        )}
      </dd>
      <dd className={styles.metricDescription}>
        {data.state === 'unavailable' ? (
          <>
            <Badge className={styles.badge}>Not connected</Badge>
            <p>{data.reason}</p>
          </>
        ) : (
          <p>{data.asOfLabel}</p>
        )}
      </dd>
    </Card>
  );
}

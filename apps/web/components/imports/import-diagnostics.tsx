import type { ImportDiagnostic } from '@darvas/contracts';
import styles from './imports.module.css';

export function ImportDiagnostics({
  title,
  entries,
  total,
}: {
  title: string;
  entries: ImportDiagnostic[];
  total: number;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <h3>
        {title} ({total})
      </h3>
      {entries.length > 0 ? (
        <ul className={styles.diagnostics}>
          {entries.map((entry, index) => (
            <li key={index}>
              <strong>{entry.code.replaceAll('_', ' ')}</strong>
              {entry.row !== null ? ` · Row ${entry.row}` : ''}
              {entry.field ? ` · ${entry.field}` : ''}
              <p>{entry.message}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>
          {total === 0 ? 'None reported by validation.' : 'Details are unavailable.'}
        </p>
      )}
      {total > entries.length && (
        <p className={styles.muted}>
          Showing {entries.length} of {total}. Diagnostics are truncated.
        </p>
      )}
    </section>
  );
}
export function ImportCounts({ values }: { values: Record<string, number> }) {
  return (
    <dl className={styles.counts}>
      {Object.entries(values).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ImportScopeNotice() {
  return (
    <p className={styles.notice}>
      Price imports only. DMA, CAR, Darvas and screening calculations remain deferred. A completed
      import does not establish screening eligibility.
    </p>
  );
}

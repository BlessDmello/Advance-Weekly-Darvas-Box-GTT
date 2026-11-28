import { ImportWorkspace } from '@/components/imports/import-workspace';
import { adminImportHistory } from '@/lib/imports/server';
import { WorkspaceUnavailableError } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Market Data Import · Advanced Darvas Box' };
export default async function ImportsPage() {
  let history;
  try {
    history = await adminImportHistory();
  } catch (error) {
    if (!(error instanceof WorkspaceUnavailableError)) throw error;
    // Do not render private controls when session or initial data validation failed.
    return (
      <section>
        <h1>Market data imports unavailable</h1>
        <p role="alert">
          Import storage or session validation is unavailable. Refresh to try again. No data has
          been uploaded.
        </p>
      </section>
    );
  }
  return <ImportWorkspace initial={history} />;
}

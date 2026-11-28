import { ImportJob } from '@/components/imports/import-job';
import { adminImportJob } from '@/lib/imports/server';
import { WorkspaceUnavailableError } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Import Job · Advanced Darvas Box' };
export default async function ImportJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  let job;
  try {
    job = await adminImportJob((await params).jobId);
  } catch (error) {
    if (!(error instanceof WorkspaceUnavailableError)) throw error;
    return (
      <section>
        <h1>Import job unavailable</h1>
        <p role="alert">Job status or session validation is unavailable. Refresh to try again.</p>
      </section>
    );
  }
  return <ImportJob key={job.jobId} initial={job} />;
}

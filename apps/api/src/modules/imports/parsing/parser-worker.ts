import { parentPort, workerData } from 'node:worker_threads';
import { parseInProcess } from './parser-core.js';
import type { ImportFile } from './limits.js';
import type { ImportParseOptions } from '@darvas/contracts';
import type { VerifiedCalendarSnapshot } from './calendar.js';

const { file, options, calendar } = workerData as {
  file: ImportFile;
  options: ImportParseOptions;
  calendar: VerifiedCalendarSnapshot | null;
};
// The worker owns no database, environment loader, network client or filesystem output.
if (parentPort) {
  const result = await parseInProcess(file, options, calendar);
  parentPort.postMessage(result);
  parentPort.close();
}

import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { importParseOptionsSchema, importParseResultSchema } from '@darvas/contracts';
import type { ImportParseOptions, ImportParseResult } from '@darvas/contracts';
import { failureResult, validateFile } from './parser-core.js';
import { PARSER_LIMITS, ParseFailure } from './limits.js';
import type { ImportFile } from './limits.js';
import type { VerifiedCalendarSnapshot } from './calendar.js';

let activeWorkers = 0;
/** Public backend entry point. No persistence, upload route or implicit IO is added. */
export async function parseMarketFile(
  file: ImportFile,
  input: ImportParseOptions,
  calendar: VerifiedCalendarSnapshot | null,
  execution: { timeoutMilliseconds?: number } = {},
): Promise<ImportParseResult> {
  const checked = importParseOptionsSchema.safeParse(input);
  if (!checked.success)
    throw new ParseFailure(
      'INVALID_OPTIONS',
      'Explicit stock, mapping, provenance and range options are required.',
    );
  const options = checked.data;
  try {
    validateFile(file);
  } catch (error) {
    return failureResult(
      options,
      error instanceof ParseFailure
        ? error
        : new ParseFailure('INVALID_FILE', 'The file could not be safely parsed.'),
    );
  }
  if (activeWorkers >= 1)
    return failureResult(
      options,
      new ParseFailure('PARSER_BUSY', 'Parser capacity is temporarily unavailable.'),
    );
  const timeout = execution.timeoutMilliseconds ?? PARSER_LIMITS.workerMilliseconds;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > PARSER_LIMITS.workerMilliseconds)
    throw new ParseFailure(
      'INVALID_OPTIONS',
      'The execution deadline must stay within the parser budget.',
    );
  if (
    calendar &&
    (!Array.isArray(calendar.days) || calendar.days.length > PARSER_LIMITS.calendarDays)
  )
    return failureResult(
      options,
      new ParseFailure('INVALID_CALENDAR', 'Calendar coverage exceeds its supported bounds.'),
    );
  activeWorkers++;
  try {
    const source = new URL(import.meta.url).pathname.endsWith('.ts');
    const entry = new URL(source ? './parser-worker.ts' : './parser-worker.js', import.meta.url);
    // Fixed project-owned source loader for Vitest/tsx only. Compiled Node starts
    // the JS worker directly and has no runtime dependency on tsx or eval.
    const worker = new Worker(
      source
        ? `require(${JSON.stringify(createRequire(import.meta.url).resolve('tsx/esm/api'))}).tsImport(${JSON.stringify(entry.href)}, ${JSON.stringify(import.meta.url)}).catch(() => { process.exitCode = 1; });`
        : entry,
      {
        eval: source,
        workerData: { file, options, calendar },
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 192,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
        stdout: true,
        stderr: true,
      },
    );
    worker.stdout.resume();
    worker.stderr.resume();
    return await new Promise<ImportParseResult>((resolve) => {
      let settled = false;
      const finish = (result: ImportParseResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate().then(
          () => resolve(result),
          () => resolve(result),
        );
      };
      const timer = setTimeout(
        () =>
          finish(
            failureResult(
              options,
              new ParseFailure('PARSER_TIMEOUT', 'Parsing exceeded its execution budget.'),
            ),
          ),
        timeout,
      );
      worker.once('message', (message: unknown) => {
        const parsed = importParseResultSchema.safeParse(message);
        finish(
          parsed.success
            ? parsed.data
            : failureResult(
                options,
                new ParseFailure('PARSER_FAILED', 'The parser returned an invalid result.'),
              ),
        );
      });
      worker.once('error', () =>
        finish(
          failureResult(
            options,
            new ParseFailure(
              'PARSER_RESOURCE_LIMIT',
              'The parser failed or exceeded its memory limit.',
            ),
          ),
        ),
      );
      worker.once('exit', () => {
        if (!settled)
          finish(
            failureResult(
              options,
              new ParseFailure('PARSER_FAILED', 'The parser stopped before completing.'),
            ),
          );
      });
    });
  } catch {
    return failureResult(
      options,
      new ParseFailure('PARSER_FAILED', 'The parser could not be started.'),
    );
  } finally {
    activeWorkers--;
  }
}
export type { ImportFile, VerifiedCalendarSnapshot };

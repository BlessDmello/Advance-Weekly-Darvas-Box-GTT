import { z } from 'zod';
import { sessionDateSchema, tradingSessionSchema } from '@darvas/contracts';
import type { ImportParseOptions, ImportSessionAssessment, ParsedOhlcv } from '@darvas/contracts';
import { PARSER_LIMITS, ParseFailure } from './limits.js';
import type { ParseBudget } from './limits.js';
import type { Diagnostics } from './diagnostics.js';

const dayMilliseconds = 86_400_000;
const snapshotSchema = z
  .object({
    source: z.string().trim().min(1).max(500),
    version: z.string().trim().min(1).max(120),
    from: sessionDateSchema,
    to: sessionDateSchema,
    days: z.array(tradingSessionSchema).min(1).max(PARSER_LIMITS.calendarDays),
  })
  .strict();
/** Supplied by a future trusted reference-data repository, never by an uploaded file.
 * Every calendar day, including closures, must be explicitly sourced. */
export type VerifiedCalendarSnapshot = z.infer<typeof snapshotSchema>;
export function validateCalendar(value: unknown, budget: ParseBudget): VerifiedCalendarSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success)
    throw new ParseFailure('INVALID_CALENDAR', 'Verified calendar metadata is invalid.');
  const snapshot = parsed.data;
  const count = (Date.parse(snapshot.to) - Date.parse(snapshot.from)) / dayMilliseconds + 1;
  if (count < 1 || count > PARSER_LIMITS.calendarDays || count !== snapshot.days.length)
    throw new ParseFailure(
      'INVALID_CALENDAR',
      'Calendar coverage must explicitly include every day.',
    );
  const start = Date.parse(snapshot.from);
  for (let index = 0; index < snapshot.days.length; index++) {
    budget.check();
    const day = snapshot.days[index]!;
    if (
      day.sessionDate !== new Date(start + index * dayMilliseconds).toISOString().slice(0, 10) ||
      day.calendarSource !== snapshot.source ||
      day.calendarVersion !== snapshot.version
    )
      throw new ParseFailure('INVALID_CALENDAR', 'Calendar dates or provenance are inconsistent.');
  }
  return snapshot;
}
export function assessSessions(
  records: ParsedOhlcv[],
  options: ImportParseOptions,
  calendar: VerifiedCalendarSnapshot | null,
  diagnostics: Diagnostics,
  budget: ParseBudget,
): ImportSessionAssessment {
  const latestSession = records.at(-1)?.sessionDate ?? null;
  const result: ImportSessionAssessment = {
    coverage: 'UNAVAILABLE',
    calendarVersion: null,
    complete: false,
    expectedSessionCount: 0,
    missingSessions: [],
    missingSessionCount: 0,
    latestSession,
    freshness: 'UNKNOWN',
  };
  if (!calendar) {
    diagnostics.add(
      'CALENDAR_UNAVAILABLE',
      'Verified NSE calendar coverage is unavailable.',
      'ERROR',
      null,
      'date',
    );
    return result;
  }
  result.calendarVersion = calendar.version;
  result.coverage =
    options.requestedRange.from >= calendar.from && options.requestedRange.to <= calendar.to
      ? 'VERIFIED'
      : 'PARTIAL';
  if (result.coverage !== 'VERIFIED')
    diagnostics.add(
      'CALENDAR_COVERAGE',
      'The requested range exceeds verified calendar coverage.',
      'ERROR',
      null,
      'date',
    );
  const days = new Map(calendar.days.map((day) => [day.sessionDate, day]));
  const observed = new Set(records.map((row) => row.sessionDate));
  let unexpected = false;
  for (const row of records) {
    budget.check();
    const day = days.get(row.sessionDate);
    if (!day || !day.isOpen) {
      unexpected = true;
      diagnostics.add(
        day ? 'NON_TRADING_SESSION' : 'UNVERIFIED_SESSION',
        day
          ? 'An observation is on a verified closed date.'
          : 'An observation has no verified session coverage.',
        'ERROR',
        null,
        'date',
      );
    } else if (day.sessionType === 'SPECIAL')
      diagnostics.add(
        'SPECIAL_SESSION_VERIFIED',
        'An observation uses an explicitly verified special session.',
        'WARNING',
        null,
        'date',
      );
  }
  for (const day of calendar.days) {
    budget.check();
    if (
      day.isOpen &&
      day.sessionDate >= options.requestedRange.from &&
      day.sessionDate <= options.requestedRange.to
    ) {
      result.expectedSessionCount++;
      if (!observed.has(day.sessionDate)) {
        result.missingSessionCount++;
        if (result.missingSessions.length < PARSER_LIMITS.rows)
          result.missingSessions.push(day.sessionDate);
      }
    }
  }
  if (result.missingSessionCount)
    diagnostics.add(
      'MISSING_SESSIONS',
      'Expected verified trading sessions are missing; no prices were filled.',
      'ERROR',
      null,
      'date',
    );
  if (records.length < options.minimumHistorySessions)
    diagnostics.add(
      'SHORT_HISTORY',
      'History is shorter than the explicitly requested observation count.',
      'WARNING',
      null,
      'date',
    );
  const expected = options.expectedCompletedSession;
  if (expected && !days.get(expected)?.isOpen)
    diagnostics.add(
      'EXPECTED_SESSION_UNVERIFIED',
      'The expected completed session is not verified as open.',
      'ERROR',
      null,
      'date',
    );
  else if (expected && latestSession) {
    if (latestSession > expected)
      diagnostics.add(
        'AFTER_COMPLETED_SESSION',
        'The file includes sessions after the expected completed session.',
        'ERROR',
        null,
        'date',
      );
    else if (result.coverage === 'VERIFIED')
      result.freshness = latestSession === expected ? 'FRESH' : 'STALE';
  }
  result.complete =
    result.coverage === 'VERIFIED' && !unexpected && result.missingSessionCount === 0;
  return result;
}

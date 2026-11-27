import { importParseOptionsSchema, importParseResultSchema } from '@darvas/contracts';
import type { ImportParseOptions, ImportParseResult } from '@darvas/contracts';
import { assessSessions, validateCalendar } from './calendar.js';
import type { VerifiedCalendarSnapshot } from './calendar.js';
import { readCsv } from './csv.js';
import { readXlsx } from './xlsx.js';
import { Diagnostics } from './diagnostics.js';
import { normalizeRows } from './normalize.js';
import { PARSER_LIMITS, ParseBudget, ParseFailure } from './limits.js';
import type { ImportFile } from './limits.js';

export function validateFile(file: ImportFile): 'CSV' | 'XLSX' {
  if (
    !(file.bytes instanceof Uint8Array) ||
    file.bytes.byteLength < 1 ||
    file.bytes.byteLength > PARSER_LIMITS.fileBytes
  )
    throw new ParseFailure('FILE_SIZE', 'A nonempty file of at most 3 MiB is required.');
  if (
    typeof file.name !== 'string' ||
    file.name.length > 160 ||
    /[\\/]/.test(file.name) ||
    Array.from(file.name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new ParseFailure('INVALID_FILENAME', 'A simple supported filename is required.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const mime = file.mimeType?.trim().toLowerCase();
  const bytes = Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
  if (extension === 'csv' && ['text/csv', 'application/csv', 'text/plain'].includes(mime)) {
    if (
      bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])) ||
      bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
    )
      throw new ParseFailure('CONTENT_MISMATCH', 'Binary spreadsheet content does not match CSV.');
    return 'CSV';
  }
  if (
    extension === 'xlsx' &&
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    if (!bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4])))
      throw new ParseFailure('CONTENT_MISMATCH', 'The content is not an unencrypted XLSX archive.');
    return 'XLSX';
  }
  throw new ParseFailure(
    'UNSUPPORTED_FILE',
    'Only correctly labeled CSV and XLSX files are supported.',
  );
}
export function emptyResult(options: ImportParseOptions): ImportParseResult {
  return {
    parserVersion: 'market-parser-v1',
    stock: options.stock,
    source: options.source,
    format: null,
    records: [],
    counts: {
      original: 0,
      normalized: 0,
      invalid: 0,
      identicalDuplicates: 0,
      conflictingDuplicates: 0,
    },
    diagnostics: [],
    errorCount: 0,
    warningCount: 0,
    diagnosticsTruncated: false,
    sessions: {
      coverage: 'UNAVAILABLE',
      calendarVersion: null,
      complete: false,
      expectedSessionCount: 0,
      missingSessions: [],
      missingSessionCount: 0,
      latestSession: null,
      freshness: 'UNKNOWN',
    },
    eligibleForConfirmation: false,
  };
}
export function failureResult(
  options: ImportParseOptions,
  failure: ParseFailure,
): ImportParseResult {
  const result = emptyResult(options);
  result.diagnostics = [
    { code: failure.code, severity: 'ERROR', message: failure.message, row: null, field: 'file' },
  ];
  result.errorCount = 1;
  return result;
}
/** Internal pure pipeline; future request handlers must use the bounded worker facade. */
export async function parseInProcess(
  file: ImportFile,
  input: ImportParseOptions,
  calendarInput: VerifiedCalendarSnapshot | null,
  budget = new ParseBudget(),
): Promise<ImportParseResult> {
  const optionsCheck = importParseOptionsSchema.safeParse(input);
  if (!optionsCheck.success)
    throw new ParseFailure(
      'INVALID_OPTIONS',
      'Explicit stock, mapping, provenance and range options are required.',
    );
  const options = optionsCheck.data;
  const result = emptyResult(options);
  const diagnostics = new Diagnostics();
  try {
    budget.check();
    result.format = validateFile(file);
    const calendar = calendarInput === null ? null : validateCalendar(calendarInput, budget);
    const table =
      result.format === 'CSV' ? readCsv(file.bytes, budget) : await readXlsx(file.bytes, budget);
    Object.assign(result, normalizeRows(table, options, diagnostics, budget));
    if (!result.records.length)
      diagnostics.add(
        'NO_VALID_ROWS',
        'The file contains no unambiguous valid observations.',
        'ERROR',
        null,
        'file',
      );
    if (options.source.basis === 'UNKNOWN')
      diagnostics.add(
        'UNKNOWN_PRICE_BASIS',
        'An explicit price adjustment basis is required before confirmation.',
        'ERROR',
        null,
        'source',
      );
    if (options.source.basis === 'BOTH')
      diagnostics.add(
        'BOTH_SERIES_UNSUPPORTED',
        'The canonical single-OHLC format cannot represent both raw and adjusted series.',
        'ERROR',
        null,
        'source',
      );
    result.sessions = assessSessions(result.records, options, calendar, diagnostics, budget);
    result.errorCount = diagnostics.errors;
    result.warningCount = diagnostics.warnings;
    result.diagnostics = diagnostics.samples;
    result.diagnosticsTruncated = diagnostics.truncated;
    result.eligibleForConfirmation =
      diagnostics.errors === 0 && result.records.length > 0 && result.sessions.complete;
    budget.check();
    return importParseResultSchema.parse(result);
  } catch (error) {
    return failureResult(
      options,
      error instanceof ParseFailure
        ? error
        : new ParseFailure('INVALID_FILE', 'The file could not be safely parsed.'),
    );
  }
}

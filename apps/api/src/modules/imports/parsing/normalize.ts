import { compareDecimalText, parsedOhlcvSchema, sessionDateSchema } from '@darvas/contracts';
import type { ImportParseOptions, ImportParseResult, ParsedOhlcv } from '@darvas/contracts';
import type { Diagnostics } from './diagnostics.js';
import type { Cell, ParseBudget, ParsedTable } from './limits.js';

export function excelSessionDate(text: string, system: '1900' | '1904'): string | null {
  // Date serials only. Financial values never take this numeric conversion path.
  if (!/^\d{1,7}(?:\.0+)?$/.test(text)) return null;
  const serial = Number(text);
  if (
    !Number.isSafeInteger(serial) ||
    serial > (system === '1900' ? 2_958_465 : 2_957_003) ||
    (system === '1900' && (serial < 1 || serial === 60))
  )
    return null;
  const base = system === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const offset = system === '1900' && serial > 60 ? serial - 1 : serial;
  const date = new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
  return sessionDateSchema.safeParse(date).success ? date : null;
}
function equalRecords(left: ParsedOhlcv, right: ParsedOhlcv): boolean {
  return (
    (['open', 'high', 'low', 'close'] as const).every(
      (field) => compareDecimalText(left.ohlc[field], right.ohlc[field]) === 0,
    ) &&
    (left.volume === null || right.volume === null
      ? left.volume === right.volume
      : compareDecimalText(left.volume, right.volume) === 0)
  );
}
export function normalizeRows(
  table: ParsedTable,
  options: ImportParseOptions,
  diagnostics: Diagnostics,
  budget: ParseBudget,
): { records: ParsedOhlcv[]; counts: ImportParseResult['counts'] } {
  const counts = {
    original: Math.max(0, table.rows.length - 1),
    normalized: 0,
    invalid: 0,
    identicalDuplicates: 0,
    conflictingDuplicates: 0,
  };
  const header = table.rows[0]?.cells.map((cell) => cell.text.trim()) ?? [];
  if (
    !header.length ||
    header.some((name) => !name || name.length > 120) ||
    new Set(header).size !== header.length
  ) {
    diagnostics.add(
      'INVALID_HEADERS',
      'Headers must be nonempty, distinct names of at most 120 characters.',
      'ERROR',
      1,
      'file',
    );
    return { records: [], counts };
  }
  const positions = new Map<string, number>();
  for (const [field, column] of Object.entries(options.mapping))
    if (column !== null) {
      const index = header.indexOf(column);
      if (index < 0)
        diagnostics.add(
          'MISSING_COLUMNS',
          'An explicitly mapped column is missing.',
          'ERROR',
          1,
          field as keyof ImportParseOptions['mapping'],
        );
      else positions.set(field, index);
    }
  if (diagnostics.errors) return { records: [], counts };
  if (options.dateMode === 'EXCEL_SERIAL' && table.dateSystem === null) {
    diagnostics.add(
      'DATE_MODE_MISMATCH',
      'Excel date serials require an XLSX workbook.',
      'ERROR',
      null,
      'date',
    );
    return { records: [], counts };
  }
  const records = new Map<string, ParsedOhlcv>();
  const conflicted = new Set<string>();
  for (const input of table.rows.slice(1)) {
    budget.check();
    const cell = (field: string): Cell | undefined => {
      const index = positions.get(field);
      return index === undefined ? undefined : input.cells[index];
    };
    const value = (field: string) => cell(field)?.text.trim() ?? '';
    if (input.cells.length > header.length) {
      counts.invalid++;
      diagnostics.add(
        'INVALID_ROW',
        'A data row has more cells than the header.',
        'ERROR',
        input.row,
        'file',
      );
      continue;
    }
    if (options.mapping.symbol !== null && value('symbol').toUpperCase() !== options.stock.symbol) {
      counts.invalid++;
      diagnostics.add(
        'SYMBOL_MISMATCH',
        'The symbol does not match the selected NSE stock.',
        'ERROR',
        input.row,
        'symbol',
      );
      continue;
    }
    const date =
      options.dateMode === 'EXCEL_SERIAL'
        ? cell('date')?.kind === 'NUMBER' && table.dateSystem
          ? excelSessionDate(value('date'), table.dateSystem)
          : null
        : value('date');
    if (!date || !sessionDateSchema.safeParse(date).success) {
      counts.invalid++;
      diagnostics.add(
        'INVALID_DATE',
        'A real ISO date or explicitly selected Excel date serial is required.',
        'ERROR',
        input.row,
        'date',
      );
      continue;
    }
    if (date < options.requestedRange.from || date > options.requestedRange.to) {
      counts.invalid++;
      diagnostics.add(
        'DATE_OUTSIDE_RANGE',
        'A date falls outside the explicitly requested range.',
        'ERROR',
        input.row,
        'date',
      );
      continue;
    }
    const parsed = parsedOhlcvSchema.safeParse({
      sessionDate: date,
      ohlc: { open: value('open'), high: value('high'), low: value('low'), close: value('close') },
      volume: value('volume') || null,
    });
    if (!parsed.success) {
      counts.invalid++;
      const missing = (['open', 'high', 'low', 'close'] as const).find((field) => !value(field));
      const issue = parsed.error.issues[0]?.path;
      const field =
        issue?.[0] === 'volume'
          ? 'volume'
          : ['open', 'high', 'low', 'close'].includes(String(issue?.[1]))
            ? (issue?.[1] as 'open' | 'high' | 'low' | 'close')
            : null;
      diagnostics.add(
        missing ? 'MISSING_VALUE' : 'INVALID_OHLCV',
        missing
          ? 'A required OHLC value is missing.'
          : 'OHLC range, exact decimal precision or whole-volume validation failed.',
        'ERROR',
        input.row,
        missing ?? field,
      );
      continue;
    }
    const previous = records.get(date);
    if (conflicted.has(date) || (previous && !equalRecords(previous, parsed.data))) {
      counts.conflictingDuplicates++;
      diagnostics.add(
        'CONFLICTING_DUPLICATE',
        'Conflicting observations share a session date; no winner was selected.',
        'ERROR',
        input.row,
        'date',
      );
      records.delete(date);
      conflicted.add(date);
    } else if (previous) {
      counts.identicalDuplicates++;
      diagnostics.add(
        'IDENTICAL_DUPLICATE',
        'An identical session observation was collapsed.',
        'WARNING',
        input.row,
        'date',
      );
    } else records.set(date, parsed.data);
  }
  const ordered = [...records.values()].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  counts.normalized = ordered.length;
  return { records: ordered, counts };
}

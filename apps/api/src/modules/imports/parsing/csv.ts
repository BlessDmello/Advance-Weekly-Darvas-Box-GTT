import { parse } from 'csv-parse/sync';
import { checkCell, decodeUtf8, PARSER_LIMITS, ParseFailure } from './limits.js';
import type { ParseBudget, ParsedTable } from './limits.js';

export function readCsv(bytes: Uint8Array, budget: ParseBudget): ParsedTable {
  const rows: ParsedTable['rows'] = [];
  const text = decodeUtf8(bytes);
  if (text.trimStart().startsWith('<') || text.startsWith('PK'))
    throw new ParseFailure('CONTENT_MISMATCH', 'The content does not match a CSV file.');
  try {
    parse(text, {
      bom: true,
      cast: false,
      columns: false,
      delimiter: ',',
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: PARSER_LIMITS.recordCharacters,
      on_record(record: string[]) {
        budget.check();
        if (rows.length >= PARSER_LIMITS.rows + 1)
          throw new ParseFailure('ROW_LIMIT', 'The file exceeds 5,000 data rows.');
        if (record.length > PARSER_LIMITS.columns)
          throw new ParseFailure('COLUMN_LIMIT', 'The file exceeds 32 columns.');
        record.forEach(checkCell);
        rows.push({
          row: rows.length + 1,
          cells: record.map((text) => ({ text, kind: 'TEXT' as const })),
        });
        return null;
      },
    });
  } catch (error) {
    if (error instanceof ParseFailure) throw error;
    throw new ParseFailure('MALFORMED_CSV', 'CSV quoting, encoding or record size is invalid.');
  }
  return { rows, dateSystem: null };
}

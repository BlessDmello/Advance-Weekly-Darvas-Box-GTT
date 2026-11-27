import { IMPORT_LIMITS } from '@darvas/contracts';

export const PARSER_LIMITS = Object.freeze({
  ...IMPORT_LIMITS,
  archiveEntries: 64,
  inflatedBytes: 16 * 1024 * 1024,
  entryBytes: 8 * 1024 * 1024,
  compressionRatio: 200,
  cellCharacters: 1024,
  recordCharacters: 32 * 1024,
  xmlNodes: 550_000,
  xmlDepth: 32,
  calendarDays: 20_000,
  milliseconds: 5000,
  workerMilliseconds: 10_000,
});
export class ParseFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export class ParseBudget {
  private readonly deadline: number;
  constructor(milliseconds: number = PARSER_LIMITS.milliseconds) {
    this.deadline = performance.now() + Math.min(milliseconds, PARSER_LIMITS.milliseconds);
  }
  check(): void {
    if (performance.now() >= this.deadline)
      throw new ParseFailure('PARSER_TIMEOUT', 'Parsing exceeded its execution budget.');
  }
}
export type ImportFile = { name: string; mimeType: string; bytes: Uint8Array };
export type Cell = { text: string; kind: 'TEXT' | 'NUMBER' };
export type DataRow = { row: number; cells: Cell[] };
export type ParsedTable = { rows: DataRow[]; dateSystem: '1900' | '1904' | null };

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code < 32 && ![9, 10, 13].includes(code)) throw new Error();
    }
    return text;
  } catch {
    throw new ParseFailure(
      'INVALID_ENCODING',
      'Only UTF-8 text without binary control characters is supported.',
    );
  }
}
export function checkCell(text: string): void {
  if (text.length > PARSER_LIMITS.cellCharacters)
    throw new ParseFailure('CELL_LIMIT', 'A cell exceeds the supported text limit.');
  const trimmed = text.trim();
  if (/^[=+@]/.test(trimmed) || (trimmed.startsWith('-') && !/^-\d+(?:\.\d+)?$/.test(trimmed)))
    throw new ParseFailure('FORMULA_FORBIDDEN', 'Spreadsheet formulas are not accepted.');
}

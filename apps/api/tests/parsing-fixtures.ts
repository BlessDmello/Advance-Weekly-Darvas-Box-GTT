import { crc32, deflateRawSync } from 'node:zlib';
import type { ImportParseOptions } from '@darvas/contracts';
import type { VerifiedCalendarSnapshot } from '../src/modules/imports/parsing/calendar.js';
import type { ImportFile } from '../src/modules/imports/parsing/limits.js';

// Deliberately synthetic prices, stock identity AND session calendar; no golden NSE data.
export const parseOptions: ImportParseOptions = {
  stock: { stockId: 'a'.repeat(24), exchange: 'NSE', symbol: 'SYNTH&TEST', series: 'EQ' },
  mapping: {
    date: 'Date',
    open: 'Open',
    high: 'High',
    low: 'Low',
    close: 'Close',
    volume: 'Volume',
    symbol: 'Symbol',
  },
  source: {
    provider: 'Synthetic fixture',
    reference: 'Unit tests only',
    basis: 'RAW',
    adjustmentVersion: null,
    declaredAt: '2026-01-04T00:00:00.000Z',
    verification: 'DECLARED',
  },
  dateMode: 'ISO',
  requestedRange: { from: '2026-01-01', to: '2026-01-03' },
  minimumHistorySessions: 3,
  expectedCompletedSession: '2026-01-03',
};
export const syntheticCalendar: VerifiedCalendarSnapshot = {
  source: 'Synthetic fixture',
  version: 'test-only-1',
  from: '2026-01-01',
  to: '2026-01-03',
  days: [1, 2, 3].map((day) => ({
    exchange: 'NSE',
    sessionDate: `2026-01-0${day}`,
    isOpen: true,
    sessionType: day === 3 ? 'SPECIAL' : 'REGULAR',
    closeTimeLocal: '15:30',
    timezone: 'Asia/Kolkata',
    calendarSource: 'Synthetic fixture',
    calendarVersion: 'test-only-1',
  })),
};
export const header = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Symbol'];
export const dataRows = [1, 2, 3].map((day) => [
  `2026-01-0${day}`,
  '100.0000000000000000000000000000001',
  '102',
  '99',
  '101',
  '1000',
  'SYNTH&TEST',
]);
export function csvFile(rows: string[][] = dataRows, headers = header): ImportFile {
  const quote = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return {
    name: 'synthetic.csv',
    mimeType: 'text/csv',
    bytes: Buffer.from([headers, ...rows].map((row) => row.map(quote).join(',')).join('\r\n')),
  };
}
export function xmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
export type ZipPart = {
  name: string;
  text: string;
  flags?: number;
  declaredSize?: number;
  crc?: number;
  method?: number;
  compress?: boolean;
};
/** Small test-owned ZIP builder so security fixtures need no spreadsheet writer. */
export function zipFixture(parts: ZipPart[]): Buffer {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name),
      raw = Buffer.from(part.text);
    const compressed = part.compress ? deflateRawSync(raw) : raw;
    const method = part.method ?? (part.compress ? 8 : 0);
    const checksum = part.crc ?? crc32(raw);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(part.flags ?? 0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(part.declaredSize ?? raw.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, compressed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(part.flags ?? 0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(checksum, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(part.declaredSize ?? raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += localHeader.length + name.length + compressed.length;
  }
  const dir = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}
export const mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const packageNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
export function sheetXml(
  rows: string[][] = dataRows,
  headers = header,
  numericDates = false,
): string {
  const body = [headers, ...rows]
    .map(
      (row, index) =>
        `<row r="${index + 1}">${row
          .map((value, column) => {
            const ref = `${column < 26 ? String.fromCharCode(65 + column) : `A${String.fromCharCode(65 + column - 26)}`}${index + 1}`;
            const numeric =
              index > 0 && ((column >= 1 && column <= 5) || (column === 0 && numericDates));
            return numeric
              ? `<c r="${ref}"><v>${xmlEscape(value)}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  return `<worksheet xmlns="${mainNs}"><sheetData>${body}</sheetData></worksheet>`;
}
export function workbookParts(options: { sheet?: string; date1904?: boolean } = {}): ZipPart[] {
  return [
    {
      name: '[Content_Types].xml',
      text: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      text: `<Relationships xmlns="${packageNs}"><Relationship Id="book" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text: `<workbook xmlns="${mainNs}" xmlns:r="${relNs}"><workbookPr date1904="${options.date1904 ? '1' : '0'}"/><sheets><sheet name="Synthetic" sheetId="1" r:id="sheet"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `<Relationships xmlns="${packageNs}"><Relationship Id="sheet" Type="${relNs}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', text: options.sheet ?? sheetXml() },
  ];
}
export function xlsxFile(parts = workbookParts()): ImportFile {
  return {
    name: 'synthetic.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: zipFixture(parts),
  };
}

import { describe, expect, it } from 'vitest';
import {
  csvFile,
  dataRows,
  header,
  mainNs,
  packageNs,
  parseOptions,
  relNs,
  sheetXml,
  syntheticCalendar,
  workbookParts,
  xlsxFile,
  zipFixture,
} from '../../../../tests/parsing-fixtures.js';
import { parseInProcess } from './parser-core.js';
import { PARSER_LIMITS } from './limits.js';
import type { ImportFile } from './limits.js';

const parse = (file: ImportFile) => parseInProcess(file, parseOptions, syntheticCalendar);
const codes = (result: Awaited<ReturnType<typeof parse>>) =>
  result.diagnostics.map((entry) => entry.code);
describe('bounded CSV/XLSX content validation', () => {
  it('accepts a plain XLSX while preserving 34 significant price digits exactly', async () => {
    const result = await parse(xlsxFile());
    expect(result.eligibleForConfirmation).toBe(true);
    expect(result.records[0]?.ohlc.open).toBe(dataRows[0]?.[1]);
  });
  it('accepts deflated XLSX parts with checked CRC and actual inflated byte counts', async () => {
    const result = await parse(
      xlsxFile(workbookParts().map((part) => ({ ...part, compress: true }))),
    );
    expect(result.eligibleForConfirmation).toBe(true);
  });
  it('supports BOM and quoted UTF-8 CSV without price casts', async () => {
    const file = csvFile();
    file.bytes = Buffer.concat([Buffer.from('\ufeff'), file.bytes]);
    expect((await parse(file)).eligibleForConfirmation).toBe(true);
  });
  it('supports shared string values without interpreting them as formulas', async () => {
    const parts = workbookParts();
    parts.find((part) => part.name.endsWith('sheet1.xml'))!.text = sheetXml().replace(
      '<c r="A2" t="inlineStr"><is><t>2026-01-01</t></is></c>',
      '<c r="A2" t="s"><v>0</v></c>',
    );
    parts.push({
      name: 'xl/sharedStrings.xml',
      text: `<sst xmlns="${mainNs}"><si><t>2026-01-01</t></si></sst>`,
    });
    expect((await parse(xlsxFile(parts))).eligibleForConfirmation).toBe(true);
  });
  it.each([
    ['unsupported extension', { name: 'test.xls' }, 'UNSUPPORTED_FILE'],
    ['CSV wrong MIME', { mimeType: 'application/zip' }, 'UNSUPPORTED_FILE'],
    ['unsafe path', { name: '../synthetic.csv' }, 'INVALID_FILENAME'],
    ['control in filename', { name: 'test\n.csv' }, 'INVALID_FILENAME'],
    ['empty', { bytes: Buffer.alloc(0) }, 'FILE_SIZE'],
    ['too large', { bytes: Buffer.alloc(PARSER_LIMITS.fileBytes + 1) }, 'FILE_SIZE'],
    ['binary', { bytes: Buffer.from([0, 1, 2]) }, 'INVALID_ENCODING'],
    ['invalid UTF-8', { bytes: Buffer.from([0xc3, 0x28]) }, 'INVALID_ENCODING'],
    ['XML masquerading as CSV', { bytes: Buffer.from('<worksheet/>') }, 'CONTENT_MISMATCH'],
    ['malformed quotes', { bytes: Buffer.from('Date,Open\n"unterminated') }, 'MALFORMED_CSV'],
  ])('rejects %s', async (_name, overrides, code) => {
    const result = await parse({ ...csvFile(), ...overrides });
    expect(codes(result)).toContain(code);
    expect(result.eligibleForConfirmation).toBe(false);
  });
  it('rejects ZIP content renamed as CSV', async () => {
    expect(codes(await parse({ ...csvFile(), bytes: xlsxFile().bytes }))).toContain(
      'CONTENT_MISMATCH',
    );
  });
  it('rejects text renamed as XLSX', async () => {
    expect(codes(await parse({ ...xlsxFile(), bytes: csvFile().bytes }))).toContain(
      'CONTENT_MISMATCH',
    );
  });
  it('rejects encrypted OLE workbook content rather than trying a password', async () => {
    expect(
      (await parse({ ...xlsxFile(), bytes: Buffer.from('d0cf11e0a1b11ae1', 'hex') }))
        .eligibleForConfirmation,
    ).toBe(false);
  });
  it.each([
    '=SUM(1,2)',
    '+SUM(1,2)',
    '@SUM(1,2)',
    '-SUM(1,2)',
    '  =HYPERLINK("https://invalid.test")',
  ])('rejects CSV formula content %s', async (formula) => {
    const rows = dataRows.map((row) => [...row]);
    rows[0]![4] = formula;
    expect(codes(await parse(csvFile(rows)))).toContain('FORMULA_FORBIDDEN');
  });
  it('rejects formulas in unmapped extra columns too', async () => {
    const rows = dataRows.map((row) => [...row, '=1+1']);
    expect(codes(await parse(csvFile(rows, [...header, 'Ignored'])))).toContain(
      'FORMULA_FORBIDDEN',
    );
  });
  it.each([
    ['ordinary', '<f>1+100</f><v>101</v>'],
    ['shared follower', '<f t="shared" si="0"/><v>101</v>'],
    ['array', '<f t="array" ref="E2:E4">100+1</f><v>101</v>'],
  ])('rejects %s XLSX formulas even with plausible cached values', async (_name, formula) => {
    const sheet = sheetXml().replace('<c r="E2"><v>101</v></c>', `<c r="E2">${formula}</c>`);
    expect(codes(await parse(xlsxFile(workbookParts({ sheet }))))).toContain('ACTIVE_CONTENT');
  });
  it.each([
    ['macro part', 'xl/vbaProject.bin', 'binary'],
    ['external link part', 'xl/externalLinks/externalLink1.xml', '<externalLink/>'],
    ['embedded object', 'xl/embeddings/oleObject1.bin', 'binary'],
  ])('rejects %s', async (_name, name, text) => {
    expect(codes(await parse(xlsxFile([...workbookParts(), { name, text }])))).toContain(
      'ACTIVE_CONTENT',
    );
  });
  it('rejects macro content types even when the file is named .xlsx', async () => {
    const parts = workbookParts();
    parts[0]!.text = parts[0]!.text.replace(
      'spreadsheetml.sheet.main',
      'ms-excel.sheet.macroEnabled.main',
    );
    expect((await parse(xlsxFile(parts))).eligibleForConfirmation).toBe(false);
  });
  it('rejects external relationships without making network requests', async () => {
    const parts = workbookParts();
    parts[3]!.text = `<Relationships xmlns="${packageNs}"><Relationship Id="sheet" Type="${relNs}/worksheet" Target="https://invalid.test/data" TargetMode="External"/></Relationships>`;
    expect(codes(await parse(xlsxFile(parts)))).toContain('EXTERNAL_LINK');
  });
  it('rejects unreferenced malicious relationships too', async () => {
    const parts = workbookParts();
    parts.push({
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      text: `<Relationships xmlns="${packageNs}"><Relationship Id="x" Type="${relNs}/hyperlink" Target="https://invalid.test/" TargetMode="External"/></Relationships>`,
    });
    expect(codes(await parse(xlsxFile(parts)))).toContain('EXTERNAL_LINK');
  });
  it('rejects DTD and XXE content without resolving entities', async () => {
    const sheet = '<!DOCTYPE worksheet [<!ENTITY secret SYSTEM "file:///private">]>' + sheetXml();
    expect(codes(await parse(xlsxFile(workbookParts({ sheet }))))).toContain('UNSAFE_XML');
  });
  it('rejects deeply nested XML', async () => {
    const sheet = `<worksheet xmlns="${mainNs}">${'<nested>'.repeat(40)}${'</nested>'.repeat(40)}</worksheet>`;
    expect(codes(await parse(xlsxFile(workbookParts({ sheet }))))).toContain('INVALID_XML');
  });
  it('rejects malformed XML', async () => {
    expect(
      codes(await parse(xlsxFile(workbookParts({ sheet: '<worksheet><unclosed>' })))),
    ).toContain('INVALID_XML');
  });
  it('rejects invalid XML entities instead of accepting a cached value', async () => {
    const sheet = sheetXml().replace('2026-01-01', '2026-01-0&#49invalid;');
    expect(codes(await parse(xlsxFile(workbookParts({ sheet }))))).toContain('INVALID_XML');
  });
  it('rejects namespace substitution', async () => {
    expect(
      codes(
        await parse(xlsxFile(workbookParts({ sheet: sheetXml().replace(mainNs, 'urn:invalid') }))),
      ),
    ).toContain('INVALID_XLSX');
  });
  it('rejects duplicate archive paths', async () => {
    const parts = workbookParts();
    expect(codes(await parse(xlsxFile([...parts, parts[4]!])))).toContain('INVALID_ARCHIVE');
  });
  it('rejects traversal archive paths', async () => {
    expect(
      codes(await parse(xlsxFile([...workbookParts(), { name: '../secret.xml', text: '<x/>' }]))),
    ).toContain('INVALID_ARCHIVE');
  });
  it('rejects bad archive checksums', async () => {
    const parts = workbookParts();
    parts[4]!.crc = 0;
    expect(codes(await parse(xlsxFile(parts)))).toContain('INVALID_ARCHIVE');
  });
  it('rejects a mismatched local ZIP filename even when the central directory is valid', async () => {
    const file = xlsxFile();
    const bytes = Buffer.from(file.bytes);
    bytes[30] = 'X'.charCodeAt(0);
    file.bytes = bytes;
    expect(codes(await parse(file))).toContain('INVALID_ARCHIVE');
  });
  it('rejects encrypted ZIP flags', async () => {
    const parts = workbookParts();
    parts[4]!.flags = 1;
    parts[4]!.compress = true;
    expect(codes(await parse(xlsxFile(parts)))).toContain('ENCRYPTED_WORKBOOK');
  });
  it('rejects invalid claimed archive sizes', async () => {
    const parts = workbookParts();
    parts[4]!.declaredSize = 10;
    expect(codes(await parse(xlsxFile(parts)))).toContain('INVALID_ARCHIVE');
  });
  it('rejects unsupported ZIP compression methods', async () => {
    const parts = workbookParts();
    parts[4]!.method = 99;
    expect((await parse(xlsxFile(parts))).eligibleForConfirmation).toBe(false);
  });
  it('rejects malformed and truncated ZIP content', async () => {
    const file = xlsxFile();
    file.bytes = file.bytes.slice(0, -30);
    expect(codes(await parse(file))).toContain('INVALID_ARCHIVE');
  });
  it('rejects arbitrary ZIPs without workbook parts', async () => {
    const file = xlsxFile();
    file.bytes = zipFixture([{ name: 'xl/styles.xml', text: '<styles/>' }]);
    expect(codes(await parse(file))).toContain('INVALID_XLSX');
  });
  it('rejects multiple worksheets including unreferenced sheets', async () => {
    expect(
      codes(
        await parse(
          xlsxFile([...workbookParts(), { name: 'xl/worksheets/sheet2.xml', text: sheetXml() }]),
        ),
      ),
    ).toContain('WORKSHEET_LIMIT');
  });
  it('rejects decompression bombs before inflating oversized content', async () => {
    const parts = workbookParts();
    parts[4] = { ...parts[4]!, text: 'A'.repeat(PARSER_LIMITS.entryBytes + 1), compress: true };
    const file = xlsxFile(parts);
    expect(file.bytes.byteLength).toBeLessThan(PARSER_LIMITS.fileBytes);
    expect(codes(await parse(file))).toContain('ARCHIVE_LIMIT');
  });
  it('rejects excessive archive entries', async () => {
    const parts = Array.from({ length: 65 }, (_, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      text: '<x/>',
    }));
    expect(codes(await parse(xlsxFile(parts)))).toContain('ARCHIVE_LIMIT');
  });
  it('rejects more than 5,000 CSV rows instead of silently truncating them', async () => {
    expect(codes(await parse(csvFile(Array.from({ length: 5001 }, () => dataRows[0]!))))).toContain(
      'ROW_LIMIT',
    );
  });
  it('permits the 5,000 CSV row boundary and reports all duplicates', async () => {
    const result = await parse(csvFile(Array.from({ length: 5000 }, () => dataRows[0]!)));
    expect(result.counts.original).toBe(5000);
    expect(result.counts.identicalDuplicates).toBe(4999);
    expect(codes(result)).not.toContain('ROW_LIMIT');
  });
  it('rejects more than 32 CSV columns', async () => {
    expect(
      codes(
        await parse(
          csvFile(
            [],
            Array.from({ length: 33 }, (_, i) => `Column${i}`),
          ),
        ),
      ),
    ).toContain('COLUMN_LIMIT');
  });
  it('rejects an XLSX column outside the supported range', async () => {
    const sheet = sheetXml().replace('r="G2"', 'r="AG2"');
    expect(codes(await parse(xlsxFile(workbookParts({ sheet }))))).toContain('COLUMN_LIMIT');
  });
  it('rejects excessive worksheet row coordinates', async () => {
    const sheet = sheetXml().replace('<row r="4">', '<row r="5002">');
    expect(codes(await parse(xlsxFile(workbookParts({ sheet }))))).toContain('ROW_LIMIT');
  });
  it('rejects oversized cell text and record buffers', async () => {
    const rows = structuredClone(dataRows);
    rows[0]![6] = 'x'.repeat(1025);
    expect(codes(await parse(csvFile(rows)))).toContain('CELL_LIMIT');
    expect(codes(await parse(csvFile([['x'.repeat(33 * 1024)]])))).toContain('MALFORMED_CSV');
  });
  it('reports duplicate and empty headers as blockers', async () => {
    expect(
      codes(await parse(csvFile(dataRows, ['Date', 'Open', 'Open', ...header.slice(3)]))),
    ).toContain('INVALID_HEADERS');
    expect(codes(await parse(csvFile(dataRows, ['', ...header.slice(1)])))).toContain(
      'INVALID_HEADERS',
    );
  });
});

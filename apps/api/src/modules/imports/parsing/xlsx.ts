import { posix } from 'node:path';
import { readArchive } from './archive.js';
import { attribute, children, localName, namespace, readXml, single, XML_NS } from './xml.js';
import type { XmlElement } from './xml.js';
import { checkCell, PARSER_LIMITS, ParseFailure } from './limits.js';
import type { Cell, ParseBudget, ParsedTable } from './limits.js';

function assertRoot(
  root: XmlElement | undefined,
  name: string,
  uri: string,
): asserts root is XmlElement {
  if (!root || localName(root) !== name || namespace(root) !== uri)
    throw new ParseFailure('INVALID_XLSX', 'Required workbook parts or namespaces are missing.');
}
function relationships(
  root: XmlElement,
  base: string,
  parts: Map<string, XmlElement>,
): Map<string, { target: string; type: string }> {
  assertRoot(root, 'Relationships', XML_NS.rels);
  const result = new Map<string, { target: string; type: string }>();
  for (const rel of children(root, 'Relationship', XML_NS.rels)) {
    const { Id: id, Target: target, Type: type, TargetMode: mode } = rel.attributes;
    if (mode && mode !== 'Internal')
      throw new ParseFailure('EXTERNAL_LINK', 'External workbook relationships are not accepted.');
    if (!id || !target || !type || result.has(id) || /[\\%?#:]|(?:^|\/)\.\.(?:\/|$)/.test(target))
      throw new ParseFailure('INVALID_XLSX', 'Workbook relationships are invalid.');
    const allowed = new Set([
      `${XML_NS.officeRels}/officeDocument`,
      `${XML_NS.officeRels}/worksheet`,
      `${XML_NS.officeRels}/styles`,
      `${XML_NS.officeRels}/sharedStrings`,
      `${XML_NS.officeRels}/theme`,
      `${XML_NS.officeRels}/extended-properties`,
      'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
    ]);
    if (!allowed.has(type))
      throw new ParseFailure('ACTIVE_CONTENT', 'Unsupported workbook relationship.');
    const path = posix.normalize(
      target.startsWith('/') ? target.slice(1) : posix.join(base, target),
    );
    if (!parts.has(path))
      throw new ParseFailure('INVALID_XLSX', 'A workbook relationship points to a missing part.');
    result.set(id, { target: path, type });
  }
  return result;
}
function cellValue(cell: XmlElement, strings: string[]): Cell {
  const type = cell.attributes.t ?? 'n';
  const values = children(cell, 'v');
  if (values.length > 1)
    throw new ParseFailure('INVALID_XLSX', 'Duplicate cell values are not accepted.');
  const value = values[0]?.text ?? '';
  let text: string;
  if (type === 's') {
    if (!/^\d{1,6}$/.test(value) || strings[Number(value)] === undefined)
      throw new ParseFailure('INVALID_XLSX', 'Invalid shared-string reference.');
    text = strings[Number(value)]!;
  } else if (type === 'inlineStr') {
    text = single(cell, 'is').text;
  } else if (['n', 'd', 'str'].includes(type)) text = value;
  else
    throw new ParseFailure(
      'UNSUPPORTED_CELL',
      'Boolean, error and unsupported cell types are not accepted.',
    );
  checkCell(text);
  return { text, kind: type === 'n' ? 'NUMBER' : 'TEXT' };
}
export async function readXlsx(bytes: Uint8Array, budget: ParseBudget): Promise<ParsedTable> {
  const archive = await readArchive(bytes, budget);
  const parts = new Map<string, XmlElement>();
  for (const [name, data] of archive) parts.set(name, readXml(data, budget));
  const types = parts.get('[Content_Types].xml');
  assertRoot(types, 'Types', XML_NS.types);
  const overrides = children(types, 'Override', XML_NS.types);
  if (
    !overrides.some(
      (item) =>
        item.attributes.PartName === '/xl/workbook.xml' &&
        item.attributes.ContentType ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    )
  )
    throw new ParseFailure('CONTENT_MISMATCH', 'The archive is not a standard XLSX workbook.');
  for (const item of [...overrides, ...children(types, 'Default', XML_NS.types)]) {
    if (/macro|vba|external|ole|activeX/i.test(item.attributes.ContentType ?? ''))
      throw new ParseFailure('ACTIVE_CONTENT', 'Active workbook content types are not accepted.');
  }
  const packageRels = parts.get('_rels/.rels');
  assertRoot(packageRels, 'Relationships', XML_NS.rels);
  const rootRelationships = relationships(packageRels, '', parts);
  if (
    [...rootRelationships.values()].filter(
      (r) => r.type === `${XML_NS.officeRels}/officeDocument` && r.target === 'xl/workbook.xml',
    ).length !== 1
  )
    throw new ParseFailure('INVALID_XLSX', 'A single standard workbook relationship is required.');
  const book = parts.get('xl/workbook.xml');
  assertRoot(book, 'workbook', XML_NS.sheet);
  const bookRels = parts.get('xl/_rels/workbook.xml.rels');
  assertRoot(bookRels, 'Relationships', XML_NS.rels);
  const rels = relationships(bookRels, 'xl', parts);
  // Inspect every relationship part, including unreferenced sheet relationships.
  for (const [name, part] of parts)
    if (name.endsWith('.rels') && !['_rels/.rels', 'xl/_rels/workbook.xml.rels'].includes(name))
      relationships(part, 'xl/worksheets', parts);
  const sheets = children(single(book, 'sheets'), 'sheet');
  const sheetParts = [...parts.keys()].filter((path) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(path),
  );
  if (sheets.length !== 1 || sheetParts.length !== 1)
    throw new ParseFailure('WORKSHEET_LIMIT', 'Exactly one data worksheet is supported.');
  const relation = rels.get(attribute(sheets[0]!, 'id', XML_NS.officeRels) ?? '');
  if (
    !relation ||
    relation.type !== `${XML_NS.officeRels}/worksheet` ||
    relation.target !== sheetParts[0]
  )
    throw new ParseFailure('INVALID_XLSX', 'The worksheet relationship is invalid.');
  const sheet = parts.get(relation.target);
  assertRoot(sheet, 'worksheet', XML_NS.sheet);
  const properties = children(book, 'workbookPr');
  if (properties.length > 1)
    throw new ParseFailure('INVALID_XLSX', 'Duplicate workbook properties.');
  const date1904 = properties[0]?.attributes.date1904 ?? '0';
  if (!['0', '1', 'false', 'true'].includes(date1904))
    throw new ParseFailure('INVALID_XLSX', 'Invalid workbook date system.');
  const stringsPart = parts.get('xl/sharedStrings.xml');
  if (stringsPart) assertRoot(stringsPart, 'sst', XML_NS.sheet);
  const strings: string[] = [];
  for (const item of stringsPart ? children(stringsPart, 'si') : []) {
    if (strings.length >= (PARSER_LIMITS.rows + 1) * PARSER_LIMITS.columns)
      throw new ParseFailure('CELL_LIMIT', 'Too many shared strings.');
    checkCell(item.text);
    strings.push(item.text);
  }
  const result: ParsedTable = {
    rows: [],
    dateSystem: ['1', 'true'].includes(date1904) ? '1904' : '1900',
  };
  let lastRow = 0;
  for (const row of children(single(sheet, 'sheetData'), 'row')) {
    budget.check();
    const number = row.attributes.r;
    if (
      !number ||
      !/^[1-9]\d{0,3}$/.test(number) ||
      Number(number) <= lastRow ||
      Number(number) > PARSER_LIMITS.rows + 1
    )
      throw new ParseFailure(
        'ROW_LIMIT',
        'Worksheet row references are invalid or exceed 5,000 data rows.',
      );
    lastRow = Number(number);
    const cells: Cell[] = [];
    let lastColumn = 0;
    for (const cell of children(row, 'c')) {
      const match = /^([A-Z]{1,3})([1-9]\d{0,3})$/.exec(cell.attributes.r ?? '');
      if (!match || Number(match[2]) !== lastRow)
        throw new ParseFailure('INVALID_XLSX', 'Worksheet cell coordinates are invalid.');
      let column = 0;
      for (const letter of match[1]!) column = column * 26 + letter.charCodeAt(0) - 64;
      if (column > PARSER_LIMITS.columns)
        throw new ParseFailure('COLUMN_LIMIT', 'The worksheet exceeds 32 columns.');
      if (column <= lastColumn)
        throw new ParseFailure('INVALID_XLSX', 'Duplicate or unordered worksheet cells.');
      lastColumn = column;
      while (cells.length < column - 1) cells.push({ text: '', kind: 'TEXT' });
      cells.push(cellValue(cell, strings));
    }
    if (lastRow === 1 || cells.some((cell) => cell.text.trim() !== ''))
      result.rows.push({ row: lastRow, cells });
  }
  if (result.rows[0]?.row !== 1)
    throw new ParseFailure('MISSING_COLUMNS', 'The worksheet must start with a header row.');
  return result;
}

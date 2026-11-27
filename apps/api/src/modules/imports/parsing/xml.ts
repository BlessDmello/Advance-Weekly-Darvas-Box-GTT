import { parseXml, XmlElement } from '@rgrove/parse-xml';
import { decodeUtf8, PARSER_LIMITS, ParseFailure } from './limits.js';
import type { ParseBudget } from './limits.js';

export const XML_NS = {
  sheet: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
  officeRels: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  types: 'http://schemas.openxmlformats.org/package/2006/content-types',
} as const;
export function namespace(element: XmlElement): string {
  const prefix = element.name.includes(':') ? element.name.split(':')[0] : '';
  const key = prefix ? `xmlns:${prefix}` : 'xmlns';
  let current: XmlElement | null = element;
  while (current) {
    const value = current.attributes[key];
    if (value !== undefined) return value;
    current = current.parent instanceof XmlElement ? current.parent : null;
  }
  return '';
}
export function localName(element: XmlElement): string {
  return element.name.split(':').at(-1)!;
}
export function children(
  element: XmlElement,
  name: string,
  uri: string = XML_NS.sheet,
): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement =>
      child instanceof XmlElement && localName(child) === name && namespace(child) === uri,
  );
}
export function single(element: XmlElement, name: string, uri: string = XML_NS.sheet): XmlElement {
  const matches = children(element, name, uri);
  if (matches.length !== 1)
    throw new ParseFailure('INVALID_XLSX', 'Workbook structure is missing or ambiguous.');
  return matches[0]!;
}
export function attribute(element: XmlElement, local: string, uri: string): string | undefined {
  for (const [key, value] of Object.entries(element.attributes)) {
    const [prefix, name] = key.split(':');
    if (name === local) {
      let current: XmlElement | null = element;
      while (current) {
        const ns = current.attributes[`xmlns:${prefix}`];
        if (ns !== undefined) {
          if (ns === uri) return value;
          break;
        }
        current = current.parent instanceof XmlElement ? current.parent : null;
      }
    }
  }
  return undefined;
}
export function readXml(bytes: Buffer, budget: ParseBudget): XmlElement {
  budget.check();
  const text = decodeUtf8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || /<\?xml[^?]*encoding\s*=\s*["'](?!utf-8["'])/i.test(text))
    throw new ParseFailure('UNSAFE_XML', 'DTD declarations and non-UTF-8 XML are not accepted.');
  // Bound allocations before building a tree, including ignored/comment markup.
  let markers = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '<' && ++markers > PARSER_LIMITS.xmlNodes)
      throw new ParseFailure('XML_LIMIT', 'Workbook XML exceeds structural limits.');
  }
  try {
    const root = parseXml(text, {
      maxElementDepth: PARSER_LIMITS.xmlDepth,
      rejectAttributeListDeclarations: true,
    }).root;
    if (!root) throw new Error();
    const stack = [root];
    while (stack.length) {
      budget.check();
      const element = stack.pop()!;
      if (
        [
          'f',
          'formula',
          'definedName',
          'externalLink',
          'oleObject',
          'control',
          'AlternateContent',
        ].includes(localName(element))
      )
        throw new ParseFailure(
          'ACTIVE_CONTENT',
          'Formulas, external links and active workbook content are not accepted.',
        );
      for (const child of element.children) if (child instanceof XmlElement) stack.push(child);
    }
    return root;
  } catch (error) {
    if (error instanceof ParseFailure) throw error;
    throw new ParseFailure('INVALID_XML', 'Workbook XML is malformed or exceeds its depth limit.');
  }
}
export type { XmlElement };

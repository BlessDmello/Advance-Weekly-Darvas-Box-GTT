import { crc32 } from 'node:zlib';
import { fromBufferPromise } from 'yauzl';
import { PARSER_LIMITS, ParseFailure } from './limits.js';
import type { ParseBudget } from './limits.js';

/** No extraction, disk writes, URLs or archive recursion. Every entry is counted. */
export async function readArchive(
  bytes: Uint8Array,
  budget: ParseBudget,
): Promise<Map<string, Buffer>> {
  let zip;
  try {
    zip = await fromBufferPromise(Buffer.from(bytes), {
      lazyEntries: true,
      autoClose: false,
      validateEntrySizes: true,
      strictFileNames: true,
    });
    if (zip.entryCount > PARSER_LIMITS.archiveEntries)
      throw new ParseFailure('ARCHIVE_LIMIT', 'The workbook has too many archive entries.');
    const parts = new Map<string, Buffer>();
    const names = new Set<string>();
    const ranges: { start: number; end: number }[] = [];
    let total = 0;
    for await (const entry of zip.eachEntry()) {
      budget.check();
      const name = entry.fileName;
      if (names.has(name.toLowerCase()))
        throw new ParseFailure('INVALID_ARCHIVE', 'Duplicate archive paths are not supported.');
      names.add(name.toLowerCase());
      if (entry.isEncrypted() || entry.generalPurposeBitFlag & 0x40)
        throw new ParseFailure('ENCRYPTED_WORKBOOK', 'Encrypted workbooks are not supported.');
      if (
        !/^[A-Za-z0-9_[\]./-]+$/.test(name) ||
        name.split('/').includes('..') ||
        name.startsWith('/') ||
        ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
      )
        throw new ParseFailure('INVALID_ARCHIVE', 'Unsafe archive paths are not supported.');
      if (name.endsWith('/')) continue;
      if (/vba|macro|externalLink|embedding|activeX/i.test(name))
        throw new ParseFailure(
          'ACTIVE_CONTENT',
          'Macros, external links and embedded objects are not supported.',
        );
      const allowed =
        /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:core|app)\.xml|xl\/(?:workbook\.xml|styles\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|theme\/theme\d+\.xml|worksheets\/sheet\d+\.xml|worksheets\/_rels\/sheet\d+\.xml\.rels))$/;
      if (!allowed.test(name))
        throw new ParseFailure('UNSUPPORTED_WORKBOOK', 'The workbook contains unsupported parts.');
      if (
        ![0, 8].includes(entry.compressionMethod) ||
        entry.uncompressedSize > PARSER_LIMITS.entryBytes ||
        entry.uncompressedSize >
          Math.max(4096, entry.compressedSize * PARSER_LIMITS.compressionRatio) ||
        total + entry.uncompressedSize > PARSER_LIMITS.inflatedBytes
      )
        throw new ParseFailure('ARCHIVE_LIMIT', 'The workbook exceeds decompression limits.');
      const local = await zip.readLocalFileHeaderPromise(entry);
      if (
        !local.fileName.equals(Buffer.from(name)) ||
        local.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
        local.compressionMethod !== entry.compressionMethod ||
        (!(entry.generalPurposeBitFlag & 8) &&
          (local.crc32 !== entry.crc32 ||
            local.compressedSize !== entry.compressedSize ||
            local.uncompressedSize !== entry.uncompressedSize))
      )
        throw new ParseFailure('INVALID_ARCHIVE', 'Local and central archive headers disagree.');
      const range = {
        start: entry.relativeOffsetOfLocalHeader,
        end: local.fileDataStart + entry.compressedSize,
      };
      if (ranges.some((prior) => range.start < prior.end && range.end > prior.start))
        throw new ParseFailure('INVALID_ARCHIVE', 'Overlapping archive entries are not accepted.');
      ranges.push(range);
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let actual = 0;
      let checksum = 0;
      try {
        for await (const chunk of stream) {
          budget.check();
          const buffer = Buffer.from(chunk as Uint8Array);
          actual += buffer.length;
          total += buffer.length;
          if (actual > PARSER_LIMITS.entryBytes || total > PARSER_LIMITS.inflatedBytes)
            throw new ParseFailure('ARCHIVE_LIMIT', 'The workbook exceeds decompression limits.');
          checksum = crc32(buffer, checksum);
          chunks.push(buffer);
        }
      } finally {
        stream.destroy();
      }
      if (actual !== entry.uncompressedSize || checksum !== entry.crc32)
        throw new ParseFailure(
          'INVALID_ARCHIVE',
          'Workbook archive integrity verification failed.',
        );
      parts.set(name, Buffer.concat(chunks, actual));
    }
    return parts;
  } catch (error) {
    if (error instanceof ParseFailure) throw error;
    throw new ParseFailure('INVALID_ARCHIVE', 'The XLSX archive is malformed or unsupported.');
  } finally {
    zip?.close();
  }
}

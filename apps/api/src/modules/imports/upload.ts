import busboy from 'busboy';
import type { Request } from 'express';
import { IMPORT_LIMITS } from '@darvas/contracts';
import type { ImportFile } from './parsing/limits.js';
import { ImportError } from './service.js';

let active = 0;
/** Auth/Origin/CSRF run before entering this bounded memory-only multipart reader. */
export async function readImportUpload(
  request: Request,
): Promise<{ file: ImportFile; fields: Record<string, string> }> {
  if (!request.is('multipart/form-data'))
    throw new ImportError(415, 'INVALID_FILE', 'A multipart CSV/XLSX upload is required.');
  if (active >= 2)
    throw new ImportError(429, 'UPLOAD_BUSY', 'Upload capacity is temporarily unavailable.');
  const maximum = IMPORT_LIMITS.fileBytes + 65_536;
  if (Number(request.headers['content-length'] ?? 0) > maximum)
    throw new ImportError(413, 'UPLOAD_LIMIT', 'The upload exceeds its byte limit.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      let parser: ReturnType<typeof busboy>;
      try {
        parser = busboy({
          headers: request.headers,
          preservePath: true,
          defParamCharset: 'utf8',
          limits: {
            files: 1,
            fields: 12,
            parts: 13,
            fieldNameSize: 80,
            fieldSize: 16_384,
            fileSize: IMPORT_LIMITS.fileBytes + 1,
            headerPairs: 32,
          },
        });
      } catch {
        reject(new ImportError(400, 'INVALID_MULTIPART', 'The multipart boundary is invalid.'));
        return;
      }
      const fields = new Map<string, string>();
      let file: ImportFile | undefined;
      let settled = false,
        received = 0,
        files = 0;
      const cleanup = () => {
        clearTimeout(timer);
        request.off('data', count);
        request.off('aborted', abort);
        request.off('error', abort);
      };
      const fail = (status = 400, code = 'INVALID_MULTIPART') => {
        if (settled) return;
        settled = true;
        cleanup();
        request.unpipe(parser);
        parser.destroy();
        request.resume();
        reject(
          new ImportError(status, code, 'The upload is malformed or exceeds its supported limits.'),
        );
      };
      const count = (chunk: Buffer) => {
        received += chunk.length;
        if (received > maximum) fail(413, 'UPLOAD_LIMIT');
      };
      const abort = () => fail();
      const timer = setTimeout(() => fail(408, 'UPLOAD_TIMEOUT'), 20_000);
      request.on('data', count).once('aborted', abort).once('error', abort);
      parser.on('file', (name, stream, info) => {
        const filename = info.filename;
        const chunks: Buffer[] = [];
        let bytes = 0;
        stream.on('error', () => fail());
        if (
          ++files > 1 ||
          name !== 'file' ||
          !filename ||
          !['binary', '7bit', '8bit'].includes(info.encoding)
        ) {
          stream.resume();
          fail();
          return;
        }
        stream.on('limit', () => fail(413, 'UPLOAD_LIMIT'));
        stream.on('data', (chunk: Buffer) => {
          if (!settled) {
            bytes += chunk.length;
            if (bytes > IMPORT_LIMITS.fileBytes) {
              fail(413, 'UPLOAD_LIMIT');
              return;
            }
            chunks.push(chunk);
          }
        });
        stream.on('end', () => {
          if (!settled)
            file = { name: filename, mimeType: info.mimeType, bytes: Buffer.concat(chunks, bytes) };
        });
      });
      parser.on('field', (name, value, info) => {
        if (fields.has(name) || info.nameTruncated || info.valueTruncated) {
          fail();
          return;
        }
        fields.set(name, value);
      });
      parser.on('filesLimit', () => fail(413, 'UPLOAD_LIMIT'));
      parser.on('fieldsLimit', () => fail(413, 'UPLOAD_LIMIT'));
      parser.on('partsLimit', () => fail(413, 'UPLOAD_LIMIT'));
      parser.on('error', () => fail());
      parser.on('close', () => {
        if (settled) return;
        if (!file || files !== 1) {
          fail();
          return;
        }
        settled = true;
        cleanup();
        resolve({ file, fields: Object.fromEntries(fields) });
      });
      request.pipe(parser);
    });
  } finally {
    active--;
  }
}

import { createHash } from 'node:crypto';
import {
  IMPORT_LIMITS,
  importPreviewMetadataSchema,
  normalizedPriceRowSchema,
  marketReferencePolicySchema,
} from '@darvas/contracts';
import type {
  ImportPreviewInput,
  ImportCommitInput,
  PublicUser,
  ImportPreviewMetadata,
  NormalizedPriceRow,
  MarketReferencePolicy,
} from '@darvas/contracts';
import { marketFingerprint, MarketStorageError, sameMarketObservation } from '@darvas/database';
import type { MarketRepository } from '@darvas/database';
import { parseMarketFile } from './parsing/parser.js';
import { validateFile } from './parsing/parser-core.js';
import type { ImportFile } from './parsing/limits.js';
import { ParseFailure } from './parsing/limits.js';
import { createTokenMaterial, hashToken } from '../auth/tokens.js';

export interface MarketDependencies {
  repository(): Promise<MarketRepository>;
  policy(): MarketReferencePolicy;
  parse?: typeof parseMarketFile;
}
export class ImportError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function readMarketReferencePolicy(
  environment: Record<string, string | undefined>,
): MarketReferencePolicy {
  try {
    const text = environment.MARKET_REFERENCE_APPROVALS;
    if (text && Buffer.byteLength(text) > 32_768) throw new Error();
    return marketReferencePolicySchema.parse(
      text === undefined ? { stocks: [], calendars: [], priceSources: [] } : JSON.parse(text),
    );
  } catch {
    throw new ImportError(
      503,
      'REFERENCE_APPROVAL_UNAVAILABLE',
      'Market reference approvals are unavailable.',
    );
  }
}
export async function importOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (error instanceof MarketStorageError) {
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'LIMITED'
            ? 429
            : error.code === 'FORBIDDEN'
              ? 403
              : [
                    'STALE_PREVIEW',
                    'IDEMPOTENCY_CONFLICT',
                    'STOCK_IMPORT_BUSY',
                    'PREVIEW_CONSUMED',
                  ].includes(error.code)
                ? 409
                : 422;
      const messages = {
        NOT_FOUND: 'The requested import was not found.',
        LIMITED: 'Import preview capacity is temporarily unavailable.',
        FORBIDDEN: 'Administrator access is required.',
        PREVIEW_INVALID: 'The staged preview is incomplete or invalid.',
        PREVIEW_BLOCKED:
          'The preview has expired, was consumed, or has blocking validation errors.',
        PREVIEW_CONSUMED: 'The preview has already been confirmed. Create a new preview.',
        STALE_PREVIEW: 'The dataset or reference data changed. Create a new preview.',
        IDEMPOTENCY_CONFLICT: 'The idempotency key was already used for a different request.',
        STOCK_IMPORT_BUSY: 'This stock already has an active import.',
        CORRECTION_REASON_REQUIRED:
          'An explicit reason is required for historical price corrections.',
        REFERENCE_UNAVAILABLE: 'The selected stock or its approved reference data is unavailable.',
      } as const;
      throw new ImportError(status, error.code, messages[error.code]);
    }
    throw new ImportError(
      503,
      'MARKET_STORAGE_UNAVAILABLE',
      'Market storage is unavailable or requires explicit operator preparation.',
    );
  }
}
export async function previewImport(
  dependencies: MarketDependencies,
  actor: PublicUser,
  file: ImportFile,
  input: ImportPreviewInput,
) {
  let format: 'CSV' | 'XLSX';
  try {
    format = validateFile(file);
  } catch (error) {
    throw new ImportError(
      error instanceof ParseFailure && error.code === 'FILE_SIZE' ? 413 : 415,
      'INVALID_FILE',
      'The upload is empty, exceeds its limit, or has unsupported file content.',
    );
  }
  return importOperation(async () => {
    const policy = dependencies.policy();
    const repository = await dependencies.repository();
    const stockId = await repository.stockBySymbol(input.stockSymbol, input.series);
    const refs = await repository.references(stockId, input.requestedRange, policy);
    const sourceApproved = policy.priceSources.some(
      (entry) =>
        entry.provider === input.source.provider &&
        entry.reference === input.source.reference &&
        entry.basis === input.adjustmentBasis &&
        entry.adjustmentVersion === input.source.adjustmentVersion,
    );
    // An approved source policy authorizes ingestion; it does not independently
    // authenticate this particular uploaded file or its historical price values.
    const source = {
      ...input.source,
      basis: input.adjustmentBasis,
      verification: 'DECLARED' as const,
      declaredAt: new Date().toISOString(),
    };
    const stockIdentity = {
      exchange: refs.stock.exchange,
      symbol: refs.stock.symbol,
      series: refs.stock.series,
    };
    const parsed = await (dependencies.parse ?? parseMarketFile)(
      file,
      {
        stock: { ...stockIdentity, stockId },
        mapping: input.mapping,
        source,
        dateMode: input.dateMode,
        requestedRange: input.requestedRange,
        minimumHistorySessions: input.minimumHistorySessions,
        expectedCompletedSession: input.expectedCompletedSession,
      },
      refs.calendar,
    );
    if (
      parsed.diagnostics.some((item) =>
        ['PARSER_BUSY', 'PARSER_TIMEOUT', 'PARSER_RESOURCE_LIMIT', 'PARSER_FAILED'].includes(
          item.code,
        ),
      )
    )
      throw new ImportError(
        503,
        'PARSER_UNAVAILABLE',
        'The bounded parser is temporarily unavailable.',
      );
    let errors = parsed.errorCount;
    const diagnostics = [...parsed.diagnostics];
    function block(code: string, message: string) {
      errors++;
      const entry = {
        code,
        message,
        severity: 'ERROR' as const,
        row: null,
        field: 'source' as const,
      };
      if (diagnostics.length < IMPORT_LIMITS.diagnostics) diagnostics.push(entry);
      else {
        const index = diagnostics.findIndex((item) => item.severity === 'WARNING');
        if (index >= 0) diagnostics[index] = entry;
      }
    }
    if (!refs.approved)
      block(
        'STOCK_REFERENCE_UNAPPROVED',
        'The stock master record does not match an operator-approved reference.',
      );
    if (!sourceApproved)
      block(
        'SOURCE_UNAPPROVED',
        'The price source and adjustment basis are not operator-approved.',
      );
    const previous = new Map(
      (await repository.prices(stockId, input.requestedRange)).map((row) => [row.sessionDate, row]),
    );
    if (
      !['UNAVAILABLE', 'PUBLISHED'].includes(refs.stock.publication.state) ||
      (refs.stock.publication.state === 'UNAVAILABLE' && previous.size > 0)
    )
      block('DATASET_NOT_READY', 'The existing dataset is incomplete or unpublished.');
    if (await repository.busy(stockId))
      block('STOCK_IMPORT_BUSY', 'This stock already has an active import.');
    const rows: NormalizedPriceRow[] = [];
    let added = 0,
      changed = 0,
      unchanged = 0,
      basisConflicts = 0;
    if (source.basis === 'RAW' || source.basis === 'ADJUSTED')
      for (const row of parsed.records) {
        const normalized = normalizedPriceRowSchema.parse({
          sessionDate: row.sessionDate,
          raw: source.basis === 'RAW' ? row.ohlc : null,
          adjusted: source.basis === 'ADJUSTED' ? row.ohlc : null,
          volume: row.volume,
          provenance: source,
          qualityFlags: [],
        });
        rows.push(normalized);
        const old = previous.get(row.sessionDate);
        if (!old) added++;
        else {
          if (
            old.provenance.basis !== source.basis ||
            old.provenance.adjustmentVersion !== source.adjustmentVersion
          )
            basisConflicts++;
          if (sameMarketObservation(old, normalized)) unchanged++;
          else changed++;
        }
      }
    if (basisConflicts)
      block(
        'PRICE_BASIS_CONFLICT',
        'Existing history uses a different price basis or adjustment version; reconciliation is required.',
      );
    const expiresAt = new Date(Date.now() + IMPORT_LIMITS.previewMilliseconds).toISOString();
    const read = parsed.counts.original - parsed.counts.identicalDuplicates;
    const metadata: ImportPreviewMetadata = importPreviewMetadataSchema.parse({
      stockId,
      familyId: actor.familyId,
      uploadedBy: actor.id,
      fileName: file.name,
      fileBytes: file.bytes.byteLength,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      normalizedHash: marketFingerprint(rows),
      fileFormat: format,
      mode: input.mode,
      columnMapping: input.mapping,
      parserVersion: parsed.parserVersion,
      mappingVersion: 'explicit-mapping-v1',
      source,
      range: input.requestedRange,
      rows: {
        read,
        valid: rows.length,
        new: added,
        changed,
        unchanged,
        rejected: read - rows.length,
      },
      quality: {
        valid: errors === 0,
        complete: errors === 0 && parsed.sessions.complete,
        freshness: parsed.sessions.freshness,
        expectedSession: input.expectedCompletedSession,
        latestSession: parsed.sessions.latestSession,
        calendarVersion: parsed.sessions.calendarVersion,
        missingSessions: parsed.sessions.missingSessions,
        missingSessionCount: Math.min(5000, parsed.sessions.missingSessionCount),
        blockingErrorCount: Math.min(5000, errors),
        warningCount: Math.min(10000, parsed.warningCount),
      },
      diagnostics,
      baseRevision: refs.stock.publication.revision,
      expiresAt,
      context: {
        stockIdentity,
        referenceApprovalHash: refs.approvalHash,
        referenceDataHash: refs.dataHash,
        dateMode: input.dateMode,
        minimumHistorySessions: input.minimumHistorySessions,
        expectedCompletedSession: input.expectedCompletedSession,
      },
    });
    const token = createTokenMaterial();
    await repository.stage(actor, token.hash, metadata, rows, policy);
    return {
      previewToken: token.token,
      symbol: input.stockSymbol,
      fileFormat: format,
      dateRange: metadata.range,
      rows: metadata.rows,
      normalization: parsed.counts,
      missingSessions: metadata.quality.missingSessions,
      blockingErrors: diagnostics.filter((item) => item.severity === 'ERROR'),
      warnings: diagnostics.filter((item) => item.severity === 'WARNING'),
      errorCount: errors,
      warningCount: parsed.warningCount,
      diagnosticsTruncated: errors + parsed.warningCount > diagnostics.length,
      completeness: parsed.sessions,
      correctionPreview: { changed, basisConflicts, requiresReason: changed > 0 },
      committable: errors === 0 && parsed.eligibleForConfirmation,
      expiresAt,
      processingScope: 'PRICE_IMPORT',
      derivedStatus: 'DEFERRED',
    };
  });
}
export async function confirmImport(
  dependencies: MarketDependencies,
  actor: PublicUser,
  input: ImportCommitInput,
  key: string,
) {
  return importOperation(async () =>
    (await dependencies.repository()).commit(
      actor,
      hashToken(input.previewToken),
      key,
      marketFingerprint({
        tokenHash: hashToken(input.previewToken),
        correctionReason: input.correctionReason,
      }),
      input.correctionReason,
      dependencies.policy(),
    ),
  );
}

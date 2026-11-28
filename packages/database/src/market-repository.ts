import { marketFingerprint, stockReferenceFingerprint } from './market-content.js';
export {
  marketFingerprint,
  stockReferenceFingerprint,
  sameMarketObservation,
} from './market-content.js';
import { readPublishedPrices } from './published-prices.js';
import type { ClientSession, Connection } from 'mongoose';
import {
  IMPORT_LIMITS,
  importPreviewMetadataSchema,
  importBatchMetadataSchema,
  importJobRecordSchema,
  isImportPreviewCommittable,
  normalizedPriceRowSchema,
  publicImportJobStatus,
  stockRecordSchema,
  tradingSessionSchema,
} from '@darvas/contracts';
import type {
  ImportPreviewMetadata,
  NormalizedPriceRow,
  MarketReferencePolicy,
  TradingSession,
  PublicUser,
  MarketPageQuery,
  ImportJobRecord,
} from '@darvas/contracts';
import { createMarketModels } from './market-models.js';
import { createAuthModels } from './models/index.js';
import { recordInput } from './models/market-options.js';

export class MarketStorageError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'PREVIEW_INVALID'
      | 'PREVIEW_BLOCKED'
      | 'STALE_PREVIEW'
      | 'IDEMPOTENCY_CONFLICT'
      | 'STOCK_IMPORT_BUSY'
      | 'CORRECTION_REASON_REQUIRED'
      | 'REFERENCE_UNAVAILABLE'
      | 'LIMITED'
      | 'FORBIDDEN'
      | 'PREVIEW_CONSUMED',
  ) {
    super(code);
  }
}
export function createMarketRepository(connection: Connection) {
  const models = createMarketModels(connection);
  const identities = createAuthModels(connection);
  const id = (value: string) => new connection.base.Types.ObjectId(value);
  const actorScope = (actor: PublicUser) => ({
    familyId: id(actor.familyId),
    uploadedBy: id(actor.id),
  });
  const active = ['QUEUED', 'RUNNING', 'RETRY'] as const;
  async function assertActor(actor: PublicUser, session: ClientSession) {
    if (
      !(await identities.User.exists({
        _id: id(actor.id),
        familyId: id(actor.familyId),
        role: 'ADMIN',
        status: 'ACTIVE',
      }).session(session)) ||
      !(await identities.Family.exists({ _id: id(actor.familyId), status: 'ACTIVE' }).session(
        session,
      ))
    )
      throw new MarketStorageError('FORBIDDEN');
  }
  async function references(
    stockId: string,
    range: { from: string; to: string },
    policy: MarketReferencePolicy,
    session?: ClientSession,
  ) {
    const document = await models.Stock.findById(stockId).session(session ?? null);
    if (!document) throw new MarketStorageError('REFERENCE_UNAVAILABLE');
    const stock = stockRecordSchema.parse(recordInput(document));
    const approved =
      stock.status === 'ACTIVE' &&
      policy.stocks.some(
        (entry) =>
          entry.stockId === stockId && entry.fingerprint === stockReferenceFingerprint(stock),
      );
    const candidates = policy.calendars.filter(
      (entry) => entry.from <= range.from && entry.to >= range.to,
    );
    const approval = candidates.length === 1 ? candidates[0] : undefined;
    let calendar: {
      source: string;
      version: string;
      from: string;
      to: string;
      days: TradingSession[];
    } | null = null;
    if (approval) {
      const documents = await models.TradingSession.find({
        exchange: 'NSE',
        sessionDate: { $gte: approval.from, $lte: approval.to },
      })
        .sort({ sessionDate: 1 })
        .limit(20_001)
        .session(session ?? null);
      const days = documents.map((day) => tradingSessionSchema.parse(recordInput(day)));
      if (
        days.length <= 20_000 &&
        marketFingerprint(days) === approval.fingerprint &&
        days.every(
          (day) =>
            day.calendarSource === approval.source && day.calendarVersion === approval.version,
        )
      )
        calendar = {
          source: approval.source,
          version: approval.version,
          from: approval.from,
          to: approval.to,
          days,
        };
    }
    return {
      document,
      stock,
      approved,
      calendar,
      approvalHash: marketFingerprint(policy),
      dataHash: marketFingerprint({ stock: stockReferenceFingerprint(stock), calendar }),
    };
  }
  function jobDto(job: ImportJobRecord, jobId: string) {
    return {
      jobId,
      batchId: job.importBatchId,
      status: publicImportJobStatus(job),
      phase: job.phase,
      processed: job.cursor,
      total: job.total,
      inserted: job.counts.inserted,
      updated: job.counts.updated,
      unchanged: job.counts.unchanged,
      failed: 0,
      errors: job.errorCode ? [{ code: job.errorCode }] : [],
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      processingScope: job.processingScope,
      derivedStatus: job.derivedStatus,
      executionAvailable: false as const,
    };
  }
  async function confirmed(actor: PublicUser, key: string, requestHash: string) {
    const batch = await models.ImportBatch.findOne({ ...actorScope(actor), idempotencyKey: key });
    if (!batch) return null;
    if (batch.get('requestHash') !== requestHash)
      throw new MarketStorageError('IDEMPOTENCY_CONFLICT');
    const job = await models.ImportJob.findOne({
      importBatchId: batch._id,
      ...actorScope(actor),
    }).orFail();
    return {
      batchId: batch.id as string,
      jobId: job.id as string,
      status: publicImportJobStatus(importJobRecordSchema.parse(recordInput(job))),
      executionAvailable: false as const,
    };
  }
  return {
    async stockBySymbol(symbol: string, series: string) {
      const stock = await models.Stock.findOne({ exchange: 'NSE', symbol, series });
      if (!stock) throw new MarketStorageError('REFERENCE_UNAVAILABLE');
      return stock.id as string;
    },
    async references(
      stockId: string,
      range: { from: string; to: string },
      policy: MarketReferencePolicy,
      session?: ClientSession,
    ) {
      const result = await references(stockId, range, policy, session);
      return {
        stock: result.stock,
        approved: result.approved,
        calendar: result.calendar,
        approvalHash: result.approvalHash,
        dataHash: result.dataHash,
      };
    },
    async prices(stockId: string, range: { from: string; to: string }) {
      const published = await readPublishedPrices(connection, stockId);
      return (published?.rows ?? [])
        .filter((row) => row.sessionDate >= range.from && row.sessionDate <= range.to)
        .map((row) =>
          normalizedPriceRowSchema.parse({
            sessionDate: row.sessionDate,
            raw: row.raw,
            adjusted: row.adjusted,
            volume: row.volume,
            provenance: row.provenance,
            qualityFlags: row.qualityFlags,
          }),
        );
    },
    async busy(stockId: string) {
      return Boolean(
        await models.ImportJob.exists({ stockId: id(stockId), status: { $in: active } }),
      );
    },
    async stage(
      actor: PublicUser,
      tokenHash: string,
      metadata: ImportPreviewMetadata,
      rows: NormalizedPriceRow[],
      policy: MarketReferencePolicy,
    ) {
      importPreviewMetadataSchema.parse(metadata);
      if (
        metadata.uploadedBy !== actor.id ||
        metadata.familyId !== actor.familyId ||
        rows.length !== metadata.rows.valid ||
        marketFingerprint(rows) !== metadata.normalizedHash
      )
        throw new MarketStorageError('PREVIEW_INVALID');
      await connection.transaction(async (session) => {
        await assertActor(actor, session);
        const current = await references(metadata.stockId, metadata.range, policy, session);
        if (
          current.stock.publication.revision !== metadata.baseRevision ||
          !metadata.context ||
          current.dataHash !== metadata.context.referenceDataHash ||
          current.approvalHash !== metadata.context.referenceApprovalHash
        )
          throw new MarketStorageError('STALE_PREVIEW');
        if (
          (await models.ImportStaging.countDocuments({
            ...actorScope(actor),
            kind: 'MANIFEST',
            state: 'PREVIEW',
            expiresAt: { $gt: new Date() },
          }).session(session)) >= 10
        )
          throw new MarketStorageError('LIMITED');
        const stagingId = new connection.base.Types.ObjectId();
        const common = {
          stagingId,
          stockId: metadata.stockId,
          ...actorScope(actor),
          state: 'PREVIEW',
          jobId: null,
          expiresAt: metadata.expiresAt,
        };
        await new models.ImportStaging({
          ...common,
          _id: stagingId,
          kind: 'MANIFEST',
          tokenHash,
          metadata,
          rowCount: rows.length,
          chunkCount: Math.ceil(rows.length / IMPORT_LIMITS.chunkRows),
        }).save({ session });
        for (let offset = 0; offset < rows.length; offset += IMPORT_LIMITS.chunkRows) {
          const chunk = rows.slice(offset, offset + IMPORT_LIMITS.chunkRows);
          await new models.ImportStaging({
            ...common,
            kind: 'CHUNK',
            ordinal: offset / IMPORT_LIMITS.chunkRows,
            chunkHash: marketFingerprint(chunk),
            rows: chunk,
          }).save({ session });
        }
      });
    },
    async commit(
      actor: PublicUser,
      tokenHash: string,
      key: string,
      requestHash: string,
      reason: string | null,
      policy: MarketReferencePolicy,
    ) {
      const prior = await confirmed(actor, key, requestHash);
      if (prior) return prior;
      try {
        await connection.transaction(async (session) => {
          await assertActor(actor, session);
          const manifest = await models.ImportStaging.findOne({
            ...actorScope(actor),
            kind: 'MANIFEST',
            tokenHash,
          })
            .select('+tokenHash')
            .session(session);
          if (!manifest) throw new MarketStorageError('NOT_FOUND');
          if (manifest.get('state') !== 'PREVIEW') throw new MarketStorageError('PREVIEW_CONSUMED');
          const metadata = importPreviewMetadataSchema.parse(
            (recordInput(manifest) as { metadata: unknown }).metadata,
          );
          if (
            manifest.get('state') !== 'PREVIEW' ||
            !isImportPreviewCommittable(metadata, new Date()) ||
            !manifest.get('expiresAt') ||
            manifest.get('expiresAt')!.getTime() <= Date.now()
          )
            throw new MarketStorageError('PREVIEW_BLOCKED');
          if (metadata.rows.changed > 0 && !reason)
            throw new MarketStorageError('CORRECTION_REASON_REQUIRED');
          const current = await references(metadata.stockId, metadata.range, policy, session);
          if (
            !current.approved ||
            !current.calendar ||
            !metadata.context ||
            metadata.context.referenceApprovalHash !== current.approvalHash ||
            metadata.context.referenceDataHash !== current.dataHash ||
            marketFingerprint(metadata.context.stockIdentity) !==
              marketFingerprint({
                exchange: current.stock.exchange,
                symbol: current.stock.symbol,
                series: current.stock.series,
              })
          )
            throw new MarketStorageError('REFERENCE_UNAVAILABLE');
          if (
            current.stock.publication.revision !== metadata.baseRevision ||
            !['UNAVAILABLE', 'PUBLISHED'].includes(current.stock.publication.state)
          )
            throw new MarketStorageError('STALE_PREVIEW');
          if (
            await models.ImportJob.exists({
              stockId: id(metadata.stockId),
              status: { $in: active },
            }).session(session)
          )
            throw new MarketStorageError('STOCK_IMPORT_BUSY');
          const chunks = await models.ImportStaging.find({ stagingId: manifest._id, kind: 'CHUNK' })
            .sort({ ordinal: 1 })
            .session(session);
          const rows: NormalizedPriceRow[] = [];
          if (chunks.length !== manifest.get('chunkCount'))
            throw new MarketStorageError('PREVIEW_INVALID');
          for (const [ordinal, chunk] of chunks.entries()) {
            const values = (recordInput(chunk) as { rows: NormalizedPriceRow[] }).rows;
            if (
              chunk.get('ordinal') !== ordinal ||
              chunk.get('state') !== 'PREVIEW' ||
              String(chunk.get('familyId')) !== actor.familyId ||
              String(chunk.get('uploadedBy')) !== actor.id ||
              String(chunk.get('stockId')) !== metadata.stockId ||
              !chunk.get('expiresAt') ||
              chunk.get('expiresAt')!.toISOString() !== metadata.expiresAt ||
              marketFingerprint(values) !== chunk.get('chunkHash') ||
              values.length !== Math.min(IMPORT_LIMITS.chunkRows, metadata.rows.valid - rows.length)
            )
              throw new MarketStorageError('PREVIEW_INVALID');
            for (const row of values) {
              normalizedPriceRowSchema.parse(row);
              if (
                marketFingerprint(row.provenance) !== marketFingerprint(metadata.source) ||
                row.sessionDate < metadata.range.from ||
                row.sessionDate > metadata.range.to ||
                (rows.length && row.sessionDate <= rows.at(-1)!.sessionDate)
              )
                throw new MarketStorageError('PREVIEW_INVALID');
              rows.push(row);
            }
          }
          if (
            rows.length !== metadata.rows.valid ||
            rows.length !== manifest.get('rowCount') ||
            marketFingerprint(rows) !== metadata.normalizedHash
          )
            throw new MarketStorageError('PREVIEW_INVALID');
          // Audited metadata-only CAS fences concurrent reference/publication updates.
          // No publication field, dataset revision, price or price-revision is written.
          const touched = await models.Stock.collection.updateOne(
            {
              _id: current.document._id,
              __v: current.document.get('__v'),
              'publication.revision': metadata.baseRevision,
            },
            { $inc: { __v: 1 } },
            { session },
          );
          if (touched.modifiedCount !== 1) throw new MarketStorageError('STALE_PREVIEW');
          const batch = new models.ImportBatch(
            importBatchMetadataSchema.parse({
              stockId: metadata.stockId,
              ...{ familyId: actor.familyId, uploadedBy: actor.id },
              stagingId: String(manifest._id),
              idempotencyKey: key,
              requestHash,
              status: 'CONFIRMED',
              preview: metadata,
              correctionReason: reason,
              confirmedAt: new Date().toISOString(),
              processingScope: 'PRICE_IMPORT',
            }),
          );
          await batch.save({ session });
          const job = new models.ImportJob({
            generation: null,
            importBatchId: batch._id,
            stockId: metadata.stockId,
            ...actorScope(actor),
            status: 'QUEUED',
            phase: 'QUEUED',
            processingScope: 'PRICE_IMPORT',
            derivedStatus: 'DEFERRED',
            total: rows.length,
            cursor: 0,
            counts: { inserted: 0, updated: 0, unchanged: 0 },
            attempts: 0,
            leaseVersion: 0,
            leaseOwner: null,
            leaseUntil: null,
            startedAt: null,
            finishedAt: null,
            errorCode: null,
          });
          await job.save({ session });
          for (const document of [manifest, ...chunks]) {
            document.$session(session);
            document.set({ state: 'ATTACHED', jobId: job._id, expiresAt: undefined });
            await document.save();
          }
        });
      } catch (error) {
        const existing = await confirmed(actor, key, requestHash);
        if (existing) return existing;
        if (error instanceof MarketStorageError) throw error;
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
          throw new MarketStorageError('STOCK_IMPORT_BUSY');
        throw error;
      }
      return (await confirmed(actor, key, requestHash))!;
    },
    async listStocks(query: MarketPageQuery & { query: string }, policy: MarketReferencePolicy) {
      const escaped = query.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const documents = await models.Stock.find({
        exchange: 'NSE',
        ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}),
        ...(escaped
          ? {
              $or: [
                { symbol: { $regex: `^${escaped}`, $options: 'i' } },
                { companyName: { $regex: `^${escaped}`, $options: 'i' } },
              ],
            }
          : {}),
      })
        .sort({ _id: -1 })
        .limit(query.limit + 1);
      return {
        data: documents.slice(0, query.limit).map((document) => {
          const stock = stockRecordSchema.parse(recordInput(document));
          return {
            id: document.id as string,
            exchange: stock.exchange,
            symbol: stock.symbol,
            series: stock.series,
            companyName: stock.companyName,
            status: stock.status,
            referenceApproved:
              stock.status === 'ACTIVE' &&
              policy.stocks.some(
                (entry) =>
                  entry.stockId === document.id &&
                  entry.fingerprint === stockReferenceFingerprint(stock),
              ),
          };
        }),
        meta: {
          nextCursor:
            documents.length > query.limit ? (documents[query.limit - 1]!.id as string) : null,
        },
      };
    },
    async job(actor: PublicUser, jobId: string) {
      const document = await models.ImportJob.findOne({
        _id: id(jobId),
        familyId: id(actor.familyId),
      });
      if (!document) throw new MarketStorageError('NOT_FOUND');
      return jobDto(importJobRecordSchema.parse(recordInput(document)), document.id as string);
    },
    async batches(actor: PublicUser, query: MarketPageQuery) {
      const documents = await models.ImportBatch.find({
        familyId: id(actor.familyId),
        ...(query.cursor ? { _id: { $lt: id(query.cursor) } } : {}),
      })
        .sort({ _id: -1 })
        .limit(query.limit + 1);
      const page = documents.slice(0, query.limit);
      const jobs = await models.ImportJob.find({
        familyId: id(actor.familyId),
        importBatchId: { $in: page.map((batch) => batch._id) },
      });
      return {
        data: page.map((document) => {
          const batch = importBatchMetadataSchema.parse(recordInput(document));
          const job = jobs.find((entry) => String(entry.get('importBatchId')) === document.id);
          if (!job) throw new MarketStorageError('PREVIEW_INVALID');
          return {
            batchId: document.id as string,
            jobId: job.id as string,
            stockId: batch.stockId,
            symbol: batch.preview.context?.stockIdentity.symbol ?? null,
            fileFormat: batch.preview.fileFormat,
            dateRange: batch.preview.range,
            rows: batch.preview.rows,
            confirmedAt: batch.confirmedAt,
            status: publicImportJobStatus(importJobRecordSchema.parse(recordInput(job))),
            processingScope: batch.processingScope,
            derivedStatus: 'DEFERRED',
            executionAvailable: false,
          };
        }),
        meta: {
          nextCursor:
            documents.length > query.limit ? (documents[query.limit - 1]!.id as string) : null,
        },
      };
    },
  };
}
export type MarketRepository = ReturnType<typeof createMarketRepository>;

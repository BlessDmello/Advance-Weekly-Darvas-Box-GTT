import { z } from 'zod';

export const marketObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
export const marketHashSchema = z.string().regex(/^[a-f\d]{64}$/);
export const marketTimestampSchema = z.iso.datetime();
export const sessionDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((text) => {
    const date = new Date(`${text}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }, 'A real YYYY-MM-DD session date is required.');

/** Plain decimal input only; no binary floating-point conversion or silent rounding. */
export const decimalTextSchema = z
  .string()
  .max(80)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .refine(
    (text) => text.replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length <= 34,
    'At most 34 significant decimal digits are supported.',
  );
export const priceTextSchema = decimalTextSchema.refine(
  (text) => /[1-9]/.test(text),
  'Prices must be positive.',
);
export const volumeTextSchema = decimalTextSchema.refine(
  (text) => /^\d+$/.test(text),
  'Volume must be a whole number.',
);

// Comparison only, not an implementation of any strategy or trading calculation.
export function compareDecimalText(left: string, right: string): number {
  const [leftWhole = '', leftFraction = ''] = left.split('.');
  const [rightWhole = '', rightFraction = ''] = right.split('.');
  if (leftWhole.length !== rightWhole.length)
    return Math.sign(leftWhole.length - rightWhole.length);
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const a = BigInt(leftWhole + leftFraction.padEnd(scale, '0'));
  const b = BigInt(rightWhole + rightFraction.padEnd(scale, '0'));
  return a === b ? 0 : a > b ? 1 : -1;
}

export const ohlcSchema = z
  .object({
    open: priceTextSchema,
    high: priceTextSchema,
    low: priceTextSchema,
    close: priceTextSchema,
  })
  .strict()
  .refine(
    (bar) =>
      !Object.values(bar).every((value) => priceTextSchema.safeParse(value).success) ||
      ([bar.open, bar.close, bar.low].every((value) => compareDecimalText(bar.high, value) >= 0) &&
        [bar.open, bar.close, bar.high].every((value) => compareDecimalText(bar.low, value) <= 0)),
    'High and low must contain the entire OHLC range.',
  );

export const sourceProvenanceSchema = z
  .object({
    provider: z.string().trim().min(1).max(120),
    reference: z.string().trim().min(1).max(500),
    basis: z.enum(['RAW', 'ADJUSTED', 'BOTH', 'UNKNOWN']),
    adjustmentVersion: z.string().trim().min(1).max(120).nullable(),
    declaredAt: marketTimestampSchema,
    verification: z.enum(['DECLARED', 'VERIFIED']),
  })
  .strict()
  .refine(
    (value) => !['ADJUSTED', 'BOTH'].includes(value.basis) || value.adjustmentVersion !== null,
    'Adjusted data requires an explicit adjustment version.',
  );

export const normalizedPriceRowSchema = z
  .object({
    sessionDate: sessionDateSchema,
    raw: ohlcSchema.nullable(),
    adjusted: ohlcSchema.nullable(),
    volume: volumeTextSchema.nullable(),
    provenance: sourceProvenanceSchema,
    qualityFlags: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/)).max(32),
  })
  .strict()
  .refine(
    (row) =>
      (row.provenance.basis === 'RAW' && row.raw !== null && row.adjusted === null) ||
      (row.provenance.basis === 'ADJUSTED' && row.adjusted !== null && row.raw === null) ||
      (row.provenance.basis === 'BOTH' && row.raw !== null && row.adjusted !== null),
    'Stored rows require a known basis and only the explicitly supplied price series.',
  );

export const dailyOhlcvSchema = normalizedPriceRowSchema.safeExtend({
  stockId: marketObjectIdSchema,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  sourceImportBatchId: marketObjectIdSchema,
});

export const stockIdentitySchema = z
  .object({
    exchange: z.literal('NSE'),
    symbol: z.string().regex(/^[A-Z0-9][A-Z0-9&.-]{0,29}$/),
    series: z.string().regex(/^[A-Z0-9]{1,8}$/),
  })
  .strict();

export const dataQualitySchema = z
  .object({
    valid: z.boolean(),
    complete: z.boolean(),
    freshness: z.enum(['FRESH', 'STALE', 'UNKNOWN']),
    expectedSession: sessionDateSchema.nullable(),
    latestSession: sessionDateSchema.nullable(),
    calendarVersion: z.string().min(1).max(120).nullable(),
    missingSessions: z.array(sessionDateSchema).max(5000),
    missingSessionCount: z.number().int().min(0).max(5000),
    blockingErrorCount: z.number().int().min(0).max(5000),
    warningCount: z.number().int().min(0).max(10000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.missingSessionCount < value.missingSessions.length ||
      (value.complete &&
        (value.missingSessionCount !== 0 || !value.valid || !value.calendarVersion)) ||
      (value.valid && value.blockingErrorCount !== 0)
    )
      ctx.addIssue({ code: 'custom', message: 'Quality counts and readiness disagree.' });
    if (
      value.freshness !== 'UNKNOWN' &&
      (!value.expectedSession || !value.latestSession || !value.calendarVersion)
    )
      ctx.addIssue({ code: 'custom', message: 'Freshness requires verified calendar context.' });
    if (value.freshness === 'FRESH' && value.expectedSession !== value.latestSession)
      ctx.addIssue({
        code: 'custom',
        message: 'Fresh data must reach the expected completed session.',
      });
    if (
      value.freshness === 'STALE' &&
      value.latestSession &&
      value.expectedSession &&
      value.latestSession >= value.expectedSession
    )
      ctx.addIssue({ code: 'custom', message: 'Stale data must precede the expected session.' });
  });

export const datasetPublicationSchema = z
  .object({
    state: z.enum(['UNAVAILABLE', 'IMPORTING', 'UNPUBLISHED', 'PUBLISHED']),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    publishedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    activeJobId: marketObjectIdSchema.nullable(),
    asOfSession: sessionDateSchema.nullable(),
    sourceRevisionKey: marketHashSchema.nullable(),
    derivedStatus: z.literal('DEFERRED'),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: 'custom', message: 'Dataset publication state is inconsistent.' });
    if (value.publishedRevision > value.revision) fail();
    if (
      value.state === 'UNAVAILABLE' &&
      (value.revision !== 0 ||
        value.publishedRevision !== 0 ||
        value.activeJobId ||
        value.asOfSession ||
        value.sourceRevisionKey)
    )
      fail();
    if (
      value.state === 'PUBLISHED' &&
      (value.revision < 1 ||
        value.revision !== value.publishedRevision ||
        value.activeJobId ||
        !value.asOfSession ||
        !value.sourceRevisionKey)
    )
      fail();
    if (
      ['IMPORTING', 'UNPUBLISHED'].includes(value.state) &&
      (value.revision <= value.publishedRevision || !value.activeJobId)
    )
      fail();
  });
export function isDatasetPublished(value: unknown): boolean {
  const parsed = datasetPublicationSchema.safeParse(value);
  return parsed.success && parsed.data.state === 'PUBLISHED';
}
export function assertDatasetTransition(
  previous: DatasetPublication,
  next: DatasetPublication,
): void {
  datasetPublicationSchema.parse(previous);
  datasetPublicationSchema.parse(next);
  if (JSON.stringify(previous) === JSON.stringify(next)) return;
  if (previous.state === 'UNAVAILABLE' || previous.state === 'PUBLISHED') {
    if (
      next.state !== 'IMPORTING' ||
      next.revision !== previous.revision + 1 ||
      next.publishedRevision !== previous.publishedRevision ||
      next.asOfSession !== previous.asOfSession ||
      next.sourceRevisionKey !== previous.sourceRevisionKey
    )
      throw new Error('A new import must reserve the next dataset revision.');
    return;
  }
  if (
    !['IMPORTING', 'UNPUBLISHED', 'PUBLISHED'].includes(next.state) ||
    next.revision !== previous.revision ||
    (next.state !== 'PUBLISHED' &&
      (next.publishedRevision !== previous.publishedRevision ||
        next.activeJobId !== previous.activeJobId ||
        next.asOfSession !== previous.asOfSession ||
        next.sourceRevisionKey !== previous.sourceRevisionKey))
  )
    throw new Error('An incomplete dataset cannot be reset or silently republished.');
}

export const stockRecordSchema = stockIdentitySchema.extend({
  companyName: z.string().trim().min(1).max(160),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  nifty100Membership: z
    .array(
      z
        .object({
          from: sessionDateSchema,
          to: sessionDateSchema.nullable(),
          source: z.string().min(1).max(500),
        })
        .strict()
        .refine((range) => range.to === null || range.to >= range.from),
    )
    .max(100),
  publication: datasetPublicationSchema,
});
export const tradingSessionSchema = z
  .object({
    exchange: z.literal('NSE'),
    sessionDate: sessionDateSchema,
    isOpen: z.boolean(),
    sessionType: z.enum(['REGULAR', 'SPECIAL', 'CLOSED']),
    closeTimeLocal: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    timezone: z.literal('Asia/Kolkata'),
    calendarSource: z.string().trim().min(1).max(500),
    calendarVersion: z.string().trim().min(1).max(120),
  })
  .strict()
  .refine((value) =>
    value.isOpen
      ? value.sessionType !== 'CLOSED' && value.closeTimeLocal !== null
      : value.sessionType === 'CLOSED' && value.closeTimeLocal === null,
  );

export type StockIdentity = z.infer<typeof stockIdentitySchema>;
export type StockRecord = z.infer<typeof stockRecordSchema>;
export type Ohlc = z.infer<typeof ohlcSchema>;
export type DailyOhlcv = z.infer<typeof dailyOhlcvSchema>;
export type NormalizedPriceRow = z.infer<typeof normalizedPriceRowSchema>;
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;
export type TradingSession = z.infer<typeof tradingSessionSchema>;
export type DataQuality = z.infer<typeof dataQualitySchema>;
export type DatasetPublication = z.infer<typeof datasetPublicationSchema>;

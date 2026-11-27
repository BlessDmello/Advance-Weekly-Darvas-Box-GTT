# ADR 0002 — Market-data import foundation

- Status: accepted for Phase 8B contracts and database foundation only.
- Decision date: 27 November 2026 (Asia/Kolkata).
- Baseline: PRD v1.2, System Design v1.1, Database Design v1.0, API Design v1.0,
  approved Milestone 8A discovery and the explicit Phase 8B scope.

The four approved specifications remain unchanged. This ADR records additive
physical/contract decisions and resolves lifecycle terminology. It does not authorize
upload APIs, parsing, a job runner, reference-data loading, UI or strategy algorithms.

## Canonical input and source compatibility

Future imports accept exactly one NSE stock per CSV or XLSX. Canonical columns are
Date, Open, High, Low, Close and optional Volume. The selected stock is bound to a
verified master identity; an optional symbol column must agree on every row. Identity
is `(exchange, symbol, series)`; do not collapse distinct series or infer provider
aliases. Preserve valid punctuation such as ampersands and hyphens. Do not infer a
stock solely from a filename. Supported provider-specific mappings remain unverified
until representative source files are supplied and reviewed.

Session dates are real `YYYY-MM-DD` dates, separate from UTC timestamps. A future
parser must explicitly select any alternate date format, handle Excel 1900/1904
systems, reject impossible dates, and avoid host-timezone shifts. Input numbers are
plain decimal strings, never JS floating-point prices. Preserve all exactly
representable Decimal128 values within 34 significant digits and the bounded input
length; reject unsupported precision instead of rounding. Scientific notation,
separators, currency decorations, NaN/Infinity and numeric JS inputs are not canonical.
Volume is a nonnegative whole decimal string or null when unavailable, never a
fabricated zero. Imported OHLC is positive and must satisfy its high/low range.

Proposed future bounds are 3 MiB/file, 5,000 rows, 32 columns, 100 rows/staging chunk,
50 chunks, 100 diagnostic samples and a 30-minute preview lifetime. Parsing and
archive/cell/decompression limits require actual implementation and tests in 8C;
this phase defines metadata/row bounds only. No parser packages are installed.

## Raw and adjusted provenance

Every source declares provider, reference, basis, adjustment version (when adjusted),
declaration timestamp and DECLARED versus VERIFIED provenance. A checksum establishes
identity, not independent source verification. Unknown basis may be represented in
an invalid preview, but cannot produce a committable batch or stored daily row.

RAW stores only the supplied raw OHLC, ADJUSTED only adjusted OHLC, BOTH both supplied
series. The unavailable counterpart is null. Never copy one into the other, infer
adjusted OHLC from Adjusted Close alone, or calculate corporate-action factors here.
Raw data is not an adjusted indicator input. Publication of price history does not
mean that the source is approved for future strategy calculation. Adjustment-version
changes and mixed histories need explicit reconciliation in 8C, not silent splicing.

## Stock master, calendar and quality

`stocks` preserves stable IDs and sourced, dated Nifty 100 membership intervals. No
current constituent list is projected backward. `tradingSessions` explicitly records
open/closed dates, REGULAR/SPECIAL/CLOSED type, local close time, Asia/Kolkata and
calendar source/version. Neither model invents defaults or seeds reference data.
Verified calendar coverage must include holidays, exceptional closures and special
weekend sessions; Monday-Friday assumptions do not establish missing sessions.

Quality separates validity, completeness and FRESH/STALE/UNKNOWN. Completeness
requires a calendar version, no missing sessions and valid data. Freshness requires
an expected completed session and the latest stored session; upload time is not
market freshness. Missing observations and short history are reported, not filled.
Dependent calculations remain deferred even when price-import quality is acceptable.

## Storage, ownership and audit

Shared collections: stocks, tradingSessions, dailyPrices and priceRevisions. Import
administration is family-scoped: importBatches, importJobs and importStaging require
familyId and uploadedBy, derived from a validated server identity in future services.
Indexes support family-filtered queries; indexes and schema fields do not themselves
implement authorization. 8C must reuse existing active/Admin/CSRF guards, scope every
administrative query, and never accept client-submitted role/ownership as authority.
Stock import exclusion is global because shared prices must have one writer.

The new technical `importStaging` collection is an explicit additive decision. The
baseline's collection inventory already lists 26 despite saying 25; this addition
does not silently correct or rewrite that document.

Daily prices are unique on stock/session. Corrections must advance revision by one,
append immutable before/after priceRevisions with actor/batch/reason/time, and preserve
original executions and live trigger state. Revision identifiers are unique on
stock/session/newRevision. Import batches are immutable confirmation metadata, with
actor/idempotency-key uniqueness and request hashes for future conflict detection.
Reformatted identical values must not become price corrections in 8C.

Batch file/mapping/source/range/count/quality metadata is grouped under its immutable
`preview` snapshot, rather than copied into competing mutable top-level fields. Batch
`status: CONFIRMED` describes confirmation only; mutable processing status belongs to
the unique job. This physical refinement does not change the existing preview/commit
API payloads. Future history DTOs must map these fields explicitly.

Ordinary model query/bulk updates and deletes are blocked because they bypass document
invariants. Batch/revision records and current prices are append-only through these
foundation model interfaces. A future 8C price-write adapter must explicitly perform
transactional price/revision/checkpoint updates with native validators enabled; it is
not supplied in 8B. Privileged raw-driver writes or `bypassDocumentValidation` can
bypass model immutability; no production database-role changes are made here. Treat
such privileges as operator capabilities, not an application authorization mechanism.

## Preview staging and expiry safety

One collection stores bounded MANIFEST and CHUNK records. The manifest binds file and
normalized hashes, mapping/source/parser versions, observed dataset revision, actor,
family, stock, quality and expected row/chunk counts. Tokens are represented only by
unique hashes, excluded from normal selection/serialization. No tokens are generated
or accepted by an API in 8B.

PREVIEW has a logical expiration and a top-level expiresAt. ATTACHED has a jobId and
**no top-level expiresAt**. PURGEABLE has an explicit cleanup deadline. The TTL index
is partial and includes only PREVIEW/PURGEABLE. Native collection validation also
rejects expiry dates on ATTACHED records. No TTL indexes are permitted on active jobs,
prices, revisions or batch history. Index verification rejects unexpected TTL/unique
constraints without deleting them. TTL is cleanup, never a token-validity decision.

Document-level attachment requires a nonexpired preview, a matching stock/family/actor
job and an explicit transaction. Release from ATTACHED requires a matching terminal
COMPLETED/FAILED job in a transaction. RETRY is not terminal. Payload bindings and
content are immutable. 8C must additionally verify every chunk, row count/hash and
binding, remove all relevant TTL deadlines, and create the batch/job in one transaction
before returning 202. It must never retain a durable job whose payload can expire.
Retention periods after completion and reference-source licensing remain open.

## Dataset revisions and publication

Publication is explicit: UNAVAILABLE, IMPORTING, UNPUBLISHED or PUBLISHED. A new stock
starts UNAVAILABLE at revision zero. Reserving an import advances the working revision
and retains the previous published revision. Interrupted work remains IMPORTING or
UNPUBLISHED, tied to its job; it cannot be reset as though the partial writes vanished.
PUBLISHED requires matching positive working/published revisions, no active job, and
an as-of session/source revision key. Model publication changes require a transaction
and the matching job; final publication requires a completed job. Optimistic versions
reject stale document saves.

These fields do not create a second shadow price table or retain an immediately
queryable old generation while current rows are being corrected. 8C readers must
deny analysis/publication of incomplete generations. 8C must atomically establish
validated price/audit/checkpoint completion before publishing, and define no-op import
generation behavior. The shape-level `isDatasetPublished` helper is not a substitute
for database-backed job completion or source/strategy readiness.

## Durable jobs and public mapping

| Database status | Phase                                           | Public status    |
| --------------- | ----------------------------------------------- | ---------------- |
| QUEUED          | QUEUED                                          | QUEUED           |
| RUNNING         | VALIDATING                                      | VALIDATING       |
| RUNNING         | UPSERTING / CHECKING_QUALITY / READY_TO_PUBLISH | UPSERTING        |
| RETRY           | Last incomplete phase                           | FAILED_RETRYABLE |
| FAILED          | Last incomplete phase                           | FAILED_FINAL     |
| COMPLETED       | COMPLETED                                       | COMPLETED        |

Only QUEUED jobs are created through models. Claims increment attempts and leaseVersion;
RUNNING requires owner/deadline/start time. Checkpoints/counters are monotonic and
phase transitions ordered. Completed/failed jobs are terminal. A partial unique index
allows one QUEUED/RUNNING/RETRY job per stock across families. One job per batch prevents
duplicate acceptance. Expired leases do not delete jobs; 8C must compare fencing
versions, reclaim explicitly and write rows/revisions/checkpoints in the same bounded
transaction. Idempotency-key reuse with different request hashes must be 409 in 8C.

Completion is explicitly `processingScope: PRICE_IMPORT` with `derivedStatus: DEFERRED`.
No RECALCULATING/REPLAYING phase is claimed. Future consumers use affected ranges,
batch/source revisions and their own versioned work; no calculations or notifications
are executed in 8B. A completed price import is not a completed trading pipeline.

## Preparation, verification and next phase

`pnpm market-data:prepare` uses the existing explicit connection utility and API
environment loader, defaults to dry-run, permits only the named development database,
and refuses production without a bypass. `--apply` is an explicit operator write;
neither command was invoked against Atlas for this milestone. Library preparation is
also used with owned disposable test connections. Preparation creates named collections,
strict native validators and indexes only; no reference rows. Existing incompatible
validators, records or indexes fail closed without repair, deletion or index dropping.
Read-only verification never provisions storage. Login and health do not import or
invoke preparation and are independent of market readiness.

8C still needs reviewed real source samples, stock/calendar manifests and provenance,
per-provider/date/Excel compatibility, duplicate normalization, correction-basis policy,
verified calendar coverage, bounded parsing, preview/commit/retry APIs, transaction
adapters, a recoverable runner, scoped authorization and UI. Dataset state fields do
not prove those services exist. No production capability, actual import, fresh market
data, strategy parity or trading readiness is claimed by this foundation.

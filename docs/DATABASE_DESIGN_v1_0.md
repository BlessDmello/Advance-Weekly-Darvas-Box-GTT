# Advanced Darvas Box — Database Design Document (DDD)

**Version:** 1.0 (design baseline)  
**Date:** 22 November 2026  
**Status:** Proposed for engineering review  
**Source baseline:** PRD v1.2; System Design v1.1; LLD v1.0; Nifty 100 GTT worksheet selection rule and previously confirmed decisions.  
**Technology:** MongoDB Atlas, Mongoose, Node.js/Express, TypeScript, Zod  
**Deployment context:** Private family application; manually imported Nifty 100 daily OHLCV, five-year history, weekend review.

## 1. Purpose, scope, and decisions

This document specifies physical MongoDB collections, field contracts, relationships, indexes, authorization boundaries, migrations, concurrency controls, and the data integrity guarantees required for Advanced Darvas Box. It does **not** change approved trading rules. A reference implementation can use these models while strategy calculations remain pure functions in `packages/strategy-core`.

**Fixed business invariants:**

1. New-entry eligibility uses fresh, valid data **AND** `In Bull Run` **AND** `Buy/Average Out` CAR. The older 52-week high-date-before-low-date suitability rule is optional, not a mandatory prerequisite.
2. Bull Run requires CMP above each SMA50/100/200 and CMP-to-SMA200 difference in `[+0.01%, +10%]`. Bear Run requires CMP below each and difference in `[-10%, -0.01%]`; otherwise Unconfirmed. Missing values imply Insufficient Data.
3. CAR uses the 52-week daily **HIGH** anchor (364 calendar days), chronological closing prices from that high date, and nine strict increases across the latest 10 expanding cumulative means; fewer than 10 genuine closes means Short History. No synthetic zero means accepted as proof.
4. Candidate Darvas trigger for the current trading week is the prior **completed** NSE calendar week's maximum high. A touch means daily `HIGH >= candidate`; eligible, non-ignored touches generate accepted **signal events**, not executed buys.
5. Inclusive ignore interval is `[lastAcceptedTrigger × 0.9725, lastAcceptedTrigger × 1.0275]`. A qualifying accepted signal updates its reference; that reference persists after position closure. Each portfolio-stock has an independent reference.
6. Purchases and full-position 6%-target sales are confirmed manually. No forced stop-loss or bearish sale. Additional purchases update weighted-average cost/target. When target is touched, status is alert/review, not evidence of a sale.
7. After completed successful sequence, next **per-stock investment target** increases by one-third of net realized capital gain (trade charges included, dividends excluded); no shared cash ledger in MVP. Quantity suggestion can be overridden.
8. Historical replays and data corrections never mutate existing confirmed transactions or per-user live trigger state. All material changes are traceable.

## 2. Data organization and tenancy

Three storage domains:

- **Shared/reference**: `families` (limited to family membership), `stocks`, `tradingSessions`, `dailyPrices`, `priceRevisions`, `importBatches`, `importJobs`, `indicatorSnapshots`, `screeningReplayRuns`, `historicalSignalEvents`, `jobRuns`.
- **Identity and sharing**: `users`, `invitations`, `sessions`, `watchlists`.
- **Private per-user / per-portfolio**: `portfolios`, `allocationTargets`, `triggerStates`, `darvasCandidates`, `triggerEvents`, `positions`, `trades`, `tradeAudit`, `capitalLedgers`, `alerts`, `notificationOutbox`.

**Isolation rules:** Every private query must constrain by authenticated `ownerId` AND, where applicable, an authorized `portfolioId`; object-ID possession does not imply access. `ADMIN` may upload shared prices and invite users, but does not implicitly read private trades. Family-shared watchlists may be read by family members; edits remain owner-controlled unless sharing rules are explicitly expanded. Stocks and computed shared indicators are read-only for members.

**Object identifiers:** `_id` is ObjectId. `stockId`, `ownerId`, `portfolioId`, `positionId`, etc. are stored as references (not populated automatically on untrusted queries). UTC BSON dates for timestamps; **NSE session dates** stored as canonical `YYYY-MM-DD` strings to avoid timezone-day shifts. `asOfSession` is the latest complete market session; `calculatedAt` is a separate UTC timestamp.

## 3. Entity relationship overview

![Database relationships](Advanced_Darvas_Box_Database_ERD_v1_0.png)

Cardinality summary:

| Parent | Child | Cardinality / invariant |
|---|---|---|
| `families` | `users` | One-to-many; roles ADMIN/MEMBER |
| `users` | `portfolios`, `watchlists`, `sessions` | One-to-many; private by default |
| `stocks` | `dailyPrices`, `indicatorSnapshots` | One-to-many shared historical records |
| `importBatches` | `importJobs`, `priceRevisions` | One batch to job and audit records |
| `portfolios` + `stocks` | `allocationTargets`, `triggerStates` | One active target and trigger reference per portfolio/stock/version |
| `portfolios` + `stocks` | `positions` | Many consecutive trading sequences; at most one active sequence per portfolio-stock in MVP |
| `positions` | `trades`, `tradeAudit` | Many executions; audit records link to individual trades |
| `darvasCandidates` | `triggerEvents` | Many event transitions; no assumed execution |
| `screeningReplayRuns` | `historicalSignalEvents` | Historical-only signals, isolated from live references |
| `users` | `alerts`, `notificationOutbox` | Dedupe per user/event/channel |

## 4. Collection inventory

Exactly **25 core collections** are proposed, matching the approved LLD; any later additions require a migration/ADR.

| Domain | Collections |
|---|---|
| Identity | `families`, `users`, `invitations`, `sessions` |
| Market and jobs | `stocks`, `tradingSessions`, `dailyPrices`, `priceRevisions`, `importBatches`, `importJobs`, `jobRuns` |
| Analysis | `indicatorSnapshots`, `screeningReplayRuns`, `historicalSignalEvents` |
| User and trading | `portfolios`, `watchlists`, `allocationTargets`, `triggerStates`, `darvasCandidates`, `triggerEvents`, `positions`, `trades`, `tradeAudit`, `capitalLedgers`, `alerts`, `notificationOutbox` |

## 5. Field contracts and indexes

The tables below list required/core fields. All collections also have `_id`, `createdAt`, and `updatedAt` unless immutable event records need only `createdAt`. Mongoose `strict:'throw'` is recommended for writes; Zod validates incoming requests. Use server-owned IDs and timestamps, never trust user-supplied ownership fields.

### 5.1 Identity and access

| Collection | Important fields and types | Indexes / constraints |
|---|---|---|
| `families` | `name:string`, `createdBy:ObjectId`, `status:ACTIVE|DISABLED` | `{createdBy:1}` |
| `users` | `familyId:ObjectId`, `emailNormalized:string`, `passwordHash:string`, `role:ADMIN|MEMBER`, `status:INVITED|ACTIVE|DISABLED`, `emailVerifiedAt?:Date` | unique `{emailNormalized:1}`; `{familyId:1,role:1}` |
| `invitations` | `familyId`, `emailNormalized`, `tokenHash`, `invitedBy`, `status:PENDING|CONSUMED|REVOKED|EXPIRED`, `expiresAt`, `consumedAt?` | unique `{tokenHash:1}`; TTL `{expiresAt:1}`; validate expiration even before TTL cleanup |
| `sessions` | `userId`, `sessionTokenHash`, `expiresAt`, `revokedAt?`, `lastSeenAt?`, `deviceLabel?` | unique `{sessionTokenHash:1}`; TTL `{expiresAt:1}`; `{userId:1}` |

Passwords stored only as adaptive secure hashes. Session tokens stored only as hashes; cookies are HttpOnly, Secure, SameSite configured for chosen same-origin proxy. Token hashes and password hashes must never appear in audit payloads or API responses.

### 5.2 Shared market data and imports

| Collection | Important fields and types | Indexes / constraints |
|---|---|---|
| `stocks` | `exchange:'NSE'`, `symbol`, `series`, `companyName`, `status`, `nifty100Membership:{from,to?}[]` | unique `{exchange:1,symbol:1,series:1}` |
| `tradingSessions` | `exchange`, `sessionDate:'YYYY-MM-DD'`, `isOpen:boolean`, `sessionType`, `calendarSource` | unique `{exchange:1,sessionDate:1}` |
| `dailyPrices` | `stockId`, `sessionDate`, `raw:{open,high,low,close}`, `adjusted:{open,high,low,close}`, `volume`, `adjustmentBasis`, `adjustmentVersion`, `revision:int`, `sourceImportBatchId`, `qualityFlags[]` | unique `{stockId:1,sessionDate:1}`; `{stockId:1,sessionDate:-1}` |
| `priceRevisions` | `stockId`, `sessionDate`, `oldPrice`, `newPrice`, `oldRevision`, `newRevision`, `changedBy`, `importBatchId`, `reason`, `changedAt` | `{stockId:1,sessionDate:1,changedAt:-1}` |
| `importBatches` | `stockId`, `uploadedBy`, `fileName`, `sha256`, `fileFormat:CSV|XLSX`, `columnMapping`, `range`, `previewCounts`, `status`, `source`, `qualityReport`, `confirmedAt?` | `{uploadedBy:1,stockId:1,sha256:1}`, `{status:1,createdAt:-1}` |
| `importJobs` | `importBatchId`, `stockId`, `status:QUEUED|RUNNING|RETRY|COMPLETED|FAILED`, `phase`, `cursor`, `leaseOwner?`, `leaseUntil?`, `attempts`, `errorCode?` | unique `{importBatchId:1}`; `{status:1,leaseUntil:1}` |
| `jobRuns` | `jobKey`, `jobType`, `scheduledFor`, `status`, `startedAt`, `finishedAt`, `summary` | unique `{jobKey:1}` |

**Price validation:** `high >= max(open,close,low)`, `low <= min(open,close,high)`, strictly positive OHLC, finite volume ≥ 0; the date must be a real NSE trading session except for explicitly marked exceptional sessions. Raw and adjusted values are stored separately; strategy calculations use a uniform declared basis. A split should never implicitly adjust a confirmed trade execution.

**Data revision:** Upsert by `(stockId,sessionDate)`. An identical repeated import is a no-op. A changed row increments `revision`, writes `priceRevisions`, marks derived snapshots for recomputation and creates new historical replay revisions. No silently overwritten source prices.

### 5.3 Indicators and historical-only events

| Collection | Important fields and types | Indexes / constraints |
|---|---|---|
| `indicatorSnapshots` | `stockId`, `asOfSession`, `sourceRevisionKey`, `ruleVersion`, `cmp`, `dma:{sma50,sma100,sma200,distance200Pct,trend}`, `car:{anchorSession,latestTenAverages,signal,validCount}`, `suitability:{highDate,lowDate,status}`, `dataQuality:{fresh,missingSessions,flags}`, `eligibility:{status,eligible,reasons[]}`, `calculatedAt` | unique `{stockId:1,asOfSession:1,sourceRevisionKey:1,ruleVersion:1}`; `{asOfSession:-1,'eligibility.eligible':1}` |
| `screeningReplayRuns` | `stockId`, `ruleVersion`, `sourceRevisionKey`, `fromSession`, `toSession`, `status`, `jobId`, `resultsSummary` | `{stockId:1,ruleVersion:1,sourceRevisionKey:1,fromSession:1,toSession:1}` |
| `historicalSignalEvents` | `replayRunId`, `stockId`, `sessionDate`, `candidateValue`, `eventType`, `eventKey`, `ruleVersion`, `sourceRevisionKey`, `reasons[]`, `isHistorical:true` | unique `{eventKey:1}`; `{replayRunId:1,sessionDate:1}` |

**Eligibility state:** `ELIGIBLE`, `WAIT_TREND`, `WAIT_CAR`, `WAIT_BOTH`, `INSUFFICIENT_DATA`, or `STALE_DATA`. Store explainable reason codes. Only `ELIGIBLE` can pass the *new-entry* gate; no eligibility change automatically closes a real position. The first eligible day is not assumed to be the first buy day. Preserve point-in-time `asOfSession` for every result.

**CAR reproducibility:** Preserve anchor tie-handling policy, price adjustment basis, 10 cumulative average values, nine pairwise comparison booleans, and calculation version. Google Sheets formula fallback dates/zeros should not quietly produce `Buy/Average Out`.

### 5.4 User watchlists, triggers, and trading

| Collection | Important fields and types | Indexes / constraints |
|---|---|---|
| `portfolios` | `ownerId`, `name`, `type:SWING|LONG_TERM|EXPERIMENT`, `status` | unique `{ownerId:1,name:1}` |
| `watchlists` | `ownerId`, `familyId`, `visibility:PRIVATE|FAMILY`, `name`, `stockIds:ObjectId[]` | unique `{ownerId:1,name:1}`; `{familyId:1,visibility:1}` |
| `allocationTargets` | `ownerId`, `portfolioId`, `stockId`, `initialTarget`, `currentTarget`, `currency:'INR'`, `version` | unique `{portfolioId:1,stockId:1}` |
| `triggerStates` | `ownerId`, `portfolioId`, `stockId`, `ruleVersion`, `lastAcceptedTrigger?`, `lastAcceptedSession?`, `seedSource`, `version` | unique `{portfolioId:1,stockId:1,ruleVersion:1}` |
| `darvasCandidates` | `ownerId`, `portfolioId`, `stockId`, `candidateWeek`, `candidatePrice`, `referenceAtEvaluation`, `lowerLimit`, `upperLimit`, `status`, `touchSession?`, `ruleVersion`, `sourceRevisionKey` | unique `{portfolioId:1,stockId:1,candidateWeek:1,ruleVersion:1}`; `{ownerId:1,status:1}` |
| `triggerEvents` | `ownerId`, `portfolioId`, `stockId`, `candidateId`, `eventType`, `eventKey`, `effectiveSession`, `value`, `details`, `createdAt` | unique `{eventKey:1}`; `{portfolioId:1,stockId:1,effectiveSession:1}` |
| `positions` | `ownerId`, `portfolioId`, `stockId`, `sequenceNo`, `status:OPEN|TARGET_TOUCHED|CLOSED`, `openQty`, `remainingCostBasis`, `avgPurchasePrice`, `targetPrice`, `openedAt`, `closedAt?`, `version` | unique `{portfolioId:1,stockId:1,sequenceNo:1}`; **partial unique** `{portfolioId:1,stockId:1}` where `status` in OPEN/TARGET_TOUCHED |
| `trades` | `ownerId`, `portfolioId`, `positionId`, `side:BUY|SELL`, `executedAt`, `quantity`, `executionPrice`, `charges`, `costBasisAllocated?`, `status:ACTIVE|SUPERSEDED`, `revision`, `clientRequestId` | unique `{ownerId:1,clientRequestId:1}`; `{positionId:1,executedAt:1}` |
| `tradeAudit` | `tradeId`, `changedBy`, `reason`, `before`, `after`, `fromRevision`, `toRevision`, `changedAt` | `{tradeId:1,changedAt:-1}` |
| `capitalLedgers` | `ownerId`, `portfolioId`, `stockId`, `closedPositionId`, `previousTarget`, `netRealizedGain`, `oneThirdIncrement`, `newTarget`, `appliedAt`, `ruleVersion` | unique `{closedPositionId:1}` |
| `alerts` | `ownerId`, `portfolioId?`, `stockId?`, `eventKey`, `type`, `dataAsOfSession`, `status`, `readAt?` | unique `{ownerId:1,eventKey:1}` |
| `notificationOutbox` | `ownerId`, `eventKey`, `channel:EMAIL|IN_APP`, `payload`, `deliveryStatus`, `attempts`, `nextAttemptAt`, `providerMessageId?` | unique `{ownerId:1,eventKey:1,channel:1}` |

**Decimal policy:** Store monetary values as Decimal128 (or consistently as integer paise) and do all money calculations in exact decimal arithmetic. Values such as share prices, moving averages and percentage thresholds may require finer precision than paise internally; round only at explicitly documented transaction and UI boundaries. Do not use IEEE-754 float comparisons at the 2.75%, 6%, 0.01%, or 10% boundaries.

**Position consistency:** No cash-ledger constraint exists in MVP. Suggested buy quantity is floor of remaining stock allocation divided by all-in unit cost, but a user can override; over-allocation should be explicitly surfaced. A user correction emits a `tradeAudit` entry, recalculates affected position and downstream one-third-profit capital changes in a controlled replay, never silently destroys the original record.

## 6. State machine persistence and concurrency

### 6.1 Darvas signal progression

`CREATED → WATCHING → (IGNORED | BLOCKED_BY_GATE | EXPIRED | ACCEPTED)`; a `TOUCHED` event is recorded on the candidate before acceptance. `ACCEPTED` updates `triggerStates.lastAcceptedTrigger` to **candidate weekly price** (not actual execution price). This occurs on the qualifying signal, even if the user chooses not to buy. A stale or insufficient-data candidate cannot become actionable. Corrections may mark historical derived events `SUPERSEDED` while retaining traceability.

**Atomicity:** Claim accepted candidate using an idempotency key; transactionally append the event and compare-and-swap `triggerStates.version`, otherwise retry/reconcile. No double acceptance of the same candidate from two workers. The reference carries forward after position is CLOSED.

### 6.2 Manual trade progression

`NONE → OPEN` after confirmed BUY. `OPEN → TARGET_TOUCHED` after high touches the current 6% target (alert only). Further BUY updates average and target; a manually confirmed full-position SELL leads to `CLOSED`. No DMA/CAR bearish state can force sale. Complete SELL and related capital-ledger write must be idempotent and consistent.

### 6.3 Reinvestment persistence

For a completed positive-gain sequence: `increment = netRealizedCapitalGain / 3`, `nextTarget = previousTarget + increment` (using exact rounding policy). Ledger entry unique on `closedPositionId`. For zero/negative gain, target stays unchanged; create an outcome record without positive increment so replay is deterministic. The trading process does not count dividends toward one-third increment. Full-position close is a manual event; touching the target does not increment capital.

### 6.4 Historical replay safety

Historical signals are written only to `screeningReplayRuns` and `historicalSignalEvents`. They **cannot** write to `trades`, `positions`, `capitalLedgers`, or live `triggerStates`. If the user wishes to seed a live trigger reference from history, require an explicit preview-and-confirm action and store `seedSource` plus approval metadata.

## 7. Import / data processing and lineage

1. **Preview:** Admin selects one NSE stock and uploads CSV or XLSX. Parse with file-size/row limits; map columns; validate sessions, numbers, corporate-action basis, duplicates, missing dates, data ordering. Return warnings/errors and insert/update counts. Preview is not an import commit.
2. **Confirm:** Create immutable `importBatches` metadata and a database-backed `importJobs` entry; return job ID. Do not rely on Render's ephemeral disk for long-lived storage.
3. **Acquire job lease:** Worker claims a bounded batch with lease expiry and renewal; save cursor/checkpoints. Free-tier sleeping or crash must not corrupt committed price rows.
4. **Upsert prices:** Bulk upsert by stock/session. Identical values no-op; differences write audit revision and bump source version. Reject invalid rows or fail batch according to configured atomicity policy; never silently interpolate missing closes.
5. **Calculate:** Recompute affected 52-week extrema, SMA50/100/200, CAR, eligibility status/history, previous-week triggers and historical replay events for the affected lookback/forward impact. Preserve old rule/source versions for auditing.
6. **Publish:** Update latest successful as-of session, create idempotent in-app alerts, stage eligible email summaries. Uploaded file's timestamps must not be confused with market-data freshness.
7. **Weekend:** GitHub Actions triggers summary over **stored** data; it does not source new NSE prices. Show stale warning; suppress stale *new actionable* alerts. Outbox delivery retries dedupe by event key.

**Revision impacts:** A corrected historical price can change downstream SMA windows, rolling 52-week high anchor, CAR cumulative series, candidate weekly highs, and eligibility transitions. Recompute a conservative affected interval or full selected stock history (Nifty 100 × five-year scope permits correctness-first) as a versioned job. Never overwrite live confirmed trades.

## 8. API-to-database mapping and access

| API | Collections touched | Access / transaction note |
|---|---|---|
| `POST /api/v1/auth/login` | `users`, `sessions` | Rate limited; no plaintext password storage |
| `POST /api/v1/invitations` | `invitations`, `users` as needed | ADMIN; hashed invitation token |
| `GET /api/v1/stocks` | `stocks`, latest `indicatorSnapshots` | Authenticated family user |
| `GET /api/v1/screener/eligible` | `indicatorSnapshots`, `stocks` | Only latest valid/fresh eligible snapshots |
| `GET /api/v1/stocks/:symbol/analysis` | `stocks`, `dailyPrices`, `indicatorSnapshots` | Authenticate; latest as-of and source basis |
| `POST /api/v1/imports/preview` | `stocks`, `tradingSessions` | ADMIN; no permanent market-data writes |
| `POST /api/v1/imports/commit` | `importBatches`, `importJobs` | ADMIN; idempotency |
| `GET /api/v1/imports/jobs/:jobId` | `importJobs`, `importBatches` | ADMIN |
| `GET/POST /api/v1/portfolios` | `portfolios` | Filter ownerId |
| `GET/POST /api/v1/watchlists` | `watchlists` | Family-visible read only for shared |
| `GET /api/v1/stocks/:symbol/triggers` | `darvasCandidates`, `triggerEvents`, `triggerStates` | Enforce portfolio ownership |
| `POST /api/v1/trades` | `trades`, `positions`, `allocationTargets` | Owner, optimistic version, idempotency; atomic when feasible |
| `PATCH /api/v1/trades/:tradeId` | `trades`, `tradeAudit`, affected positions | Owner; reason required; full downstream recalculation |
| `GET /api/v1/portfolios/:id/summary` | `positions`, `trades`, `allocationTargets` | Owner |
| `GET /api/v1/alerts` | `alerts` | Owner |
| `POST /api/v1/internal/weekend-digest` | `jobRuns`, `notificationOutbox`, `alerts` | Service-authenticated, deduped |

**Response requirements:** Explicit `asOfSession`, `dataQuality`, `ruleVersion`, and `sourceRevisionKey` in calculated results. Return `409 VERSION_CONFLICT` for stale client writes, `422 INVALID_OHLC` / `INSUFFICIENT_DATA` for invalid operations, `403 FORBIDDEN` for unauthorized resources, and `503 RETRY_LATER` for temporarily unavailable job processors.

## 9. Retention, storage, and backup

- Daily OHLCV: maintain target five-year lookback plus a small recalculation buffer; preserve historically referenced snapshots required for existing trade audit/replay. Archiving or pruning must not break historical proof.
- Market-data corrections: keep price revision metadata/history while space allows; document storage impact on Atlas free plan.
- Authentication: TTL expired sessions/invitations, but check expiry synchronously; minimize IP/user-agent data retained.
- Trade and audit histories: do not delete as part of routine data pruning; explicit account-delete policy requires dependency-safe handling and privacy review.
- Job and outbox logs: define short retention after successful completion; do not delete active retry jobs.
- Backup: because free-tier backups may be limited, plan periodic encrypted, access-controlled exports and restore drills; test restore before relying on them.
- Capacity check: ~100 stocks × 5 years × ~250 sessions = ~125,000 price docs before adjustment, revision, indices, and derived snapshots. Measure `collStats`/indexes rather than assuming the free-tier quota is sufficient.

## 10. Validation and acceptance tests

| Test ID | Scenario | Expected persistent result |
|---|---|---|
| DB-01 | Two users with different portfolios | Cannot read/write each other's trades; shared indicators visible |
| DB-02 | Family-shared watchlist | Family members may read; non-owner cannot edit |
| DB-03 | Same CSV uploaded twice | No duplicate `(stockId,sessionDate)` rows; no duplicate alerts |
| DB-04 | Corrected historical high | `priceRevisions` entry; new revisioned snapshots/replay; original trade unmodified |
| DB-05 | OHLC missing trading day | Relevant calculations marked insufficient; no synthetic close inserted |
| DB-06 | Bull Run + CAR Buy + valid/fresh | Latest eligibility = ELIGIBLE |
| DB-07 | Bull Run + CAR Avoid/Hold | Not eligible; reason contains `CAR_NOT_CONFIRMED` |
| DB-08 | Above 200 DMA by >10% | Not Bull Run by source rule |
| DB-09 | Nine strict CAR increases and 10 genuine closes | CAR Buy/Average Out; tie/equality fails |
| DB-10 | Weekly trigger equals lower/upper ignore boundary | Candidate IGNORED; no reference update |
| DB-11 | Week's daily high touches eligible outside-band trigger | Signal ACCEPTED, reference updated, **no trade inserted** |
| DB-12 | Signal rerun or duplicate worker | Unique accepted event, version-safe reference, no duplicate alert |
| DB-13 | Manual BUY | Position OPEN, weighted average/target computed from confirmed execution |
| DB-14 | Additional BUY | Quantity, cost basis and 6% target recomputed |
| DB-15 | Target high touch, no SELL | TARGET_TOUCHED only; shares unchanged; no capital increment |
| DB-16 | Manual full SELL with positive gain | CLOSED; one ledger entry; target grows by net gain / 3 |
| DB-17 | New sequence after CLOSE | Trigger reference persists; allocation target persists |
| DB-18 | Older price correction | Historical replay updated, live trade and live trigger unchanged |
| DB-19 | Edit trade with reason | `tradeAudit` before/after stored; dependent aggregates corrected |
| DB-20 | Weekend run twice | Single `jobRuns` identity; notification deduped |
| DB-21 | Free worker interruption | Job lease expires and processing resumes without duplicate writes |
| DB-22 | Stale prices | Historical view retained; no new actionable email generated |

## 11. Delivery plan and implementation checklist

1. **Schema and indexes:** Mongoose models for 25 collections, Zod API DTOs, migration/bootstrap scripts, index verification.
2. **Permissions:** Central `authorizeOwnedPortfolio(userId, portfolioId)` guard; shared watchlist read policy; security tests against IDOR.
3. **Data ingest:** CSV/XLSX preview, jobs, idempotent price upserts, revision log and calendar-gap checks.
4. **Indicators:** Pure strategy outputs persisted with rule/data versions, eligibility snapshots and explanation codes.
5. **Signal storage:** Historical replay separated from live `triggerStates`; state transition events atomically persisted.
6. **Portfolio ledger:** Confirmed trade writes, precise cost basis, audit corrections, optimistic concurrency and one-third-profit idempotency.
7. **Notifications:** Outbox, user alert read status, weekend digest job and stale-data suppression.
8. **Operational safety:** Auth/session TTL, metrics/logging, storage quota monitoring, encrypted export and restore test.

## 12. Open engineering decisions (not changes to trading policy)

- **Precision contract:** Choose Decimal128 vs integer paise in persistence, then specify rounding for import adjusted prices, weighted averages, charges, target and one-third increment. Default recommendation: Decimal128 for precise price/money plus decimal arithmetic library; round realized INR only under a documented transaction policy.
- **CAR anchor ties:** Determine exact Google Sheets sorted-high tie behavior using known test cases; persist explicit tie policy/version.
- **Point-in-time freshness:** Define staleness by expected last NSE session versus latest uploaded complete session, including unusual Saturday trading sessions.
- **Mongoose transactions on free Atlas:** Verify multi-document transaction capabilities and worker behavior in deployment; use a durable outbox/idempotent reconciliation where operations cannot be atomic.
- **Trade correction propagation:** Decide whether editing a completed historical trade triggers a full derived capital-ledger rebuild for the stock/portfolio (recommended), with the ledger still audit-preserving.
- **MVP position policy:** One simultaneously open position per portfolio/stock; separate sequence numbers for later cycles (specified above) versus overlapping independent lots (deferred).
- **Source licensing and provenance:** Store filename, origin and adjustment policy; users supply market data. No automatic trading or live broker data presumed.

---

**Document owner:** Advanced Darvas Box project  
**Change log:** v1.0 — baseline physical MongoDB design aligned to PRD v1.2 and System Design v1.1. New-stock gate is Bull Run + CAR + valid/fresh; previous 52-week suitability remains optional. Approved signal/trade separation and full-target exit preserved.

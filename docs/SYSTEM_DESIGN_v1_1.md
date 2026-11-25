# Advanced Darvas Box — System Architecture Specification v1.1

**Basis:** Approved PRD v1.2 and user selections from Stage 1–3. **Date:** 22 November 2026. **Scope:** Private, invite-only, family-used Nifty 100 swing-trading analysis app; not an automated brokerage trading system.

## 1. Architecture decision record

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui.
- Backend: Node.js, Express, TypeScript, Zod for validation, Mongoose for persistence.
- Persistent data: MongoDB Atlas Free (monitor storage/index quota; 512 MB currently).
- Authentication: Credentials (email/password), strong password hashes, server-validated sessions stored securely, HTTP-only Secure cookies. Invite-only admin/member authorization. Review cross-origin cookie behavior for Vercel/Render; use frontend same-origin API proxy if needed.
- Platform: Responsive web only; multiple family accounts with private portfolios and watchlists.
- Deployment: Next.js on Vercel Hobby, Express on Render Free; Render can spin down on inactivity.
- Source repository: Private GitHub monorepo using pnpm workspaces; GitHub Actions for CI and weekly scheduled job.
- Email: Resend API; persistent email outbox, retries and duplicate suppression.
- Tests: Vitest (strategy and API), React Testing Library (components), Playwright (browser E2E).
- Market data: Manual CSV/XLSX upload only; no automated NSE API ingestion. Nifty 100 focus, 5 years of history; weekend review cadence.
- Hosting budget: ₹0 target subject to platform free-plan terms, quotas, and availability.

## 2. Deployment and trust boundaries

1. Browser ↔ Vercel Next.js via HTTPS.
2. Next.js ↔ Render Express API via authenticated HTTPS; do not expose secrets in client bundles.
3. Render API ↔ MongoDB Atlas via TLS and least-privilege credentials. Avoid unbounded IP allowances where feasible; if network restrictions require a broad allowlist on free infrastructure, document the residual risk and rely on strong authentication and database isolation.
4. Express API ↔ Resend HTTPS API for email.
5. GitHub Actions ↔ signed/secret-authenticated Express `/internal/jobs/weekend-digest` endpoint; replay-resistant/idempotent job IDs; no public unauthenticated job endpoints.
6. All market data is user-uploaded; server validates file size, MIME/extension, headers, date ranges, prices, source, and symbol mapping. Original file need not be persistently stored on free Render filesystem.
7. Every user-owned record is partitioned and queried using `userId`, except shared market prices/indicator snapshots and admin-only imports.

## 3. Component boundaries

- `auth`: invitation creation/acceptance, credentials, session lifecycle, roles, account recovery.
- `stocks`: NSE symbols, shared prices, watchlists, latest data freshness.
- `imports`: file parsing, preview/mapping, validation, batch metadata, idempotent upsert and reconciliation.
- `indicators`: optional 52-week extrema date-order classifier; 50/100/200 SMA with source-specific ±10% DMA200 regime classification; CAR anchored expanding-average comparison.
- `eligibility`: REQUIRED default new-stock gate: valid + fresh data AND In Bull Run AND CAR Buy/Average Out; emits dated eligibility transitions with explainable reasons. Legacy 52-week suitability may be displayed or explicitly enabled as an additional optional filter. Source workbook Final List filters CAR alone; application Final List uses the approved combined gate.
- `darvas`: weekly high candidate, ±2.75% symmetric ignore band around last **accepted** trigger, high-touch event, accepted trigger persistence across completed trade sequences.
- `portfolio`: user-executed trades, cost basis, holding quantity, weighted-average acquisition price, 6% target, realized profit and one-third-profit investment target growth.
- `notifications`: signal outbox, in-app alerts, weekend email digests via Resend.
- `reports`: snapshots, trade ledgers, CSV exports; historical backtesting in later phase.

## 4. Domain rules to preserve

1. Candidate trigger for week W = maximum daily high from completed previous trading week W-1.
2. Ignore if candidate inside the **inclusive** last-accepted-trigger range `[lastAccepted×0.9725, lastAccepted×1.0275]`.
3. New accepted trigger only after `dailyHigh >= weeklyTrigger` AND new-stock entry eligibility passed as-of the signal date (unless an existing position is following a separately approved continuation rule). This gate is Bull Run + CAR + valid/fresh data. No assumed fill.
4. A last accepted trigger remains in place after all shares are sold and carries into subsequent trade sequences.
5. Additional-purchase candidate comes from the previous completed week's high and must pass the same screening/touch/ignore rules.
6. User manually records executions. Price touch and broker fill are distinct events.
7. Target = current weighted-average purchase price × 1.06. No mandatory downside stop-loss or DMA-triggered forced sale.
8. DMA alerts fire on **new entry** into qualifying Bull/Bear classifications, not on every day in the state.
9. CAR anchor: highest historical daily HIGH within the prior 364 calendar days; expanding arithmetic mean of chronological CLOSE values since selected high date; latest ten cumulative means strictly increasing (nine adjacent comparisons), with at least 10 valid rows. Original column H checks ten comparisons, last against zero, equivalent only under valid positive averages. Test anchor ties, header handling, and no synthetic-zero fallbacks.
10. Following a successful **completed** trading sequence, new investment target = previous target + one-third of the sequence's realized capital gain (after defined trading charges, excluding dividends for this target).
11. Only stocks passing the DEFAULT combined eligibility gate enter the new-entries Final List: `trend == In Bull Run && car == Buy/Average Out && valid && fresh`; the legacy 52-week suitability rule is a separate optional screen. The original workbook Final List is CAR-only; this is a deliberate application change. Existing positions are not force-sold when screening changes.
12. Missing market data must yield 'Insufficient Data' or 'Stale', not a fabricated current signal.
13. Backtests must use point-in-time data and cannot assume intraday touch was executable at target price.

## 5. Recommended collections and indexes

| Collection | Key fields | Critical index |
|---|---|---|
| users | email, passwordHash, role, status | unique email |
| invitations | email, tokenHash, invitedBy, expiresAt, consumedAt | unique tokenHash; TTL as appropriate |
| sessions | userId, sessionHash, expiresAt | TTL expiresAt |
| stocks | exchange, symbol, companyName | unique exchange+symbol |
| dailyPrices | stockId, tradingDate, OHLCV, importBatchId, adjustmentPolicy | unique stockId+tradingDate |
| importBatches | uploadedBy, fileHash, status, lastDate, errorSummary | fileHash+status |
| indicatorSnapshots | stockId, asOfDate, ruleVersion, suitability, DMAs, trend, CAR, eligible, eligibilityReasons, dataFreshness | unique stockId+asOfDate+ruleVersion |
| watchlists | userId, name, stockIds | userId+name |
| darvasCandidates | userId, stockId, weekStart, candidate, status, ruleVersion | unique userId+stockId+weekStart+ruleVersion |
| triggerEvents | userId, stockId, eventKey, effectiveDate, value | unique eventKey |
| positions | userId, stockId, sequenceId, qty, avgCost, currentTarget, status | userId+status+stockId |
| trades | userId, positionId, side, executedAt, quantity, price, fees | userId+positionId+executedAt |
| capitalLedgers | userId, sequenceId, prevTarget, realizedGain, increment, nextTarget | unique userId+sequenceId |
| notificationOutbox | userId, eventKey, channel, deliveryStatus, attempts | unique userId+eventKey+channel |
| jobRuns | jobType, scheduledFor, status, completedAt | unique jobType+scheduledFor |

Store financial currency amounts as integer paise or Decimal128 and define consistent rounding. Immutable executions and compensating adjustments are preferred to silent trade deletion.

## 6. Initial API contracts

| Method | Path | Description | Access |
|---|---|---|---|
| POST | `/api/auth/login` | Credentials login | Public, rate-limited |
| POST | `/api/auth/logout` | Revoke session | Authenticated |
| POST | `/api/invitations` | Invite family member | Admin |
| POST | `/api/invitations/accept` | Accept valid invitation | Token holder |
| GET | `/api/stocks` | Search master symbols + analysis summary | Member |
| GET | `/api/stocks/:symbol/analysis` | Indicators, trigger, data freshness, combined eligibility and reasons | Member |
| GET | `/api/screener/eligible` | Filtered Final List: Bull Run AND CAR AND valid/fresh | Member |
| GET | `/api/stocks/:symbol/eligibility-history` | Dated eligibility transitions, versions and blockers | Member |
| POST | `/api/imports/preview` | Parse and validate upload preview | Admin |
| POST | `/api/imports/commit` | Persist validated import batch and recompute | Admin |
| GET/POST | `/api/watchlists` | Private watchlists | Member |
| GET | `/api/stocks/:symbol/triggers` | Candidate and accepted trigger events | Member |
| GET/POST | `/api/trades` | Private executions | Member |
| GET | `/api/portfolio` | User positions/cash/targets | Member |
| GET | `/api/alerts` | Private alerts, read status | Member |
| POST | `/api/internal/jobs/weekend-digest` | Idempotent scheduled summary | Service secret only |

Use pagination for market and event history; consistent error codes (`INVALID_FILE`, `INSUFFICIENT_HISTORY`, `STALE_DATA`, `UNAUTHORIZED`, `DUPLICATE_IMPORT`). Add versioned request/response schemas.

## 7. Weekend jobs and data freshness

- **Immediately after successful upload:** Save validated OHLCV, calculate relevant indicators and the combined eligibility gate, generate next-week candidate using completed weeks, replay eligible high/target touches by date with point-in-time rules, and update alert outbox.
- **Saturday, 10:30 Asia/Kolkata (initial proposal):** GitHub Actions schedules signed call; API verifies new uploads, data freshness, and job-run ID, compiles in-app summary, and sends Resend email digests. No network-based stock fetch.
- **Manual fallback:** Admin can trigger weekend summary in the dashboard; GitHub `workflow_dispatch` also available. Both paths share idempotent job logic.
- **If data is stale:** Clearly label latest available trading date and do not claim signals are up-to-date. Don't send 'new' market signals based only on reruns of old records.
- **Free hosting caveat:** Render web service may be asleep; workflow should retry with exponential backoff, and provide manual summary fallback. Never depend on on-instance cron or ephemeral file storage.

## 8. Monorepo directory layout

```text
advanced-darvas-box/
  apps/
    web/                 # Next.js App Router, Tailwind, shadcn/ui
    api/                 # Express REST API and domain modules
  packages/
    strategy-core/       # Pure calculations, no DB or web coupling
    contracts/           # Shared Zod schemas and TypeScript types
    ui/                  # Optional shared UI components
  scripts/               # Validation, import fixtures, migrations
  fixtures/              # Excel-matched golden test datasets
  .github/workflows/
    ci.yml
    weekend-digest.yml
  pnpm-workspace.yaml
  README.md
```

## 9. CI/CD and quality gates

- Pull request: typecheck, lint, unit tests for strategy-core, API tests, component tests, build.
- Main branch: deploy frontend to Vercel and backend to Render (via platform Git integration or secured deploy hooks).
- Playwright smoke E2E (login, import, stock analysis, purchase, target, logout) against controlled test environment.
- No production market data or personal trades in CI artifacts. Use synthetic and redacted fixtures.
- Golden tests: source Nifty workbook Final List CAR-only vs intentionally stricter app Final List, 10-observation CAR monotonicity, Bull Run ±10% boundaries, missing/stale data eligibility, eligibility transitions and position preservation. Other golden tests: supplied Adani CSV, 52-week suitability workbook, Nifty 100 GTT workbook, CAR workbook; compare each rule, anchor, trigger, and transition to spreadsheet outputs.

## 10. Delivery plan

1. Foundation: monorepo, environment config, MongoDB schema, test harness, CI, roles/auth.
2. Data: NSE symbol master, upload preview, parsing, validation, idempotent imports and data freshness.
3. Strategy: suitability, 50/100/200 DMA, CAR, weekly Darvas triggers and golden test parity.
4. Trading: manual execution ledger, averages, target touches, capital allocation and user isolation.
5. UI: screener, stock details, chart overlays, watchlists, trade journal, portfolio dashboard.
6. Operations: scheduled digest, Resend, dedupe/retries, deployments, monitoring and recovery testing.
7. Later: backtesting, bulk data optimizations, advanced analytics.

## 11. Open engineering constraints

- Upload format specifics and guaranteed source column mapping: document fixture by fixture.
- Trade-time convention: a daily high tells us a level was touched, but not whether it happened before an order was placed or a change in target occurred. Mark ambiguous same-day cases as unverified in historical replay.
- CAR equal-high tie policy and 52-week lookback: mirror tested Google Sheets results, not arbitrary assumptions.
- Frontend/backend cookie domain approach: production authentication spike on Vercel + Render before implementation proceeds.
- Backup policy: free MongoDB tier may lack managed backups; schedule encrypted exports to an approved durable location, keeping credentials and personally identifiable data secure.
- Resend email sender verification/domain requirements; free-tier limits and Vercel non-commercial usage terms need confirmation before exposing the family app beyond personal use.
- Budget is a ₹0 target, not guaranteed SLA or fixed long-term entitlement.

## 12. External platform reference checks (Nov 2026)

- Render free services: https://render.com/docs/free
- Vercel Hobby: https://vercel.com/docs/plans/hobby
- MongoDB Atlas Free: https://www.mongodb.com/pricing
- Resend pricing: https://resend.com/pricing/
- GitHub scheduled workflow: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows


## 13. Default Combined Screening — Detailed System Design Amendment (v1.1)

**Authoritative rule:** `eligibleForNewEntry = validFreshOHLC && trend === 'In Bull Run' && car === 'Buy/Average Out'`. Source sheet used for DMA and CAR: `Copy of  Nifty 100 GTT Stocks List (1).xlsx`. Source `Final List` actually filters CAR-only: application output is intentionally stricter, per user approval.

### Data dependencies and calculation order

1. Admin uploads an individual NSE-symbol CSV or XLSX (five-year initialization, subsequent weekly delta). Validate exchange/session calendar, OHLC, corporate-action adjustment basis, duplicate dates and gaps; keep raw history and revisions.
2. Build price snapshot for each trading session with point-in-time validity and source freshness. For EOD analysis `CMP` is the latest available close; do not mix contemporaneous GoogleFinance intraday CMP with a different close without labeling the timestamp.
3. SMA50/SMA100/SMA200: arithmetic mean of latest 50/100/200 valid completed-session CLOSE prices. As in workbook `CMP > each SMA`, **not** `SMA50 > SMA100 > SMA200`. Calculate `distance200 = (CMP - SMA200)*100/SMA200`.
4. In Bull Run if `CMP > SMA50 && CMP > SMA100 && CMP > SMA200 && 0.01 <= distance200 <= 10`. In Bear Run if CMP below all three and `-10 <= distance200 <= -0.01`, otherwise Unconfirmed. Missing valid inputs produce Insufficient Data, not Unconfirmed.
5. CAR: select 52-week HIGH date from maximum daily HIGH in 364 calendar days ending at as-of; retrieve completed-session CLOSE values from that high date; expanding cumulative averages; newest 10 values; require nine strictly positive consecutive differences, and at least 10 actual price observations. Record anchor date, tie resolution, recent ten means, comparison results and source basis. Do not silently use spreadsheet's fallback high_date=today-30 or synthetic-zero arrays as passing signals.
6. `eligibility = ELIGIBLE | WAIT_TREND | WAIT_CAR | WAIT_BOTH | INSUFFICIENT_DATA | STALE_DATA`; store `eligible:boolean`, `reasons[]`, effective trading date, strategy version and computedAt. On fresh valid data, cache per-stock snapshot and append an event only for eligibility transitions; no repeated identical alerts on rerun.
7. Candidate Darvas trigger for week W = completed prior week's highest daily HIGH; apply inclusive ±2.75% around user's last accepted trigger; require High touch and eligibility at that historical date for a **new** entry. User manually confirms purchase/exit. Existing holdings remain active when eligibility later fails; they do not receive automatic sell or bearish stop-loss.

### Separation of shared and private state

- Shared: stock universe, daily prices, 52-week extrema, DMA, CAR, eligibility snapshots.
- User/portfolio-specific: selected screening preferences, private/shared watchlists, candidate/accepted-trigger state, purchase/sale transaction ledger, position targets and reinvestment.
- Historical replay jobs compute simulated signal history isolated from personal real-trading trigger state. Never mutate manually entered trades or accept signals retroactively into live state.

### Typed API response (illustrative)

```json
{
  "symbol":"NSE:EXAMPLE", "asOfDate":"2026-11-20", "priceBasis":"adjusted_eod_close",
  "dma":{"sma50":102,"sma100":101,"sma200":100,"distance200Pct":5,"trend":"In Bull Run"},
  "car":{"rating":"Buy/Average Out","anchorDate":"2026-06-01","observations":90,"recentCumulativeAverages":[98,99,100,101,102,103,104,105,106,107]},
  "eligibility":{"eligible":true,"status":"ELIGIBLE","reasons":[],"ruleVersion":"eligibility-v1.1"},
  "data":{"valid":true,"fresh":true,"latestTradingDate":"2026-11-20"}
}
```

### Test matrix and release gate

| Test | Setup | Expected |
|---|---|---|
| EL-01 | Bull Run + Buy/Average Out + fresh valid data | ELIGIBLE |
| EL-02 | Bull Run + Avoid/Hold | WAIT_CAR |
| EL-03 | Bear Run + Buy/Average Out | WAIT_TREND |
| EL-04 | distance200 = 10.01% | Unconfirmed, ineligible |
| EL-05 | distance200 = 0.01%, price above all SMAs | Bull Run boundary passes |
| EL-06 | CAR 9 valid close rows | INSUFFICIENT_DATA |
| EL-07 | CAR newest ten not strictly rising | WAIT_CAR |
| EL-08 | old price data or missing session | STALE_DATA / INSUFFICIENT_DATA; no fresh entry signal |
| EL-09 | legacy 52-week rule says Avoid while combined passes | Eligible by default (unless optional legacy veto explicitly enabled) |
| EL-10 | Existing position changes to Bear Run | Keep holding, last accepted trigger, 6% target |
| EL-11 | Same upload / scheduled calculation repeated | No duplicate eligibility transition or alerts |
| EL-12 | Historical backfill finds eligible past dates | Replay only; no real trades or live trigger-state mutation |

### Security, operations and implementation notes

- `/api/screener/eligible` supports as-of date, pagination, sort by DMA distance, and data-quality explanations. Share only market eligibility; private holdings require owner authorization.
- Weekend digest is sent only after recent manual upload; mark stale/unavailable clearly rather than claiming market prices are live.
- Source CAR formula embeds `__xludf.DUMMYFUNCTION` when exported to XLSX; validate against underlying native Google Sheets logic and known historical fixtures, not Excel cached evaluation alone.
- GTT order examples from the source workbook are **not** part of the Darvas trade execution engine; the app remains manual-order confirmation only.

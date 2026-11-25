| DOCUMENT CONTROL | DETAIL                                                                                                  |
|------------------|---------------------------------------------------------------------------------------------------------|
| Version          | 1.2 — approved combined Bull Run + CAR stock selection                                                  |
| Date             | 22 November 2026                                                                                        |
| Status           | Requirements baseline; historical-data validation pending                                               |
| Market           | NSE-listed Indian equities                                                                              |
| Delivery         | Responsive web application, manual execution first                                                      |
| Inputs           | Latest Nifty 100 GTT workbook, prior screening/trading sheets, DMA-DMA blog, approved PRD/LLD decisions |

| **Core principle** Preserve each source strategy as an independent rule set. Never infer that an indicator alert equals a completed purchase or sale. |
|-------------------------------------------------------------------------------------------------------------------------------------------------------|

# 1. Executive Summary

Build a web-first NSE stock screening and swing-trade tracking application. DEFAULT new-stock eligibility requires In Bull Run AND CAR Buy/Average Out AND valid, fresh market data; optional legacy 52-week suitability is displayed separately. The user primarily reviews markets on weekends and uploads prices manually. Signals are decision support only: all trades are manually confirmed.

The system is decision support and an accounting tracker. It does not execute broker orders. Signals are derived from historical or current prices and must display their freshness and assumptions.

# 2. Scope and Priorities

| ID  | MODULE                             | PRIORITY | MVP?    |
|-----|------------------------------------|----------|---------|
| M01 | Stock universe, import, watchlists | P0       | Yes     |
| M02 | 52-week suitability                | P0       | Yes     |
| M03 | DMA-DMA trend + transition alerts  | P0       | Yes     |
| M04 | CAR cumulative-average indicator   | P1       | Phase 2 |
| M05 | Weekly Darvas trigger engine       | P0       | Yes     |
| M06 | Trade/portfolio + 1/3 reinvestment | P0       | Yes     |
| M07 | Alerts and weekend digest          | P1       | Phase 2 |
| M08 | Backtests and comparison           | P2       | Phase 3 |

Non-goals for MVP: automated brokerage trades, intraday high-frequency execution, mandatory stop-loss, automatic DMA-based exit, debt ETF investing, commercial investment advice, derivatives.

# 3. Confirmed Strategy Decisions — Change Log

| ID    | USER-APPROVED REQUIREMENT                                 | IMPLEMENTATION INTERPRETATION                                                                  |
|-------|-----------------------------------------------------------|------------------------------------------------------------------------------------------------|
| OD-01 | Accept trigger only when buying condition actually occurs | A candidate alone cannot update the reference. Require price touch and eligibility checks.     |
| OD-02 | Day’s high touches weekly trigger                         | High \>= trigger marks a breakout event; no assumed fill.                                      |
| OD-03 | Carry reference into next sequence                        | Do not reset last accepted trigger after a full exit.                                          |
| OD-04 | Additional purchases: previous-week high                  | Evaluate next weekly high against persistent reference and ±2.75% band.                        |
| OD-05 | Sell only on 6% profit                                    | No compulsory stop-loss or trend-based sale; manually recorded sales supported.                |
| OD-06 | DMA only when newly qualifying                            | Transition-based signal, not an alert on each qualifying day.                                  |
| OD-07 | CAR anchor as Excel                                       | Use 52-week-high date and cumulative average implementation of source workbook; validate ties. |
| OD-08 | Weekend review                                            | Daily EOD refresh; weekly aggregation after last market session.                               |
| OD-09 | One-third-profit reinvestment                             | Increase next investment budget by 1/3 of successful prior trade capital gain.                 |

# 4. Users and Main Journeys

Primary user: personal NSE swing trader managing stock analysis, manually placed trades, and weekend review. Secondary: researcher comparing historical performance of rule variants.

- Import or synchronize daily OHLC data for a watchlist; inspect missing-data status.

- Screen suitability, DMA trend, and CAR as three independent attributes.

- Every completed week, compute next-week candidate trigger from the previous week’s high.

- When any daily high touches an eligible trigger, flag a buying opportunity; user separately records whether a purchase occurred.

- Track every buy, recompute remaining weighted cost and 6% target, and flag target touches.

- After a successful completed sequence, grow the next investment target by one-third of the realized capital gain.

- Review weekly summary with new transitions, trigger touches, holdings and performance.

# 5. Detailed Functional Requirements

## 5.1 Stock universe and data ingestion

**FR-001** Maintain NSE symbol master, company name, series, active status and stable stock ID.

**FR-002** Import daily OHLCV from CSV/Excel; later integrate a permitted NSE-compatible market-data provider.

**FR-003** Store trading date, exchange timezone (Asia/Kolkata), source, freshness, and corporate-action adjustment policy.

**FR-004** Allow create/edit/delete watchlists, stock search, and manual symbol mapping during import.

**FR-005** Report missing observations, duplications, stale prices and insufficient indicator history rather than misclassify them.

## 5.2 52-week suitability

OPTIONAL LEGACY SCREEN (NOT REQUIRED FOR DEFAULT ELIGIBILITY). Source: “Stocks for Darvas Box Strategy Advanced Version.xlsx”. Strict legacy rule: if date(52-week high) \< date(52-week low), Suitable for Darvas Box Strategy; otherwise Avoid. Insufficient data must be a third system result. This is a date-order rule, not an assumed uptrend.

**FR-006** Compute rolling 52-week highest daily high and lowest daily low with their dates.

**FR-007** Show source extrema, dates, screening status and evaluation timestamp.

FR-008 Allow sorting/filtering Suitable, Avoid, Insufficient Data. This optional legacy filter shall not veto or qualify new-stock eligibility unless explicitly enabled by an authorized user. Document tie-breaking when extrema repeat.

## 5.3 DMA-DMA bullish/bearish classification

Source: “Copy of Nifty 100 GTT Stocks List.xlsx”. Let D = 100×(Close−DMA200)/DMA200, with moving averages from 50, 100, 200 completed trading sessions.

| STATE             | EXACT DEFAULT CONDITION                                  |
|-------------------|----------------------------------------------------------|
| In Bull Run       | Close \> DMA50, DMA100 and DMA200; 0.01% \<= D \<= 10%   |
| In Bear Run       | Close \< DMA50, DMA100 and DMA200; -10% \<= D \<= -0.01% |
| Unconfirmed       | Neither above condition is met                           |
| Insufficient Data | Not enough valid observations to compute all averages    |

**FR-009** Compute and store DMA values, D, trend status and analysis date.

**FR-010** Emit trend entry event only when previous valid status differs from the newly qualifying Bull or Bear state.

**FR-011** Repeated successive days in one trend shall not issue repeated “entered trend” alerts.

**FR-012** Make DMA thresholds configurable, defaulting to the supplied workbook.

**FR-013** DMA classifications are informational and shall not create forced sell orders or stop-loss exits.

## 5.4 CAR momentum

Source: “Copy of MAHESH STOCK CAR.xlsx”. Find the 52-week high date from the historical high series (GoogleFinance lookback of 365 calendar days in the source). From that date, collect daily close prices, calculate expanding cumulative averages, and compare the latest ten averages newest-first: 9 of 9 successive increases ⇒ BUY / AVERAGE OUT; otherwise AVOID / HOLD.

**FR-014** Replicate source workbook’s high-date anchor and cumulative-average sequence.

**FR-015** Return BUY / AVERAGE OUT, AVOID / HOLD, or Insufficient Data / Short History as applicable.

**FR-016** Expose ten comparison values and nine comparison outcomes for debugging and transparency.

**FR-017** Validate exact anchor/ties, sort direction and alternate CAR formula from the main Nifty sheet before declaring parity.

FR-018 Keep CAR an independent attribute; do not equate it with Bull Run or a Darvas purchase. The DEFAULT new-stock screener requires BOTH the Bull Run classification and CAR Buy/Average Out, plus valid and fresh data.

## 5.5 Weekly Darvas buying engine

Source: Adani Enterprises historical tracker + decisions OD-01 to OD-04. A completed trading week produces a candidate weekly trigger equal to the maximum of that week’s daily high prices, available for the next week. Use the completed NSE trading week, accounting for exchange holidays.

| **Formula set** Candidate = max(previous completed week highs); Lower = last accepted trigger × 0.9725; Upper = last accepted trigger × 1.0275. Ignorable interval includes both bounds. |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

State machine: CANDIDATE → IGNORED (inside band), or WATCHING (outside band) → TOUCHED when any valid daily High \>= candidate → ACCEPTED if buying conditions are satisfied. First eligible touch initializes a missing reference. ACCEPTED is a signal record, not an executed fill.

**FR-019** Generate at most one candidate per stock for each completed trading week and record its provenance.

**FR-020** Compare candidate with ±2.75% of last accepted trigger; do not update reference on ignored triggers.

FR-021 Only accept a candidate once actual buying condition is met: dailyHigh \>= candidate, candidate outside the inclusive ignore band, AND default new-stock eligibility has passed as-of that trading session (for new entries). Existing holdings keep their triggers and targets regardless of later screening changes. High \>= candidate, candidate not ignored, plus any enabled gating conditions.

**FR-022** Keep accepted reference unchanged after full target exit and into the next trading sequence.

**FR-023** An additional buy uses the new previous-week high and passes the same touch and ignorable-range checks.

**FR-024** Record candidate, ignored, touched, accepted, purchase and filled as distinct events/states with timestamps.

**FR-025** Support manual override with audit trail for historical data or missed signals.

**FR-026** Avoid duplicate processing when records are rerun or imported again.

## 5.6 Purchases, exits and profit targets

User-confirmed exit policy: No downside stop-loss; the strategy exit condition is a 6% profit target on current weighted-average purchase price. The system may flag a target as touched when High \>= target, but must not assume a fill or sale until the user records execution.

**FR-027** Allow manual buy execution date, quantity, price, fees and linked stock/trigger/sequence.

**FR-028** Maintain open quantity and weighted-average cost consistently after additional buys and partial exits.

**FR-029** Target = current weighted-average purchase price × 1.06 by default, recalculated after each qualifying buy.

**FR-030** Generate “target reached” event if any market-day high equals or exceeds target, but retain position until sale is recorded.

**FR-031** Do not issue automated stop-loss, bearish-exit, or reverse-trade instructions.

**FR-032** Support manual sales and corrections with reasons, keeping complete audit history.

**FR-033** Display unrealized drawdown, holding age and capital tied up; clearly explain no protective exit rule is active.

## 5.7 Capital allocation (one-third-profit reinvestment)

The trading plan uses an investment target/budget that can differ from account cash. Example: starting target ₹50,000; after successful closed trading sequence with ₹3,000 realized capital gain, next target = ₹51,000. Profit used is realized capital gain after trade charges, excluding dividends, assumed interest and unrealized P&L.

**FR-034** Track separate starting investment target, current investment target, available cash and actual executed investment.

**FR-035** After a fully completed profitable sequence: NextTarget = PreviousTarget + (RealizedCapitalGain / 3).

**FR-036** For zero-profit or loss-making sequences, retain investment target; never apply negative compounding by default.

**FR-037** Use integer share quantities within both the target and actual cash budget, accounting for configured entry charges.

**FR-038** Keep re-investment calculation transparent in a sequence-level ledger, with ability to compare blog-style gross vs net treatment.

## 5.8 Dashboards, alerts and reports

FR-039 Overview cards show eligible stocks (Bull Run + CAR + valid/fresh), stocks waiting on trend or CAR, missing/stale inputs, optional legacy suitability, trigger touches, open positions and P&L.

**FR-040** Stock detail: OHLC/candlestick, DMAs, 52-week extrema, CAR values, weekly trigger and range, trades, target, notes.

**FR-041** Weekend review digest: completed-week highs, newly qualified trend transitions, fresh trigger touches and reached targets.

**FR-042** Deduplicate notifications by stock, event type, effective date and rule version.

**FR-043** Provide downloadable CSV trade/trigger history and reproducible performance report.

**FR-044** Label every display with last refresh date and whether prices are delayed/EOD/historical.

## 5.9 Backtesting (later phase)

FR-045 Backtest Darvas-only and the DEFAULT Bull Run + CAR screening gate with Darvas execution; evaluate DMA-only and CAR-only as research comparisons without automatically changing the live eligibility rule.

**FR-046** Use previous completed week’s high for next-week decisions; ensure historical indicator knowledge is point-in-time.

**FR-047** Never assume trigger-touch or target-touch filled at trigger/target price without an explicit execution model.

**FR-048** Support brokerage, taxes/charges, slippage, splits/bonuses, dividends and price adjustment conventions.

**FR-049** Report trade ledger, final capital, CAGR, max drawdown, exposure, turnover and buy-and-hold benchmark.

**FR-050** Version strategy inputs and data snapshots to make results reproducible.

# 6. User Interface Specification

| PAGE         | REQUIRED CONTENT                                                                    |
|--------------|-------------------------------------------------------------------------------------|
| Dashboard    | Count and P&L cards; signal event feed; weekend digest; data freshness              |
| Screener     | Filters: suitability, DMA, CAR, eligible candidate, touched status; sort/export     |
| Watchlists   | Named lists, symbol search, tracked status and notes                                |
| Stock detail | OHLC candles, overlays, weekly triggers, dates, 52w high/low, CAR and trade history |
| Portfolio    | Positions, cost basis, 6% targets, unrealized loss, realized P&L, budget/cash       |
| Transactions | Add/edit/correct buys and sells; link trigger events; audit log                     |
| Settings     | 2.75% symmetric range, 6% target, DMA bands, trade charges, indicator rules         |
| Backtests    | Strategy choice, historical interval, execution assumptions and comparisons         |

# 7. Technical Design

Selected stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui; private family access; invite-only credentials; Vercel frontend, Render Express API; GitHub Actions weekend jobs; Resend dashboard/email notifications. , Node.js + Express API, MongoDB, background job worker, market-data ingestion service, chart component, and optional Python analytics in later phases. Web-first and responsive; no need for a real-time streaming interface in MVP.

## 7.1 Core data entities

| ENTITY            | KEY FIELDS                                                              |
|-------------------|-------------------------------------------------------------------------|
| Stock             | symbol, name, exchange, series, active                                  |
| DailyBar          | stockId, sessionDate, OHLCV, source, isAdjusted, ingestedAt             |
| IndicatorSnapshot | stockId, asOf, 52w extrema+dates, DMA50/100/200, D, trend, CAR, version |
| WeeklyCandidate   | stockId, weekEnd, high, availableFrom, ignoredReason, touchDate, status |
| TriggerReference  | stockId, userId, strategyId, lastAcceptedTrigger, acceptedAt            |
| TradingSequence   | id, userId, stockId, status, investmentTarget, start, end               |
| Trade             | sequenceId, side, timestamp, quantity, fillPrice, fees, note            |
| Position          | sequenceId, qty, costBasis, avgPrice, target, unrealizedPnl             |
| CapitalLedger     | sequenceId, previousTarget, realizedGain, oneThirdAdded, nextTarget     |
| SignalEvent       | stockId, eventType, effectiveDate, stateFrom, stateTo, ruleVersion      |
| BacktestRun       | params, asOfData, tradeLedger, metrics, executionModel                  |

## 7.2 Processing cadence

- After each ADMIN manual CSV/XLSX upload: validate and persist single-stock daily bars, recalculate screening snapshots, and replay historical signals without creating real trades. Weekend GitHub Actions only checks already-uploaded data; calculate technical snapshots; detect trend transitions, candidate/target touches, CAR updates.

- After the last trading session of a week: finalize week high; create the following week’s candidate trigger.

- Weekend: publish a concise report with newly accepted/touched signals, watchlist changes, positions and P&L.

- All processing runs idempotently; avoid generating duplicate events on a retry.

# 8. Acceptance Tests — Must Pass

| TEST  | INPUT / EVENT                            | EXPECTED RESULT                                                |
|-------|------------------------------------------|----------------------------------------------------------------|
| AT-01 | Last accepted = ₹3,338.00                | Band = ₹3,246.205 to ₹3,429.795 (display ₹3,246.21–₹3,429.80). |
| AT-02 | Candidate ₹3,400, regardless of touch    | Ignored; reference stays ₹3,338.                               |
| AT-03 | Candidate ₹3,500; day High ₹3,499        | Not accepted; reference unchanged.                             |
| AT-04 | Candidate ₹3,500; day High ₹3,500        | Eligible touch; candidate accepted (subject to active gates).  |
| AT-05 | All shares sold at target                | Reference remains last accepted trigger for new sequence.      |
| AT-06 | One share ₹3,338 + one share ₹3,500      | Average ₹3,419 before fees; target ₹3,624.14.                  |
| AT-07 | Avg price ₹3,338; High reaches ₹3,538.28 | Target touched; position does not auto-close.                  |
| AT-08 | Bull yesterday; Bull today               | No repeat Bull entry alert.                                    |
| AT-09 | Unconfirmed yesterday; Bull today        | One new Bull entry event.                                      |
| AT-10 | Closed gain ₹3,000; target ₹50,000       | Next target ₹51,000.                                           |
| AT-11 | Closed loss or no profit                 | Next investment target unchanged.                              |
| AT-12 | Incomplete 200-session data              | DMA Insufficient Data, not Unconfirmed.                        |
| AT-13 | Reimport same market-day bar             | No duplicate bars or signals.                                  |

Rounding: maintain currency and exact trigger threshold calculations at full precision until presentation; define cash-rounding and tax treatment before production P&L sign-off.

# 9. Validation Approach and Test Fixtures

- Adani CSV: golden dataset for previous-week highs, trigger touches, ignore-band reference, weighted purchase prices, 6% targets and reported trade outcomes.

- 52-week suitability workbook: golden dataset for date-order screening and the Final List filter.

- Nifty 100 GTT workbook: golden dataset for moving averages, ±10% bands, trend transitions and CAR summary.

- MAHESH STOCK CAR: golden dataset for anchor date, expanding averages, newest-first ordering and nine comparisons.

- DMA-DMA blog PDF: explanatory reference for one-third capital allocation and alternate 6.28% strategy; the user’s explicit 6% sell-only rule overrides the blog’s reverse-trading exit workflow.

# 10. Open Implementation Details (not strategy decisions)

| TOPIC                                     | VALIDATION REQUIRED                                                                                             |
|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| Price touch vs actual order               | Touch at weekly high is a signal; user provides execution fill, which can differ due to gaps/slippage.          |
| Candidate beyond band but trigger touched | Confirm whether optional DMA/CAR gating is enabled or informative only. Default: informative only.              |
| CAR high-date tie                         | Source query sorts by high descending; equal highs may not specify a deterministic date. Add tested tie policy. |
| First-ever trigger                        | Initialize last accepted trigger from first eligible touched candidate.                                         |
| Mixed/partial position exits              | Define when sequence is “completed” for one-third realized-gain allocation; initial default: fully closed.      |
| Share accounting                          | Confirm weighted average cost basis on partial exits and exact charges/tax methods.                             |
| Corporate actions                         | Agree on adjusted vs unadjusted weekly highs and cost-basis restatement.                                        |
| End-of-day signal timing                  | End-of-day backfill can detect intra-day touches but cannot imply users saw alerts in real time.                |

# 11. Release Plan and Definition of Done

| PHASE              | DELIVERABLE                                                                          | DONE WHEN                                                               |
|--------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| 1 — Rules & import | Data parsers; independent indicators; trigger/portfolio engine; automated unit tests | Workbook and CSV golden cases match or discrepancies documented.        |
| 2 — MVP UI         | Dashboard, watchlists, stock details, manual trade ledger, target tracking           | All normal tracking possible without Excel edits.                       |
| 3 — Monitoring     | EOD data service, transition events, weekend digest, CAR views                       | Weekend report generated reliably from fresh/stale labeled data.        |
| 4 — Research       | Backtests, strategy comparisons, advanced reports                                    | Results reproducible without look-ahead and with execution assumptions. |

# 12. Data Security, Risk and Compliance

Use HTTPS, password hashing, user-level data isolation, authenticated APIs, private transaction records, audited edits, source licensing and provider-rate limits. Market data can be missing or stale; do not present stale or spreadsheet-cached labels as current recommendations. Historical P&L and backtests are educational analytics; no returns are guaranteed. There is no downside-exit rule, so portfolio risk may be substantial. Confirm applicable exchange/SEBI requirements before commercial deployment or redistribution of data.

# 13. Source and Requirements Traceability

| REFERENCE                                                      | CONTRIBUTION                                                                                                         |
|----------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Stocks for Darvas Box Strategy Advanced Version.xlsx           | 52-week high-date \< low-date suitability formula.                                                                   |
| Copy of Nifty 100 GTT Stocks List.xlsx                         | DMA50/100/200 and ±10% Bull/Bear rules, CAR summary.                                                                 |
| Copy of MAHESH STOCK CAR.xlsx                                  | 52-week high anchor, expanding cumulative averages, 9/9 rising test.                                                 |
| Adani_Enterprises_xlsx\_-\_Quote-Equity-ADANIENT-EQ-02-10-.csv | Weekly high trigger, averaging, target and trade examples.                                                           |
| advance darvos box.pdf                                         | DMA-DMA discussion, capital-growth example, backtest context.                                                        |
| User-confirmed decisions in project conversation               | All nine OD decisions, especially sell-only-at-6%, carry-forward reference, EOD use and one-third-profit allocation. |

| **Definition of Done** The MVP can import valid historical data, classify suitability/trend, create reproducible weekly candidates, ignore symmetric ±2.75% bands around the last accepted trigger, detect touches, record manual trades, calculate weighted cost and the 6% target, preserve the reference across sequences, and update the next capital target after successful fully closed trades. |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 14. Approved Stock Selection Gate — PRD v1.2 Amendment

Status: REQUIRED for new-stock entries. Source: Copy of Nifty 100 GTT Stocks List (1).xlsx, NSE100 Stocks (columns B–H) and Final List. Decision date: 22 November 2026.

## 14.1 Default eligibility formula

Eligible(stock, asOfDate) = ValidFreshData AND (CMP \> DMA50 AND CMP \> DMA100 AND CMP \> DMA200) AND (0.01 \<= 100\*(CMP-DMA200)/DMA200 \<= 10.00) AND CAR == "Buy/Average Out".

No 50\>100\>200 ordering is implied by the workbook; CMP only must exceed each DMA. A stock more than +10% above DMA200 is Unconfirmed under the source rule, not In Bull Run. Negative/bear classification retains the workbook formula but is ineligible for NEW entries.

## 14.2 CAR formula equivalence and limitations

Select a 52-week high date from historical daily HIGH prices over approximately 364 calendar days. Retrieve chronological daily CLOSE prices from the peak date through as-of date. Define cumulativeAverage\[i\] = sum(closes\[0..i\]) / (i+1). Read the newest 10 valid cumulative averages, require at least 10 observations, and check nine strict adjacent increases from oldest to newest. The source Nifty 100 column H formula compares ten newest-first values against the next value, ending with a comparison to zero; for positive price averages this is equivalent to the nine adjacent comparisons plus positive oldest average. Errors, missing data, or synthetic zero fallbacks shall NOT produce eligibility. Record anchor/tie policy and rule version.

Spreadsheet discrepancy: The source Final List formula filters only CAR == "Buy/Average Out". This product intentionally improves the application Final List by requiring BOTH In Bull Run and CAR Buy/Average Out with valid/fresh data. Do not claim that the original Final List already implements the combined gate.

## 14.3 Eligibility and execution lifecycle

- Eligible stocks enter the New Opportunities list, not a brokerage order. Eligibility is a dated computed snapshot; the next weekly Darvas trigger remains the previous completed week high.

- At touch (daily High \>= candidate trigger), evaluate the selected gating rule using information available as of the touch date. Candidate must be outside the inclusive ±2.75% band around the last accepted trigger; accepted reference updates on qualifying SIGNAL, even without a trade.

- All purchases and full-position sales require manual confirmation. Position target is 6% above weighted average executed purchase price. No stop-loss, forced bearish exit, or automatic brokerage order is introduced.

- Open holdings and their accepted triggers survive later loss of eligibility and target-completed exits. The one-third of NET realized profit reinvestment rule remains per-stock and per-portfolio.

- Manual single-stock CSV/XLSX imports, initial five-year history plus weekly increments, missing-session flags, corrected-price revision history and corporate-action-adjusted indicator basis remain unchanged.

- The workbook GTT limit-order example does not override weekly Darvas trigger calculation or manual execution.

## 14.4 Additional acceptance criteria

| Test  | Input                                                  | Expected                                                         |
|-------|--------------------------------------------------------|------------------------------------------------------------------|
| SG-01 | Bull Run + Buy/Average Out + valid current data        | ELIGIBLE                                                         |
| SG-02 | Bull Run + Avoid/Hold                                  | WAIT                                                             |
| SG-03 | Bear Run or Unconfirmed + Buy/Average Out              | NOT ELIGIBLE                                                     |
| SG-04 | CMP \> DMA200 by more than 10%                         | UNCONFIRMED; NOT ELIGIBLE                                        |
| SG-05 | CAR fewer than 10 valid closes after anchor            | SHORT HISTORY; NOT ELIGIBLE                                      |
| SG-06 | Missing/stale source data                              | DATA UNAVAILABLE; suppress new actionable alerts                 |
| SG-07 | 52-week legacy rule = Avoid while combined gate passes | ELIGIBLE by default; legacy marker separately displayed          |
| SG-08 | Position becomes Bear Run after buy                    | Preserve position, 6% target, and accepted trigger               |
| SG-09 | Historical replay of eligible signals                  | No automatic trades or mutation of user-owned live trigger state |
| SG-10 | Workbook Final List filters CAR alone                  | Show source-vs-app difference in validation suite                |

Rule precedence: Approved v1.2 combined eligibility gate supersedes prior descriptions that treated DMA and CAR solely as independent optional attributes for new-stock selection; they remain individually visible for transparency. All other approved OD and LLD decisions remain in force.

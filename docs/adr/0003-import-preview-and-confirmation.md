# ADR 0003 — Secure import preview and confirmation

- Status: accepted for the explicitly authorized Phase 8D-1 only.
- Decision date: 28 November 2026 (Asia/Kolkata).
- Baseline: four approved specifications, ADR 0002, Phase 8C parser and the user's
  Phase 8D-1 request. The four specifications remain unchanged.

## API boundary and additive fields

Implement canonical `/api/v1/imports/preview`, `/imports/commit`, `/imports/jobs/:jobId`,
`/imports/batches` and `/stocks`. Import administration requires a validated active
Admin and is family-scoped. Stock lookup is available to active Members and Admins,
consistent with the authoritative API Design; it exposes shared reference metadata,
not indicator results or another family's import history.

Preview multipart fields retain `file`, `stockSymbol`, `mapping` and `adjustmentBasis`.
The explicit current request requires mapping JSON, source JSON (`provider`, `reference`,
`adjustmentVersion`), `dateMode`, requestedRange JSON, minimumHistorySessions and
expectedCompletedSession JSON (ISO session string or null). Optional series defaults
to EQ and mode to INITIAL. No date/header/source guessing. Client role, family, actor,
stock IDs and provenance-verification claims are rejected. A missing stock yields an
explicit reference-unavailable error without inventing an ID or creating a record.

Preview responds with the existing token/symbol/fileFormat/dateRange/rows/missingSessions/
blockingErrors/warnings/expiresAt fields. Add normalization counts, completeness,
correction metadata, diagnostic totals/truncation and committable. No normalized price
payload, staging ID or hashes are returned. The approved opaque preview token is an
import capability scoped to the authenticated actor/family; it is not an auth session.
Commit additionally accepts an optional correctionReason, required for changed history.
Its mandatory Idempotency-Key is a UUID. Read APIs use bounded ID cursors, max 100 rows,
explicit response allowlists and no-store headers. Errors use `{error}`; health retains
its existing scaffold envelope. No retry/cancel/job-execution endpoint is implemented.

## Reference approval and provenance

`MARKET_REFERENCE_APPROVALS` is optional, server-only, bounded JSON supplied by an
operator after independently reviewing real source/reference data. Default empty lists
provide no approval authority. It pins stock IDs to exact stock-master fingerprints,
calendar source/version/coverage to exact calendar-record fingerprints, and acceptable
price provider/reference/basis/adjustment-version tuples. It is not accepted from HTTP.
Invalid policy disables market operations without disabling Login/health. No approval,
stock, calendar, holiday or historical price is synthesized or downloaded automatically.

Fingerprint input is canonical sorted-key JSON. Stock reference fingerprints cover
identity, company name, status and membership intervals, excluding mutable publication
state. Calendar fingerprints cover ordered, explicitly sourced open AND closed days.
Exactly one approved coverage interval must cover the requested range; ambiguous or
missing coverage blocks confirmation. The existing parser verifies calendar completeness
and genuine dates. The operator must establish real-world correctness; these shape/hash
checks do not themselves establish real NSE accuracy or licensed data provenance.

Price-source approval authorizes a declared source policy, not the authenticity of a
particular upload. Uploaded provenance remains DECLARED, even when the policy permits
ingestion. Clients cannot manufacture VERIFIED provenance. Unknown basis and unsupported
BOTH single-series inputs remain blocked. Existing basis/adjustment-version conflicts
are blocked pending separately reviewed reconciliation; a correction reason is not a
bypass. No corporate-action adjustment or missing-price substitution is implemented.

## Staging and compatibility

Use the existing manifest/chunk collection and 3 MiB/5,000-row/32-column parser bounds.
Multipart is read in memory after auth/Origin/CSRF; one file, bounded fields/parts/total
bytes, two concurrent readers and a 20-second upload deadline. The parser retains its
independent worker/decompression/time/memory limits. Busboy 1.6.0 (one streamsearch
dependency) and development-only @types/busboy 1.5.5 are pinned after checking registry
engines/dependencies/scripts and [upstream limits](https://github.com/mscdex/busboy).
No file is written to disk and no parser dependency is upgraded.

Add optional `preview.context` metadata containing the resolved stock identity, policy
and reference-data fingerprints, date mode and history/as-of settings. Optionality keeps
Phase 8B model contracts readable; the new confirmation API requires this context.
These fields are immutable with the preview snapshot. Preparation recognizes exactly
the prior Phase 8B validators without this optional context and offers a dry-run report.
Only explicit operator `--apply` can install the additive validator; arbitrary/custom
validator drift still fails closed. No HTTP request creates collections/indexes or
changes validators. Authentication/index readiness remains independent.

`rows.read` counts observations after identical-duplicate collapse so existing
valid+rejected and new+changed+unchanged invariants remain true. `normalization.original`
preserves the original source-row count and separate duplicate counts. Unknown-basis
observations cannot become stored normalized price rows. Diagnostics contain static
messages and bounded samples; persisted legacy quality counts retain their existing
bounds while response totals retain actual parser diagnostic totals. Error bodies and
request logging expose no file contents, capabilities, cookies or credentials.

## Atomic confirmation and no execution

Preview staging rechecks the reference snapshot and dataset revision in its transaction.
Commit validates current active Admin/family, scoped token hash, logical expiry, immutable
quality/readiness, current approvals/reference hashes, stock identity and dataset
revision. It validates every chunk, ordinal, scope, hash, count, provenance and session
ordering/range. Missing or inconsistent chunks fail closed.

A single transaction creates the immutable batch and QUEUED job, then attaches the
manifest and all chunks and removes every top-level TTL deadline. Metadata's original
expiry remains audit information, not an active TTL field. Any failure rolls back all
changes, including a metadata-only Stock.__v compare-and-swap fence. This fence changes
no publication field or dataset revision. The existing global partial unique active-job
index arbitrates imports across families; the actor/idempotency-key unique index
arbitrates retries. No index is dropped or weakened.

An identical successful idempotent request returns its existing batch/job, including
after original preview expiry, because it performs no new confirmation. Different
payload/reason with the same key returns 409. Different keys cannot consume one preview
twice. Another Admin cannot consume the preview, even in the same family; same-family
Admins can read authorized job/batch history. Cross-family reads return 404 or an empty
scoped list without revealing other-family job IDs. Global stock-busy errors expose
no other family's identity or history.

The response is truthful QUEUED acceptance with executionAvailable=false and price-only
scope. **Queued imports cannot execute in Phase 8D-1.** No daily price, price revision,
dataset generation/publication, indicator, live trigger or notification is written.
Active queued jobs retain their payload and exclude further imports for that stock.
There is no automatic expiration, cancellation or cleanup of active jobs in this phase.

## Verification and remaining work

Tests use owned disposable replica sets, synthetic reference fingerprints and mocked
email only. Compiled browser fixtures prepare synthetic references at test startup,
never from a production HTTP route and never in Atlas. The existing nullable metadata
integer adapter was corrected to permit diagnostic row=null while retaining integer
and range checks; the new preview diagnostics exposed that compatibility defect.

Phase 8D-2 must implement reviewed transactional price/revision processing, job claims/
leases/checkpoints, recovery, publication reservation/finalization and operational cleanup.
It must recheck reference/approval validity before execution and preserve real trades.
Actual source samples, verified stock/calendar data, adjustment provenance, retention
and hosting behavior remain unverified. No real reference seeding, cloud operation,
deployment or email is performed for this milestone.

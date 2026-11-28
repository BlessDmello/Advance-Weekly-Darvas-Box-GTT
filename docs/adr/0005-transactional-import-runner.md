# ADR 0005: Bounded transactional price-import execution

- Status: Implemented for Phase 8D-2B; operational verification recorded in project_status.md
- Date: 28 November 2026 (Asia/Kolkata)
- Extends ADRs 0002–0004; the four approved specifications remain unchanged.

## Lifecycle and authority

Confirmation durably queues a job. An explicitly enabled, in-process coordinator
executes VALIDATING → UPSERTING → CHECKING_QUALITY → READY_TO_PUBLISH → COMPLETED.
It reuses the generation planner, full confirmed-payload/hash validation, approved
stock/calendar/source snapshots, exact Decimal128 conversion and publication CAS.
It neither computes indicators nor touches private trading collections.

Worker identity, lease version, database-clock lease validity, immutable job scope
and an expected phase/count/generation checkpoint fence each price transaction.
Claims use optimistic transaction conflicts and increment the fencing version.
An expired RUNNING job explicitly transitions through RETRY before takeover.
Only the original active Admin and active family authorize price processing;
release/failure bookkeeping can safely stop a worker after that authority is revoked.

Every chunk inserts at most 100 complete-generation output rows and their correction
audits, then advances counters and the build checkpoint in the same transaction.
Audited native inserts are internal database adapters, use strict native validators,
and never bypass validation. Existing rows must match the deterministic candidate
prefix. Duplicate-checkpoint replay fails before any insertion. All MongoDB calls
within transactions are sequential. Published generations remain immutable.

Final validation reads the complete candidate, verifies counts, exact contents,
audit identities, calendar continuity, provenance and capacity, then atomically
completes the job and changes the published pointer. Previous generations remain
readable until that commit. No-op imports advance input counters but allocate no
generation. Failed candidates retain their never-reusable revision allocation and
never replace the published pointer. No automatic pruning exists.

Valid stale, short-history and raw-only histories retain explicit quality warnings.
Completion always leaves derivedStatus DEFERRED and screeningEligible false.

## Transactions, uncertainty and recovery

The Core transaction API bounds whole-transaction retries to three and commit
retries to three, within a cooperative ten-second budget and five-second commit
limit. Unknown commit results retry only commit on the same session, never rerun
the callback. After unresolved errors the worker rereads durable job state before
deciding whether to continue, pause or fail. A changed checkpoint is resumed;
ownership loss stops writes. Unavailable reads leave recovery to lease expiry.
No external effects occur inside transaction callbacks.

These are cooperative budgets, not hard socket or process deadlines. A slow driver
call can overrun a slice. Operation timeouts and the renewable lease provide bounded
normal operation; database/process failure may instead require lease takeover.
The driver convenience API's deprecated timeoutMS is not used as a deadline.
See [MongoDB Core transaction guidance](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/transaction-core/).

Integrity/reference/quality failures are terminal and release the reservation.
Unexpected infrastructure failures preserve checkpoints and attached staging,
with persisted exponential retry delay (one to thirty seconds) and at most five
automatic recoveries by default. Manual retry receipts are bounded to 100; total
claims are bounded to 100. An exhausted unowned/expired job is atomically fenced,
failed and its reservation released; a live last claim is never interrupted by
cleanup. This terminal maintenance writes no prices. Startup recovery or explicit
operator `--apply` can perform it. Repeatedly broken jobs require operator review
and a new preview rather than unlimited retries. Recovery never rewinds checkpoints.

The coordinator runs one slice at a time, holds at most 100 tracked jobs, and uses
round-robin continuation. Healthy slice yields release leases with durable
checkpoints and do not spend the failure-recovery budget; the next claim receives
a new fencing version. Overflow jobs remain durably queued for explicit recovery.
Shutdown stops admission, waits for the current atomic operation and pauses an owned
job when possible. Abrupt termination relies on lease expiry. Multiple backend
processes are safe through database fencing, not shared in-memory identity flags.

Completed jobs retire all matching staging records transactionally, setting a
seven-day cleanup deadline only after durable completion. Interrupted retirement
can be repeated through explicit recovery or enabled startup scanning. RETRY/active
payloads never receive TTL deadlines. Price generations and audits are never deleted.

## Configuration and operator control

Execution and startup recovery are separately opt-in. No default startup connects
to MongoDB for runner work. IMPORT_RUNNER_ENABLED=true permits new confirmations
and explicit retries to be scheduled; IMPORT_RUNNER_RESUME_ON_STARTUP=true also
admits existing jobs discovered by a bounded scan. No reference data is seeded.

Defaults: IMPORT_RUNNER_CHUNK_ROWS=100 (1–100), IMPORT_RUNNER_LEASE_MS=60000
(30000–300000), IMPORT_RUNNER_SLICE_MS=20000 (100–20000),
IMPORT_RUNNER_MAX_RECOVERIES=5 (0–10). Invalid configuration disables execution
without breaking independent authentication/health. Capacity is unchanged from ADR
0004; full bounded plans are rebuilt per chunk, trading CPU/read cost for integrity.

Optional job execution metadata is additive. Existing Phase 8D-2A job validators
need explicit operator preparation: inspect `pnpm market-data:prepare`, review,
then separately invoke `--apply`. Runtime readiness remains read-only. Neither
this preparation nor the generation migration is run against Atlas during testing.

`pnpm imports:resume --job <jobId>` reads status only. `--apply` authorizes one
bounded slice, verifies the stored original Admin and pauses unfinished work for
manual continuation. It refuses production and other database targets. It owns and
closes its connection; output contains counts/status only.

## Additive HTTP contract

POST /api/v1/imports/jobs/:jobId/retry requires an active Admin in the job's family,
exact Origin, valid session-bound CSRF, UUID Idempotency-Key and the existing family
import mutation quota. Body: `{ "reason": "Reviewed interruption" }`.
202 returns `{ "data": { "jobId": "…", "resumeRequested": true } }`.
The hash-only key receipt is scoped to actor and job; duplicates with identical
content return the original acknowledgement, conflicting content returns 409.
Live owned jobs and terminal jobs cannot be reopened. Cross-family IDs return 404.
Disabled execution returns 503; membership denial returns 403.

Job/history DTOs add final quality and recovery information, while executionAvailable
reflects configured execution capability. They never return staged rows, hashes,
worker identity, lease capabilities, retry reasons or raw driver diagnostics.
The public status mapping and existing preview/confirmation fields remain intact.

## Operational limitations

No market UI, stock-price API, scheduler, distributed rate limiter, outbox, automatic
storage preparation or pruning is added. Recovery requires retained payloads and
unchanged approved references. Terminal integrity failures require a fresh preview.
Polling is process-local and only covers admitted jobs; bounded startup scanning is
an explicit operator choice. This is a development-verified import foundation,
not a production-readiness claim or verified NSE/provider compatibility.

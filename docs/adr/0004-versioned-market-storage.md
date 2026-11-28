# ADR 0004 — Versioned market storage and publication foundations

- Status: accepted for Phase 8D-2A only.
- Date: 28 November 2026 (Asia/Kolkata).
- Authority: explicit user approval of generation storage and warning-bearing price
  publication, followed by the narrower Phase 8D-2A implementation request.
- Baseline: ADRs 0002/0003 and the four approved specifications, which remain unchanged.

## Scope and approved amendments

Keep the existing seven collections. `dailyPrices` gains required `datasetRevision`;
physical uniqueness is `(stockId, datasetRevision, sessionDate)`. Logical stock/session
uniqueness holds within the generation selected by the published pointer. This explicitly
supersedes ADR 0002's single mutable current-price row and unavailable old-generation
behavior. A publication flag on mutable rows would not provide snapshot consistency.

`priceRevisions` gains datasetRevision in its unique identity alongside stock/session/
newRevision. Candidate audits describe proposed corrections; joining their generation
to completed publication lineage distinguishes them from published corrections.
Audit records are append-only and remain retained when a candidate is abandoned.
Logical row revisions advance only for changed observations within that lineage.

`stocks.publication.revision` is a monotonic allocator/high-water mark, not the reader
selector. `publishedRevision` is the sole current generation pointer. A failed candidate
can leave gaps in allocated numbers. Settled PUBLISHED permits publishedRevision below
the allocator; settled UNAVAILABLE permits a positive allocator with no published data.
No API accepts a caller-selected generation as proof of publication.

Jobs gain nullable generation metadata: base published revision, candidate revision,
bounded build checkpoint and final quality assessment. Existing queued jobs have null
metadata until a future explicitly authorized execution step reserves a generation.
This phase creates no runner, claim, retry endpoint, resume command, scheduler,
checkpoint executor or price-writing orchestration. No startup/HTTP code invokes
reservation, assessment, publication, abandonment or migration.

## Complete candidates and immutable publication

The pure bounded candidate planner merges the entire published generation with the
confirmed uploaded interval. Sessions outside that interval are preserved exactly.
Identical numeric values retain original provenance and row revision; they do not
manufacture source verification. Corrections require the confirmed reason and produce
immutable before/after audits. Unknown or conflicting adjustment basis/version fails.
Raw and adjusted counterparts are never synthesized. Prices remain exact decimal text
and Decimal128; no financial value is converted through Number or rounded.

Application repositories have no published-row update/delete operation. Document saves
reject replacement of existing prices, and new price inserts require a transactional
matching running candidate reservation. Query/bulk guards remain enabled. Privileged
raw-driver access is still an operator capability, not a security boundary. A future
writer must additionally couple the lease fence, price/audit writes and checkpoint in
one audited transaction; this milestone deliberately supplies no chunk executor.

Every published reader resolves the stock pointer and reads exactly that generation in
one primary, snapshot-read/majority-write-concern transaction. The optional session
entry point is for the same internally owned transaction. The reader checks bounds,
the complete content hash and as-of session. Missing/inconsistent published rows fail
closed; no fallback to a candidate, highest revision or fabricated empty result exists.
The old published generation remains readable while a candidate is incomplete or fails.

Reservation consumes the next allocator number under a matching existing RUNNING job.
No claim is created. Fenced primitives conditionally write the job using server-side
lease expiry, owner, fencing version, family and uploader; the write serializes stale
workers and concurrent publication. Active Admin/Family status is rechecked. Stock
optimistic versions protect reservation/publication changes.

Assessment reconstructs the expected complete candidate from immutable batch/staging,
verifies every chunk/hash/binding, confirms current operator approvals and references,
and checks actual candidate rows, audit identities, counters and durable build metadata.
An untrusted caller cannot certify a candidate merely by supplying a quality flag/hash.
Final publication repeats those checks and atomically completes the matching ready job
and swaps the stock pointer. Late failures roll back both. There is no externally
visible completed job without its publication transaction.

Abandonment marks the matching job FAILED and releases its reservation while retaining
the allocator, old pointer, candidate records and audits. It never deletes data or
reopens terminal jobs. Identical reimports can complete through the same assessment
path with a null candidate revision, no allocator increase and no new price generation.

## Quality and screening boundary

Publication requires valid, complete rows over the merged required interval and
independently approved calendar coverage including explicitly sourced closed dates.
Missing sessions, incomplete reference coverage, stale approvals, invalid/future bars,
corrupt payloads, basis conflicts and missing audit/build records block publication.
No prices or market sessions are invented.

Valid raw-only, short-history and stale datasets may publish with RAW_ONLY,
SHORT_HISTORY and STALE_DATA warnings. DECLARED_SOURCE remains distinguishable from
verification. If approved calendar coverage cannot establish the current completed
session, freshness is UNKNOWN with UNKNOWN_FRESHNESS, rather than falsely fresh.
The current expected session is derived from approved open/close records and India
time, not the client preview's freshness assertion or the upload timestamp.

All publication assessments/read DTOs explicitly keep screeningEligible=false, and
derivedStatus stays DEFERRED. No DMA/CAR/Darvas or screening calculation is performed.
History length is measured against the confirmed requested minimum; the first supplied
bar is not proof of listing date. Verified listing metadata and future indicator
readiness remain separate work.

## Capacity and retention

Explicit price-generation bounds: 20,000 rows, 32 MiB of BSON including ordinary
document metadata, and 16 KiB per row. Uploaded payloads retain their 5,000-row bound.
Per-stock retained price plus revision storage is limited to 128 MiB at reservation
and publication. Diagnostics report actual BSON usage via read-only aggregation.
These are application bounds, not a claim that Atlas free-tier capacity is sufficient.
Global/index/backup overhead still needs operational measurement before deployment.

There is no automatic generation pruning or TTL on prices/audits. Published,
audit-referenced and abandoned generations are not deleted by this phase. Staging
retirement/runner recovery remains deferred; attached payloads retain their no-TTL
protection, including after these explicit foundation primitives complete a job.

## Offline migration and rollback preparation

`pnpm market-data:migrate-generations` owns its connection through the existing API
environment-file convention. It defaults to read-only dry-run and refuses production.
Apply additionally requires --apply --offline-confirmed --backup-confirmed. These are
operator attestations: the tool does not create a backup or certify an untested restore.
Keep all market writers and other migration operators offline throughout the operation.
The command was not invoked against Atlas for development or tests.

Only exact known pre-generation, current or transitional validators/indexes are
accepted. Unexpected validators, constraint drift, orphan prices, active execution,
ambiguous/incomplete legacy datasets and legacy audits without generation lineage
are refused before mutation. Older Phase 8B context migration must be prepared
explicitly before this generation migration. No stock/calendar seeding occurs.

For a coherent legacy PUBLISHED stock, tag its existing rows with that published
revision, preserve its allocator, compute the new complete-generation content hash,
and initialize null job metadata. This preserves operator-declared legacy publication;
it does not independently verify legacy provenance or grant screening eligibility.
Unknown legacy correction lineage is never guessed: the tool refuses such audits.

Recognizable transitional validators permit forward resumption after interrupted DDL.
New generation indexes are installed before old stock/session constraints are removed.
Backfill is bounded per stock, with small queued-job metadata batches. Only known
superseded indexes are dropped, at the end; unrelated indexes are preserved. Current
validation/readiness is verified before market writers can restart. Ordinary storage
preparation/HTTP requests never perform this index replacement or a legacy backfill.

Restore the separately verified pre-migration backup only while market writes remain
offline and before new generation writes occur. After generation use, recovery must
be forward-only with retained lineage; blindly dropping datasetRevision or restoring
old uniqueness would destroy information. No automatic rollback or deletion is offered.

## Verification and remaining boundaries

Use disposable MongoDB replica sets, synthetic references and mocked email. Verify
generation uniqueness/isolation, old-data visibility, partial-range preservation,
fenced atomic publication/rollback, immutable published records, no-op completion,
quality warnings, capacity limits, migration refusal/resumption and existing imports.

Execution leases, chunk checkpoints/writes, retries, scheduler recovery, staged-payload
retirement and operational pruning require a separately approved runner milestone.
No Atlas access, production operation, real email, commit, push or deployment is part
of Phase 8D-2A. Local tests establish neither real NSE accuracy nor production readiness.

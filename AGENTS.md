# Advanced Darvas Box — Agent Guide

This file applies to the entire repository. Keep it aligned with the implementation
when project boundaries, commands, or workflows change. Record durable instructions
here; keep installation details in `README.md`, requirements in the four approved
specifications, and current implementation status in `docs/project_status.md`.

## Required project-status maintenance

- Read `docs/project_status.md` at the start of project work alongside this guide.
- After every project update, update `docs/project_status.md` in the same task,
  before the completion report. This includes code, UI, tests, dependencies,
  configuration, documentation, and project decisions that change the recorded state.
- Update the last-updated date using `Asia/Kolkata`, completed/current milestone,
  pending work, material decisions or blockers, and a concise recent-progress entry.
  Record Git/delivery outcomes when those actions are part of the authorized task.
- Record only checks actually run, with their outcomes and date. Preserve older
  application results as explicitly dated evidence; do not imply they reran after
  a documentation-only update. State failures, skipped checks, and limitations.
- Keep current state separate from planned work and recommendations. Remove stale
  pending items as they are completed; do not mark a feature complete prematurely.
- Do not add secrets, private financial records, or machine-specific credentials.
  Read-only inspections without project changes do not need a new progress entry.
- This maintenance rule authorizes updating the status record, not rewriting the
  four approved specifications, implementing another milestone, committing, or pushing.
- Keep the canonical filename `docs/project_status.md`; do not create a duplicate
  `projecta_status.md`. It is a living status document, not a requirements baseline.

## Project and current scope

Advanced Darvas Box is a private, invite-only NSE stock-screening and manual
swing-trading management application. It is a pnpm modular monolith.

Phase 1 scaffolding, the public landing page at `/`, and the login UI at `/login`
are implemented. Public pages share the brand, palette, theme provider, local
Geist/Inter fonts, and static chart illustration. Express provides a health API;
shared packages, tests, and CI are established. Identity models and a development-only
first-Admin CLI exist. Real email/password login, MongoDB sessions, logout, CSRF
and a protected `/dashboard` UI with unavailable business data are connected. Central active-account,
Admin and private-ownership guards exist. Family invitations, Member registration,
verification, revocation and fresh-token resend are implemented; actual business-resource
APIs remain deferred. Do not describe this release
as production-ready or the workspace shell as a completed trading dashboard.

The authenticated application shell lives in `apps/web/app/(private)/layout.tsx`
and `apps/web/components/shell`. It wraps Dashboard, invitation and import administration;
public Landing, Login and invitation acceptance retain their own layouts. Reuse the
existing brand, public palette/fonts, theme controls and LogoutButton. Sidebar collapse
is state for the mounted shell only; do not persist sidebar state or identity/role
flags. Preserve the existing theme preference behavior.
Dashboard, Family Management and Admin Market Data Import have implemented navigation destinations.
Future entries are disabled with Coming soon labels and no href; Administration is
omitted for Members. Keep the canonical navigation definition in `shell/navigation.ts`.
Use the selected Stitch Main Trading Dashboard references `13580afd125a432a8f2d8eef02d5aee4`
and `852fdff541564acfb5545e28a77ebe2f` for shell structure, with the approved navigation
groups and Alerts mobile tab. Do not copy sample financial values, hardcoded identities,
portfolio switching, market-status badges, prototype controls or engine claims.

The Main Dashboard UI lives in `components/dashboard/main-dashboard.tsx`, rendered
by the guarded `/dashboard` Server Component inside the existing shell. Its six
metrics and portfolio, eligible-stock, target, activity and freshness panels use
explicit unavailable states until business APIs exist. Use `—`, Not connected and
Unknown; missing integration is not evidence of zero holdings or no eligible stocks.
Do not add illustrative financial values, performance curves, fake events or refresh
timestamps. Preserve both layout- and page-level session guards. Future financial
data must remain owner-scoped, including for Admins; signals and manually recorded
transactions must remain distinct. No business API or calculation is implemented
by this UI milestone. Reuse the existing shell and avoid nested main elements.

The public landing and login pages may show fixed mock stock values only inside an explicitly
labeled "Illustrative Preview — Not Live Market Data" illustration. These values are
presentation examples, never golden-test inputs, current prices, performance claims,
or computed signals. The landing page must not fetch API or market data. Login may
call only the same-origin authentication endpoints; previews never fetch data. Landing Sign In
actions navigate to `/login`.

Approved landing references are in Stitch project `7871198770128109512`: desktop
screen `c5c59502d9bd43d9a11e909aad659beb` and mobile screen
`56d4657467e44785920baf4d357e8eb9`. Use the mobile supporting copy on all breakpoints;
preserve the shared headline. Do not copy live-data badges, execution guarantees,
institutional claims, or unsupported performance statistics from the design export.

Login references in the same Stitch project: desktop screen
`5de95a5aee7742ecbfd81148778d0b36` and mobile screen
`475f8dea45524831a58d501e04ca0133`. Preserve the split desktop/single-column mobile
layout while matching the landing page's exact shared palette, brand, and fonts.
The references only supply dark variants; light mode uses the existing public palette.
Do not copy design-review controls, prefilled credentials, fake authentication or
recovery confirmations, live-feed badges, fabricated session IDs, or security claims.

The login form performs local required/email-format validation and submits through
the same-origin auth API with CSRF protection. It confirms `/auth/me` before
navigation to `/dashboard`, clears attempted passwords, preserves email on failure,
and shows loading only during real requests. Never persist passwords or place tokens
in localStorage/sessionStorage; session tokens belong only in HttpOnly cookies.
Keep native form controls disabled until hydration
so credentials cannot submit through a fallback browser navigation. Forgot Password
is disabled with a visible Coming soon explanation; no reset or public signup route exists.
The dynamic `/login` Server Component verifies existing sessions through `/auth/me`
and redirects authenticated visitors to `/dashboard` before rendering the form,
including without JavaScript. Cookie presence alone must not trigger a redirect.
Invalid/revoked sessions or unavailable validation leave the public form accessible.

Implement only the user's requested milestone. Business-resource APIs,
screening, DMA/CAR/Darvas calculations, portfolio accounting, trading
notification delivery, scheduled jobs, and cloud deployment remain deferred until requested.
Existing scaffold and landing-page maintenance do not require reapproving Phase 1.

Phase 8B adds market-data contracts and the seven market/import model definitions;
Phase 8C adds bounded, backend-only CSV/XLSX parsing and validation. Phase 8D-1 adds
Admin preview/confirmation, family-scoped job/batch reads and active-member stock
lookup. Phase 8D-2B adds bounded transactional price execution and explicit recovery;
Phase 8E adds the Admin import UI; reference seeding remains deferred. See
`docs/adr/0002-market-data-import-foundation.md` for additive storage decisions.
`createMarketModels` only registers models. `verifyMarketStorage` is read-only;
`prepareMarketStorage` is explicit and dry-run by default. The development-only
`pnpm market-data:prepare` command owns its connection and needs `--apply` for DDL.
Never invoke it against Atlas as part of automated tests or ordinary app startup.
Do not couple market readiness to Login/health or seed real reference data implicitly.
Prices use exact Decimal128/string contracts; never cast JS Number prices or round
imports. Staging ATTACHED records have no TTL deadline, and release requires a
matching terminal job in a transaction. Dataset publication changes require the
matching job and transaction. Model query/bulk mutations are intentionally blocked;
future persistence work must supply explicitly audited transaction adapters before writes.
Price-import completion always leaves derived processing DEFERRED. Public state
labels and schema fields are not proof of an implemented import/calculation service.

Phase 8D-1 routes use the same verified session/active/Admin middleware and CSRF
context as authentication/invitations. Keep multipart reading after authorization,
Origin and CSRF checks. `marketRepository()` reuses the existing owned connection
with a separate read-only market-readiness check; Login/health never prepare market
storage. See `docs/adr/0003-import-preview-and-confirmation.md` for additive fields.
`MARKET_REFERENCE_APPROVALS` is bounded, server-only operator configuration. Empty,
missing or mismatched real reference approvals must never become verified data.
Clients cannot set actor/family/role or provenance verification. Approved source
policy does not authenticate uploaded prices; uploaded provenance stays DECLARED.
Keep preview capabilities hashed in storage and scoped to actor/family. Confirmation
verifies every durable chunk, rechecks approvals/revision, and creates the batch/job
and removes all staging TTL deadlines in one transaction. Only a technical Stock.__v
fence changes; publication fields and dataset revisions remain untouched in 8D-1.
Queued imports retain attached payloads until successful completion. No HTTP route may
seed references or create indexes/validators. Explicit preparation recognizes only
the known additive preview-context and execution-metadata validator upgrades; arbitrary drift fails
closed. The E2E import reference helper is disposable startup-only test code, excluded
from production, and must never be used to populate Atlas or manual development data.

Phase 8D-2A adds versioned storage/publication foundations only. See ADR 0004.
Daily prices are unique on stockId/datasetRevision/sessionDate; correction audit
identity also includes datasetRevision. Stock publication.revision is a monotonic
allocator; publishedRevision is the reader pointer and may be lower after failures.
Always use readPublishedPrices for published data: it resolves the pointer and rows
in a single snapshot, checks complete content integrity and never falls back to
candidates. Candidate planning preserves unaffected history. Published generations
are immutable and never pruned automatically. Price publication remains explicitly
ineligible for screening, including stale/raw/short-history data with warnings.
Generation repository primitives require a live lease/fence and verified confirmed
payload. Phase 8D-2B uses createImportRunnerRepository for claims, checkpoint-fenced
100-row maximum transactional chunks/audits, final publication and completed-payload
retirement. See ADR 0005. Reuse the connection owner; runtime readiness remains
read-only. IMPORT_RUNNER_ENABLED defaults false; IMPORT_RUNNER_RESUME_ON_STARTUP is separately
opt-in. Never execute queued development jobs as part of tests or ordinary startup.
Automatic recovery is bounded and persisted; explicit Admin retry is family-scoped,
CSRF-protected and UUID-idempotent. Unknown commit outcomes require durable reads
before further writes. Keep operations sequential in transactions, preserve exact
decimals, and never mutate published prices/private trading data. RETRY payloads
have no TTL. Only successful completion permits seven-day staging retirement.
Use `pnpm imports:resume --job <jobId>` for inspection; mutation requires --apply
and runs one bounded development-only slice. Do not run it against Atlas during
automated tests. Scheduler, pruning and strategy execution stay deferred.
The offline market-data:migrate-generations command is dry-run-first and development
only; --apply additionally needs --offline-confirmed and --backup-confirmed. These
attestations do not create or verify a backup. Only this explicit migration may
replace the recognized old price uniqueness indexes; ordinary preparation must
refuse legacy generation storage and unrelated drift. Never invoke it against Atlas
as part of testing. Ambiguous legacy publication or audit lineage must fail closed.

Phase 8E routes `/admin/imports` and `/admin/imports/jobs/[jobId]` use page-level
requireAdminUser guards in addition to the private layout and backend guards. Reuse
the same-origin typed import client and existing CSRF flow. Stocks are selectable
only when ACTIVE and referenceApproved; label them Approved NSE stocks, never a
verified Nifty 100 list. Canonical mappings are editable defaults, not detection.
The default 200-session history-warning threshold is editable and independent of
DMA/screening readiness. Expected completed session stays null unless explicitly set.
Keep preview capabilities, files and action UUIDs in memory, never URLs or storage.
Every logical confirmation/retry retains its UUID and payload after uncertain
responses. Preview-input changes invalidate the preview/key. Lock uncertain action
inputs and offer same-action recovery plus history/status checks; do not silently
resubmit with a new key. Serialized polling pauses on hidden pages, unavailable
execution, terminal states, denied access and unmount. Disabled execution means
awaiting operator-controlled execution, not automatic processing. Only backend
recovery eligibility permits retry. Completion is price-only with indicators deferred;
candidate counters do not establish publication. Never expose worker/hash/log fields
or add runner enablement, operator commands, price parsing or reference seeding to UI.
Synthetic CSV/XLSX and stock/calendar fixtures remain disposable test-only data.

Use `apps/api/src/modules/imports/parsing/parser.ts` for bounded parser execution;
see the module `README.md` for source profiles, limits and dependency decisions.
Reuse shared decimal/date/OHLC validators. Never convert financial cell text through
Number/parseFloat, infer adjustment basis from Adjusted Close, or evaluate formulas.
Unknown basis and absent/unverified calendar coverage block confirmation. Resolve the
selected stock and calendar snapshot from trusted reference sources in API
integration; uploaded values cannot certify their own master/calendar provenance.
The result's eligibility is parser readiness, not authorization or an import commit.
Tests use synthetic stock/session fixtures only; they establish no real NSE calendar
or provider compatibility. No parser stage may connect to MongoDB, load app `.env`,
write files/records, call external URLs or seed reference data. Keep worker admission,
memory, decompression and hard deadline safeguards when adding future preview APIs.

## Requirements baseline

Read the relevant approved specifications before changing domain behavior:

- `docs/PRD_v1_2.md`: requirements, strategy decisions, approved eligibility amendment.
- `docs/SYSTEM_DESIGN_v1_1.md`: architecture, trust boundaries, module separation.
- `docs/DATABASE_DESIGN_v1_0.md`: persistence, tenancy, revisions, and concurrency.
- `docs/API_DESIGN_v1_0.md`: canonical `/api/v1` routes and HTTP contracts.

Preserve these documents unless the user explicitly requests a specification edit.
Do not rewrite or reformat them while editing application code. They are excluded
from Prettier. Treat them as the user-approved baseline despite historical status
labels within some documents. Explicit user instructions and approved amendments
take precedence over superseded passages.

Known issues to resolve before the corresponding feature work:

- The collection inventory lists 26 collections while its introduction says 25.
- Earlier PRD passages mention partial exits and cash constraints; later designs
  specify full-position exits and no shared-cash solvency checks.
- CAR anchor ties, adjustment provenance, monetary rounding/tick-size policy, and
  exceptional sale reconciliation require verified decisions or source fixtures.
- Referenced LLD, ERD image, and historical source workbooks/CSV are not supplied.

Raise a contradiction when it materially affects the requested implementation.
Do not invent a trading rule or block unrelated scaffold maintenance over it.

## Architecture and dependency boundaries

| Path                     | Responsibility                                                                |
| ------------------------ | ----------------------------------------------------------------------------- |
| `apps/web`               | Next.js App Router, React, Tailwind, application-owned shadcn/ui components   |
| `apps/api`               | Express REST API, configuration, middleware, application composition          |
| `packages/contracts`     | Browser-safe Zod schemas, JSON DTOs, inferred TypeScript types                |
| `packages/strategy-core` | Framework-independent, deterministic strategy calculations when authorized    |
| `packages/database`      | Explicit lifecycle, identity/market models, storage preparation and bootstrap |
| `packages/test-fixtures` | Development-only verified golden data and provenance                          |
| `tests/e2e`              | Playwright browser smoke tests                                                |

- Web may consume contracts; never import API, Mongoose, database, or fixture code
  into the frontend. Keep secrets out of client bundles.
- API routes call application services; services use repository interfaces and
  pure strategy functions. Future modules belong in `apps/api/src/modules`.
- Strategy-core must not access HTTP, MongoDB, React, Express, or process environment.
- Test fixtures are development-only. Do not fabricate historical golden results
  or commit private portfolio records or unapproved source workbooks.
- Shared packages use `workspace:*`, ESM, explicit `dist` exports, and declarations.
  Do not bypass package exports with sibling-source aliases or deep imports.
- Keep strict TypeScript. Libraries/API use NodeNext; web uses bundler resolution.
  Use `.js` extensions for relative runtime imports in emitted NodeNext packages.
- Retain the modular monolith. No Docker, Redis, Kafka, microservices, or additional
  infrastructure without a specific requirement.

## Domain invariants for future work

These are design constraints, not permission to implement deferred features:

- New-entry eligibility requires valid/fresh data AND Bull Run AND CAR Buy/Average
  Out. Legacy 52-week suitability is an independent optional filter.
- Weekly candidates use the prior completed NSE trading week's high. The ignore
  band around the last accepted trigger is inclusive at both ±2.75% boundaries.
- A qualifying trigger touch is a signal, not an executed trade. Accepted reference
  advances on the signal and persists across completed position sequences.
- Purchases and sales are manually confirmed. No broker execution, compulsory
  stop-loss, forced bearish exit, or assumed fill may be introduced.
- The approved position target is 6% above weighted average executed purchase price.
  One-third of positive net realized capital gain grows the per-stock/per-portfolio
  target once a successful sequence is fully closed.
- Historical replay and source corrections must not silently change real trades
  or live portfolio trigger references.
- Preserve ownership boundaries between shared market data and private portfolios.
- Money crosses HTTP boundaries as decimal strings. Use exact arithmetic for
  financial calculations; do not use binary floating point at rule boundaries.
- NSE session dates are `YYYY-MM-DD` in `Asia/Kolkata`; timestamps are separate UTC
  values. Missing/stale inputs must not become fabricated actionable signals.

## Toolchain and local development

Use the versions pinned in `.node-version`, `package.json`, workspace manifests,
and `pnpm-lock.yaml`. Check those files rather than assuming a global tool version.

- Node.js: 26.13.1 LTS; root engines restrict the supported major to 26.
- pnpm: 12.23.0. Use pnpm only; do not introduce npm/yarn lockfiles.
- TypeScript 6.0.3 and ESLint 9.39.5 are intentional compatibility pins. Recheck
  typescript-eslint and Next's lint-plugin peers before upgrading their majors.
- Do not change the machine's global Node/pnpm installation without authorization.
  An ignored `.tools/` directory may contain checkout-local tools, but fresh clones
  must work using the prerequisites documented in `README.md`.
- Use Windows/PowerShell-compatible commands and cross-platform package scripts.
  Do not assume Bash, WSL, or Unix-only environment assignments.
- For Next.js changes, consult relevant version-matched documentation under
  `apps/web/node_modules/next/dist/docs/` when APIs or behavior are uncertain.
  Keep `agentRules: false` in Next configuration so this root guide remains owned
  by the project rather than regenerated by the development server.

Run from the repository root:

| Command                                | Purpose                                                               |
| -------------------------------------- | --------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | Install the existing dependency graph reproducibly                    |
| `pnpm dev`                             | Build shared packages, then watch packages and run both apps          |
| `pnpm dev:web` / `pnpm dev:api`        | Build packages and start one application                              |
| `pnpm build:packages`                  | Emit shared JavaScript and declarations                               |
| `pnpm db:ping`                         | Explicit read-only Atlas connectivity check for `advanced_darvas_dev` |
| `pnpm market-data:migrate-generations` | Explicit offline generation migration; dry-run by default             |
| `pnpm admin:bootstrap`                 | Interactive one-time development Family/Admin initialization          |
| `pnpm typecheck`                       | Check package/app types plus test and tool configuration              |
| `pnpm lint`                            | ESLint with zero allowed warnings                                     |
| `pnpm test`                            | Vitest, React Testing Library, and Supertest checks                   |
| `pnpm build`                           | Production builds in dependency order                                 |
| `pnpm test:e2e`                        | Desktop/mobile Chromium smoke tests with managed local servers        |
| `pnpm format` / `pnpm format:check`    | Format or verify implementation files                                 |

For intentional dependency updates, update manifests and the pnpm lockfile together,
verify peer/engine compatibility, and review install-script policy changes. Do not
disable strict peers, ignore engine failures, or regenerate the lockfile needlessly.

Frontend uses port 3000; Express uses port 4000. Browser calls use relative
`/api/v1` paths, rewritten by Next.js to the server-only `API_INTERNAL_ORIGIN`.
`GET /api/v1/health` must work without MongoDB and return:

```json
{
  "success": true,
  "data": { "status": "ok", "service": "advanced-darvas-api" }
}
```

## Configuration and data safety

- Web loads `apps/web/.env.local`; API loads `apps/api/.env`. Root `.env.example`
  is a reference, not an environment loader. Commit examples only.
- Current defaults keep startup/health functional without actual environment files.
  Auth connects lazily and returns a sanitized 503 when unavailable. Do not require
  Atlas or Resend credentials for isolated tests. Database index readiness is
  verified read-only on first real auth use; HTTP requests never provision indexes.
- Database imports must not open connections. Connect explicitly, close owned
  connections on shutdown, and keep automatic collection/index creation disabled.
  Identity DDL is explicit through `prepareAuthStorage`, used by the bootstrap CLI
  and disposable integration tests. Never use `syncIndexes()` to drop indexes.
- `pnpm db:ping` explicitly loads `apps/api/.env` with Node's environment-file loader
  and reuses the database connection utility. It permits development/test mode only,
  requires `advanced_darvas_dev` in both the URI path and `MONGODB_DB_NAME`, rejects
  placeholders, sends only the `ping` command, and closes the owned connection.
  Keep driver errors and complete URIs out of diagnostic output. This command does
  not create records, models, collections, indexes, or accounts and is never run by CI.
- `pnpm admin:bootstrap` builds the API dependency graph, loads `apps/api/.env`, and
  requires an interactive terminal, no arguments, explicit development mode, and
  `advanced_darvas_dev` in both database settings. Production is refused without a
  bypass flag; it needs separately approved implementation. Never invoke the live
  bootstrap for testing or ask for its password in chat.
- Bootstrap creates only the first Family/Admin in a transaction. A permanent,
  uniquely indexed Family marker arbitrates concurrent attempts; never remove or
  expire it. Pre-existing identity data blocks initialization. Unsupported
  transactions or missing indexes fail closed; retries never overwrite accounts.
- Email identity is trimmed/lowercase and globally unique; dots/plus tags remain.
  User states are ACTIVE/DISABLED per the approved Stage 2 request, superseding the
  older INVITED user state. Family `_id` is the workspace identifier. CLI creation
  leaves `emailVerifiedAt` unset. Roles do not confer private portfolio ownership.
- Passwords use Argon2id (64 MiB, three passes, parallelism one, random 16-byte salt).
  CLI entry is hidden with reveal disabled; no password arguments, persistence or
  logging. Secret fields use default query exclusion and serialization redaction;
  always use `toPublicUser`/the DTO allowlist, including for explicitly selected lean
  records. Token hashes are SHA-256 of opaque 32-byte random tokens, never passwords.
- Session/invitation validity must check expiry and revocation/consumption at use
  time. TTL indexes are asynchronous cleanup, not authorization. Sessions use opaque
  32-byte tokens with SHA-256 hashes in MongoDB, active User/Family checks and fresh
  browser-session tokens at login. Normal absolute lifetime is eight hours; Remember
  Me is seven days with a persistent cookie. Logout revokes before reporting success.
- Auth cookies are HttpOnly, SameSite=Lax, Path=/, host-only, and Secure with `__Host-`
  names in production. Production auth requires HTTPS WEB_ORIGIN and a stable random
  server-only CSRF_SECRET (at least 43 characters). Development uses an ephemeral
  signing secret if absent. Do not weaken production flags for local browser tests.
- GET `/api/v1/auth/csrf` is the approved Stage 3 support endpoint. Signed double-submit
  CSRF tokens bind to an anonymous nonce before login and session hash afterward.
  Mutations require exact configured Origin plus X-CSRF-Token; no CORS credential
  bypass or forwarded-host-derived origin. CSRF tokens may be returned to memory;
  session tokens must never appear in JSON, URLs or logs. Keep request logging redacted.
- Auth uses the API Design's `{data}`/`{error}` envelopes; the legacy health/scaffold
  success discriminator stays intact. Login input validation is distinct from new
  password policy; unknown accounts receive comparable Argon2 verification work.
  Disabled accounts/families receive the same generic credential error.
- Login limits are process-local, per normalized account plus transport-IP backstop.
  Keep proxy trust disabled unless topology is explicitly verified. Behind Next,
  IP backstops can be shared; these limits are not a distributed production defense.
- The workspace Server Component forwards cookies to Express using a server-only
  fixed API origin and no-store fetch. Never grant access based on cookie existence
  or a client-side guard. Failed backend validation renders no private user content.
- `requireAuthenticated` establishes request-scoped identity through the existing
  live session lookup, including active User/Family checks. Use `authenticatedUser`
  to read it; `response.locals`, headers, query and body identity are not proof of
  authentication. `requireActiveAccount` and `requireAdmin` fail closed without
  that context. Current roles are reloaded on each protected backend request.
- Use `privateResourceScope` for future owner-constrained reads and writes, with
  authorized parent IDs and family constraints where supported by the collection.
  `authorizeOwnedResource` checks server-loaded metadata and gives Admin no
  ownership bypass. Return 401 for invalid authentication, 403 for role denial,
  and 404 for inaccessible private resources per the authoritative API Design.
- Private pages call `requireCurrentUser` at the page/data boundary. A shared
  layout alone does not protect child rendering or RSC payloads. Backend outages
  render only unavailable feedback; framework redirects must propagate normally.
- The private layout validates identity for shell chrome and passes only display
  name and role to client controls. Keep page-level and API guards when adding routes:
  Next layouts persist across client navigation, and menu visibility grants no access.
  Shell popovers/sheets must retain focus trapping where modal, Escape dismissal,
  focus restoration and accessible labels. Desktop starts at 1024px; smaller screens
  use safe-area-aware bottom navigation and More. Use account-menu Logout rather
  than duplicating the authentication flow. Public-page CSS must remain unchanged.
- Never expose server configuration through `NEXT_PUBLIC_*` or log credentials,
  raw environment objects, request bodies, cookies, or private financial records.
- Invitation contracts are recorded in `docs/adr/0001-family-invitations.md` as
  explicitly approved amendments. Use the existing `/api/v1/invitations` routes,
  POST verification/acceptance, and family-scoped Admin revoke/resend operations.
  Sharing a CSRF context across auth and invitation routers is mandatory.
- Invitation tokens are opaque 32-byte values, SHA-256 hashed, single use and valid
  for exactly 72 hours. Registration derives family/email from the invitation,
  always creates an ACTIVE MEMBER and never issues a session. Current family and
  issuing Admin status are validated. Existing accounts are never transferred.
- Resend creates a replacement row because token hashes remain immutable; old links
  stop working. Keep persisted recipient cooldowns/quotas across replacements and
  transactionally arbitrate acceptance versus revoke/resend. TTL is only cleanup.
- Invitation retention uses purgeAt, 90 days after expiry. `invitations:prepare`
  defaults to a dry-run, requires explicit --apply and refuses production. Never
  drop unrelated indexes or run identity DDL from HTTP/startup. Login readiness is
  independent of invitation index migration. See README for the operator workflow.
- Resend delivery uses server-only RESEND_API_KEY/RESEND_FROM_EMAIL and WEB_ORIGIN.
  RESEND_FROM_EMAIL is the canonical bare-address setting. Development uses
  onboarding@resend.dev; the adapter adds the Advanced Darvas Box display name.
  Production needs an address on a verified sender domain. Restart the backend
  after local environment changes, and keep real provider sends separately approved.
  Synchronous sending with persisted delivery states is the approved temporary
  exception to the future outbox design. ACCEPTED means provider acceptance, not
  inbox delivery. Never persist email bodies or recoverable invitation tokens.
- Use fragment invitation links, remove the fragment after reading into memory,
  send tokens only in JSON request bodies, and apply no-referrer on the acceptance
  page. Do not add analytics or tracking to invitation links. All automated email
  delivery must be mocked; test setup never returns tokens in API JSON responses.
- Use dedicated development/test databases for authorized integration work. Do
  not run migrations, seed data, or perform writes against production implicitly.
- Preserve generated request IDs, centralized errors, security headers, request
  size limits, and structured redacted logging when extending the backend.

## Verification and working practices

- Inspect branch/status and relevant files before editing; preserve unrelated work.
- Make focused changes within the requested scope. Ask questions only for unresolved
  choices that materially affect the work and cannot be resolved from the baseline.
- Run checks appropriate to the change. For application/dependency changes, run
  `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm format:check`.
  Documentation-only changes normally need formatting and diff checks, not app tests.
- On memory-constrained Windows machines, run full Vitest, production builds and
  compiled Playwright sequentially. `pnpm test --maxWorkers=1` and
  `pnpm test:e2e --workers=1` reduce concurrent load. Do not weaken production
  transaction budgets or silently skip security tests to hide resource failures.
- Add or update meaningful tests for changed behavior. Do not create dummy checks,
  empty success scripts, invented golden data, or unnecessary implementation mirrors.
- Database integration tests start a test-owned loopback MongoDB replica set using
  `mongodb-memory-server-core` and pinned MongoDB 8.2.6. First use downloads and
  checksum-verifies a binary under ignored `node_modules/.cache/mongodb-binaries`.
  They generate `advanced_darvas_test_<uuid>` databases and never read app `.env`
  or Atlas settings. Keep ownership/loopback guards before cleanup; do not replace
  the harness URI with a development/production URI or silently skip security tests.
- Playwright uses `test:auth-server`, a disposable replica set and synthetic account.
  Its helper never loads app `.env` and must not be used for manual development
  sign-in. Compiled-app tests use compiled Express code with HTTP test cookie flags;
  secure production attributes are tested separately. Optional E2E_WEB_PORT and
  E2E_API_PORT keep default 3000/4000; preserve unrelated processes. Local browser
  caches may be selected through PLAYWRIGHT_BROWSERS_PATH without committing paths.
- Authorization fixtures in `apps/api/tests/authorization-fixture.ts` compose test
  routes outside production server composition and builds. The test-only session
  setup issues cookies for isolated synthetic identities, never tokens in JSON.
  Never mount these routes in the real application or use them for manual sign-in.
- Invitation fixtures add synthetic link setup and a fake email sender only in the
  disposable test server. Cookie-context application instances isolate browser
  rate-limit budgets, including SSR cookie forwarding, without changing production
  limits. Keep that dispatcher under `apps/api/tests`, never production composition.
- Production Playwright startup rebuilds the frontend under its selected
  API_INTERNAL_ORIGIN before `next start`. Keep build/start origins identical:
  changing only startup environment does not replace compiled rewrite destinations.
- For UI/proxy/theme changes, run Playwright, review desktop/mobile behavior, and
  check for overflow. Preserve light/dark/system themes and emerald visual tokens.
  Public-page checks include 360/390px mobile, tablet, and 1440px desktop, the static
  preview disclaimer, functional navigation, and absence of runtime data calls.
  Login checks cover inline validation, password visibility, Remember Me, truthful
  submission feedback, and disabled native submission without JavaScript.
- Playwright requires Chromium (`pnpm exec playwright install chromium`) and owns
  ports 3000/4000 during tests. Stop only task-owned development processes; never
  kill an unrelated process just to free a port. Use `E2E_PRODUCTION=1` through the
  shell's environment syntax to test compiled apps after `pnpm build`.
- CI currently runs on pushes to `main` and on pull requests, on Linux and Windows;
  Linux also exercises compiled-app Chromium tests. A direct `dev` push alone does
  not currently trigger this workflow. Do not claim remote CI passed without evidence.
- Report actual checks and failures accurately. Never claim an application is
  running without checking it, and state whether task-owned servers were left running.

## Git workflow and maintaining this guide

- `main` is the stable baseline; development work currently uses `dev`. Inspect the
  active branch rather than switching or discarding changes automatically.
- Commit, push, open a PR, merge, or deploy only when requested or already authorized
  for the current task. An earlier task-specific push is not blanket permission.
- Before committing, review staged paths/diffs. Exclude `.tools`, `node_modules`,
  `.next`, `dist`, test reports, actual environment files, and secrets. Preserve the
  approved specifications exactly unless a specification change is requested.
- Never force-push, rewrite shared history, or modify `main` as a routine shortcut.
- Update this guide with relevant workflow/architecture changes in the same task.
  Remove obsolete instructions as features arrive. Do not turn it into a work log,
  copy transient test counts, or record credentials and machine-specific state.

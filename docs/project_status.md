# Advanced Darvas Box — Project Status

- **Last updated:** 27 November 2026 (Asia/Kolkata)
- **Current milestone:** Phases 8B/8C market-data foundation and bounded parsing implemented, locally verified and delivered to origin/dev; Phase 8D persistence/API workflow and production readiness remain pending
- **Overall state:** Frontend foundation complete; business features and deployment pending

This is the living implementation-status record. Requirements remain in the four
approved specifications; working conventions remain in [AGENTS.md](../AGENTS.md).
Update this file with each project change. Describe completed work, pending work,
and verification accurately rather than treating planned features as implemented.

## Completed work

| Area                   | Current implementation                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo               | pnpm workspaces with `apps/web`, `apps/api`, and four shared packages                                                                                                   |
| Frontend foundation    | Next.js App Router, strict TypeScript, Tailwind, shadcn/ui Button/Card primitives, emerald theme tokens                                                                 |
| Public landing page    | Route `/`, responsive header and mobile menu, approved hero copy, illustrative preview, three feature cards, four-step workflow, educational footer                     |
| Login UI               | Route `/login`, preserved design, real login with local validation, password toggle, remembered sessions, disabled recovery and static preview                          |
| Appearance             | Light, dark, and system themes with persistence; locally hosted Geist/Inter fonts and licenses                                                                          |
| Backend foundation     | Express, Zod environment validation, structured redacted logging, security middleware, request IDs, centralized errors                                                  |
| Health endpoint        | `GET /api/v1/health`; works without MongoDB                                                                                                                             |
| API routing            | Same-origin Next.js rewrite from `/api/v1/*` to the local Express API                                                                                                   |
| Contracts              | Shared Zod health/error and identity contracts, normalized email, roles/statuses and safe user DTO allowlist                                                            |
| Strategy-core          | Framework-independent boundaries for DMA, CAR, Darvas, suitability, and capital allocation; no trading calculations                                                     |
| Database package       | Identity plus seven market/import model definitions, explicit native validators/indexes, dry-run-first preparation and atomic bootstrap; no automatic DDL               |
| Market-data foundation | Browser-safe Zod price/import contracts, exact Decimal128, provenance, scoped metadata, durable job/checkpoint shapes and publication states; no import services        |
| Market-file parsing    | Worker-isolated CSV/XLSX reading, exact normalization, duplicate classification, bounded diagnostics and trusted-calendar assessment; no upload endpoint or persistence |
| Admin bootstrap        | Interactive development-only CLI; one-time Family/Admin transaction; user reports successful development workspace/Admin creation                                       |
| Authentication         | Login/current-user/logout/CSRF, hashed sessions, centralized active/Admin/ownership guards and protected workspace; isolated Stage 4 verification passed                |
| Family invitations     | Admin creation/listing/revoke/resend, 72-hour hash-only links, transactional Member acceptance and Resend adapter; development indexes prepared                         |
| Application shell      | Shared authenticated layout, collapsible desktop sidebar, grouped role-aware navigation, header/account controls and mobile bottom navigation/More sheet                |
| Main Dashboard UI      | Six unavailable metrics and five data-status panels inside the existing shell; server-rendered, responsive, themed and role-aware; no business data APIs                |
| Atlas diagnostic       | Explicit development-only `pnpm db:ping`; configuration guarded and credentials redacted; live ping succeeded against `advanced_darvas_dev`                             |
| Test fixtures          | Structure and provenance guidance for future verified golden tests; no fabricated historical market data                                                                |
| Quality tooling        | ESLint, Prettier, Vitest, React Testing Library, Supertest, and Playwright                                                                                              |
| CI                     | GitHub Actions configured for Linux/Windows checks and Linux Chromium tests; no cloud deployment                                                                        |
| Project guidance       | Root `AGENTS.md` and this status tracker                                                                                                                                |

## Landing-page decisions and boundaries

- Approved Stitch project: `7871198770128109512`.
- Desktop reference: `c5c59502d9bd43d9a11e909aad659beb`.
- Mobile reference: `56d4657467e44785920baf4d357e8eb9`.
- Exact headline: **Smarter Stock Screening. Disciplined Swing Trading.**
- Supporting copy uses the approved mobile text on every breakpoint.
- Landing Sign In actions navigate to `/login`, which connects the real authentication API.
- The mock illustration is labeled **Illustrative Preview — Not Live Market Data**.
  Its values are presentation examples, not current prices, calculated signals,
  performance results, or verified historical fixtures.
- The landing page makes no runtime API or market-data requests. Its sections are
  Server Components; theme interaction reuses the existing client components.
- The landing milestone added no business APIs, trading calculations, or dependencies. The older scaffold dashboard component remains
  in the codebase but is not routed from `/`.
- The four approved files under `docs/` remain byte-for-byte unchanged.

## Login UI decisions and boundaries

- Stitch project `7871198770128109512`: desktop
  `5de95a5aee7742ecbfd81148778d0b36`, mobile
  `475f8dea45524831a58d501e04ca0133`.
- `/login` is public and now connects real authentication. The approved split desktop and single-column mobile
  structure uses the landing page's shared brand, Geist/Inter fonts, emerald
  palette, borders, and existing light/dark/system theme infrastructure.
- Stitch supplies dark login references only. Light mode uses the existing public
  palette. Prototype state controls, credentials, recovery/success simulations,
  live-feed indicators, and unsupported financial/security claims were omitted.
- Email and password are required; email format is validated locally. Inline errors
  are associated with their inputs, values survive validation, and the first invalid
  field receives focus. Password visibility and Remember Me are interactive.
- Remember Me requests a persistent session lasting up to seven days. Forgot
  Password is disabled with Coming soon. There is no public signup.
- Valid local submission obtains CSRF protection and posts to the real login API,
  then confirms `/auth/me` before `/dashboard` navigation. Loading lasts only for real
  requests; attempted passwords are cleared and email survives errors. No credential
  or token browser-storage write, artificial delay or fake success is used.
- Native form controls remain disabled until hydration; the no-JavaScript notice
  explains that JavaScript is required and credentials are not submitted without it.
- The desktop panel reuses the landing illustration and fixed stock examples,
  labeled **Illustrative Preview — Not Live Market Data**. DMA/CAR labels and
  weekly trigger values are mock presentation content, not calculations.
- The landing content and layout remain preserved; its two Sign In actions open
  `/login`. Stage 3 changes auth behavior only; no trading dashboard is implemented.

## Phase 8B/8C Git delivery — 27 November 2026

- Committed the 49 reviewed Phase 8B/8C files as `1241ebb`
  (`feat: add market-data foundation and bounded file parsing`) and pushed to
  `origin/dev`. GitHub's branch hash was verified against the full local commit hash
  on 27 November 2026. This documentation follow-up records the observed delivery.
- The milestone's dated verification remains 425 passing Vitest tests, 64 compiled
  browser regressions, two compiled parser smoke cases, TypeScript, ESLint and build.
  This delivery task changes status documentation only and does not rerun those
  application checks. Formatting, ADR formatting, whitespace, staged-scope and
  credential-pattern checks passed for all 49 staged files before committing.
  No credential-pattern findings or unexpected staged paths were detected.
  The existing development-only minimatch
  advisory remains documented; no production dependency finding was reported.
- Actual environment files and generated output are excluded. The four approved
  specifications, public/private UI and authentication implementation are preserved.
  `main` was not changed. No deployment, Atlas operation or additional email occurred.
  A direct dev push does not trigger the current main/PR CI workflow; no remote CI
  success is claimed.

## Phase 8C parsing and validation — 27 November 2026

- Added backend-only CSV/XLSX readers, pure normalization/duplicate classification,
  explicit mappings/provenance/date modes, additive browser-safe result schemas and
  trusted-calendar snapshot validation. The selected stock remains caller-resolved
  against a verified master; no reference sources are invented or loaded automatically.
- Exact OHLC/volume validators and mapping/range schemas reuse Phase 8B contracts.
  Unknown basis can retain observed preview rows but blocks confirmation. BOTH cannot
  be inferred from one OHLC series; no raw/adjusted counterpart is fabricated.
- Enforced file/MIME/content, row/column, ZIP size/ratio/integrity/path, XML depth,
  cell/record and diagnostic bounds. Formula/cached-value, macro, encryption, external
  relationship and DTD rejection is explicit. A single owned worker has memory and
  execution limits; capacity rejects excess requests instead of retaining a queue.
- Pinned csv-parse 7.0.3, yauzl 3.4.0, @rgrove/parse-xml 5.2.0 and development-only
  @types/yauzl 3.4.0 after checking engines, dependency/lifecycle metadata and upstream
  documentation. No unrelated upgrades or install-script policy changes.
- Final verification on 27 November 2026: **425/425 Vitest tests across 44 files passed**,
  including **117 new parser/contract tests** and all earlier authentication, invitation,
  authorization and database tests. Full workspace TypeScript, zero-warning ESLint and
  production builds passed after the final source-worker fix. Root formatting and
  whitespace/diff verification passed; generated Next references were restored.
- Compiled Playwright **64/64 regressions passed** using isolated ports 3001/4001,
  disposable MongoDB and mocked email. Coverage includes both roles, Login/Logout,
  invitation acceptance, private/public navigation and 360/390/768/1440px themed layouts.
  Two additional compiled-parser smoke cases (CSV/XLSX with real JS workers) passed.
  Task-owned servers were stopped; no frontend/test listeners remained on ports
  3000/3001/4001, and the existing port-4000 backend health remained OK.
- An additional plain-Node source-worker check exposed source URL query/loader
  resolution failure outside Vitest. Fixed pathname detection and resolved the existing
  API-owned tsx loader explicitly. A new standalone subprocess test removes NODE_PATH
  and verifies correct worker startup/results. All seven worker-execution tests and
  the final full suite passed. Earlier strict inference/type-only import and encrypted
  ZIP fixture issues were corrected; no final application-test failures remain.
- Production dependency audit reports zero advisories. Full audit identifies one
  pre-existing moderate minimatch 10.2.6 development advisory through shadcn/ts-morph
  (GHSA-g3hv-75wg-m249); its version already exists in HEAD and remains unchanged.
  No production dependency finding or known new parser advisory was reported.
- All new data is synthetic, including the test calendar; these tests establish no
  real NSE calendar accuracy, source-workbook parity or provider-format compatibility.
  Actual source files, verified reference data and adjustment provenance remain needed.
- No parser stage loads app environment files, accesses Atlas, sends mail, persists
  previews, writes prices/revisions, exposes routes, seeds data or starts jobs. Existing
  auth/invitations/public UI/shell/Dashboard and the four specifications remain preserved.
  No commit, push or deployment. See the imports module README for supported profiles
  and resource limits. This supersedes the broad future-8C scope discussed in ADR 0002:
  persistence/API/runner/UI work remains deferred to separately approved phases.

## Phase 8B market-data foundation — 27 November 2026

- Added ADR 0002, browser-safe Zod market/import contracts, seven connection-scoped
  models, explicit native validators/indexes and development-only dry-run-first
  market-storage preparation. No parser dependencies or lockfile changes.
- Exact decimal strings/Decimal128, explicit raw/adjusted provenance, family-scoped
  import metadata, append-only audit, per-stock active-job exclusion, durable
  checkpoints/fencing, partial TTL staging and separate publication states are defined.
  Transaction guards cover payload attachment/release and dataset publication.
- No upload/preview/commit API, runner, stock/calendar seed, Admin UI, strategy
  calculation or Dashboard integration. Authentication readiness remains independent.
- Verification on 27 November 2026: full workspace TypeScript, zero-warning ESLint,
  full Vitest **308/308 tests across 40 files** (53 new foundation tests), production
  build, root formatting, explicit ADR formatting and whitespace/diff checks passed.
  Additional tooling/test TypeScript checking passed after the final adversarial cases.
- Compiled Playwright **64/64 regressions passed** on isolated ports 3001/4001,
  including Login/Logout, session denial, role authorization, invitation acceptance,
  shell and public/Dashboard theme/responsive checks. The first browser startup was
  blocked by a Windows EPERM while deleting generated Next output (zero tests ran);
  the unchanged retry passed. No application/configuration workaround was added.
- Task-owned browser servers and disposable MongoDB processes were stopped after
  verification. The pre-existing backend on port 4000 remained healthy; no task-owned
  frontend server was left running.
- Isolated tests cover native BSON constraints, exact decimal precision, duplicate
  identities/idempotency, concurrent stock exclusion, optimistic versions, ordered
  lifecycle/checkpoints, family-bound payload attachment, publication guards, active
  payload TTL safety and index/validator drift. Initial BSON boolean-alias, portable
  declaration and strict fixture typing/lint issues were fixed without weakening checks.
- All database tests use owned disposable loopback replica sets and explicitly
  synthetic records, never app `.env` or Atlas settings. CLI tests mock connectivity;
  the live preparation command was not invoked, even in dry-run. No reference data
  downloads/seeds, production access, real email, commit, push or deployment.
- No dependencies or lockfile changes; no auth/invitation behavior, runtime routes,
  frontend source or approved-specification changes. Generated Next references were
  restored. Model/native validation is a foundation, not an implemented import service;
  privileged raw-driver mutations remain a trusted operator capability. Phase 8C
  still needs audited transaction adapters, reference verification, parsers/APIs,
  resumable runner and UI. No production/trading readiness is claimed.

## Shell and Dashboard Git delivery — 27 November 2026

- Committed the reviewed Milestone 6 application shell and Milestone 7A Dashboard UI
  as `59e664c` (`feat: add authenticated application shell and dashboard UI`) and
  pushed to `origin/dev`. GitHub's remote branch hash matched the local commit.
- Reviewed all 26 staged paths, scoped diffs, credential patterns and whitespace.
  Root formatting and diff checks passed. Actual environment files, local tools,
  generated outputs and test reports were excluded. The four approved specifications,
  backend, shared packages and public pages remain unchanged; `main` was untouched.
- No application code changed during delivery. The earlier 27 November results
  remain the evidence: 255 Vitest tests across 35 files, 64 compiled Playwright
  tests, TypeScript, ESLint and production build passed. These application checks
  were not rerun solely for Git delivery. No deployment or remote CI success is
  claimed; a direct `dev` push does not trigger the current workflow.

## Milestone 7A Main Dashboard UI — 27 November 2026

- Implemented the approved desktop/mobile Stitch section hierarchy inside the existing
  shell, with six metrics, Portfolio Overview, Eligible Stocks Summary, Positions
  Approaching 6% Target, Recent Activity and Market Data Freshness panels.
- Values are explicitly unavailable (`—`, Not connected, Unknown). No stock values,
  balances, chart curves, events, refresh timestamps or empty-result claims are
  fabricated. Only the existing authenticated identity is real data on this screen.
- Reused Card/Button, brand, fonts and theme tokens; added small Badge/EmptyState
  primitives and typed metric availability. Dashboard content remains server-rendered;
  existing layout/page guards, authentication and invitation functionality are preserved.
- No business API calls, backend/schema/contracts changes, calculations, dependencies,
  Atlas writes, real email, specification edits, commit, push or deployment.
- Verification on 27 November 2026: workspace `pnpm typecheck`, zero-warning
  `pnpm lint`, full `pnpm test --maxWorkers=2` (255/255 tests across 35 files),
  `pnpm build`, and compiled `pnpm test:e2e --workers=2` (64/64 tests) passed.
  Browser tests rebuilt Next under the selected API origin and used ports 3001/4001,
  disposable loopback MongoDB, synthetic identities and mocked email delivery.
- New browser checks verify both Admin and Member at 360/390/768/1440px in light
  and dark themes, metric/section availability, responsive table/grid behavior,
  no horizontal overflow, no business/external API requests, keyboard skip/focus,
  disabled trade action and real Logout. Existing session denial, role escalation,
  invitation acceptance and public-page regression coverage remains intact.
- Reviewed representative mobile, tablet and desktop screenshots in both themes,
  including Member and Admin views. Preserved Geist/Inter, emerald tokens, existing
  shell/account/navigation behavior, and the single main landmark. No unsupported
  trading/performance/freshness claims or illustrative financial values were copied
  from Stitch. The five new component tests include SSR and identity escaping.
- Fixed an initial strict optional-prop typing failure in the new EmptyState;
  subsequent typecheck and production compilation passed. Non-failing jsdom
  performance advice and Playwright color-environment notices remain informational.
  Browser verification used Chromium emulation; physical devices, Safari/Firefox
  and an actual screen-reader session were not exercised.
- No deviation from the approved file list. Existing Milestone 6 uncommitted work
  is preserved; generated Next route-type references were restored. Real Dashboard
  metrics, historical signals, portfolio values and data freshness remain unavailable
  until separately authorized backend and domain milestones.
- Final root formatting and whitespace/diff checks passed. Backend/shared packages,
  public pages/styles and the four approved specifications are unchanged. Task-owned
  servers on 3001/4001 and disposable MongoDB processes stopped; no frontend server
  was left running. The pre-existing backend on 4000 remains healthy and the
  pre-existing MongoDB process is preserved. No remote CI result is claimed.

## Milestone 6 application shell — 27 November 2026

- Added a shared dynamic `(private)/layout.tsx` and reusable shell around Dashboard
  and invitation administration. Identity comes from the existing server-side
  session check; only display name and role cross into client chrome. Existing
  page/data/API guards remain intact, and unavailable validation renders no private
  shell or children. No authentication, backend, database or API-contract changes.
- Reused SiteBrand, Geist/Inter, public emerald/theme tokens, ThemeToggle,
  LogoutButton, installed Radix primitives and Lucide. Desktop navigation collapses
  in memory for the mounted layout, survives private navigation and resets on reload.
  No sidebar preferences or identity/role flags are persisted. No dependencies added.
- Implemented the approved Overview/Analysis/Trading/Activity/Administration/Account
  groups. Only Dashboard and Family Management link to implemented routes; future
  entries are disabled and visibly marked Coming soon. Administration is omitted
  for Members. Header page title and active-route states track client navigation.
- Below 1024px, Dashboard/Screener/Portfolios/Alerts/More bottom navigation and a
  scrollable modal More sheet use safe-area padding. Verified focus trapping,
  Escape/close dismissal, route-change dismissal and focus restoration; crossing
  the desktop breakpoint closes More and focuses the visible account trigger.
  The account popover and More sheet both reuse the real Logout behavior.
- Selected and inspected Stitch references `13580afd125a432a8f2d8eef02d5aee4`
  (desktop) and `852fdff541564acfb5545e28a77ebe2f` (mobile). Adapted their shell
  structure to the existing palette/branding and approved navigation; omitted
  financial widgets, fake identities/portfolio switches, counters, status/engine
  claims and prototype controls. Dashboard and invitation contents are preserved
  with duplicate outer chrome/main elements removed. Public pages are unchanged.
- Verification on 27 November 2026: workspace TypeScript, zero-warning ESLint,
  full Vitest 250/250 across 34 files, production build and compiled Playwright
  60/60 passed. Two additional focused compiled browser checks passed after
  explicitly testing Member Logout from the mobile More sheet. Existing login,
  invitation acceptance and authorization regressions passed with account-menu
  interactions. Server/layout composition tests retain both page and layout guards
  and assert a single main landmark. Initial strict Link handler typing was fixed;
  focused shell tests passed without the earlier jsdom navigation diagnostic.
- Reviewed shell/More screenshots across 360/390/768/1440px in light/dark themes;
  automated overflow and keyboard checks passed for both private pages. Tests use
  disposable loopback MongoDB and synthetic credentials with mocked email, never
  the development Atlas database or real provider sends. No commit/push/deployment.
- Root formatting and whitespace/diff checks passed. Source/hash checks confirmed
  no unexpected changes: backend, public pages/styles, approved specifications and
  local environment are unchanged. Credential scanning found no local secrets in
  Git candidates. Restored the generated Next type references. Test servers on 3001/4001
  and test-owned MongoDB stopped; the pre-existing backend on 4000 and pre-existing
  MongoDB process were preserved; the backend health check passed. No frontend
  development server was left running.
- Remaining scope is unchanged: no full Dashboard, screener, portfolios, imports
  or trading features. Navigation availability is UI only; Express remains the
  authorization authority. The long More sheet scrolls on smaller viewports.
  Browser verification used Chromium; physical-device Safari/Firefox testing was
  not run. Color-environment and jsdom performance notices were non-failing.

## Git delivery — 27 November 2026

- Committed the reviewed Stage 4 authorization and Stage 5 invitation work,
  Resend configuration examples, tests and project guidance in `d6f8346`
  (`feat: enforce authorization and implement family invitations`). All 59 staged
  paths matched the reviewed set. Push to `origin/dev` succeeded and the GitHub
  branch hash was verified directly. No main-branch push, force-push or deployment.
- Local `apps/api/.env` remains ignored and untracked. Credential/pattern scans
  found no secrets in candidate files, and the four approved specifications remain
  unchanged. Staged whitespace and root formatting/diff checks passed for
  this delivery record; application tests were not repeated for Git/documentation
  operations. The 237-test/54-browser verification below is dated application evidence.
- A direct dev push does not trigger the current main/pull-request workflow;
  no remote CI result is claimed. Production sender, real-recipient delivery and
  hosting/proxy readiness remain pending as recorded below.

## Stage 5 verification closeout — 27 November 2026

- Added explicit integration coverage for Member invitation creation with valid
  session-bound CSRF (403 FORBIDDEN, no writes or email), accepted Member family
  assignment in storage and authenticated profile, and cross-family Admin resend
  denial (404, no token rotation or email). Existing expiry/replay/concurrency,
  authorization, duplicate-account and delivery-error checks remain intact.
- Added component tests for FAILED and UNCONFIRMED delivery feedback, automatic
  list refresh, fresh-invitation resend and confirmed revocation. Provider acceptance
  remains distinct from inbox delivery. No application behavior or visuals changed.
- Browser tests now cover the continuous Admin Login -> Create Invitation ->
  Accept Invitation -> Member Login -> Protected Dashboard -> Logout workflow using
  the exact Admin-created invitation. Verified the accepted account's email,
  MEMBER role and Admin's family, denied Admin-only APIs, and confirmed logout
  prevents subsequent authenticated access. This passed on desktop and mobile.
- After explicit approval to extend the four-file scope, updated only the existing
  test fixture with an in-memory mock-mail capture and one-time redirect. It requires
  a validated active Admin session and matching family, accepts only loopback links,
  sends no real email and never returns a token in API JSON or persists mock mail.
  Added integration coverage for anonymous/Member/cross-family denial, one-time
  retrieval, hash correspondence and absence from production application routes.
  Scoped browser revoke actions to each test's invitation to avoid parallel-test ambiguity.
- Verification on 27 November 2026: targeted component tests 11/11, targeted
  invitation integration tests 24/24 before adding the fixture-access test; final full Vitest suite 237/237 across 32 files,
  workspace TypeScript, zero-warning ESLint, production build and compiled
  Playwright 54/54, root formatting and whitespace/diff checks passed. Final test/tool TypeScript checking also passed. An initial TypeScript check caught unsupported exact
  options in newly added Testing Library queries; corrected those test options
  and the full TypeScript rerun passed. No application-code fix was needed.
- Both themes and 360/390/768/1440px invitation layouts passed automated overflow
  checks; reviewed acceptance and invite-dialog screenshots across these sizes.
  Tests used disposable loopback MongoDB and synthetic credentials with mocked
  email. No Atlas writes, real email, dependency changes, commit, push or deployment.
- A Windows pnpm lifecycle warning appeared during browser-server shutdown after
  successful tests; the Playwright runner exited zero. No failed browser checks or
  application defect required a code fix. Test ports 3001/4001 are closed and
  test-owned MongoDB processes stopped; the pre-existing backend on port 4000 and
  pre-existing MongoDB process were preserved.
- Only the four approved test/fixture files and this status record were intentionally
  changed. Existing application code, schemas, contracts, approved specifications,
  local environment and unrelated uncommitted work are preserved. Stage 5 is ready
  to close as a locally verified development milestone. Real-recipient delivery,
  verified production sender/domain, reachable HTTPS links and deployment/proxy
  hardening remain separate operational work; the approved outbox deferral remains.

## Controlled Resend provider test — 27 November 2026

- Explicitly authorized one generic email from
  `Advanced Darvas Box <onboarding@resend.dev>` to `delivered@resend.dev` with the
  exact approved integration-test subject and body. Resend accepted the request
  with HTTP 200 and provider message ID `01a21cd1-968d-76b0-a62a-a6f5ce2bb4e2`.
- Reused the backend Node environment-file loader, environment validation and
  existing invitation sender in an isolated in-memory harness. The harness replaced
  invitation content with the generic message and made failures terminal to prevent
  the adapter's normal retries. Exactly one provider request was made; zero retries.
- No invitation/user records were created. No tokens, personal data or credentials
  were included in the message or exposed. Application files were unchanged; no
  additional sends, commit or push. The existing key and environment file were
  unchanged. Provider acceptance does not establish inbox
  delivery, real-recipient behavior or production-domain readiness.
- Updated only this status record. Earlier application/regression checks below
  were not rerun for this manual provider test. Any further send requires approval.

## Resend development configuration — 27 November 2026

- Configured the ignored backend environment with the bare development sender
  `RESEND_FROM_EMAIL=onboarding@resend.dev`. The reusable adapter adds the display
  name `Advanced Darvas Box`. The user reports rotating the API key; this task
  preserved it and every other local environment setting. Fresh server-side
  configuration validation confirms the key loads and the transport is configured;
  it does not verify provider credentials, permissions or inbox delivery.
- Replaced outdated sender-variable references in the example and README with
  canonical `RESEND_FROM_EMAIL`. Documented development versus production senders,
  backend reloads and separate approval for any real provider test. Added mocked
  tests for the exact From header, incomplete configuration and safe failure handling.
- Checks passed on 27 November 2026: 8 targeted mocked email tests, all 232 tests
  across 32 files, workspace TypeScript checks, zero-warning ESLint and production
  build, root formatting check and whitespace/diff check. Automated email remained mocked and integration databases were disposable;
  no Atlas or real email operation was used. Browser tests were not rerun for this
  configuration-only update; the older Stage 5 browser results below remain dated evidence.
- No backend was listening initially. Started Express fresh on port 4000 with the
  updated environment; its health check passed, and this task-owned backend is left
  running. Frontend processes and authentication implementation were not changed.
- Confirmed local environment files remain ignored and untracked. A credential scan
  of Git candidate files found no local secrets. Preserved existing uncommitted
  Stage 4/5 work; no dependency changes, real sends, accounts, commit or push.
- At this configuration review, live provider verification awaited separate approval.
  The subsequently approved single generic test is recorded above. Production still
  requires a verified sender domain and a reachable HTTPS application origin.

## Authentication Stage 5 — 27 November 2026

- Implemented family-scoped Admin invitation creation/listing, token verification,
  transactional Member registration, revocation and fresh-token resend. Registration
  uses invitation-owned email/family, the existing Argon2id policy, verified email
  timestamps and no automatic session. Concurrent acceptance/revoke/resend and
  duplicate-account rollback are tested against isolated MongoDB replica sets.
- Tokens are opaque 32-byte values stored only as SHA-256 hashes and expire after
  exactly 72 hours. A partial unique pending-recipient index arbitrates issuance;
  a 60-second cooldown and three sends per family/recipient/day survive rotation.
  Retention is 90 days after expiry, with an explicit development-only preparation
  CLI. Login readiness is independent of invitation migration; HTTP never runs DDL.
- Added protected `/admin/invitations`, an Admin invite dialog for Member access and a public
  `/accept-invitation` flow with valid/invalid/expired/consumed/revoked states. The
  browser removes URL fragments and retains tokens only in memory. Added one
  verified-Admin workspace link. Existing Landing/Login designs are preserved.
- Reused the approved Stitch invitation references with existing branding, fonts,
  palette and themes, removing prototype controls, false security/trading claims,
  role selection and conflicting expiry/password rules. API/database amendments
  and the approved synchronous-email/outbox exception are recorded in
  `docs/adr/0001-family-invitations.md`; the four baseline specifications remain intact.
- Resend uses server-only optional configuration, a verified sender and WEB_ORIGIN.
  Provider acceptance is distinguished from delivery failure/uncertainty. Bounded
  retries reuse provider idempotency keys; no recoverable token/email body is stored.
  Missing mail configuration does not break health/login. Automated email is mocked.
- Verification passed on 27 November 2026: workspace typecheck, zero-warning lint,
  227 tests across 32 files, root production build, and all 52 compiled-app browser
  checks on isolated ports 3001/4001. Two additional targeted dialog checks passed
  after expanding both-theme visual coverage. Final tool/test TypeScript checking
  also passed. Reviewed acceptance and invitation dialog screenshots at
  360/390/768/1440px; automatic overflow checks passed in light/dark themes.
- Fixed an older test's expiry-TTL expectation, same-page invitation-fragment
  re-verification and stale asynchronous response handling. Added a regression
  test. Expanded E2E traffic initially shared an IP rate budget; test-only cookie
  partitions now use prebuilt application instances. Production limits are unchanged,
  and the rate-limiter construction warning is resolved. Earlier browser failures
  are superseded by the successful full and targeted reruns.
- Ran explicit development index preparation after reviewing a dry run showing the
  expected legacy TTL and zero duplicate active invitations. Apply succeeded and
  verified the required indexes; a post-apply read-only report showed no legacy
  expiry index and zero duplicate groups. This operation targets only
  advanced_darvas_dev; it creates no users or emails. Automated tests remained on
  disposable databases, with synthetic credentials and mocked email delivery.
- No real email or live Admin credential was used; no development account was
  created, and no commit/push/deployment occurred. User development applications
  remain running on 3000/4000 (both HTTP checks returned 200); test servers stopped.
  Live Resend/domain verification, reachable HTTPS invitation links, production
  proxy/TLS hardening and a durable outbox remain pending. Synchronous delivery
  and its explicit retry limitations are documented in the approved amendment.

## Authentication Stage 4 — 27 November 2026

- Centralized `requireAuthenticated`, `requireActiveAccount` and `requireAdmin`
  reuse the existing MongoDB session lookup, including expiry/revocation and active
  User/Family validation. Only middleware-established response-scoped identity
  grants access; client body/query/header identity and response-local lookalikes
  are ignored. Current database roles apply to each protected backend request.
- Ownership helpers require session-derived owner scopes and server-loaded
  metadata, with family checks where available. Admin has no private ownership
  bypass. Invalid authentication returns 401, role denial 403, and inaccessible
  private resources 404 per API Design. No portfolio or other business API exists.
- `/dashboard` calls a reusable server-side guard, retains dynamic/no-store
  validation and unavailable-service feedback, and displays the verified name and
  role with the existing Logout, brand and theme controls. Public Landing/Login
  visuals and authenticated `/login` redirects are preserved. No full navigation
  shell or broken Admin links were added.
- Cookie parsing is application-wide; centralized errors support authorization
  outside `/auth/*` without changing the health contract. Test-only routes live
  outside production composition/builds, with disposable synthetic identities,
  cookie-only test sessions and isolated resource fixtures. No Atlas connection,
  real Admin credential use, dependency/schema/index change, commit or push.
- Verification passed on 27 November 2026: workspace typecheck, zero-warning lint,
  all 183 tests across 26 files, production build, and all 40 compiled-app Chromium
  checks using disposable MongoDB and default local ports 3000/4000. Targeted lint
  also passed after simplifying error handling. Security tests cover all requested
  scenarios, current-role changes, middleware-order failure and absence of fixture
  routes from production application composition.
- Browser checks cover both roles, invalid sessions and logout, no-JavaScript
  server protection, private response no-store headers, and existing public-page
  regressions. Inspected workspace screenshots at 360/390/768/1440px across light
  and dark themes; automated overflow checks passed at each size. Workspace
  formatting and whitespace checks passed. Test-owned HTTP/MongoDB processes
  stopped; the pre-existing MongoDB process was preserved. Restored the generated
  Next type-reference file to its original development form. Production proxy/TLS
  deployment remains unverified. Older 26 November results below are historical.
  No remote CI result is claimed.

## Authenticated login-route redirect — 26 November 2026

- The `/login` Server Component now verifies the incoming session through the
  existing no-store `/auth/me` helper and redirects authenticated visitors to
  `/dashboard` before rendering the form. It is explicitly dynamic; cookie
  presence alone does not grant authentication or trigger a redirect. Anonymous,
  invalid/revoked and unavailable-validation cases retain the public login form.
- Kept the approved Login Page components and visual styles unchanged. Extended
  the real-session browser regression to cover direct `/login` navigation, the
  landing Sign In link, JavaScript-disabled authenticated navigation, and replayed
  revoked cookies without a redirect loop. Existing logout behavior is preserved.
- Typecheck, zero-warning lint, all 149 tests across 22 files, production build,
  formatting and whitespace checks passed. All 24 compiled-app browser checks passed
  on isolated ports 3001/4001, including the new authenticated redirect scenarios in
  both desktop and mobile projects. `/login` is now dynamic; `/` remains static.
  Documentation records this behavior; older static-login results below are historical.
- Two initial build attempts failed removing a read-only OneDrive generated Next
  manifest directory. Removed only that verified ignored production artifact;
  the subsequent root build and browser-run production rebuild passed. Development
  output and user processes were preserved. Test-owned servers were stopped.
- No backend endpoints, models, credentials, dependencies, approved specifications,
  commits or pushes were changed by this follow-up. Tests use isolated synthetic
  accounts, not the real Admin or development database.

## Production browser-test origin fix — 26 November 2026

- Fixed the reviewed alternate-port isolation issue: production Playwright startup
  now builds Next under the selected `API_INTERNAL_ORIGIN` before starting it under
  the same environment. Compiled rewrites and server-side session reads therefore
  use the same disposable backend. Production startup allows three minutes for the
  build; development startup retains its existing timeout and behavior.
- Reran workspace typecheck, zero-warning lint and all 149 tests across 22 files:
  passed. Ran `pnpm test:e2e --workers=2` with `E2E_PRODUCTION=1`, web port 3001 and
  API port 4001: all 24 desktop/mobile checks passed, including real fixture login
  and logout. The runner rebuilt shared packages, Express and the production
  frontend; a separate root `pnpm build` was not rerun for this configuration fix.
- Inspected the generated routes manifest and confirmed `/api/v1/*` rewrites to
  port 4001. The existing development applications on 3000/4000 were not stopped.
  Test-owned alternate-port servers were cleaned up. Formatting and whitespace
  checks passed. Documentation now explains build-time origins and rebuilding
  normal production artifacts after a custom-port browser run.
- Only Playwright configuration and workflow/status documentation changed in this
  follow-up. Application behavior, dependencies, environment credentials and four
  approved specifications were preserved. Prior uncommitted work remains intact;
  no commit, push, Atlas login or real-account test was performed.

## Prior Authentication Stage 3 — 26 November 2026

- User confirmed the first Family/Admin was created with the CLI after Stage 2.
  This is user-reported state, not a new database inspection. Stage 3 tests never
  use the real Admin password, development database, or that account.
- Implemented POST `/api/v1/auth/login`, GET `/api/v1/auth/me`, POST
  `/api/v1/auth/logout`, and approved support GET `/api/v1/auth/csrf`. New auth
  envelopes follow the API Design's `{data}`/`{error}` format; legacy health stays
  unchanged. Input is Zod-validated and normalized, password verification reuses
  Argon2id with comparable unknown-account work, and disabled User/Family responses
  do not enumerate account state. Bootstrap email verification is not required.
- Sessions use opaque 32-byte tokens, SHA-256 hashes only in MongoDB, active
  membership checks, explicit expiry/revocation and login rotation. Eight-hour
  absolute normal lifetime; Remember Me uses seven days and a persistent cookie.
  Cookies are HttpOnly, SameSite=Lax, Path=/, host-only; production uses Secure and
  `__Host-` names. Logout revokes before clearing cookies/reporting completion.
- Signed double-submit CSRF binds to an anonymous nonce before login and the session
  hash afterward. Mutations require exact Origin plus X-CSRF-Token. Production auth
  requires HTTPS WEB_ORIGIN and stable server-only CSRF_SECRET. Local development
  can use an ephemeral key. Auth endpoints and protected reads are no-store.
- Login has process-local account/transport-IP limits. Forwarded IPs are not trusted
  automatically. Auth connects lazily using existing backend configuration and verifies
  indexes read-only; missing config/storage fails closed. No HTTP DDL is performed.
  Owned connections close on shutdown. Added cookie-parser, csrf-csrf and cookie
  parser types with exact pins and lockfile updates; no competing auth framework.
- The existing form preserves styling, layout, theme controls and local validation;
  submits through the unchanged Next rewrite, confirms authentication, and navigates
  to a minimal Server Component `/dashboard` shell. Server-side session validation
  gates that page; logout is functional. No trading screens or services were added.
- Final checks passed on 26 November 2026: workspace typecheck, zero-warning ESLint,
  149 tests across 22 files (including 23 Stage 3 HTTP integration cases and lazy
  runtime/read-only readiness tests), production build, formatting and whitespace
  checks. `/` and `/login` remain static; `/dashboard` is dynamic and authenticated.
  First HTTP test failures came from constructing POST requests
  before the test agent obtained CSRF cookies; corrected that ordering. Type checks
  found a test model-union call and missing ESM extension; corrected both.
- First Playwright run had four request-level passes; Chromium was absent from its
  default cache. Reused existing ignored local browser cache. The next run passed
  20 browser checks, including real desktop/mobile login/logout; four failures were
  obsolete UI-only expectations or an ambiguous Next route-announcer selector.
  Corrected those tests; final compiled-app Chromium run passed all 24 checks across
  desktop/mobile, including real login/logout through Next, cookie forwarding,
  revocation replay, protected navigation, keyboard focus, light/dark/system themes,
  branding and no-overflow checks. Screenshots reviewed at 1440px dark, 768px dark,
  390px light and 360px light; automation covers both themes at all these widths.
- Test databases are generated and loopback-only on a disposable replica set;
  Playwright seeds a synthetic Admin and never loads app `.env`. Compiled-app browser
  checks use compiled Express/Next with HTTP test cookies; HTTPS production cookie
  attributes are verified separately. No real Admin credentials, account/session
  writes in Atlas, production connection, approved specification edits, commit or
  push are part of this task. Prior milestone results below remain historical.
  Test-owned servers/connections were stopped, ports 3000/4000 left unused, and an
  unrelated pre-existing MongoDB process preserved. No remote CI or cloud HTTPS
  deployment was verified. Firefox, Safari and real-device testing were not run.

## Prior Authentication Stage 2 — 26 November 2026

- Added connection-scoped identity models and explicit index preparation. User email
  is globally unique after trim/lowercase normalization; roles are ADMIN/MEMBER and
  account states ACTIVE/DISABLED per the approved request, superseding the older
  INVITED user state. Family retains baseline creator/status fields and uses its
  ObjectId as the unique workspace identifier. Display name is required.
- Password/token hashes are excluded from default queries and document serialization;
  `toPublicUser` applies an explicit DTO allowlist for selected/lean records. Sessions
  and invitations have unique hash indexes and expiry TTL indexes plus synchronous
  validity helpers. No session or invitation workflow is connected.
- `pnpm admin:bootstrap` builds the API dependency graph and loads the existing
  backend environment file. It requires development mode and target, an interactive
  terminal and hidden matching password entries, rejects arguments/production,
  prepares identity DDL explicitly, and writes the first Family/Admin transactionally.
  A permanent unique Family marker arbitrates concurrent attempts. Existing identity
  data, missing indexes or unavailable transactions fail closed. Email verification
  remains unset. Errors are sanitized and owned connections close.
- Added Argon2id (64 MiB, three passes, parallelism one, random salt), hidden Inquirer
  prompts, and a disposable MongoDB replica-set test harness. Manifests and pnpm
  lockfile changed together; only Argon2's reviewed native install step was added to
  the build allowlist. `db:ping` now builds its contracts dependency too. No global
  tools were changed.
- Eight real MongoDB integration cases passed, including four concurrent bootstrap
  attempts yielding exactly one linked Family/Admin, rollback after User-write
  failure followed by safe retry, global email uniqueness, token uniqueness and
  missing-index refusal. Final checks passed: workspace typecheck, ESLint with no
  warnings, 116 tests across 19 files (including all eight integration cases),
  production build, formatting and whitespace diff checks. Public pages remain
  static. Playwright was not rerun because no UI, proxy or theme behavior changed;
  earlier browser evidence remains explicitly historical. Remote CI was not run.
- Earlier checks exposed a connection-model identity issue and two strict typing
  issues; corrected them. The first full test run had 105 passing tests, the old
  model assertion failure, and eight integration cases skipped because the initial
  Windows binary download exceeded the three-minute hook timeout. Increased the
  bounded first-run timeout to ten minutes; the isolated integration retry and final
  full suite passed. A later test-only lint import issue was fixed before the final
  clean lint run.
- Integration tests use generated test database names on a test-owned loopback
  MongoDB 8.2.6 replica set, never the application environment file or Atlas. Only
  synthetic test records were written. No actual development/production account,
  collection or index was provisioned during this milestone. No approved
  specification, public page, backend HTTP behavior, commit or push was changed.
  Test-owned MongoDB processes were stopped; an unrelated existing process was
  preserved. Environment files were not edited and the local API environment remains
  ignored/untracked. The root `admin:bootstrap` command was not invoked against Atlas.

## Prior MongoDB diagnostic verification — 26 November 2026

- Sanitized `apps/api/.env.example`: its MongoDB password and hostname are placeholders;
  the requested database is `advanced_darvas_dev`. The credential-bearing local
  example edit was never staged or committed.
- Preserved the existing connection value in ignored `apps/api/.env`, normalized
  the URI database path, and set `MONGODB_DB_NAME=advanced_darvas_dev`. Existing
  Node/tsx environment-file loading conventions remain in use. No credentials or
  complete URI are stored in this status record.
- Added `pnpm db:ping`, which builds the existing database package and reuses its
  configuration, connection, and shutdown utilities. It rejects unsupported modes,
  placeholders, invalid URIs, and database mismatches before connecting; sends only
  `{ ping: 1 }` with a command timeout; and closes the owned connection.
- **Latest live result: passed.** On the latest user-requested retry on 26 November
  2026, `pnpm db:ping` exited successfully against `advanced_darvas_dev`. The check
  closed its owned connection after `{ ping: 1 }`. No database writes or environment
  edits were performed. Only this status record changed; application checks were
  not rerun for this retry. Status formatting and whitespace checks passed.
- **Earlier attempts: failed, including the first local credential-update retry.**
  The ordinary command returned a sanitized failure.
  A guarded diagnostic retry identified **AUTHENTICATION_FAILED**. A read-only DNS
  check confirmed Atlas supplies the expected admin authentication source.
  The latest successful retry above supersedes this connectivity blocker.
- The user previously confirmed a local credential update. `pnpm db:ping` and a guarded
  diagnostic retry still failed with `AUTHENTICATION_FAILED`. Safe checks confirmed
  that the URI and database name match the development target, the loaded values
  match the local file, the expected development username is present, and Atlas DNS
  supplies the admin authentication source. No raw error, hostname, or credential
  was printed. Local password and URI-encoding verification was recommended at
  that point. This task did not rotate Atlas credentials.
  Do not put real values back into the tracked example or paste them into chat.
- No database records, collections, indexes, users, or accounts were created,
  modified, or deleted. Application startup still does not connect automatically.
- Checks actually run: targeted database tests passed (20 tests); full Vitest suite
  passed (56 tests across 10 files); root typecheck, ESLint, and production build
  passed, as did formatting and whitespace diff checks. An initial type-only import lint error in the new test was corrected and
  ESLint reran successfully.
- Playwright was not rerun for this CLI/configuration change. The prior login UI
  browser results below remain historical evidence, not a new browser run.
- The Landing Page, Login Page, four approved specifications, backend request
  handling, dependency graph, and lockfile are unchanged. No packages were installed,
  no application server was started/stopped, and no commit or push was performed.

The first credential-update follow-up reran the guarded ping and sanitized diagnostics
only; application code was unchanged and the earlier 56-test/typecheck/lint/build
results above were not rerun for that follow-up.

The earlier approved configuration review on **26 November 2026** restored MongoDB
placeholders in the tracked example again and preserved the current local `.env`
byte-for-byte. Verified that the local file is Git-ignored and untracked, and both
database settings target `advanced_darvas_dev`. Reused the existing `pnpm db:ping`;
no duplicate command or dependency was added. The live command failed and a sanitized
diagnostic confirmed `AUTHENTICATION_FAILED`; connectivity was blocked at that time.
Workspace typecheck and all 20 database tests across two files passed on
this review. Formatting and whitespace checks also passed. Full application tests,
lint, build, and browser tests were not rerun for this example/status-only follow-up;
their earlier results above remain historical. No data writes, UI/specification
changes, commits, or pushes were performed.

## Prior login application verification

Verified on **26 November 2026 (Asia/Kolkata)** for the login UI milestone:

| Check                                                                  | Outcome                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                       | Passed                                                                                                                                                                                             |
| `pnpm lint`                                                            | Passed                                                                                                                                                                                             |
| `pnpm test --maxWorkers=2`                                             | Passed: 38 tests across 9 files                                                                                                                                                                    |
| `pnpm build`                                                           | Passed; `/` and `/login` prerendered as static content                                                                                                                                             |
| `pnpm format:check`                                                    | Passed                                                                                                                                                                                             |
| `pnpm test:e2e` with isolated QA config, 2 workers, `E2E_PRODUCTION=1` | Passed: 20 Chromium checks across desktop/mobile projects; temporary isolated QA configuration                                                                                                     |
| Responsive checks                                                      | No page overflow at 320, 360, 390, 768, 1024, or 1440px; preview hidden below 1024px                                                                                                               |
| Interaction checks                                                     | Empty/invalid-email/missing-password validation, preserved values, password visibility, Remember Me, keyboard/Enter submission, recovery availability, home links, and landing navigation          |
| Appearance/accessibility                                               | Light/dark/system themes and persistence, keyboard focus/error associations; light/dark screenshots reviewed at 1440, 768, 390, and 360px; input boundary contrast at least 3:1 against field/card |
| Privacy checks                                                         | No credential API/external requests, browser-storage writes of credentials, session cookies, or fake authenticated redirect; controls disabled without JavaScript                                  |
| Regression/integrity                                                   | Landing tests and API proxy smoke checks passed; four approved specification hashes unchanged; dependencies, backend, and shared packages unchanged                                                |

During the earlier implementation, the initial server-HTML assertion and browser
notice selector needed corrections.
Final assertions pass. A later unconstrained test-script rerun encountered a Windows
`EBUSY` lock while reading an Undici dependency; the two-worker rerun above passed
without changing dependencies or test configuration.

Historical landing delivery on the same date passed 31 tests and 8 browser checks.
The latest milestone expands that coverage; no remote CI result has been verified.
CI runs on `main` pushes and pull requests, not a direct `dev` push.

## Login QA review — 26 November 2026

- Compared the retrieved approved Stitch desktop/mobile screenshots with the actual
  login page and existing landing design. Layout/copy follow the approved references;
  shared logo, fonts, palette, borders, and spacing remain consistent. Stitch has no
  separate light login reference; light mode retains the existing public palette.
- Found low-contrast input boundaries: approximately 1.17:1 in light mode and 1.50:1
  in dark mode against the field background. Fixed only the login input border using
  a blend of existing theme colors. Browser regression checks now require at least
  3:1 contrast against both the input fill and surrounding card in both themes.
- Added a missing-password unit case and browser checks for the complete keyboard
  flow, visible input/button focus, branding equality, and rendered border contrast.
  Screenshot coverage now explicitly includes 1440, 768, 390, and 360px in both themes.
- Browser tests now derive their origin from Playwright's configured base URL.
  This allowed isolated compiled-app QA on port 3001 without stopping the user's
  existing frontend on 3000. The initial temporary configuration inherited port
  3000; corrected the override and reran successfully. Persistent configuration and
  application ports remain unchanged.
- Final checks: typecheck, lint, 38 tests, production build, and 20 production
  Chromium browser checks passed. Formatting and whitespace diff checks also passed.
- No fake auth, credential storage/transmission, session cookie, broken recovery
  link, or nonexistent auth-service call was observed. Recovery remains disabled,
  Remember Me is UI state only, and valid submit gives the availability message.
- Verification uses Chromium desktop/mobile emulation. No Safari/Firefox or actual
  screen-reader session was exercised. Authentication remains intentionally absent.
- This review changed only login styling, relevant tests, and this tracker. Landing
  components, approved specifications, backend, dependencies, and shared packages
  were preserved; no commit or push.

## Latest Git delivery — 26 November 2026

Authentication models, the secure first-Admin CLI, read-only Atlas ping utility,
real login/session/logout, and the authenticated login redirect were committed as
`8adda68` and pushed to `origin/dev`. GitHub's remote branch hash matched the local
commit. The delivery includes the production E2E origin and alternate-port fixes.

All 69 staged files were reviewed; credential scans, formatting, and staged
whitespace checks passed during delivery. Actual environment files and generated
artifacts were excluded. The four approved specifications and `main` were unchanged.
The earlier 26 November verification remains the application evidence: 149 tests,
24 compiled browser checks, typecheck, lint, and production build passed. Application
checks were not rerun for this Git-only delivery. No remote CI result is claimed;
the current workflow does not run on a direct `dev` push. No deployment was performed.

## Prior login Git delivery — 26 November 2026

The reviewed login milestone was committed as `fb7995c` and pushed to
`origin/dev`. GitHub's remote branch hash matched the local application commit.
Delivery preparation verified formatting, whitespace, staged paths, and credential
patterns across the 19 milestone files. Approved specifications, dependencies,
backend, shared packages, and `main` were preserved. Ignored local tools, actual
environment files, build output, and browser reports were excluded.

Application code was unchanged during this Git delivery task, so application tests
were not rerun solely for committing and pushing. The latest verified results remain
38 tests and 20 production browser checks. A `dev` push does not trigger the current
CI workflow; no remote CI success is claimed. This documentation update records the
verified application delivery.

## Documentation maintenance history

On **26 November 2026**, added this tracker, required same-task status updates in
`AGENTS.md`, and included only this living document in formatting checks under
`docs/`. Markdown formatting and `git diff --check` passed. The four specification
hashes remained unchanged. Application tests were not rerun for this documentation-only
update; their most recent verified results are recorded above.

The subsequent Git delivery task reran the formatting check and reviewed staged
paths, whitespace, and credential patterns. The landing-page source was unchanged;
application tests were not rerun solely for committing and pushing this work.

## Repository and delivery snapshot

- Working branch: `dev`, tracking `origin/dev`.
- Last committed scaffold milestone: `68718ae` — `chore: scaffold Phase 1 pnpm monorepo`.
  That scaffold commit was pushed to `origin/dev`; `main` was left unchanged.
- Landing-page work, licensed fonts, the agent guide, and the initial status tracker
  were committed and pushed to `origin/dev` in `aaebdce` — `feat: add approved Stitch
landing page and project guidance`. The remote branch hash was verified after
  the push. Later documentation-only commits may update this delivery record.
- Login UI and accessibility QA were committed and pushed to `origin/dev` in
  `fb7995c` — `feat: implement themed login UI and accessibility QA`. The remote
  branch hash was verified after the push; `main` was left unchanged.
- No cloud deployment is configured or published.
- Authentication and database milestones, including the authenticated login redirect,
  were committed and pushed to `origin/dev` in `8adda68`; the remote hash was verified.
- The QA production servers on 3001/4000 were task-owned and stopped after review.
  A pre-existing frontend on 3000 was preserved; recheck before reporting its status.
- The configured Stitch connection was verified for read access to the approved
  designs. Credentials are user-level configuration, not repository content.

## Local development

Use Node.js **26.13.1** and pnpm **12.23.0**, as pinned in the repository. See
[README.md](../README.md) for setup and environment-file instructions.

```powershell
pnpm dev:web
# Public landing page: http://localhost:3000
# Login UI: http://localhost:3000/login
```

Use `pnpm dev` for both applications, or `pnpm dev:api` for Express on port 4000.
The public pages and health endpoint do not require MongoDB or future feature
secrets. Local ignored tools are optional; fresh clones should follow the README.

## Pending implementation

| Area                        | State                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite-only authentication  | Login/session/logout/CSRF, authorization and invitations implemented; recovery and actual business APIs remain pending                                                       |
| Persistence                 | Identity and market/import models implemented; market preparation/reference loading not performed against Atlas in Phase 8B; business-resource persistence pending           |
| Market-data imports         | Contracts/models/index preparation and bounded CSV/XLSX parsing implemented; preview/commit APIs, persistence, runner, reference/calendar seeds and import UI remain pending |
| Screening and strategies    | No DMA/CAR/Darvas/suitability algorithms, eligibility calculations, or golden parity tests                                                                                   |
| Private application screens | Authenticated shell and unavailable-state Dashboard UI complete; live Dashboard data, screener, watchlists, stock detail, portfolio and trades pending                       |
| Portfolio accounting        | No confirmed trade recording, positions, targets, allocation ledger, or corrections                                                                                          |
| Notifications               | Invitation-only synchronous Resend adapter implemented; trading notifications, durable outbox and scheduled digest remain pending                                            |
| Operations                  | No Vercel/Render deployment, production configuration, backup/restore verification, or operational monitoring                                                                |
| Later research              | Backtests and strategy comparisons remain deferred                                                                                                                           |

Live market-data feeds and broker order execution are not part of the current
approved milestone. Do not introduce them implicitly.

## Open decisions and risks

- Development Atlas connectivity was verified by ping; the user subsequently
  confirmed successful workspace/Admin bootstrap. Stages 3/4 use isolated tests only. Rotation of credentials
  previously exposed in the example/output has not been independently confirmed;
  this task did not change Atlas users or passwords.

- Login/session protection and invitations exist, but password recovery, business-resource tenancy and
  production deployment hardening are incomplete. Do not represent this release as
  a production-ready private trading application. Process-local limits reset on
  restart and can share proxy IPs; Vercel/Render TLS and trust topology remain unverified.
- The database document's stated 25 collections versus its 26-item inventory remains
  inconsistent. Stage 2 adds no collection beyond its four named identity collections;
  the technical bootstrap marker resides on Family.
- Reconcile older PRD partial-exit/cash passages with the later full-position-sale
  and no-shared-cash designs before portfolio implementation.
- Verify CAR anchor ties, source adjustment provenance, decimal rounding/tick-size
  policy, and exceptional sale reconciliation before dependent feature work.
- Referenced LLD, ERD image, and source workbooks/CSV are not supplied. Historical
  algorithm parity cannot be claimed without reviewed source fixtures.
- Review production cookie/proxy behavior, Atlas access, hosting limits, and
  backup/recovery before deployment. The free-hosting budget is a target, not an SLA.

## Recommended next milestone

Agree on Phase 8D preview/persistence boundaries and obtain representative source files
and verified stock/calendar manifests before integrating actual imports. Dashboard
source APIs and production proxy/TLS verification remain separate future work. The development sender is configured;
one approved generic provider test was accepted. Additional sends require approval. Production invitation email
needs a verified sender domain and a reachable HTTPS application origin. This recommendation does not
authorize starting another milestone or deploying the application.

## Recent progress

| Date (Asia/Kolkata) | Update                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25 November 2026    | Monorepo scaffold implemented and verified; `dev` created from `main` and scaffold pushed                                                                                                                                                                                                 |
| 26 November 2026    | Approved Stitch landing page implemented; application checks and 8 browser tests passed                                                                                                                                                                                                   |
| 26 November 2026    | Added this living status record and agent instructions to maintain it with project updates                                                                                                                                                                                                |
| 26 November 2026    | Landing page and project guidance committed and pushed to `origin/dev` in `aaebdce`; `main` left unchanged                                                                                                                                                                                |
| 26 November 2026    | Login UI implemented and verified locally: 37 tests and 16 browser checks passed; no dependencies, commit, or push                                                                                                                                                                        |
| 26 November 2026    | Login QA: fixed input boundary contrast, added missing-password/keyboard/design checks; 38 tests and 20 production browser checks passed                                                                                                                                                  |
| 26 November 2026    | Login milestone committed and pushed to `origin/dev` as `fb7995c`; remote hash verified and `main` unchanged                                                                                                                                                                              |
| 26 November 2026    | Sanitized Atlas example, added guarded read-only db:ping; 56 tests/typecheck/lint/build passed; live ping rejected authentication, credentials pending                                                                                                                                    |
| 26 November 2026    | Retried development ping after confirmed local credential update; Atlas still rejected authentication; safe configuration checks passed                                                                                                                                                   |
| 26 November 2026    | Restored example placeholders while preserving local env; existing ping still fails authentication; workspace typecheck and 20 database tests passed                                                                                                                                      |
| 26 November 2026    | User-requested Atlas retry succeeded with pnpm db:ping against advanced_darvas_dev; connection closed, no database writes or environment edits                                                                                                                                            |
| 26 November 2026    | Authentication Stage 2 models and secure dev bootstrap CLI implemented; 116 tests including atomicity/concurrency passed, typecheck/lint/build verified; no Atlas writes or push                                                                                                          |
| 26 November 2026    | Stage 3 real login/session/logout and protected shell implemented; 149 tests, 24 compiled browser checks, typecheck/lint/build passed; no real-account tests, commit or push                                                                                                              |
| 26 November 2026    | Fixed production E2E build/start origin mismatch; 149 tests and 24 compiled browser checks passed on 3001/4001; development services preserved, no commit or push                                                                                                                         |
| 26 November 2026    | Added server-verified /login redirect for authenticated users; 149 tests and 24 compiled browser checks passed, including no-JS and revoked-cookie regressions; no commit or push                                                                                                         |
| 26 November 2026    | Authentication/database milestones and login redirect committed and pushed to origin/dev as 8adda68; remote hash verified, secret/format/diff checks passed, main unchanged                                                                                                               |
| 27 November 2026    | Stage 4 guards/ownership conventions and verified workspace role completed; 183 tests, 40 compiled browser checks, typecheck/lint/build passed; no Atlas use, commit or push                                                                                                              |
| 27 November 2026    | Stage 5 invitations implemented and verified: 227 tests, 52 compiled browser checks plus two theme checks, typecheck/lint/build passed; development indexes migrated and verified, no real email or accounts created; no commit/push                                                      |
| 27 November 2026    | Resend development sender configured with existing key preserved; 8 mocked email tests and all 232 regression tests passed, typecheck/lint/build passed; backend started and health verified; no real email or Git delivery                                                               |
| 27 November 2026    | Approved single generic Resend test accepted (HTTP 200); one request, zero retries, no database writes or application changes; provider ID recorded above; no further sends, commit or push                                                                                               |
| 27 November 2026    | Stage 5 closeout completed: 237 Vitest tests and 54 compiled browser checks passed, including continuous Admin-created invitation acceptance/login/logout; approved memory-only mock-mail fixture added; no Atlas writes, real email or Git delivery                                      |
| 27 November 2026    | Stage 4/5 and Resend work committed as d6f8346 and pushed to origin/dev; GitHub branch hash verified; reviewed 59 staged paths and secret/whitespace checks passed; main and local environment unchanged; no deployment or remote CI claim                                                |
| 27 November 2026    | Milestone 6 authenticated shell implemented: 250 Vitest tests, 60 full compiled browser checks plus 2 More-sheet Logout checks passed; role-aware navigation, responsive/keyboard/theme checks verified; no backend changes, Atlas writes, real email, commit or push                     |
| 27 November 2026    | Milestone 7A unavailable-state Dashboard UI implemented: 255 Vitest tests across 35 files, 64 compiled Playwright tests, typecheck/lint/build passed; both roles and all requested viewports/themes verified; no APIs, dependencies, Atlas writes, real email or Git delivery             |
| 27 November 2026    | Milestones 6/7A committed as 59e664c and pushed to origin/dev; remote hash verified, 26 staged paths and credential/format/diff checks passed; main unchanged, no deployment or remote CI claim                                                                                           |
| 27 November 2026    | Phase 8B contracts/seven market models, native indexes/validators and explicit dry-run preparation implemented; 308 Vitest tests, 64 compiled regressions, typecheck/lint/build/format/diff passed; no parser/API/UI, Atlas access, seed, dependencies or Git delivery                    |
| 27 November 2026    | Phase 8C bounded CSV/XLSX parsing implemented; 425 Vitest tests (117 new), 64 compiled browser regressions and two compiled parser smoke cases passed; source-worker portability fixed; no Atlas writes, parser routes/persistence, real email or Git delivery                            |
| 27 November 2026    | Phases 8B/8C committed as 1241ebb and pushed to origin/dev; remote hash verified, 49 staged paths passed scope/credential-pattern/format/diff review; implementation's 425 tests and 64 compiled regressions retained as dated evidence; main unchanged, no deployment or remote CI claim |

Keep this history concise. Replace stale current-state statements when work ships;
retain only useful milestone evidence and unresolved decisions. Never record secrets
or claim approval, test success, commits, pushes, or deployments without evidence.

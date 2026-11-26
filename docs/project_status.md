# Advanced Darvas Box — Project Status

- **Last updated:** 26 November 2026 (Asia/Kolkata)
- **Current milestone:** Login UI implemented and QA verified; Git delivery in progress
- **Overall state:** Frontend foundation complete; business features and deployment pending

This is the living implementation-status record. Requirements remain in the four
approved specifications; working conventions remain in [AGENTS.md](../AGENTS.md).
Update this file with each project change. Describe completed work, pending work,
and verification accurately rather than treating planned features as implemented.

## Completed work

| Area                | Current implementation                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo            | pnpm workspaces with `apps/web`, `apps/api`, and four shared packages                                                                               |
| Frontend foundation | Next.js App Router, strict TypeScript, Tailwind, shadcn/ui Button/Card primitives, emerald theme tokens                                             |
| Public landing page | Route `/`, responsive header and mobile menu, approved hero copy, illustrative preview, three feature cards, four-step workflow, educational footer |
| Login UI            | Route `/login`, shared public design system, local form validation, visibility toggle, memory-only Remember Me, disabled recovery, static preview   |
| Appearance          | Light, dark, and system themes with persistence; locally hosted Geist/Inter fonts and licenses                                                      |
| Backend foundation  | Express, Zod environment validation, structured redacted logging, security middleware, request IDs, centralized errors                              |
| Health endpoint     | `GET /api/v1/health`; works without MongoDB                                                                                                         |
| API routing         | Same-origin Next.js rewrite from `/api/v1/*` to the local Express API                                                                               |
| Contracts           | Shared Zod success/error/health contracts and basic validation utilities                                                                            |
| Strategy-core       | Framework-independent boundaries for DMA, CAR, Darvas, suitability, and capital allocation; no trading calculations                                 |
| Database package    | Explicit Mongoose connection/disconnection helpers; no connections at import, models, migrations, or automatic collection/index creation            |
| Test fixtures       | Structure and provenance guidance for future verified golden tests; no fabricated historical market data                                            |
| Quality tooling     | ESLint, Prettier, Vitest, React Testing Library, Supertest, and Playwright                                                                          |
| CI                  | GitHub Actions configured for Linux/Windows checks and Linux Chromium tests; no cloud deployment                                                    |
| Project guidance    | Root `AGENTS.md` and this status tracker                                                                                                            |

## Landing-page decisions and boundaries

- Approved Stitch project: `7871198770128109512`.
- Desktop reference: `c5c59502d9bd43d9a11e909aad659beb`.
- Mobile reference: `56d4657467e44785920baf4d357e8eb9`.
- Exact headline: **Smarter Stock Screening. Disciplined Swing Trading.**
- Supporting copy uses the approved mobile text on every breakpoint.
- Landing Sign In actions now navigate to the UI-only `/login` route.
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
- `/login` is public UI only. The approved split desktop and single-column mobile
  structure uses the landing page's shared brand, Geist/Inter fonts, emerald
  palette, borders, and existing light/dark/system theme infrastructure.
- Stitch supplies dark login references only. Light mode uses the existing public
  palette. Prototype state controls, credentials, recovery/success simulations,
  live-feed indicators, and unsupported financial/security claims were omitted.
- Email and password are required; email format is validated locally. Inline errors
  are associated with their inputs, values survive validation, and the first invalid
  field receives focus. Password visibility and Remember Me are interactive.
- Remember Me is memory-only UI state with an availability explanation. Forgot
  Password is disabled with Coming soon. There is no public signup.
- Valid submission announces: **Sign-in functionality will be available when
  authentication is connected.** There is no request, artificial delay/loading,
  credential storage, session, success claim, or dashboard redirect.
- Native form controls remain disabled until hydration; the no-JavaScript notice
  explains that sign-in is unavailable.
- The desktop panel reuses the landing illustration and fixed stock examples,
  labeled **Illustrative Preview — Not Live Market Data**. DMA/CAR labels and
  weekly trigger values are mock presentation content, not calculations.
- The landing content and layout are preserved; its two Sign In actions now open
  `/login`. No backend, shared-package, dependency, or approved specification changes.

## Latest application verification

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
- Login UI delivery to `origin/dev` is authorized and being prepared; push verification is pending.
- No cloud deployment is configured or published.
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

| Area                        | State                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Invite-only authentication  | Not implemented: credentials, invitations, sessions, authorization, and CSRF protection                         |
| Persistence                 | Atlas connectivity not exercised; collections, indexes, migrations, and tenancy adapters not implemented        |
| Market-data imports         | No CSV/XLSX parsing, preview, commit, resumable jobs, revision processing, or trading-session calendar          |
| Screening and strategies    | No DMA/CAR/Darvas/suitability algorithms, eligibility calculations, or golden parity tests                      |
| Private application screens | Dashboard, screener, watchlists, stock detail, portfolio, and trade routes not implemented; `/login` is UI only |
| Portfolio accounting        | No confirmed trade recording, positions, targets, allocation ledger, or corrections                             |
| Notifications               | No delivery, outbox processing, Resend integration, or scheduled digest                                         |
| Operations                  | No Vercel/Render deployment, production configuration, backup/restore verification, or operational monitoring   |
| Later research              | Backtests and strategy comparisons remain deferred                                                              |

Live market-data feeds and broker order execution are not part of the current
approved milestone. Do not introduce them implicitly.

## Open decisions and risks

- Authentication is not an existing security boundary; this release must not be
  represented as a production-ready private trading application.
- Resolve the database document's stated 25 collections versus its 26-item
  inventory before creating models.
- Reconcile older PRD partial-exit/cash passages with the later full-position-sale
  and no-shared-cash designs before portfolio implementation.
- Verify CAR anchor ties, source adjustment provenance, decimal rounding/tick-size
  policy, and exceptional sale reconciliation before dependent feature work.
- Referenced LLD, ERD image, and source workbooks/CSV are not supplied. Historical
  algorithm parity cannot be claimed without reviewed source fixtures.
- Review production cookie/proxy behavior, Atlas access, hosting limits, and
  backup/recovery before deployment. The free-hosting budget is a target, not an SLA.

## Recommended next milestone

Agree on the next implementation scope. The current recommendation is invite-only
authentication and tenancy: invitation UI, secure session lifecycle,
ownership boundaries, CSRF strategy, and corresponding tests. This recommendation
does not authorize starting that work.

## Recent progress

| Date (Asia/Kolkata) | Update                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 25 November 2026    | Monorepo scaffold implemented and verified; `dev` created from `main` and scaffold pushed                                                |
| 26 November 2026    | Approved Stitch landing page implemented; application checks and 8 browser tests passed                                                  |
| 26 November 2026    | Added this living status record and agent instructions to maintain it with project updates                                               |
| 26 November 2026    | Landing page and project guidance committed and pushed to `origin/dev` in `aaebdce`; `main` left unchanged                               |
| 26 November 2026    | Login UI implemented and verified locally: 37 tests and 16 browser checks passed; no dependencies, commit, or push                       |
| 26 November 2026    | Login QA: fixed input boundary contrast, added missing-password/keyboard/design checks; 38 tests and 20 production browser checks passed |

Keep this history concise. Replace stale current-state statements when work ships;
retain only useful milestone evidence and unresolved decisions. Never record secrets
or claim approval, test success, commits, pushes, or deployments without evidence.

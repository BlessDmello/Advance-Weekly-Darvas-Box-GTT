# Advanced Darvas Box — Project Status

- **Last updated:** 26 November 2026 (Asia/Kolkata)
- **Current milestone:** Public landing page implemented, verified, and delivered to `dev`
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
- Sign In is disabled with a visible **Coming soon** label. `/login` does not exist.
- The mock illustration is labeled **Illustrative Preview — Not Live Market Data**.
  Its values are presentation examples, not current prices, calculated signals,
  performance results, or verified historical fixtures.
- The landing page makes no runtime API or market-data requests. Its sections are
  Server Components; theme interaction reuses the existing client components.
- No login/dashboard routes, business APIs, trading calculations, or dependencies
  were added for this milestone. The older scaffold dashboard component remains
  in the codebase but is not routed from `/`.
- The four approved files under `docs/` remain byte-for-byte unchanged.

## Latest application verification

These results are from the landing-page implementation on **26 November 2026**.
They are historical verification evidence, not a claim that the checks rerun
automatically after every documentation edit.

| Check                     | Last verified outcome                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`          | Passed                                                                                                                                         |
| `pnpm lint`               | Passed                                                                                                                                         |
| `pnpm test`               | Passed: 31 tests across 8 files                                                                                                                |
| `pnpm build`              | Passed; `/` prerendered as static content                                                                                                      |
| `pnpm format:check`       | Passed                                                                                                                                         |
| `pnpm test:e2e`           | Passed: 8 Chromium tests against compiled applications                                                                                         |
| Responsive browser checks | No page-level overflow at 320, 390, 768, 1024, or 1440px                                                                                       |
| Interaction checks        | Keyboard skip link, section anchors, mobile menu, disabled Sign In, and persistent light/dark/system themes verified                           |
| Network checks            | Zero runtime API or external data requests from the landing page; separate API proxy test passed                                               |
| Visual review             | Desktop light/dark, mobile light, and tablet light screenshots reviewed; browser tests also verified mobile themes                             |
| Scope/integrity checks    | Specifications, dependencies, backend, and shared packages unchanged by the landing milestone; no credential patterns found in changed sources |

GitHub Actions is configured, but no remote CI result has been verified in this
session. The workflow currently triggers on pushes to `main` and on pull requests;
a direct push to `dev` alone does not trigger it.

## Latest documentation maintenance

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
- No cloud deployment is configured or published.
- At the most recent runtime check, verification servers were stopped and ports
  3000/4000 were free. Recheck before reporting the application as running.
- The configured Stitch connection was verified for read access to the approved
  designs. Credentials are user-level configuration, not repository content.

## Local development

Use Node.js **26.13.1** and pnpm **12.23.0**, as pinned in the repository. See
[README.md](../README.md) for setup and environment-file instructions.

```powershell
pnpm dev:web
# Public landing page: http://localhost:3000
```

Use `pnpm dev` for both applications, or `pnpm dev:api` for Express on port 4000.
The landing page and health endpoint do not require MongoDB or future feature
secrets. Local ignored tools are optional; fresh clones should follow the README.

## Pending implementation

| Area                        | State                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Invite-only authentication  | Not implemented: credentials, invitations, sessions, authorization, and CSRF protection                       |
| Persistence                 | Atlas connectivity not exercised; collections, indexes, migrations, and tenancy adapters not implemented      |
| Market-data imports         | No CSV/XLSX parsing, preview, commit, resumable jobs, revision processing, or trading-session calendar        |
| Screening and strategies    | No DMA/CAR/Darvas/suitability algorithms, eligibility calculations, or golden parity tests                    |
| Private application screens | Login, dashboard, screener, watchlists, stock detail, portfolio, and trade routes not implemented             |
| Portfolio accounting        | No confirmed trade recording, positions, targets, allocation ledger, or corrections                           |
| Notifications               | No delivery, outbox processing, Resend integration, or scheduled digest                                       |
| Operations                  | No Vercel/Render deployment, production configuration, backup/restore verification, or operational monitoring |
| Later research              | Backtests and strategy comparisons remain deferred                                                            |

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
authentication and tenancy: approved login/invitation UI, secure session lifecycle,
ownership boundaries, CSRF strategy, and corresponding tests. This recommendation
does not authorize starting that work.

## Recent progress

| Date (Asia/Kolkata) | Update                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| 25 November 2026    | Monorepo scaffold implemented and verified; `dev` created from `main` and scaffold pushed                  |
| 26 November 2026    | Approved Stitch landing page implemented; application checks and 8 browser tests passed                    |
| 26 November 2026    | Added this living status record and agent instructions to maintain it with project updates                 |
| 26 November 2026    | Landing page and project guidance committed and pushed to `origin/dev` in `aaebdce`; `main` left unchanged |

Keep this history concise. Replace stale current-state statements when work ships;
retain only useful milestone evidence and unresolved decisions. Never record secrets
or claim approval, test success, commits, pushes, or deployments without evidence.

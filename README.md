# Advanced Darvas Box

A private, invite-only NSE stock analysis and manual swing-trading workspace.
Phase 1 establishes a pnpm monorepo, a responsive themed frontend, an Express health
API, shared package boundaries, and a tested development toolchain. Email/password
login, MongoDB sessions, logout and a minimal protected workspace are implemented.
Invitation workflows and trading features remain deferred. This is not a
production-ready trading application.

## Prerequisites

- Windows with PowerShell and VS Code, or another supported Node.js development OS.
- Node.js **26.13.1 LTS** (see `.node-version`; package engines restrict the major).
- pnpm **12.23.0**, pinned by `packageManager`.
- Git. Docker and WSL are not required.

For an existing nvm-windows installation:

```powershell
nvm install 26.13.1
nvm use 26.13.1
node --version
npm install --global pnpm@12.23.0
pnpm --version
```

Alternatively install Node from its official Windows installer, then install the
pinned pnpm version with the npm command above. Do not rely on bundled Corepack.
Node selection is a machine setup step; repository scripts never change it.

TypeScript is deliberately pinned to **6.0.3** because typescript-eslint 8 currently
supports TypeScript below 6.1. ESLint **9.39.5** satisfies the React and accessibility
plugin peers used by Next.js. Do not independently upgrade these to TypeScript 7 or
ESLint 10 until the full toolchain supports them.

## Install and configure

Run from the repository root:

```powershell
pnpm install
Copy-Item -LiteralPath apps/web/.env.example -Destination apps/web/.env.local
Copy-Item -LiteralPath apps/api/.env.example -Destination apps/api/.env
pnpm dev
```

The provided defaults also work without creating environment files. Never overwrite
an existing local environment file when following these instructions. All actual
`.env` files and `.env.local` files are ignored; only examples are tracked.

- Frontend: <http://localhost:3000>
- Backend: <http://127.0.0.1:4000>
- Direct health: <http://127.0.0.1:4000/api/v1/health>
- Proxied health: <http://localhost:3000/api/v1/health>

Both development servers bind to the local loopback interface. Keep ports 3000 and
4000 available. Stop the workspace with Ctrl+C. `pnpm dev` first builds shared
packages, then watches their output while running Next.js and Express. Changes to
compiled shared packages are included in the API watcher. Restart Next.js after
changing environment variables or rewrite configuration.

The placeholder labels unfinished features as coming soon. There are no live market
prices, fabricated portfolios, broker integrations, or automatic transactions.

## Commands

| Command                | Operation                                                                       |
| ---------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`             | Build packages once, then watch packages and run both apps                      |
| `pnpm dev:web`         | Build packages and run Next.js on port 3000                                     |
| `pnpm dev:api`         | Build packages and run Express on port 4000                                     |
| `pnpm build`           | Build the workspace in dependency order                                         |
| `pnpm typecheck`       | Build declarations, generate Next types, check all source and test/config files |
| `pnpm admin:bootstrap` | Create the initial development Family/Admin interactively, once                 |
| `pnpm lint`            | Run ESLint with no warnings allowed                                             |
| `pnpm test`            | Run Vitest unit, component, export, and Supertest API tests                     |
| `pnpm test:watch`      | Run Vitest interactively                                                        |
| `pnpm test:e2e`        | Launch isolated local apps and run desktop/mobile Chromium tests                |
| `pnpm format`          | Format implementation files with Prettier                                       |
| `pnpm format:check`    | Verify formatting without changes                                               |

Install the browser before the first E2E run:

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts and stops its own servers and refuses to reuse unrelated processes
on the configured ports. Stop `pnpm dev` first. To test compiled applications:

```powershell
pnpm build
$env:E2E_PRODUCTION = '1'
pnpm test:e2e
Remove-Item Env:E2E_PRODUCTION
```

To run compiled apps manually, build once, then run each command in a separate terminal:

```powershell
pnpm --filter @darvas/api start
pnpm --filter @darvas/web start
```

## Project structure

```text
apps/
  web/                  Next.js App Router, Tailwind, shadcn/ui, themes
  api/                  Express, environment validation, logging, health
packages/
  contracts/            Browser-safe Zod HTTP schemas and inferred types
  strategy-core/        Pure TypeScript strategy module boundaries only
  database/             Explicit lifecycle, identity/market models, storage preparation
  test-fixtures/        Future golden source manifests and reviewed outputs
tests/e2e/              Real desktop/mobile browser smoke tests
.github/workflows/      Linux and Windows CI, no cloud deployment
.vscode/                Suggested extensions and pnpm tasks
docs/                   Four approved specifications, preserved byte-for-byte
```

Workspace dependencies use `workspace:*` and explicit exports from `dist`. Shared
libraries emit ESM JavaScript and declarations using NodeNext. The frontend uses
Next's bundler resolution. Shared strict compiler settings are in
`tsconfig.base.json`; tests and build output have separate configurations.

The web app depends only on contracts. The API currently uses contracts; future
application services may consume strategy-core and database when needed. Do not
import database, test fixtures, or backend modules into frontend code. Strategy-core
has no framework, database, HTTP, or environment dependency. Future backend domain
modules belong in `apps/api/src/modules`; retain a modular monolith.

shadcn/ui is configured in `apps/web/components.json`. Its Button and Card source
live in `components/ui` and are owned by the application. To add a component later:

```powershell
pnpm --filter @darvas/web exec shadcn add <component>
```

No remote fonts are required for builds. Emerald CSS tokens, dark overrides, and
responsive sidebar/mobile navigation foundations live in the frontend.

## Environment variables

Each app loads its own file; the root `.env.example` is a reference, not an env loader.

| Variable              | Location             | Current requirement                                                                          |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `API_INTERNAL_ORIGIN` | Web `.env.local`     | Defaults to `http://127.0.0.1:4000`; server-only rewrite target                              |
| `NODE_ENV`            | API `.env` / process | `development`, `test`, or `production`                                                       |
| `HOST`                | API `.env`           | Defaults to `127.0.0.1`                                                                      |
| `PORT`                | API `.env`           | Defaults to `4000`                                                                           |
| `WEB_ORIGIN`          | API `.env`           | Defaults to `http://localhost:3000`; reserved for future origin/CSRF policy                  |
| `LOG_LEVEL`           | API `.env`           | Defaults to `info`; structured Pino JSON                                                     |
| `MONGODB_URI`         | API `.env`           | Optional for startup; required for explicit `pnpm db:ping`; never commit the real URI        |
| `MONGODB_DB_NAME`     | API `.env`           | Set to `advanced_darvas_dev` for the explicit development ping                               |
| `SESSION_SECRET`      | API `.env`, later    | Future authentication only                                                                   |
| `RESEND_API_KEY`      | API `.env`           | Server-only invitation email credential; optional for startup/health/login                   |
| `RESEND_FROM_EMAIL`   | API `.env`           | Bare sender address; `onboarding@resend.dev` for development, verified domain for production |

The browser uses relative `/api/v1` requests. Next.js rewrites them to Express,
preserving the versioned path. Do not add server credentials to `NEXT_PUBLIC_*`.
Never log raw environment objects, request bodies, cookies, or credentials.

The API validates current environment values with Zod. It applies Helmet, a bounded
JSON parser, generated request IDs, no-store responses, and in-process rate limiting.
Health is excluded from rate limiting for monitoring. This scaffold has no sessions,
CSRF implementation, user authorization, or production proxy-trust configuration.
Those belong to the authentication/deployment milestones.

Health works without MongoDB:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "advanced-darvas-api"
  }
}
```

## MongoDB Atlas connectivity

### Market-storage foundation (Phase 8B)

The database package defines stocks, trading sessions, daily prices, immutable price
revisions, import batches, jobs and bounded staging. It does not upload/parse files,
seed stock/calendar reference data, run jobs, calculate indicators or provide an
import UI. Existing Login and health checks do not prepare or require market storage.

An operator can review market-storage readiness using `pnpm market-data:prepare`.
The command builds the API dependency graph, uses the existing `apps/api/.env`
loader and explicit connection utility, and defaults to a read-only dry-run.
Only after reviewing the report and separately authorizing development DDL, use
`pnpm market-data:prepare --apply`. Both database settings must name
`advanced_darvas_dev`, NODE_ENV must be development, and production is refused.
Preparation installs named collections, native validators and indexes only. It
does not seed records, drop indexes or repair incompatible data. No preparation
command is run by CI, normal startup or this milestone's verification.

See [ADR 0002](docs/adr/0002-market-data-import-foundation.md) for price provenance,
family scope, publication, immutable audit, expiry and recovery requirements.

### Bounded market-file parsing (Phase 8C)

The backend has a worker-isolated single-stock CSV/XLSX parsing module. It preserves
exact decimal text, requires explicit mappings/provenance and a trusted calendar
snapshot, and returns bounded diagnostics and normalized observations. Unknown price
basis or unavailable verified sessions block confirmation. No upload route, import
confirmation, database writes, reference seeding, runner or Admin UI is implemented.
See the [module guide](apps/api/src/modules/imports/README.md) for supported formats,
security/resource limits, dependency decisions and remaining source-file limitations.

### Read-only Atlas connectivity check

Keep real credentials in the ignored `apps/api/.env` file. The tracked example
contains placeholders only. Percent-encode reserved characters in the username or
password before putting them into a MongoDB URI. Rotate credentials if they have
been exposed in a tracked file or diagnostic output.

For the development connectivity check, set both the URI database path and
`MONGODB_DB_NAME` to `advanced_darvas_dev`, using `NODE_ENV=development`.
Then run from the repository root with the pinned Node.js and pnpm:

```powershell
pnpm db:ping
```

The command builds the database dependency graph, loads `apps/api/.env` through the same Node
environment-file convention as the backend, and reuses `readDatabaseConfig`,
`connectDatabase`, and `disconnectDatabase`. Existing process environment variables
take precedence over the file; a database mismatch, placeholder, or unsupported
environment is rejected before connecting.

Only `{ ping: 1 }` is sent, with a five-second command timeout. The owned connection
is closed afterwards. Output contains a fixed success/failure message rather than
credentials, a complete URI, or raw driver exceptions. A successful ping confirms
connectivity, not that collections or indexes have been provisioned.

The database package opens no connection at import time. Automatic collection and
index creation remain disabled. The ping performs no collection, index, account,
or record write; normal API startup and health checks still work without MongoDB.
Neither frontend builds nor isolated unit tests need an Atlas account or credentials.
The live ping is an explicit operator command and is not part of CI.

## First Admin bootstrap (development only)

Identity models exist for `families`, `users`, `sessions` and `invitations`. They do
not connect or provision database objects on import. The Login UI now uses real
credentials and MongoDB-backed sessions; create the initial Admin once before use.

To create the first workspace/Admin intentionally, open an interactive VS Code
PowerShell terminal at the repository root, with the existing development MongoDB
settings in ignored `apps/api/.env` and `NODE_ENV=development`, then run:

```powershell
pnpm admin:bootstrap
```

Both database settings must target `advanced_darvas_dev`. The command builds the API
and its shared dependencies. It prompts for workspace name (default: Family
Workspace), Admin email, display name, hidden password and confirmation. Passwords
must contain 15–128 characters; they are not trimmed and need no arbitrary character
composition. No password arguments, browser storage, generated password, or email
verification claim is used. Never paste credentials into chat or tracked examples.

The CLI explicitly prepares the four identity collections and their indexes. It
then creates an ACTIVE Family and ADMIN user together in a MongoDB transaction,
using Argon2id with a random salt, 64 MiB memory, three passes and parallelism one.
The workspace ID is its ObjectId. Email is trimmed/lowercase and globally unique;
dots and plus tags are preserved. The Admin email remains unverified.

A permanent uniquely indexed Family marker prevents two concurrent bootstrap
attempts from succeeding. Existing identity data rejects a second initialization,
including when the original Admin is disabled. Transactions and verified indexes
are required; no unsafe fallback or automatic account overwrite is provided. Failed
transactions roll back identity records; prepared empty collections/indexes may
remain and are safe to reuse. An uncertain commit result must be checked before a
retry; the command never resets initialization. Connections close on completion
and errors. Ctrl+C during prompts cancels before a connection is opened.

Production bootstrap is refused; it requires separate approval and implementation.
There is no production override flag. Do not run the live CLI as a test. The CLI
does not issue a session. Public registration and password reset remain deferred.
New Members register only by accepting a valid family invitation; no account is
created automatically.

## Local sign-in and sign-out

Use your existing bootstrapped Admin and ignored `apps/api/.env`, then run `pnpm dev`
from the root and open **http://localhost:3000/login**. Use the host matching backend
`WEB_ORIGIN`; localhost and 127.0.0.1 are different origins. No new local secret is
required. If pnpm is absent from PATH and this checkout already has ignored local
tools, enable them for the current PowerShell terminal only:

```powershell
$env:Path = "$PWD\.tools\node-v26.13.1-win-x64;$PWD\.tools\pnpm\node_modules\.bin;$env:Path"
pnpm dev
```

The form obtains CSRF protection, posts credentials to `/api/v1/auth/login`, and
confirms `/api/v1/auth/me` before opening `/dashboard`. That page is only a protected
workspace shell with the current display name and Sign Out. It has no trading data.
Sign Out posts to `/api/v1/auth/logout`, revokes the stored session and clears cookies.
Already authenticated visitors to `/login` are redirected server-side to `/dashboard`,
including with JavaScript disabled. Invalid or revoked cookies still show the form;
the route verifies the session instead of trusting cookie presence.
Failure messages are generic; attempted passwords are cleared and never stored in
browser storage. Forgot Password remains disabled; there is no public signup.

Sessions use 32-byte random opaque tokens, storing only SHA-256 hashes in MongoDB.
They expire absolutely after eight hours, or seven days with Remember Me. The
normal cookie lasts for the browser session; Remember Me sets persistent expiry.
Every session use checks expiry, revocation and active User/Family. A fresh token
replaces the presented browser session on login. TTL is cleanup only.

Cookies are HttpOnly, SameSite=Lax, Path=/ and host-only. Production uses Secure,
`__Host-` cookie names and requires HTTPS `WEB_ORIGIN` plus a stable randomly generated
32-byte base64url `CSRF_SECRET` in backend secrets. Local development uses an
ephemeral signing key if absent. Session tokens never enter JSON, URLs or client
storage. CSRF tokens from GET `/api/v1/auth/csrf` are non-authentication tokens,
kept in memory and sent as `X-CSRF-Token`. Signed binding changes from an anonymous
nonce to the session at login. Mutations also require the exact allowed Origin.

Auth responses follow the API Design's `{data}`/`{error}` format; the legacy health
response keeps its success flag. MongoDB is connected lazily and existing identity
indexes are verified read-only. Missing configuration, unavailable MongoDB or missing
indexes cause auth to fail closed with sanitized errors; health still works. HTTP
requests never create collections/indexes. API shutdown closes its owned connection.

Login throttling uses per-account failed-attempt limits plus a transport-IP limit,
in process memory. Proxy trust is disabled; the IP limit can be shared behind Next.
Production Vercel/Render proxy trust, distributed limits, TLS cookie behavior and
secrets still require deployment verification. No production rollout is included.

## Tests and CI

Vitest uses Node projects for API/packages and jsdom + React Testing Library for
components. Supertest checks health, headers, request IDs, 404s, malformed JSON, and
body limits. Contract tests reject invalid payloads. Strategy tests verify the built
package exports without implementing financial calculations. Playwright verifies
the actual API rewrite, theme persistence/system preference, and layout widths from
320px through desktop. No live market data is required.

GitHub Actions runs a frozen-lockfile install, formatting, lint, typecheck, tests,
and builds on Linux and Windows. Linux also runs Chromium against compiled apps.
No production credentials or deployments are configured.

The `database-integration` Vitest project starts a disposable loopback-only MongoDB
replica set, uses generated `advanced_darvas_test_<uuid>` databases, and shuts down
its owned server. It never loads application `.env` or uses Atlas credentials.
MongoDB 8.2.6 is pinned; the first test run needs network access to download and
checksum-verify its platform binary into ignored `node_modules/.cache/mongodb-binaries`.
Subsequent runs reuse it. Tests cover real unique indexes, concurrent bootstrap,
rollback, secret exclusion and token validity without waiting for TTL cleanup.

Playwright also starts a disposable replica set with a synthetic Admin using
`test:auth-server`, never the real backend `.env` or development database. That helper
is test-only; use `pnpm dev` for manual sign-in. Compiled-app tests exercise compiled
Express and Next with HTTP test cookies. Production cookie attributes are tested
separately in HTTP integration tests; this is not a Vercel/Render TLS deployment test.
`E2E_WEB_PORT`/`E2E_API_PORT` can select unused local ports; defaults remain 3000/4000.
Production Playwright startup rebuilds Next with the selected API origin before
starting it, so compiled rewrites and server-side requests use the same test backend.
Rebuild with your normal `API_INTERNAL_ORIGIN` before using those production artifacts
outside the browser tests; the development server uses its separate dev output.

```powershell
pnpm build:packages
pnpm exec vitest run --project database-integration
```

## Scope and next milestone

Invitation creation/listing, token verification/acceptance, revocation and fresh-token
resend are implemented. Admins use `/admin/invitations`; new members follow the
emailed `/accept-invitation#token=...` link. Registration does not sign users in.

Set optional server-only `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `apps/api/.env`.
For development, set `RESEND_FROM_EMAIL=onboarding@resend.dev`. The email adapter adds
the display name, producing `Advanced Darvas Box <onboarding@resend.dev>`; do not
put the formatted display name inside the environment value. Use an address on a
verified sender domain in production and disable open/click tracking in Resend. `WEB_ORIGIN`
is the canonical application origin, HTTPS in production. A localhost invitation
link can only be opened on that machine. No provider credential belongs in web env.
Missing mail configuration keeps health/login working and safely disables sending.
Restart the backend after changing its environment so it loads the new sender/key.
All automated tests use synthetic keys and mocked email delivery. A manual provider
test requires explicit approval and may use Resend's documented `delivered@resend.dev`
recipient with generic content, without creating an invitation or account.

Existing databases need explicit invitation index preparation before using the
feature. The command is development-only and checks both database settings:

```powershell
pnpm invitations:prepare
# Review the dry-run report, then explicitly apply the approved changes:
pnpm invitations:prepare --apply
```

Preparation replaces expiry-time deletion with cleanup 90 days after expiry,
backfills retention timestamps and creates the unique pending-invitation index.
It refuses duplicate live pending invitations or unexpected TTL definitions. It
does not create accounts, send email, run at startup or drop unrelated indexes.
Production preparation is refused. Login does not depend on invitation readiness.

Invitation links expire after 72 hours. Resend invalidates the old link and creates
a new one; a persisted 60-second cooldown and three sends per recipient/family per
day apply. Delivery is synchronous: provider acceptance is not inbox delivery.
Failed/unconfirmed sends require explicit Admin recovery; there is no durable
background outbox yet. Reopen the original email after reloading the acceptance
page because the token is deliberately kept only in memory. See
[the approved Stage 5 amendments](docs/adr/0001-family-invitations.md).

Deferred: business-resource APIs and their ownership integration, non-identity collections/indexes,
CSV/XLSX import, screening, DMA/CAR/Darvas calculations, portfolio accounting,
notifications, scheduled jobs, live feeds, cloud deployment, and broker automation.

Recommended next milestone: agree on the next business-resource scope and tenancy,
with a production same-origin cookie/CSRF deployment review before deployment.
Resolve the documented precision, source-fixture, and collection-inventory questions
before implementing persistence or strategy algorithms. The approved specifications
are excluded from formatting and remain the requirements baseline.

# Family invitations — approved Stage 5 amendments

Date: 27 November 2026 (Asia/Kolkata). The user approved the discovery plan before
implementation. The four baseline specifications are preserved.

## HTTP contracts

All routes use `/api/v1`, `{data}`/`{error}` envelopes, no-store responses, strict
Zod inputs and shared Origin/signed-double-submit CSRF protection for POSTs.

| Route | Access and behavior |
| --- | --- |
| POST /invitations | Active Admin; `{email,expiresInHours:72}` (72 defaults when omitted); 201 invitation DTO |
| GET /invitations | Active Admin; own family only; optional status, limit (25 default/100 max), ObjectId cursor |
| POST /invitations/verify | `{token}`; non-consuming; VALID metadata or INVALID/EXPIRED/CONSUMED/REVOKED state |
| POST /invitations/accept | Signed-out browser; `{token,displayName,password}`; 201 `{data:{userId}}`; no session |
| POST /invitations/:id/revoke | Own-family Admin; empty body; 204; cannot disable an accepted account |
| POST /invitations/:id/resend | Own-family Admin; empty body; replaces pending/expired invitation; 201 new DTO |

Invitation DTO: invitationId, email, status, expiresAt, createdAt and delivery.
Lists return an array in data and `{nextCursor}` in meta. VALID verification returns
only invited email, family name, inviter name and expiry. Other verification states
return no identity metadata. Acceptance adds required displayName to the baseline.
Invalid acceptance returns generic 422 INVITATION_INVALID, including account races.
An existing signed-in session returns 409 ALREADY_AUTHENTICATED and is preserved.
Roles, account email, family and user IDs cannot be selected during acceptance.

## Persistence and lifecycle

- Generate opaque 32-byte random tokens and store only SHA-256 hashes. Token hashes
  remain immutable; resend creates a new record and invalidates the prior link.
- Invitations last exactly 72 hours. Acceptance transactionally checks current
  active family/issuing Admin, expiry and consumption, creates an ACTIVE MEMBER
  using invitation-owned email/family, and records consumption. Token possession
  establishes email verification. Existing accounts are never transferred/re-enabled.
- User email stays globally unique. A partial unique family/email PENDING index
  arbitrates concurrent issuance; expired pending rows transition before replacement.
- Retain records until purgeAt, 90 days after expiry. Explicit preparation replaces
  the old expiresAt TTL with purgeAt TTL. Already-deleted history cannot be restored.
- The CLI is development-only, targets advanced_darvas_dev in both settings,
  defaults to dry-run, requires --apply for writes, refuses duplicate live pending
  records and unknown expiry-index definitions, and never drops unrelated indexes.
  HTTP requests do not provision storage. Login readiness excludes invitation DDL.
- Persist a 60-second cooldown and three sends per family/recipient per 24-hour
  window across replacement records. Process-local family/IP limits supplement it;
  these are not a distributed production abuse defense.

## Email and token privacy

Synchronous Resend delivery is the approved Stage 5 exception to the System Design's
future durable outbox. The sender uses server-only RESEND_API_KEY and a verified
RESEND_FROM_EMAIL; WEB_ORIGIN supplies the fixed link origin. Missing mail settings
do not break startup/health/login. Never derive links from request Host headers.

Persist PENDING/ACCEPTED/FAILED/UNCONFIRMED delivery state without storing email
bodies or recoverable token payloads. ACCEPTED means provider accepted, not inbox
delivery. Retry a bounded uncertain send with the same provider idempotency key.
After a crash, an unconfirmed record requires explicit Admin resend with a fresh
token; there is no background retry or automatic delivery guarantee.

Links use `/accept-invitation#token=...`; client code removes the fragment and keeps
the token only in memory. Reopen the email after reload. Verify/accept send tokens
only in JSON bodies. Use no-referrer on the acceptance page, no third-party assets
or analytics, and disable email tracking in the Resend sender-domain configuration.
Do not log tokens, bodies, credentials or provider errors. Tests inject fake email
delivery and use only disposable loopback MongoDB data.

## UI boundaries

Use the existing public palette/brand/fonts and four retrieved Stitch invitation
references. Implement only invitation management and account acceptance. Omit
prototype controls, fake identities/financial metrics, Admin role selection, member
deactivation, seat quotas, 2FA/KYC/encryption claims and unsupported trading text.
Use 72 hours and the existing 15–128-character password policy. Registration never
creates a session; users sign in through the existing login flow.

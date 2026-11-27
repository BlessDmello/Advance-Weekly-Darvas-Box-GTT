# Application modules

Auth contains hashing, first-Admin bootstrap, login/session/logout services and a
lazy MongoDB runtime. Central middleware validates sessions, active membership and
Admin permissions. Auth's ownership policy supports future owner-constrained queries
and server-loaded resource checks; Admin never bypasses private ownership. Invitations
adds family-scoped issuance/listing, verification, transactional Member acceptance,
revocation and fresh-token resend with synchronous Resend delivery. Recovery and
actual business-resource APIs remain deferred. HTTP requests never
provision storage.

Future modules belong here: stocks, imports, screener, signals, portfolio,
notifications, and reports. Routes call application services; services depend on
repository interfaces and pure strategy-core calculations. Persistence adapters use
the database package. Do not add business APIs or algorithms during Phase 1.

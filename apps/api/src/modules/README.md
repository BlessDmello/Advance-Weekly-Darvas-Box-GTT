# Application modules

Auth contains hashing, first-Admin bootstrap, login/session/logout services and a
lazy MongoDB runtime. Invitations, recovery and business-resource authorization
remain deferred. HTTP requests never provision storage.

Future modules belong here: stocks, imports, screener, signals, portfolio,
notifications, and reports. Routes call application services; services depend on
repository interfaces and pure strategy-core calculations. Persistence adapters use
the database package. Do not add business APIs or algorithms during Phase 1.

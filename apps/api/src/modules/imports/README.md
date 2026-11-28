# Market-data imports — Phases 8B through 8D-2B

Phase 8D-1 adds `service.ts`, `upload.ts` and the routes in `routes/v1/imports.ts`.
They reuse the parser, shared security context, owned database connection and explicit
market-storage readiness. See [ADR 0003](../../../../../docs/adr/0003-import-preview-and-confirmation.md)
for request/response fields, reference approvals, staging and atomic confirmation.
All import writes are Admin-scoped; stock lookup follows the API Design's active-member
access. There is no import UI. The Phase 8D-2B runner is opt-in; default execution remains disabled.

`parsing/parser.ts` exports `parseMarketFile(file, options, calendar)`, a backend-only,
bounded worker facade. The parser itself has no database connection, job runner or
filesystem output. Do not import this module into web code.
The synchronous/pure stages in `parser-core.ts`, `normalize.ts` and `calendar.ts` are
internal building blocks; future request handlers must use the worker facade.

## Caller and result contracts

- Resolve the selected stock against a trusted stock master before calling. Options
  carry its stable ID, exchange, symbol and series; a filename is never identity.
- Supply explicit, distinct header mappings, provenance, requested range, minimum
  history count and either ISO or Excel-serial date mode. No header/date/basis guess.
- Supply a `VerifiedCalendarSnapshot` from a trusted reference repository, or null.
  Its sourced/versioned coverage must explicitly enumerate **every calendar day**,
  including closures and special sessions. The adapter validates internal consistency;
  synthetic tests do not establish real NSE calendar accuracy. Never construct this
  reference from uploaded observations or a Monday–Friday heuristic.
- Result `records` are observed `{sessionDate, ohlc, volume}` values with result-level
  source metadata. They are deliberately **not** persisted `DailyOhlcv` DTOs. Unknown
  basis retains a preview but blocks confirmation. The canonical one-OHLC format
  cannot represent BOTH; it must not copy values into a second price series.
- `eligibleForConfirmation` means parser/reference checks passed. It does not grant
  authorization, promise freshness for strategy use, compare existing prices, perform
  a commit, or verify source adjustment claims independently. Phase 8D must recheck
  authorization, bound reference/provenance versions and the current dataset revision.
- Numeric equality for duplicate dates is exact: `102` equals `102.00`. Identical
  duplicates collapse with warnings. Conflicting dates are removed from normalized
  output with blocking diagnostics; no first/last winner is silently selected.
- Missing sessions, closed/unverified dates and unavailable calendar coverage block
  confirmation. Short history is a warning based only on the caller's explicit count;
  no indicator sufficiency or five-year market calendar is invented. Freshness is
  UNKNOWN unless a verified expected completed session is supplied. Historical import
  readiness is distinct from readiness to issue current trading signals.
- Diagnostics use fixed messages, row/field references, at most 100 samples and exact
  total counts. They never echo uploaded cell text, paths, dependency exception bodies
  or file contents. Fatal parse failures return no partial observations/count claims.

## Supported source profile and security bounds

CSV is UTF-8 (optional BOM), comma-delimited, quoted using standard CSV escaping,
with its header first. Empty physical lines are ignored; empty records/required values
are not silently accepted. CSV cells remain strings. No delimiter, locale or provider
alias detection is performed.

XLSX uses a deliberately narrow OOXML profile: one worksheet, header at row 1,
explicit ordered row/cell coordinates, standard transitional SpreadsheetML namespaces,
inline/shared/text/numeric cells, and conventional workbook part paths. Optional
properties, styles and themes are inspected but never evaluated. Unknown workbook
parts, named ranges, alternate-content branches, macros, embeddings, external links,
formula elements (including cached/shared/array formulas), encrypted packages and
malformed archives/XML are rejected. A cached `<v>` never makes a formula acceptable.
Plain textual formula prefixes are rejected in CSV/XLSX, including unmapped columns.
Negative numeric text remains subject to the existing OHLC/volume validation.

Financial numeric `<v>` text is read directly; no Number/parseFloat/currency rounding
is used. Scientific notation, separators, decorations, unsupported precision and
nonpositive OHLC are rejected using the existing shared schemas. No values are filled.
Excel serials are allowed only for numeric date cells in explicit EXCEL_SERIAL mode.
The workbook's 1900/1904 flag is honored; fictitious 1900-02-29 (serial 60), fractions,
ambiguous textual dates and date/time inference from formatting are rejected.

| Bound                      | Limit                                                        |
| -------------------------- | ------------------------------------------------------------ |
| Compressed input           | 3 MiB                                                        |
| Data rows / columns        | 5,000 / 32                                                   |
| ZIP entries                | 64, counted before extraction                                |
| Inflated total / part      | 16 MiB / 8 MiB                                               |
| Compression ratio          | 200×, with a 4 KiB small-part allowance                      |
| Cell / CSV record text     | 1,024 / 32,768 characters                                    |
| XML markup markers / depth | 550,000 / 32 per part                                        |
| Verified calendar coverage | 20,000 explicitly sourced days                               |
| Diagnostic samples         | 100; blockers retained preferentially                        |
| Execution                  | 5-second cooperative budget, 10-second hard worker deadline  |
| Worker admission           | One active worker per API process, no queue                  |
| Worker V8 memory / stack   | 192 MiB old generation, 16 MiB young generation, 4 MiB stack |

Byte/shape bounds are enforced independently of worker memory. V8 limits do not cap
all native/RSS allocations; admission, input/decompression bounds and deployment
memory monitoring remain necessary. Large/complex files can hit a structural or
resource limit before reaching a dimension's maximum. Timeout/resource failures close
the worker and release admission capacity. Limits cannot be raised through execution
options. Source-mode tests/development use the existing tsx loader; compiled workers
run emitted JavaScript directly, without tsx or eval.

ZIP processing is memory-only and sequential, checks declared and actual inflated
sizes, CRC32, local/central header agreement, overlapping entries, duplicate/unsafe
paths and encryption. There is no archive recursion, extraction or network resolution.
XML uses strict parsing with bounded depth; DTD/entities and non-UTF-8 declarations
are rejected before parsing. Dependency exceptions and worker stderr are not exposed.

## Dependency decision — 27 November 2026

Pinned backend runtime dependencies:

- `csv-parse@7.0.3`: maintained CSV reader, string/no-cast mode, record bounds and
  callbacks; zero runtime dependencies. [Options](https://csv.js.org/parse/options/).
- `yauzl@3.4.0`: lazy sequential ZIP entries, size checks and Promise API. Its only
  runtime dependency is `pend@~1.2.0` (already locked); CRC/path/resource policies are
  enforced here. [API](https://github.com/thejoshwolfe/yauzl). Already present transitively,
  now declared directly by the API package.
- `@rgrove/parse-xml@5.2.0`: strict string-preserving XML tree parser with depth limits,
  no external DTD loading and zero runtime dependencies. Requires Node >=22.12.0,
  compatible with pinned Node 26.13.1/TypeScript 6 NodeNext.
  [Documentation](https://github.com/rgrove/parse-xml).
- Development-only `@types/yauzl@3.4.0`, reusing the pinned Node typings.

Registry versions, engines, transitive dependencies and lifecycle scripts were
checked before installation; no install-script permission changes or unrelated
upgrades. `saxes` was considered but its upstream is archived, so it was not selected.
Full workbook engines were avoided because this phase needs exact stored numeric
lexemes and a constrained read-only format, not formula execution or workbook editing.

Microsoft references: [date systems](https://support.microsoft.com/en-gb/excel/date-systems-in-excel),
[cached formula values](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas).

## Verification and remaining work

Synthetic fixtures live in `apps/api/tests/parsing-fixtures.ts`. Tests cover both
date systems, precision, mappings, duplicates, reference coverage, unsafe workbook
parts, formula caches, malformed archives, size/dimension/decompression bounds and
worker deadlines/admission. A standalone subprocess regression removes NODE_PATH
and checks source-worker loading from the repository root, including tsx-namespaced
source URLs. Never use private workbooks or read app `.env` in tests.

Real provider/export compatibility, actual NSE master/calendar accuracy, adjustment
provenance and source licensing still require reviewed source files/reference data.
Alternative CSV encodings/delimiters, localized dates, scientific-number lexemes,
strict OOXML, additional sheets/parts and separate raw/adjusted column sets are
unsupported. They require explicit compatibility work, not automatic guessing.
The parser does not write staged data or prices. Phase 8D-1 services compare existing
rows exactly, stage bounded previews and queue jobs transactionally. Phase 8D-2B adds
price/revision execution and recovery. Seeding, UI and strategy calculations remain deferred.
Preserve ADRs 0002/0003 and the four approved specifications.

## Phase 8D-2B execution

The opt-in in-process runner in `runner.ts` reuses the generation planner and
database repository. It processes only confirmed durable jobs. Defaults: 100 output
rows per transaction, 60-second renewable lease, 20-second cooperative slices and
five automatic recoveries. Execution and startup recovery are separately opt-in;
ordinary startup never claims existing jobs by default. See ADR 0005 for controls,
retry API, operator resume, transaction bounds and operational limitations.

Every price chunk and audit checkpoint is atomic and fenced. Unknown commit results
are resolved from durable state; no external side effects occur in callbacks.
Publication revalidates full candidate content and references. Only completed jobs
retire staging for seven-day TTL cleanup. Active/retry payloads remain attached.
No UI, strategy, scheduler, pruning or real reference-data seeding is implemented.

# Changelog

## [Unreleased]

### Milestone 0 — SCORM vertical slice

The riskiest, least controllable part of the project is SCORM integration:
Moodle version behaviour, the 4096-character `suspend_data` ceiling, iframe
versus popup launch, secure context, status vocabulary, gradebook wiring. The
specification deferred all of it to milestone 6 of 7. This milestone pulls it to
the front so those unknowns are retired before the expensive build starts.

**Added**

- Vendored synchronous SHA-256, verified against the FIPS 180-4 vectors and
  differentially against Node's OpenSSL implementation.
- Canonical serialization: recursive key sorting, preserved array order, ISO
  date normalization, and rejection of `NaN`, `Infinity`, functions, symbols,
  `bigint` and circular references rather than silently emitting a misleading
  hash input.
- Domain core: commands, events, a pure synchronous reducer, the transaction
  lifecycle, block sealing with hash linking, and integrity verification.
- Unit normalization to grams, with `packageSizeGrams` on assets.
- Validation rule engine, evaluating every applicable rule without
  short-circuiting, with five rules for `CREATE_BATCH`.
- Compact state codec: positional base36 encoding of enum indices. A pessimistic
  full attempt encodes to ~180 characters against the 4096-character limit; a
  test enforces a 3800-character ceiling.
- SCORM 1.2 adapter with bounded API discovery through ancestor and opener
  windows, plus a standalone `localStorage` fallback.
- Strict mock SCORM 1.2 API enforcing the real data model constraints, so a
  suspend-data overflow fails CI rather than appearing in Moodle.
- Vietnamese and English catalogues (218 keys, kept in sync by a validator).
- Stages 1 and 2 playable, with the supply-chain diagram, transaction pipeline,
  validation results, asset card, and ledger explorer.
- SCORM package build and an 18-check verifier.
- Locale and scenario validators.

**Corrected from the specification**

- `RULE_TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT` compared raw numbers, so
  packaging 82 KG into 820 UNIT of 100 g failed on `820 > 82` and made stage 7
  impossible. Quantities now normalize to grams before comparison.
- §8.3 and §13.3 named the same rule differently; `RULE_CERTIFIER_AUTHORIZED`
  is canonical.
- Added `RULE_OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER`, which §8.4 required but
  §13.3 never defined — the rule carrying the ownership-versus-custody lesson.
- Removed `VERIFY_PRODUCT`: reading the ledger is a query, not a transaction.
- Defined `ORDERED` versus `COMMITTED` and the block flush algorithm, which the
  specification left in conflict.
- Added the `Location` entity, the `LOC_` prefix, and the scenario timeline —
  all referenced by the specification but never defined.
- Merged stages 4 and 5, giving nine stages, to protect the 30–45 minute budget
  without dropping a learning objective.

**Added beyond the specification**

- Review-mode guard reading `cmi.core.lesson_mode` and `cmi.core.credit`.
  Without it, relaunching a completed activity overwrites a good grade with a
  fresh zero.
- One `aria-live` announcement per transaction rather than seven.
- `pagehide` alongside `visibilitychange` for iOS Safari.

**Not yet built** — stages 3 to 9, scoring, provenance and recall, the tamper
demonstration, the final report, Playwright end-to-end tests, and the remaining
documentation.

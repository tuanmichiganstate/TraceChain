# Changelog

## [Unreleased]

### Milestone 1 — Scenario foundation

The activity becomes data. Specification section 41 step 4 asks that the
scenario be implemented "as data, not as hard-coded page logic"; after Milestone
0 the stages were a `switch` statement in a React component, which is the
opposite. This milestone closes that, and fills in the thirteen specification
types that had no implementation.

**Added**

- `ScenarioDefinition` and `ScenarioStageDefinition` (sections 17.1, 17.2), with
  knowledge checks, hints, required actions, and evaluable completion
  conditions.
- Scoring types (section 19): `ScoreState`, `ScoringConfiguration`,
  `CompletionState`, `LearnerInteraction`, `DiagnosticLogEntry`, and the
  six-component allocation summing to 100.
- Deterministic scenario clock (section 17.3), refusing backwards movement and
  normalizing instants so two spellings of the same time cannot hash
  differently. Display formatting is pinned to `vi-VN` / `Asia/Ho_Chi_Minh`
  rather than the browser's timezone.
- `validateScenario`, run at build time *and* at startup (section 27), reporting
  every problem at once. 192 checks against the coffee scenario.
- `ScenarioProvider` and a stage component registry. Routing, the progress
  indicator, the role banner, the codec key and the ledger configuration all
  read from the scenario.
- The coffee scenario assembled: nine stages declared, the near-miss distractor
  chain seeded with real provenance, the full decision and hint key.
- `docs/DOMAIN_MODEL.md`, `docs/SCENARIO_FLOW.md`, `docs/CONTENT_AUTHORING.md`,
  `docs/LOCALIZATION_GUIDE.md`.

**Changed**

- Stage 2 no longer seals its block automatically. The ledger runs in
  `STAGE_BOUNDARY` mode and the learner presses "Ghi giao dịch vào khối" — which
  makes the ORDERED/COMMITTED distinction visible instead of theoretical. The
  integration test asserts no ledger exists until the block is sealed.
- `seedTransactions` and `seedProvenanceEdges` added to the scenario schema.
  Section 17.1 offered only `seedAssets`, which cannot express committed
  history — needed both for the pre-committed dispatch error and for distractor
  provenance chains.
- `producesAssetIds` added to stages, so the validator can confirm every asset a
  completion condition names is actually created by something. It caught a real
  case while being written: stage 7's target asset was created mid-stage and
  declared nowhere.
- `activeActorIds` is a list rather than the specification's single
  `activeActorId`. Stages 4 and 7 hand over to a second role partway through,
  and that handoff is the lesson.

**Fixed**

- The role banner was hidden during orientation, violating section 31.4's
  "current role is always visible". It now always renders, saying explicitly
  that the learner has not yet been given a role rather than inventing one.
- `pagehide` listener was registered but never removed on cleanup.

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

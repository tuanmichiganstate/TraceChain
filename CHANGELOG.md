# Changelog

## [Unreleased]

### Orientation, cause and effect, and what the marks are for

Acting on a UI/UX review. The three themes it identified were right; roughly a
third of what it proposed already existed, one of its figures was wrong in a way
that would have misinformed learners, and the defect its own top priority was
about was live in the build.

**Fixed**

- **The top bar described the wrong stage.** It read `currentStageId` — the
  furthest stage unlocked — while the router renders `viewedStageId`. The two
  diverge the instant a stage's last condition is satisfied, so the header
  announced the next stage's number and role over the screen the learner was
  still reading. That is precisely the disorientation the two-field split exists
  to prevent; it was applied to the router and never to the header. A regression
  test now holds both fields to the stage on screen.
- **The hint cost was understated.** The notice said only that a hint "reduces
  part of this step's score". A hint caps *every* scored item in the stage at
  `afterHintCredit`, which in stage 9 is 7.5 points across three items —
  measured against the score engine, not inferred. The notice now states the
  cap and the points it puts at risk, both derived from the scoring
  configuration, phrased as a ceiling rather than as an automatic deduction, and
  saying that it covers answers already given — the cap is retroactive, which
  was the one material consequence the wording still left out.
  `docs/SCORING_MODEL.md` now records the policy and an open decision for the
  product owner; nothing about the scoring itself changed.
- **Two 320 px overflows that had shipped.** Validation rule identifiers, and
  the recall question's `fieldset`, each forced a horizontal scroll on every
  stage that renders them. The reflow test only ever visited stage 1, which is
  the one stage that renders neither. See `docs/ARCHITECTURE.md`.
- **Duplicate element ids on any stage showing more than one transaction.**
  `TransactionPipeline` and `ValidationResults` each hard-coded a heading id, so
  stage 5 issued `pipeline-heading` and `validation-heading` three times apiece
  and two thirds of those regions were labelled by the wrong heading. Both now
  use `useId`. The existing duplicate-id test only ever visited stage 1, which
  renders one of each.
- **A correction chain rendered every step with the final value.** The lineage
  panel showed `effectiveValue` against each correction, which is correct by
  coincidence for one correction and wrong for two: a 1000 → 100 → 105 chain
  displayed 105 against the step that established 100. `resolveEffectiveValue`
  now reports each correction with the value it made effective.

**Changed, in the interface's use of status colour**

- **Recall lots are classified, not judged.** An affected lot first rendered
  with the validation `fail` tone, handing a learner who correctly identified
  contaminated stock a rejection cross for getting it right. Classification is
  now a separate `ClassificationPill` with `affected` and `unaffected`,
  distinguished by fill as well as colour. Two components rather than one
  widened union because `validation-results.tsx` and `transaction-history.tsx`
  both map a status enum onto `StatusTone`, and adding classifications to it
  made `{ FAILED: "affected" }` type-check.
- **One spelling of a unit on a screen.** `formatCorrectionValue` writes the
  canonical `1000 KG`, which stage 5 showed beside the manifest panel's
  `1000 kg` and the asset card's `100 kg`. Learner-facing renders go through
  `formatCorrectionValueLabel`, which maps the enum to the translated label --
  `kg`, and `gói`/`packages` for UNIT, which is a word rather than a symbol.
  Commands, payloads, hashes, suspend data and the scenario contracts are
  untouched, and a test asserts it.
- **The correction lineage no longer borrows validation iconography.** The
  superseded manifest figure is a committed historical fact, not a failed rule;
  marking it with the rejection glyph said the opposite of the stage's lesson.
  The step labels carry the meaning, and nothing is struck through.
- **Nor does the stage 5 discrepancy panel.** It showed the declared 1000 kg
  with the rejection glyph and the measured 100 kg with the success glyph, on a
  screen the learner reaches before doing anything. The manifest passed every
  rule when the clerk filed it and is committed for good, so it is inaccurate
  rather than invalid, and a scale reading is not a validation outcome at all.
  Both figures are now plain, the labels say which is which, and the mismatch is
  stated in words. The illustration's overlay moved off fail-red and pass-green
  onto the palette's own ledger and physical-world colours; amber is reserved
  for the mismatch itself.

**Added**

- **Correction lineage beside current state** in stage 5: original value,
  correction appended, effective value, each with its transaction. The activity
  promises learners they will "distinguish current state from transaction
  history" and stage 5 is the one place the two genuinely disagree — but seeing
  it meant opening the reference workspace and comparing two tabs.
- **Per-lot recall justification** in stage 9, showing the provenance path that
  puts each lot in scope, and stating plainly that the lookalike lot has none.
  The score said whether the learner was right; nothing said why, which for the
  near-miss distractor is the entire lesson. `justifyRecallSelection` derives
  the path from the same graph the scope calculation walks.
- **Scoring explained before the activity starts** — action points, question
  points, the pass mark, the hint cap and the procedural floor, all derived from
  the scenario rather than written down.
- **A stated reason when Continue is unavailable**, instead of an absent button.
- **Task-aware reference panel**: the workspace opens on the tab the current
  stage actually needs, and re-aims when the learner moves on.

**Changed**

- The final report separates competencies from telemetry. Blocks sealed and
  transactions committed moved into a "simulation activity summary" below the
  breakdown; in one list with the six score components they read as marks.
- Learner interactions record the stage on screen rather than the furthest one
  unlocked. In this scenario the two agree everywhere they can be reached —
  every stage's last interaction is also the one that completes it — so this
  fixes no observable defect; it removes the possibility of one, and gives
  "where was the learner" a single answer.
- The reference workspace re-aims by remounting on a key rather than by
  adjusting state during render. Same behaviour, and `isOpen` deliberately sits
  outside the key so the panel stays open across a stage change.

### Milestone 4 — Learner interface

Stages 1 to 7 are playable in the browser. An integration test walks a learner
from orientation to a packaged lot on a retail shelf, through every check and
every transaction.

**Added**

- One knowledge check component for all three question shapes, driven entirely
  by the scenario definition. Classification uses labelled selects rather than
  drag and drop, which section 26 forbids.
- A transaction panel with progressive disclosure: the full ceremony the first
  time a learner meets a transaction type, collapsed thereafter. The
  specification's eight-section composer repeated fifteen times is where the
  session budget disappears.
- Stage shell providing instructions, the outstanding-work list and hints,
  derived from the same completion conditions that govern progression.
- Hints as an explicit two-step reveal, since taking one costs credit.
- Provenance viewer as a nested list rather than an SVG graph: keyboard
  reachable, reflows at 320 px, and needs no separate text alternative because
  the accessible version is the visible one.
- Transaction history, including rejected transactions, with per-transaction
  validation detail.
- Glossary pairing each Vietnamese term with its English.
- Workspace tabs implementing the ARIA tab pattern, with arrow, Home and End
  keys.
- `answer-codec.ts`: answers encode to a single integer and decode back, so
  correctness is a pure function of the stored answer and the scenario.

**Fixed**

- **The feedback vanished before a learner could read it.** Progression is
  derived from completion conditions, so answering the last outstanding
  question advanced the stage instantly and replaced the explanation of that
  very answer. Session state now separates the furthest stage unlocked from the
  stage on screen; unlocking stays automatic, moving on is the learner's choice.
- Correctness was derived from the in-memory interaction log, so a resumed
  attempt could not reproduce its own score. It is now derived from the stored
  answers, closing the gap Milestone 3's reproducibility test had papered over.
- `.asset-card__row` used a two-column grid at every width, which combined with
  unbreakable identifiers to overflow at narrow widths. Verified at a real
  320 px viewport, in an iframe so media queries evaluate correctly: zero
  overflowing elements, no horizontal scroll.
- The context method `useHint` read as a React hook to the linter and to the
  next person; renamed `revealHint`.

### Milestone 3 — Scenario engine

The activity is now complete as a *thing a learner does*, independently of any
interface. `full-attempt.test.ts` plays all nine stages, answers every knowledge
check, reaches 100 points, and completes.

**Added**

- Score engine: the deduction ladder, the procedural floor, the repeated-attempt
  cap, and recall precision scored strictly. The score is a pure function of
  decisions and hints, never a running total, so it is recalculated identically
  on resume.
- Stage completion evaluator. Stages advance because their declared conditions
  hold against real state, not because a component called `completeStage`.
- Learner interaction record, and its compression into the persisted decision
  form. The chain is interactions -> decisions -> score.
- Knowledge checks for all required concepts in section 20.1, each placed in the
  stage where the learner has just done the thing it asks about, and each
  carrying a connection back to what just happened.
- The section 25 data-governance classification, trimmed from eleven items to
  six while keeping all four categories.
- `ScoredAction` on stages, so procedural marks are declared as data alongside
  the questions.
- `docs/SCORING_MODEL.md`.

**Fixed**

- **Three completed stages un-completed themselves at the end of the activity.**
  Stages 5, 6 and 7 used `ASSET_LIFECYCLE_STATUS` completion conditions, which
  read *mutable* state; the stage 9 recall then set those assets to RECALLED and
  the conditions stopped holding. A learner would finish the recall and find
  three stages had reverted, with no way to complete. Completion conditions are
  now required to be monotonic, and the offending condition shape was removed
  from the union entirely rather than worked around.
- The scenario validator's asset check was vacuous: it added each condition's
  own target to the set of known assets before checking membership, so it could
  never fail. Targets must now be justified by a seed or a `producesAssetIds`
  declaration.
- `npm run validate:scenario` now checks that each score component's items sum
  to its declared budget. Without it a stage could be worth more or less than
  the configuration said while the total still reached 100.

**Noted**

- The repeated-attempt cap never binds under the shipped configuration: the 0.6
  credit floor already limits retry loss to exactly 40, which is exactly
  `maxInvalidAttemptPenalty`. It is kept as a guard against a harsher ladder,
  and a test covers both the fact that it does not fire and that it would.

### Milestone 2 — Domain and ledger engine

The whole scenario now runs headless. `scenario-walkthrough.test.ts` creates,
certifies, ships, monitors, receives, corrects, transforms, packages,
distributes and recalls a batch with no interface involved at all.

**Added**

- All twelve event handlers in the reducer, and all twelve command-to-event
  translations. The reducer switch is exhaustive, so an unhandled event type is
  a compile error rather than a silent no-op.
- All twenty-five validation rules, grouped by concern across eight files. A
  registry test asserts every declared rule identifier is actually registered --
  an unregistered rule would simply never run, protecting nothing, silently.
- Provenance traversal with cycle protection, and recall scope with separate
  over-selection and under-selection reporting.
- `LedgerAdapter` and `SimulatedLedgerAdapter` (section 16), the seam Tier 2 and
  Tier 3 would replace.
- Endorsement policies that add the counterparty to a transfer, so both sides of
  a handover must approve it.
- Seed replay: genesis assets and provenance, plus seeded transactions that go
  through the real pipeline.
- `docs/FUTURE_LEDGER_ADAPTERS.md`.

**Fixed**

- **The engine validated the wrong actor's permissions.** `submitCommand` spread
  a stored validation context whose `actorId` and `organizationId` were fixed at
  construction, so every rule evaluated as though the same organization had
  submitted every transaction. With one actor this was invisible; with seven it
  made authorization meaningless -- a retail manager could have issued
  certificates. Registries and acting identity are now separate types, so the
  mistake is unrepresentable.
- `RULE_RECEIVER_AUTHORIZED` rejected every `RECEIVE_BATCH`, because it treated
  "receiver is the acting organization" as an error. On a receipt that is the
  entire point; the check now applies only to outgoing transfers.
- **The processor never acquired ownership.** Stage 7 has it selling the
  packaged lot, but nothing in the scenario transferred title to it -- the
  co-operative still owned the coffee through roasting. Stage 5 now separates
  booking goods in (custody) from buying them (ownership), which is also a third
  application of the lesson.
- `DISPATCH_BATCH` required custody rather than ownership. In stage 7 the
  distributor owns the packages while they are still at the plant, and directing
  a shipment is an ownership right.

**Changed**

- `configuration.ts` no longer duplicates `passingScore`, `estimatedMinutes`,
  `blockCommitMode` or `maxTransactionsPerBlock`. The scenario owns them and is
  what the application reads; the copies were silently ignored.
- `ANCHOR_DOCUMENT` carries its document metadata. Referencing an anchor that
  had to exist beforehand was circular -- anchoring is the act that creates it.

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

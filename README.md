# TraceChain

A simulated permissioned blockchain for teaching supply-chain traceability,
delivered as a self-contained SCORM 1.2 package for Moodle.

Learners follow a batch of Arabica coffee from a Lâm Đồng co-operative to a
retail shelf, and then through a recall investigation — creating assets,
transferring custody and ownership separately, anchoring documents off-chain,
correcting a committed error without deleting it, transforming and packaging,
and tracing provenance forwards and backwards.

The shipped Guided, curated Practice, and Challenge-bank presets use **Vietnamese**; the same
localization system also contains English. All code, identifiers, comments,
tests and documentation are **English**.

**It is a simulation.** No blockchain node, no network, no cryptocurrency, no
mining. The interface says so on every screen.

---

## Status

Version 2 implements the complete nine-stage activity as configurable Guided,
curated Practice, and Challenge-bank packages, including atomic consequential decisions,
trusted role handoff, append-only correction, deterministic TC3 replay, and a
causal final report. Genuine Ed25519 proposal and endorsement signatures,
scenario-authored authorization, and constrained endorsement-policy evaluation
are integrated into custody transfer and append-only quantity correction.
Organizational identity and key custody remain explicitly educational
simulations.

Hosted and SCORM delivery now resolve the same Configuration Schema V2:
professional activity, support profile, delivery purpose, outcome strategy,
content identity, learning policies, scoring, reporting, and persistence.
Preset and hosted-profile names remain selectors rather than overloaded product
modes; the Phase 1 audit is archived in
`docs/archive/phases/PRODUCT_MODES_PHASE_1.md`.
Phase 2 added development-only coded benchmarks for the shared Learning,
Operations, Audit, Blockchain Inspector, professional-decision, finding, and
persistent-result workspace architecture. The prototypes are intentionally not
rolled into every learner screen until their recognition review is complete;
see `docs/archive/phases/PRODUCT_MODES_PHASE_2.md`.
Phase 3 made Guided, Practice, and Challenge explicit Operations support
profiles and added one curated Practice bridge case without introducing another
simulation engine or scoring contract; see
`docs/archive/phases/PRODUCT_MODES_PHASE_3.md`.
Phase 4 adds one fixed hosted Guided Audit case over an immutable completed
coffee process. Audit findings, decoys, workpapers, scoring, conclusions, and
reports use the shared event, replay, assignment, competency, and persistence
boundaries while remaining outside the operational ledger. Phase 5 adds one
curated Practice Audit case plus Guided and Practice Audit SCORM packages with
bounded replay. Phase 6 adds three complete Audit Challenge cases, deterministic
TA2 assignment before reveal, a final-feedback Audit Assessment configuration,
shared hosted allocation policies, and review-only calibration summaries. The
new Audit bank remains a calibration candidate rather than a claim of
high-stakes equivalence. Phase 7 exposes all eight accepted packages through a
four-dimension graphical selector and resolved preset preview, adds a validated
Audit case-bank authoring starter and contract summary, and adds class Audit
reporting with finding-level replay, variant distribution, and review-only
calibration views. Phase 8 now has a frozen technical candidate, proposed
concept, Audit, usability, rater, accessibility, and Vietnamese-review
instruments, plus an execution record that keeps automated readiness separate
from still-unapproved participant evidence; see
`docs/archive/phases/PRODUCT_MODES_PHASE_4.md`,
`docs/archive/phases/PRODUCT_MODES_PHASE_5.md`,
`docs/archive/phases/PRODUCT_MODES_PHASE_6.md`,
`docs/archive/phases/PRODUCT_MODES_PHASE_7.md`, and
`docs/pilot/PRODUCT_MODES_PHASE_8.md`.

The Technical Laboratory is now a ninth package and a hosted assignment type.
Its seven ordered modules cover SHA-256 and the avalanche effect, canonical
serialization, Ed25519 signatures, authorization, endorsement policies,
state-version conflicts, and end-to-end trust diagnosis. One headless engine
drives both the TL1 SCORM journal and the server-authoritative hosted run. The
laboratory retains its own exact 100-point 40/40/20 contract and does not alter
the Operations or Audit score contracts. In development, open
`http://localhost:5173/technical-lab` after `npm run dev`; hosted learners enter
the laboratory through a Technical Laboratory assignment on `/learner`.

The instructor platform now defines versioned
competency, rubric, scenario-pack, publication, hosted-event, replay, and
role-projection contracts. The server-authoritative coffee service now carries
an authorized run through Stage 3 certificate handling, Stage 4 endorsed
custody transfer and transport recording, and Stage 5 receipt, discrepancy
mitigation, and endorsed append-only correction. It then continues through
Stage 6 transformation and provenance reasoning and Stage 7 packaging,
ownership transfer, and retail dispatch, Stage 8 integrity and data-governance
reasoning, and Stage 9 scoped recall with a trusted regulator handoff and final
blockchain-suitability debrief. It reuses the existing simulation and
endorsement services, persists ordered events through memory or D1, returns
role-filtered learner state, and exposes authenticated timeline,
rubric-evidence, and competency APIs. The hosted `/instructor` route provides a
deliberately small authenticated workspace for exact-version assignment
creation from the published runnable scenario library and active provisioned
learner roster, those evidence
projections, evidence-linked rubric ratings,
optional immutable assignment availability windows, one-way assignment closure
and feedback release, moderation, assignment
reports, replay-derived live
learner status, and graphical SCORM package jobs. The `/learner` route lists
only the signed-in learner's
assignments and runs the complete bounded coffee command path from
role-filtered server state. The certificate decision now records the
scenario-required rationale, cited evidence, cited policy, confidence, and
adverse-event probability estimate as one atomic submission. The `/author`
route imports bounded JSON, YAML, or ZIP packs, provides a compact visual draft
editor, pharmaceutical cold-chain starter, and complete Audit case-bank
starter with an explicit finding, decoy, evidence, policy, scoring, and
equivalence summary. It validates and previews roles and modes, compares
versions, and controls publication and retirement.
The `/admin` route provisions
application users, replaces server-owned roles, and disables or reactivates
access through idempotent audited commands. Deployment authentication and
course management remain outside TraceChain. Administrators can review the
latest 100 append-only access changes without editing that history. Assignment
reports now provide stable JSON and CSV evidence exports with exact content
versions, complete event streams, authoritative event-span timing, rating
revisions, event-derived learner activity counts, deterministic rejection
findings, exact-version evidence interpretation definitions, and a data
dictionary. Assessment-only reliability and content judgments are available to
authorized authors and instructors without entering learner projections.
Audit assignments additionally provide exact-case class summaries, direct
finding-event replay, curated-variant distribution, and review-only
calibration measures that never rescale scores or change official grades.
Instructors may download those records with identified learner IDs or with
deterministic assignment-scoped pseudonyms; the interface explicitly warns
that pseudonymized records are not anonymous.
They also summarize class competency evidence and its rating distribution, and
expose expandable per-learner profiles with evidence recency, current rubric
comments, and direct supporting-event review, without inferring stable
competence from one run. Once feedback is released, the learner workspace
shows only that learner's evidence profile and never the class aggregate or a
second score. Versioned declarative evidence rules are evaluated against their
referenced append-only events before competency evidence is recorded.
Independently owned and adopted curriculum overlays can project that evidence
onto external course or program outcomes while explicitly refusing to infer
attainment or create a second grade. The instructor assignment report presents
the exact overlay, framework, and evidence provenance with self-localized labels
and offers a versioned JSON download.
Instructors can replay any event sequence through the
existing deterministic reducer and inspect the role-filtered view that existed
at that point, with the submitted response beside the evidence available at
that decision time, including explicit cited and available-but-not-cited
labels when the selected response recorded citations. The assignment monitor
uses the same replay boundary for current stage and pending actions, and
reports a technical issue when a run cannot be reconstructed. It does not
expose hidden outcomes. A separate completed-run report compares authored
decision evidence with the realized scenario outcome without turning either
into another grade; active-run correctness and outcomes remain hidden. The
hosted platform also supports assignment-bounded decision and authored
condition counterfactuals from completed runs: copy-on-write replay preserves
the assessed source, aligns named stochastic draws, evaluates authored
comparison metrics, reuses valid downstream commands, pauses on divergence,
captures reflection, and provides role-filtered branch and assignment
analytics exports. The
hosted work does not alter the current SCORM activity.
The hosted instructor workspace also supports an LTI 1.3 Core resource-link
launch from Moodle. It verifies the signed Moodle launch, provisions only an
external instructor identity, and scopes assignment records to the verified
course context. NRPS, grade services, Deep Linking, hosted learner launch, and
Moodle SCORM-attempt access remain deferred.
The pharmaceutical transfer case also supports one scenario-authored,
versioned instructor incident; its release is permission-controlled,
append-only, replayable, and cannot edit hidden state or prior decisions.
Assignments may expose a stable authenticated learner deep link and optionally
record bounded controlled-study metadata with a fixed seed. Assignment reports
include event-linked descriptive process observations with explicit
no-trait-inference limits. Scenario-authored safety, cost, delay, compliance,
and evidence effects remain diagnostic professional consequences rather than a
second score or a generic game currency.

| | |
|---|---|
| Domain | complete — all 12 transaction types and the full rule registry |
| Scenario | complete — one shared engine, fixed Standard Coffee, one curated Practice case, and three curated Challenge cases |
| Cryptographic evidence | real Ed25519 proposal and endorsement signatures; simulated educational identities and key custody |
| Stages playable | all 9 in the browser and in deterministic replay |
| Contract audit | schema validation plus executable cross-layer contracts |
| Content review | deterministic bilingual pack; human Vietnamese review remains open |
| SCORM package | one-build Operations and Audit Guided/Practice generation with cross-package byte verification |
| Moodle | Docker acceptance covers storage, grading, forced failure, and cleanup |

Stage order, trusted contexts, role handoffs, completion conditions, knowledge
checks, hints, scripted history, seeds, and scoring live in a
`ScenarioDefinition`. Package configuration, scenario JSON, and the optional
Challenge variant bank are external to the shared application bundle.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run quality      # lint, typecheck, test, validators, build, package, verify
```

`npm run quality` must pass before any commit.

## Building the SCORM package

For a clean release tree:

```bash
npm run package:scorm -- --preset guided
npm run package:scorm -- --preset guided,practice,challenge,assessment,audit-guided,audit-practice,audit-challenge,audit-assessment,technical-lab
```

For local verification of all accepted presets from an existing build:

```bash
npm run build
npm run build:scorm
npm run verify:scorm
```

Strict release generation produces
`TraceChain_Guided_StandardCoffee_vi_v2.3.0.zip`,
`TraceChain_Practice_PracticeCase_vi_v1.0.0.zip`,
`TraceChain_Challenge_ChallengeBank_vi_v2.0.0.zip`, plus
`TraceChain_Assessment_StandardCoffee_vi_v2.3.0.zip`,
`TraceChain_AuditGuided_GuidedCoffeeAudit_vi_v2.0.0.zip`, and
`TraceChain_AuditPractice_PracticeCoffeeAudit_vi_v1.0.0.zip`, plus the
calibration-candidate
`TraceChain_AuditChallenge_ChallengeCoffeeAuditBank_vi_v1.0.0.zip` and
`TraceChain_AuditAssessment_ChallengeCoffeeAuditBank_vi_v1.0.0.zip`, plus
`TraceChain_TechnicalLab_PermissionedBlockchainFoundations_vi_v1.0.0.zip`.
The local command
appends `_NON_RELEASE` to every archive name. The Docker demo selects the
current nine archives by their embedded build metadata, deploys them into
separate reset activities, and ignores stale ZIPs.
Release packaging fails on a dirty tree;
`--allow-dirty` output is marked non-release in its filename and metadata.

## Developer mode

Append `?debug=true` to show a diagnostics panel: platform mode, current stage,
block count, and every SCORM diagnostic collected. It never alters scoring or
domain behaviour, and is never visible to an ordinary learner.

---

## Layout

```
src/
├── config/            typed configuration, presets, validation and hashing
├── crypto/            Ed25519, proposals, authorization, endorsements and evidence
├── domain/            pure, synchronous, no React
│   ├── commands/      learner intent
│   ├── events/        committed outcomes
│   ├── ledger/        reducer, engine, integrity verification
│   ├── provenance/    forward and backward tracing, recall scope
│   ├── rules/         one file per concern + registry
│   ├── scenario/      validation, seed replay, completion, interactions
│   ├── scoring/       score engine
│   ├── simulation/    trusted commands, events, audit history and replay
│   ├── reporting/     deterministic causal and diagnostic projections
│   ├── units/         gram normalization
│   └── types/         enums, models, rule ids, scenario schema, scoring
├── infrastructure/
│   ├── hashing/       vendored SHA-256, canonical serialization
│   ├── persistence/   compact state codec, standalone adapter
│   ├── scorm/         API discovery, SCORM 1.2 adapter
│   └── time/          deterministic scenario clock
├── platform/
│   ├── contracts/     scenario-pack, competency, rubric and hosted-event V1
│   ├── author/        pack import, draft editing, preview and lifecycle UI
│   ├── hosted/        incremental coffee orchestration, trusted access and APIs
│   ├── instructor/    thin assignment, evidence and assessment workspace
│   ├── learner/       assigned-run dashboard and role-filtered command UI
│   ├── persistence/   D1 event, pack and application-principal adapters
│   ├── portal/        role-aware hosted workspace landing page
│   ├── reporting/     export and competency-report projections
│   ├── runs/          event-store port, replay guard and role projection
│   └── scenario-packs validation and immutable publication
├── scenarios/
│   ├── coffee-traceability/
│   ├── practice-a/
│   └── challenge-a/
├── technical-lab/     shared TL1–TL7 engine, content, hosted runtime and UI
├── features/          one folder per stage + the stage registry
├── components/        shared UI
├── locales/           vi.json (production), en.json (scaffold)
└── styles/

test/
├── scorm-mock/        strict in-memory SCORM 1.2 API
└── support/           domain fixtures

scripts/               locale + scenario validators, SCORM build + verify
sites/                 authenticated Sites worker and hosted API boundary
db/                    Current fresh-install D1 schema
scenario-packs/        declarative hosted-platform pack sources
schemas/               published versioned JSON Schemas
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Static production build |
| `npm run build:site` | Build the shared client and bundled Sites worker |
| `npm test` | Unit, component and integration tests |
| `npm run test:site` | Test static routing, authentication, D1 and hosted API replay |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run validate:locales` | Key parity, placeholders, no stray Vietnamese in source |
| `npm run validate:scenario` | Schema consistency plus executable cross-layer contracts |
| `npm run validate:platform-pack [-- <pack.json> …]` | Validate declarative platform packs with path-specific diagnostics |
| `npm run validate:curriculum-overlays` | Validate independently owned curriculum overlays and exact TraceChain framework references |
| `npm run generate:content-review` | Deterministically rebuild the bilingual review pack |
| `npm run verify:content-review` | Regenerate temporarily and compare the review pack byte-for-byte |
| `npm run package:scorm -- --preset …` | Strict clean-tree release generator |
| `npm run build:scorm` | Build all nine local non-release preset packages |
| `npm run verify:scorm` | Validate all nine packages and their shared static build |
| `npm run verify:signature-evidence -- <bundle.json>` | Independently verify a copied Ed25519 evidence bundle with Node |
| `npm run quality` | All of the above, in order |

## Documentation

Start with [`docs/README.md`](docs/README.md). It separates current
implementation contracts, active pilot evidence, architecture decisions,
generated review material, and historical records.

The most frequently used references are:

- [`AGENTS.md`](AGENTS.md) — verification and repository conventions
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime boundaries
- [`docs/SCENARIO_FLOW.md`](docs/SCENARIO_FLOW.md) — learner journey
- [`docs/SCORING_MODEL.md`](docs/SCORING_MODEL.md) — scoring contract
- [`docs/CONTENT_AUTHORING.md`](docs/CONTENT_AUTHORING.md) — content changes
- [`docs/MOODLE_TESTING.md`](docs/MOODLE_TESTING.md) — Moodle acceptance
- [`CHANGELOG.md`](CHANGELOG.md) — release history

## Constraints worth knowing before you change anything

- **`DECISION_IDS` and `HINT_IDS` are append-only.** The compact state codec
  stores decisions by index, not by name. Reordering silently reinterprets every
  learner's saved progress.
- **`SCENARIO_STAGE_ORDER` is append-only** for the same reason.
- **Every knowledge check must appear in `DECISION_IDS`**, or its answer is
  collected, scored, and then silently lost on resume.
- **Core application strings live in `src/locales/`.** Portable scenario packs
  may carry their own bounded `localizationCatalogs`; their referenced EN/VI
  keys are validated as immutable pack content.
- **No student identity may reach the ledger** — not an asset, transaction,
  block, hash, or suspend-data value.
- **`cmi.suspend_data` is capped at 4096 characters.** TC3 enforces a
  3,000-character authored budget and 3,800-character internal ceiling against
  the actual worst case of both scenarios.

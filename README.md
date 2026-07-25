# TraceChain

A simulated permissioned blockchain for teaching supply-chain traceability,
delivered as a self-contained SCORM 1.2 package for Moodle.

Learners follow a batch of Arabica coffee from a Lâm Đồng co-operative to a
retail shelf, and then through a recall investigation — creating assets,
transferring custody and ownership separately, anchoring documents off-chain,
correcting a committed error without deleting it, transforming and packaging,
and tracing provenance forwards and backwards.

The shipped guided and Challenge A presets use **Vietnamese**; the same
localization system also contains English. All code, identifiers, comments,
tests and documentation are **English**.

**It is a simulation.** No blockchain node, no network, no cryptocurrency, no
mining. The interface says so on every screen.

---

## Status

Version 2 implements the complete nine-stage activity as configurable guided
and curated Challenge A packages, including atomic consequential decisions,
trusted role handoff, append-only correction, deterministic TC3 replay, and a
causal final report. Genuine Ed25519 proposal and endorsement signatures,
scenario-authored authorization, and constrained endorsement-policy evaluation
are integrated into custody transfer and append-only quantity correction.
Organizational identity and key custody remain explicitly educational
simulations.

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
route imports bounded JSON, YAML, or
ZIP packs, provides a compact visual draft editor and pharmaceutical
cold-chain starter, validates and previews roles and modes, compares versions,
and controls publication and retirement. The `/admin` route provisions
application users, replaces server-owned roles, and disables or reactivates
access through idempotent audited commands. Deployment authentication and
course management remain outside TraceChain. Administrators can review the
latest 100 append-only access changes without editing that history. Assignment
reports now provide stable JSON and CSV evidence exports with exact content
versions, complete event streams, authoritative event-span timing, rating
revisions, event-derived learner activity counts, deterministic rejection
findings, and a data dictionary.
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
hosted platform also supports assignment-bounded decision counterfactuals from
completed runs: copy-on-write replay preserves the assessed source, reuses
valid downstream commands, pauses on divergence, captures reflection, and
provides role-filtered branch and assignment exports. The
hosted work does not alter the current SCORM activity.

| | |
|---|---|
| Domain | complete — all 12 transaction types and the full rule registry |
| Scenario | complete — one shared engine, standard coffee and curated Challenge A |
| Cryptographic evidence | real Ed25519 proposal and endorsement signatures; simulated educational identities and key custody |
| Stages playable | all 9 in the browser and in deterministic replay |
| Contract audit | schema validation plus executable cross-layer contracts |
| Content review | deterministic bilingual pack; human Vietnamese review remains open |
| SCORM package | one-build guided/challenge generation with cross-package byte verification |
| Moodle | Docker acceptance covers storage, grading, forced failure, and cleanup |

Stage order, trusted contexts, role handoffs, completion conditions, knowledge
checks, hints, scripted history, seeds, and scoring live in a
`ScenarioDefinition`. Package configuration and scenario JSON are external to
the shared application bundle.

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
npm run package:scorm -- --preset guided,challenge,assessment
```

For local verification of all accepted presets from an existing build:

```bash
npm run build
npm run build:scorm
npm run verify:scorm
```

Strict release generation produces
`TraceChain_Guided_StandardCoffee_vi_v2.2.0.zip` and
`TraceChain_Challenge_ChallengeA_vi_v1.1.0.zip`, plus
`TraceChain_Assessment_StandardCoffee_vi_v2.2.0.zip`. The local command appends
`_NON_RELEASE` to every archive name. The Docker demo selects the current Guided
and Challenge archives by their embedded build metadata, deploys them into
separate reset activities, and ignores stale ZIPs. Assessment is generated and
verified but is not deployed to the demo unless that deployment workflow is
explicitly extended.
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
│   └── challenge-a/
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
| `npm run generate:content-review` | Deterministically rebuild the bilingual review pack |
| `npm run verify:content-review` | Regenerate temporarily and compare the review pack byte-for-byte |
| `npm run package:scorm -- --preset …` | Strict clean-tree release generator |
| `npm run build:scorm` | Build all three local non-release preset packages |
| `npm run verify:scorm` | Validate all three packages and their shared static build |
| `npm run verify:signature-evidence -- <bundle.json>` | Independently verify a copied Ed25519 evidence bundle with Node |
| `npm run quality` | All of the above, in order |

## Documentation

- `AGENTS.md` — how to verify a change here, and the conventions one follows
- `docs/CANONICAL_CONFIGURABLE_SCORM_PLAN.md` — the approved configurable
  simulation boundary, exact scoring allocation, TC3 budget, and delivery gates
- `docs/CANONICAL_SIGNATURES_AND_ENDORSEMENTS_PLAN.md` — the approved,
  two-increment follow-on plan for genuine Ed25519 signatures, authorization,
  and endorsement policies
- `docs/CANONICAL_INSTRUCTOR_READY_PLATFORM_PLAN.md` — the approved stopping
  point B roadmap for the hosted instructor-ready platform
- `docs/current-architecture.md` / `docs/target-architecture.md` — the
  repository audit and target hosted/SCORM boundaries
- `docs/SCENARIO_PACK_V1.md` — the V1 pack schema, validation, publication,
  native-runtime, generic-workflow, and security contract
- `docs/HOSTED_STAGE3_API.md` — the authenticated hosted coffee API, D1 schema,
  role boundaries, and bootstrap procedure
- `docs/APPLICATION_ACCESS_ADMINISTRATION_V1.md` — administrator-only user and
  role provisioning, idempotency, audit, and self-protection boundaries
- `docs/ASSIGNMENT_EXPORT_V1.md` — the stable assignment JSON/CSV evidence
  contract and data dictionary
- `docs/DECISION_OUTCOME_REPORT_V1.md` — replay-derived completed decision
  evidence, realized outcomes, and active-run concealment
- `docs/COMPETENCY_REPORT_V1.md` — versioned learner and class competency
  evidence aggregation and its no-inference boundary
- `docs/RUN_REPLAY_V1.md` — exact sequence-bounded instructor replay and the
  hidden-state boundary
- `docs/RUBRIC_MODERATION_V1.md` — append-only rubric score resolution and its
  separation from simulation scoring
- `docs/HOSTED_RUN_MODES_V1.md` — published Tutorial, Standard, Sandbox, and
  Configured behavior plus deterministic outcome replay
- `docs/COUNTERFACTUAL_BRANCH_FOUNDATION_V1.md` — hosted-only authored
  eligibility, copy-on-write replay, authenticated decision comparison, and
  ungraded reflection
- `docs/COUNTERFACTUAL_EXPORT_V1.md` — stable branch JSON/CSV and
  assignment-level counterfactual reporting
- `docs/SCENARIO_AUTHORING_V1.md` — self-localized pack import, visual draft
  editing, validation, preview, comparison, publication, and retirement
- `docs/SCORM_PACKAGE_JOBS_V1.md` — hosted package identity, object storage,
  shared-build verification, and exact download behavior
- `docs/HOSTED_ROLE_WORKSPACES_V1.md` — authenticated learner, instructor,
  rater, author, and administrator route boundaries
- `docs/ARCHITECTURE.md` — layering, invariants, and every deviation from the
  specification with its reasoning
- `docs/DOMAIN_MODEL.md` — entities, the transaction lifecycle, hashing, time
- `docs/SCENARIO_FLOW.md` — the nine stages and the non-obvious design calls
- `docs/SCORING_MODEL.md` — allocation, the deduction ladder, recall precision
- `docs/CONTENT_AUTHORING.md` — changing the activity, or writing a new one
- `docs/LOCALIZATION_GUIDE.md` — Vietnamese conventions and the audit rules
- `docs/FUTURE_LEDGER_ADAPTERS.md` — what Tier 2 and Tier 3 would take
- `docs/MOODLE_TESTING.md` — the Moodle acceptance checklist
- `CHANGELOG.md`

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

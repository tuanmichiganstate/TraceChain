# TraceChain canonical configurable SCORM plan

Status: approved implementation specification
Current boundary: configurable Guided, Challenge A, and Assessment packages

Pre-release policy: only the current schemas and TC3 state format are
supported. When a load-bearing contract changes, reset development attempts and
regenerate packages; do not add migration readers, aliases, fallback adapters,
or dual-format behavior.

Approved follow-on work for genuine Ed25519 signatures, authorization, and
endorsement policies is specified separately in
[`CANONICAL_SIGNATURES_AND_ENDORSEMENTS_PLAN.md`](CANONICAL_SIGNATURES_AND_ENDORSEMENTS_PLAN.md).
That plan extends this foundation; it does not replace the architecture or
retroactively expand this completed boundary.

## Objective

TraceChain evolves from one fixed SCORM activity into a configurable,
deterministic decision-making simulation while retaining:

- One application codebase.
- One scenario and consequence engine.
- One scoring engine.
- One localization system.
- One SCORM integration.
- One package generator.
- A feasible path to a future server-backed, multi-user application.

Lecturers generate different SCORM packages without editing source code or
maintaining forks. The long-term product supports guided practice, challenge
case, assessment, and technical laboratory modes. The coffee supply-chain
simulation remains the primary learning experience; cryptographic mechanisms
support the business decisions rather than replacing them.

## Product direction and current boundary

TraceChain remains a guided simulation, not an unrestricted sandbox or
conventional game. The common nine-stage journey guarantees exposure to the
required concepts, comparable scoring, structured debriefing, and a practical
classroom duration. Selected decisions now produce persistent, deterministic
consequences that appear later.

This implementation boundary delivers only:

1. A future-compatible simulation boundary and deterministic headless replay.
2. Compact TC3 SCORM persistence.
3. Validated external configuration.
4. Guided and curated Challenge A presets.
5. One-build CLI package generation.
6. Three consequential decision stages.
7. A causal final report.
8. Generated and tested guided and challenge SCORM packages.

It does not deliver a backend, database, authentication, real-time
collaboration, lecturer dashboard, graphical package builder, multi-tenant
service, production PKI, real distributed network, unrestricted procedural
generation, open-world simulation, digital signatures, endorsement policies,
state-conflict laboratory, Merkle laboratory, proof-of-work laboratory,
cryptocurrency, or token economy.

## Design principles

### One codebase, tested presets

Every generated package uses the same application, simulation core,
components, scoring, localization, cryptographic services, and SCORM adapter.
Presets are exposed before unrestricted configuration to avoid invalid
combinations, inconsistent assessment, and avoidable maintenance.

### Business decisions remain central

The learning experience concerns supply-chain decisions, data governance,
accountability, ownership and custody, correction, recall, authorization,
truthfulness of source data, and the limits of blockchain. Technical inspection
clarifies those decisions.

### Genuine technical claims

SHA-256 hashing, canonical serialization, hash chaining, asset-state and
document hashes, and integrity verification remain genuine. Signatures,
endorsements, organizational identity, network communication, ordering, and
consensus remain explicitly simulated until their later technical phases.

### Deterministic outcomes

The same fully resolved configuration, scenario version, scenario seed, and
submitted command sequence must produce the same events, audit events, state,
consequences, scores, diagnostics, and final report. Time, randomness, and
identifier generation are injected.

### Clear LMS ownership

TraceChain owns its internal simulation, decisions, feedback, hints, scoring,
diagnostics, and final report. The LMS owns availability, attempt policy,
gradebook aggregation, access restrictions, and activity completion policy. A
package's passing score is configuration-owned and must agree across learner
text, score evaluation, SCORM status, and manifest metadata.

### Future server authority

The reusable core does not depend on SCORM, React, browser storage, or one
person playing every organization. Browser state displays and submits work; it
does not define the business rules. A future server can become authoritative
without replacing the core.

## Target architecture

```text
TraceChain
  reusable simulation core
    commands and validation
    accepted domain events
    rejected-attempt audit events
    state reconstruction
    decisions and consequences
    scoring and provenance
    causal reporting

  reusable supporting services
    scenario definitions
    configuration and validation
    hashing and canonicalization
    diagnostic reporting

  environment adapters
    SCORM persistence
    memory persistence
    standalone persistence
    clock
    random source
    identifier generator

  current applications
    SCORM player
    SCORM package generator

  future applications
    collaborative web client
    simulation server
    lecturer dashboard
```

## Simulation and architecture contracts

TraceChain remains one guided, deterministic coffee supply-chain simulation.
Guided and challenge packages reuse one application build, simulation core,
scoring engine, localization system, SCORM adapter, and package generator.
Package configuration and scenario data remain external runtime files:
`tracechain.config.json` and `scenario.json`.

The simulation core is independent of React, browser storage, SCORM, and the
LMS. Learner actions cross the core boundary as commands with trusted
`sessionId`, `actorId`, `organizationId`, and `roleId` metadata. Accepted
commands create append-only domain events. Rejected attempts create
`AttemptAuditEvent` records and never enter ledger projections, hashes, blocks,
or asset versions.

Mutable assets use explicit state versions and commands declare
`expectedStateVersions: Readonly<Record<string, number>>`. New assets have no
prior version. Every affected existing asset increments exactly once for an
accepted command; outputs begin at version 1. Time, randomness, and identifiers
are injected and deterministic.

### Commands and trusted context

Every meaningful submitted business action is a command. Learner-editable
payloads never assert identity. The application orchestrator creates command
metadata from scenario-controlled trusted execution context:

```ts
interface CommandMetadata {
  readonly commandId: string;
  readonly sessionId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly submittedAt: string;
  readonly expectedStateVersions: Readonly<Record<string, number>>;
}
```

`sessionId`, `actorId`, `organizationId`, and `roleId` are distinct concepts.
They remain present on commands, accepted events, rejected-attempt audit
events, and causal evidence.

### Accepted events and rejected attempts

```ts
type SimulationEvent = AcceptedDomainEvent | AttemptAuditEvent;
```

Only `AcceptedDomainEvent` values reduce into ledger and asset state. An
`AttemptAuditEvent` remains available for scoring and reporting, but:

- Never enters the blockchain ledger.
- Never changes an asset version.
- Never affects transaction or block hashes.
- Never appears as an accepted business transaction.
- Never reduces into business state.

Corrections are later append-only accepted events that reference the original
record. Previous accepted events are never overwritten or deleted.

### Explicit state-version behavior

New assets have no expected previous version and begin at version 1. A command
that changes existing assets supplies all of their expected versions. A stale,
missing, or unexpected version rejects the command as an audit-only attempt.
Commands with input and output assets increment each affected existing input
exactly once and create each new output at version 1. Multiple accepted events
from one command cannot increment the same affected asset more than once.

### Persistence and environment interfaces

Simulation persistence is accessed through an adapter, not through SCORM or
browser storage from the core:

```ts
interface SimulationPersistence {
  load(): Promise<SimulationSession | null>;
  persistAndCommit(session: SimulationSession): Promise<void>;
}

interface Clock {
  now(): string;
}

interface RandomSource {
  next(): number;
}

interface IdGenerator {
  nextId(prefix: string): string;
}
```

Memory, standalone, and SCORM-facing bridges implement the persistence
boundary. Fixed test clocks, seeded random sources, and deterministic
identifier sequences make headless replay reproducible.

## Consequential submission contract

Stages 3, 5, and 9 permit exactly one initial consequential submission. Initial
controls become read-only after submission. Ordinary edits before submission do
not enter the journal.

- Stage 3 commits one structured certificate decision containing certificate
  assessment, issuer recognition/authorization, storage choice, and lot
  disposition. Review, storage remediation, and lot suspension are separate,
  bounded mitigation commands.
- Stage 5 commits one structured discrepancy decision containing the proposed
  record action and reason code. Overwrite and delete are audit-only rejected
  attempts. Investigation and append-only correction are bounded mitigation
  commands.
- Stage 9 commits scope and evidence under the active trusted role. The stage
  begins under the product holder. An unauthorized attempt is audit-only, but
  its scope and evidence are scored and retained. Scenario-permitted role
  handoff changes trusted execution context; identity is never learner payload.
  Guided mode offers the regulator handoff. Challenge mode requires the learner
  to choose among authored handoffs. Authorized resubmission creates the recall
  events.

Stage completion is evaluated from three distinct facts:

1. The initial consequential decision was submitted.
2. A required business mutation was committed.
3. The bounded mitigation phase was completed or declined as authored.

A rejected initial command therefore unlocks feedback and mitigation but does
not satisfy the business-commitment requirement.

## Score replacement contract

The published maximum remains exactly 100: 39 operational points and 61
knowledge points. No item is duplicated. A second-attempt mitigation is capped
at 80%; an opened item-scoped hint remains capped at 70%, including after
mitigation.

| Existing `scorableItemId` | Old | Consequential replacement | New max | Mitigation max | Split | Hint target and ceiling |
|---|---:|---|---:|---:|---|---|
| `INT_CREATE_BATCH` | 4 | Unchanged create action | 4 | n/a | Operational | `HINT_CREATE_BATCH_FIELDS`, 2.8 |
| `INT_RECEIVE_BATCH` | 3 | Unchanged receipt action | 3 | n/a | Operational | None |
| `INT_CORRECTION_RECORDED` | 10 | Stage 5 discrepancy action and append-only resolution | 10 | 8 | Operational | `HINT_CORRECTION_MECHANISM`, 7 |
| `INT_TRANSFORM_BATCH` | 4 | Unchanged transform action | 4 | n/a | Operational | `HINT_TRANSFORMATION_YIELD`, 2.8 |
| `INT_PACKAGE_BATCH` | 3 | Unchanged package action | 3 | n/a | Operational | None |
| `INT_OWNERSHIP_TRANSFER_SCOPE` | 5 | Unchanged ownership transfer | 5 | n/a | Operational | None |
| `INT_DISPATCH_BATCH` | 5 | Unchanged dispatch action | 5 | n/a | Operational | None |
| `INT_RECALL_COMMITTED` | 5 | Stage 9 authorization and committed recall | 5 | 4 | Operational | None |
| `INT_CERTIFICATE_STORAGE_CHOICE` | 5 | Stage 3 storage subdecision | 5 | 4 | Knowledge | `HINT_CERTIFICATE_STORAGE`, 3.5 |
| `INT_CERTIFICATE_ISSUER_CHECK` | 5 | Stage 3 certificate/issuer/disposition subdecision | 5 | 4 | Knowledge | None |
| `INT_CUSTODY_TRANSFER_SCOPE` | 6 | Unchanged custody judgment | 6 | n/a | Knowledge | `HINT_CUSTODY_VERSUS_OWNERSHIP`, 4.2 |
| `INT_TRANSPORT_CONDITION` | 5 | Unchanged transport judgment | 5 | n/a | Knowledge | None |
| `INT_TRANSFORMATION_PROVENANCE` | 8 | Unchanged provenance judgment | 8 | n/a | Knowledge | None |
| `INT_TAMPER_DEMONSTRATION` | 7 | Unchanged integrity judgment | 7 | n/a | Knowledge | None |
| `INT_DATA_GOVERNANCE_CLASSIFICATION` | 5 | Unchanged governance classification | 5 | n/a | Knowledge | None |
| `INT_RECALL_SCOPE` | 15 | Stage 9 scope and evidence, independent of authority | 15 | n/a | Knowledge | `HINT_RECALL_PROVENANCE`, 10.5 |
| `INT_BLOCKCHAIN_NECESSITY` | 5 | Unchanged debrief judgment | 5 | n/a | Knowledge | None |

Operational: 4 + 3 + 10 + 4 + 3 + 5 + 5 + 5 = 39.
Knowledge: 5 + 5 + 6 + 5 + 8 + 7 + 5 + 15 + 5 = 61.

The points-at-risk disclosure is always calculated from current attempt state.
A hint caps only its declared item and mitigation cannot restore points removed
by opening that hint.

## Configuration, presets, and compatibility

Every production package contains a fully resolved, runtime-validated
configuration. It never depends on undocumented defaults, query parameters, or
learner suspend data for lecturer-owned settings.

```ts
interface TraceChainConfiguration {
  configurationVersion: string;
  mode: "guided" | "challenge" | "assessment" | "technical-lab";
  scenarioId: string;
  scenarioVersion: string;
  scenarioSeed: string;
  difficulty: "introductory" | "intermediate";
  feedbackTiming: "immediate" | "stage-end" | "final";
  hints: "enabled" | "limited" | "disabled";
  referenceWorkspace: "enabled" | "disabled";
  technicalFeatures: {
    hashInspection: boolean;
    digitalSignatures: boolean;
    endorsementPolicies: boolean;
    stateVersionConflicts: boolean;
    merkleLab: boolean;
    proofOfWorkLab: boolean;
  };
  scoring: {
    maximumScore: 100;
    passScore: number;
    reportDiagnosticDimensions: boolean;
  };
  locale: "vi" | "en";
}
```

Configuration precedence is:

1. A valid embedded `tracechain.config.json`.
2. Preset values fully resolved during package generation.
3. Development-only application defaults.

Configuration serialization and hashing are canonical and deterministic.
Configuration hash, scenario ID, and scenario version form exact attempt
compatibility boundaries. Learner-facing feedback, hint controls, reference
workspace, diagnostics, language, and passing-score copy derive from the active
configuration.

### Implemented presets

Guided practice uses Standard Coffee, introductory difficulty, immediate
feedback, enabled hints, the reference workspace, hash inspection, diagnostic
reporting, and a configured pass score.

Challenge A uses one curated intermediate scenario, deterministic identifiers
and quantities, stage-end feedback, limited hints, the reference workspace,
altered certificate and discrepancy conditions, and the same engine and
100-point scoring contract.

Assessment and technical-laboratory modes remain schema values for the intended
architecture but are rejected by current compatibility validation because
their reviewed content is not in this implementation boundary.

### Configuration validation

Validation rejects unknown fields and incompatible versions as well as:

- Passing scores outside 0–100 or a maximum other than 100.
- A scenario that does not match the selected guided or challenge preset.
- Missing fixed scenario seeds.
- Technical features whose content is absent.
- Disabling hash inspection while the current journey exposes hash inspection.
- Assessment or laboratory modes before their reviewed content exists.
- A configuration hash that does not match the embedded configuration.
- Resume data from another configuration or scenario version.

The generator and runtime use the same schema and human-readable errors.

## TC3 persistence and replay

SCORM 1.2 persistence uses a compact TC3 command journal with a 3,800-character
internal ceiling and a 3,000-character authored payload budget. The journal
stores commands and bounded replay inputs, not event objects or independent
accept/reject flags. Replay under the recorded trusted-context sequence
regenerates domain events, audit events, validation outcomes, consequences,
scores, and the causal report.

Each consequential stage has one initial submission and a scenario-bounded
mitigation count. Duplicate `commandId` delivery is idempotent. Knowledge-check
retries keep the existing compact decision/attempt representation and are
explicitly limited to its 35 retained attempts. Persisted strings have
schema-declared UTF-8 byte limits; option indexes and authored reason codes are
preferred. Data is never silently truncated.

The authored payload budget is allocated as follows. These are enforced
ceilings, not estimates:

| Section | Characters |
|---|---:|
| Configuration/scenario/session metadata | 220 |
| Progress, decisions, and hints | 420 |
| Trusted-context handoffs | 160 |
| Baseline business commands and at most 13 valid seals | 1,000 |
| Stage 3 consequential commands | 220 |
| Stage 5 consequential commands and correction reason | 500 |
| Stage 9 recall and authorization commands | 220 |
| Completion flags and TC3 framing | 100 |

The section allocation totals 2,840 characters, leaving 160 characters of
headroom inside the 3,000-character authored budget and 960 inside the
3,800-character internal ceiling. Guided and Challenge A worst-case tests fill
every permitted record, all hint and decision slots, and the complete
240-byte correction reason.

Before an action is exposed as durable, TraceChain builds the prospective
journal, validates and encodes it, confirms its size, writes it, and commits the
adapter. Runtime overflow is an invariant failure, not a normal learner path.
Worst-case tests use every permitted record and maximum string length.

Configuration hash and scenario version are exact resume boundaries. TC2 data
is unsupported and is never read, overwritten, or cleared. The learner is told
to exit and start a new LMS attempt; the package does not claim it can create
one.

### Transactional persistence sequence

For every journaled submission the orchestrator:

1. Produces prospective simulation state and the compact journal.
2. Validates and encodes the complete prospective snapshot.
3. Confirms every section and total remain within the authored limits.
4. Writes the snapshot and commits the active persistence adapter.
5. Only then publishes the resulting command outcome to the learner interface.

If persistence fails, the initial controls do not advance to a committed
learner-visible state. Overflow is an invariant failure with localized
recovery, not an authored learner path. No learner data is silently truncated.

## Scenario and consequence model

Each serialized scenario contains metadata, objectives, organizations, actors,
roles, trusted contexts, permitted handoffs, permissions, initial assets and
documents, timeline, stages, decisions, learner command templates, scripted
transactions, journal limits, delayed consequences, scoring rules, and
diagnostic inputs.

Each consequential decision defines its identifier, stage, prompt and options,
preconditions, one atomic initial command, immediate and delayed effects,
ledger effect, score and diagnostic effects, evidence generated, bounded
mitigation, and later stages affected.

### Stage 3: certificate verification

One `SUBMIT_CERTIFICATE_DECISION` atomically records certificate validity,
issuer recognition and authorization, storage choice, and lot disposition.
Separate bounded mitigation commands review the issuer, remediate storage, or
suspend the lot. Earlier choices influence manual review, confidentiality,
operational delay, compliance, and recall evidence at Stage 9.

### Stage 5: quantity discrepancy

One `SUBMIT_DISCREPANCY_DECISION` records the chosen action and authored cause
code for the 1,000 kg ledger value versus 100 kg physical lot. Ignore,
overwrite, delete, append-only correction, and investigate-then-correct remain
distinct choices. Overwrite and delete create only an `AttemptAuditEvent`.
Investigation and correction are bounded later commands; the accepted
correction references the original manifest transaction and leaves it intact.

### Stage 9: recall scope and trusted handoff

Stage 9 begins in the trusted context of the organization holding or
discovering the affected product. The learner selects scope and evidence, then
may request only handoffs authored by the scenario. Permitted handoffs are
available before the first recall commitment as well as after an authorization
rejection. A learner who selects the appropriate handoff first can earn the
full `INT_RECALL_COMMITTED` value; submitting immediately under the product
holder keeps the authored unauthorized path reachable.

An initial submission under an unauthorized active role:

- Is the one initial consequential submission.
- Creates an `AttemptAuditEvent` containing scope and evidence.
- Creates no ledger mutation or asset-version change.
- Scores `INT_RECALL_SCOPE` independently from authorization.
- Unlocks authored feedback and mitigation.

Guided mode offers the regulator handoff. Challenge A says further action is
possible and requires selection of the appropriate authored handoff. The
orchestrator, not the learner payload, supplies the new trusted context.
Authorized resubmission creates the accepted recall event and scores
`INT_RECALL_COMMITTED`. The final report retains both submissions.

### Stage progression after rejection

Stage completion never infers success solely from acceptance of the initial
command. Completion rules explicitly require:

```text
initial consequential decision submitted
business mutation committed, where required
mitigation phase completed or declined as authored
```

After a Stage 5 overwrite/delete attempt or Stage 9 unauthorized attempt, the
initial controls remain read-only. The learner proceeds through mitigation or
authorized resubmission; the interface never erases and replaces the initial
history.

## Causal final report

The final report contains the single academic score, existing competency
breakdown, explanatory diagnostic dimensions, hints used, invalid attempts,
committed transaction and block counts, scenario identity, configuration hash,
and deterministic decision-to-consequence explanations.

Diagnostics cover traceability, data integrity, compliance, consumer safety,
operational efficiency, and governance quality. They explain the result and do
not create a competing grade. The report explicitly distinguishes, for
example, an authorization-rejected recall attempt from the later regulator
resubmission and an overwrite attempt from the append-only correction that
resolved the operational path.

## Packaging and reproducibility

The CLI builds the static application once, then combines the identical output
with validated configuration and scenario files to create each package.
Release packaging fails on a dirty working tree. `--allow-dirty` is for local,
non-release output, records dirty status and the application build hash, and
makes no cross-machine byte-reproducibility claim. Every such archive carries
an `_NON_RELEASE` filename suffix so it cannot be mistaken for a release.

Clean builds normalize ZIP metadata and use the deterministic generation
timestamp. `build-info.json` records application version, source commit,
generator version, configuration hash, scenario identity, application build
hash, and timestamp.

Release usage:

```text
npm run package:scorm -- --preset guided
npm run package:scorm -- --preset guided,challenge
npm run package:scorm -- --config configs/resolved-package.json
```

`--title` changes manifest metadata. `--no-build` reuses an existing static
build. `--allow-dirty` is restricted to explicitly non-release local output.

### Lecturer and developer workflow

The current CLI workflow is:

1. Select a guided or challenge preset, or provide a fully resolved config.
2. Validate compatibility and show the resolved package summary.
3. Build the static application once unless `--no-build` is explicit.
4. Add external configuration and scenario JSON.
5. Generate manifest and build metadata.
6. Normalize and create a descriptive ZIP.
7. Validate every generated package.
8. Upload the ZIP and configure LMS-owned attempt settings.

The later graphical builder must call this same configuration and generation
logic; it must not introduce another configuration system.

### Package contents

Every package contains:

```text
imsmanifest.xml
index.html
application assets
tracechain.config.json
scenario.json
build-info.json
version.json
SCORM runtime integration
bundled README/documentation
```

`build-info.json` records application version, source commit, generator
version, deterministic generated timestamp, configuration hash, scenario ID
and version, application build hash, dirty status, and release status.
Manifest passing-score metadata is generated from the active configuration.

Guided and Challenge A packages are produced by copying the same static
application output and adding only their external runtime files. Verification
compares every static filename and byte and requires one identical application
build hash.

## Repository responsibility boundaries

Exact folder names follow existing conventions, but responsibilities remain
separated:

```text
src/
  app/                         React orchestration and presentation
  config/                      types, presets, validation, hashing, loading
  domain/
    simulation/                commands, accepted/audit outcomes, replay
    scenario/                  reusable scenario evaluation
    scoring/                   the one academic score
    provenance/                trace and recall calculations
    reporting/                 causal diagnostics
  infrastructure/
    persistence/               TC3 codec and adapter boundaries
    scorm/                     SCORM 1.2 platform adapter
    hashing/                   canonicalization and real SHA-256
  scenarios/
    coffee-traceability/       Standard Coffee runtime data
    challenge-a/               curated Challenge A runtime data
  locales/                     all learner-facing Vietnamese and English text

scripts/
  build-scorm.mjs              shared-build CLI generator
  verify-scorm.mjs             package and shared-build verification
  package-entry.ts             generator-side config/scenario bundle

docs/
  CANONICAL_CONFIGURABLE_SCORM_PLAN.md
  content-review/
```

Simulation, scoring, consequence, provenance, and reporting logic run without
React, a browser, SCORM, Moodle, or local storage.

## Deferred technical roadmap

After this boundary is stable, future phases may add in order:

1. Lecturer-facing graphical builder using the existing generator.
2. Genuine educational digital signatures plus separate identity and
   authorization checks.
3. Real endorsement-policy evaluation.
4. A deterministic state-version conflict activity.
5. Reviewed assessment variants with fixed scoring and seeds.
6. Optional genuine Merkle inclusion proofs.
7. Optional low-difficulty proof-of-work comparison.

Proof of work must never replace the permissioned main-ledger model.
Cryptocurrency remains deferred unless a separate learning outcome explicitly
requires token incentives, settlement, carbon credits, loyalty, or token
governance.

## Delivery gates

The work remains one plan, delivered incrementally:

1. Simulation boundary and headless replay.
2. TC3 persistence and trusted contexts.
3. External configuration, presets, and scenario serialization.
4. Standard-scenario parity.
5. Consequential decisions and exact scoring.
6. Delayed consequences and causal report.
7. Challenge A through the same core suite.
8. One-build CLI packaging and validation.
9. Guided and challenge browser, SCORM, Moodle, locale, content, and
   accessibility acceptance.

Every step must be green before the next depends on it. The graphical builder,
digital signatures, endorsements, state-conflict laboratory, Merkle proofs,
proof of work, cryptocurrency, backend, and multi-user interface remain outside
this implementation boundary.

## Required verification

### Simulation core

- Commands do not mutate prior state directly.
- Accepted commands generate deterministic accepted events.
- Rejected commands generate only deterministic audit events.
- Accepted events reconstruct expected state.
- Actor and organization context survive every outcome.
- Duplicate command delivery is idempotent.
- Existing assets use deterministic optimistic-version checks.
- The same seed, contexts, and commands reproduce state, audit outcomes, score,
  consequences, and report without SCORM or React.

### Configuration and scenarios

- Every implemented preset validates.
- Invalid combinations and unknown fields are rejected.
- Default resolution and configuration hashing are stable.
- Standard Coffee retains its required journey and scoring totals.
- Challenge A passes the same scenario/core contracts.
- Delayed consequences appear at the authored stage.
- Branches return to the common journey.
- Final explanations agree with replayed history.

### Persistence

- Memory and platform persistence obey one interface.
- TC3 resume reconstructs derived state rather than persisting redundant event
  or ledger objects.
- Exact configuration and scenario boundaries reject incompatible state.
- Every string and record count is schema-bounded.
- Real authored worst cases fit below the 3,800-character internal ceiling.
- Prospective persistence completes before command state is published.
- Unsupported pre-TC3 data is never read or rewritten and directs the learner
  to a new LMS attempt.

### Scoring and hints

- The score remains exactly 100 with the published 39/61 split.
- The old-to-current score replacement table has no duplicate item.
- Scope/evidence and authorization score independently at Stage 9.
- Item-scoped hint ceilings match learner disclosure.
- Mitigation never restores points removed by a hint.
- Passing-score text, logic, manifest metadata, and SCORM success agree.

### Packages, browser, and LMS

- Required package files and valid manifests are present.
- Guided and Challenge A share byte-identical static application output.
- Metadata and hashes match package contents.
- Clean outputs are deterministic; dirty release generation fails.
- Compiled Chromium accessibility, reflow, resume, and SCORM boundary tests
  pass.
- Moodle parses and deploys the package, round-trips TC3 state, resumes,
  reports score/completion, preserves configured gradebook behavior, respects
  the SCORM 1.2 storage boundary, and cleans up synthetic attempts.

### Content and accessibility

- Vietnamese and English catalogues remain in parity.
- Learner text reflects the configured behavior and distinguishes real from
  simulated mechanisms.
- The bilingual content-review artifact is regenerated deterministically.
- Existing axe, keyboard, screen structure, and reflow gates remain green.

## Success criteria

This boundary is complete when:

- A lecturer can generate guided or Challenge A without source edits.
- Both packages trace to one application build and resolved configuration.
- The same core can later serve assessment and server-backed applications.
- Consequential decisions create understandable later effects.
- Rejected attempts and later mitigation remain visible without corrupting the
  accepted ledger.
- Stage 9 authorization failure is reachable only through trusted
  scenario-controlled context and can be resolved by an authored handoff.
- Save/resume and audit outcomes are deterministic.
- Scores remain exactly comparable under the curated scoring contract.
- Learners can distinguish integrity from truthfulness and identity from
  authorization.
- The core, scoring, provenance, and causal report pass a headless portability
  test.
- All repository, package, browser, localization, content, accessibility, and
  Moodle acceptance gates are green.

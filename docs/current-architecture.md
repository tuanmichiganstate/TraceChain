# Current architecture

Status: audited on 24 July 2026
Baseline commit: `f4edfad16c42012f3c32cc0858132aedc5ecc47b`

This document is the Phase 0 inventory for the instructor-ready configurable
platform roadmap. It describes the repository as it exists before hosted
platform code is added.

Implementation progress after this baseline is documented in
`docs/HOSTED_STAGE3_API.md`; this audit remains intentionally fixed to its
starting commit.

## Product surfaces

TraceChain currently has three delivery surfaces and no application backend:

1. A React learner application built by Vite.
2. Portable Guided, Challenge, and Assessment SCORM 1.2 packages generated from
   one static application build.
3. A standalone Sites deployment whose Cloudflare Worker serves the same
   static learner application.

Docker Moodle is a local acceptance environment. It is not an application
database or production service.

## Runtime map

```text
React presentation
  -> SimulationProvider orchestration
  -> canonical proposal and Ed25519 verification
  -> authorization evaluation
  -> pure command validation and domain events
  -> SimulatedLedger
  -> deterministic reducer, hashing, scoring and reporting
  -> compact TC3 journal
  -> SimulationPersistence
       -> LearningPlatformPersistenceBridge -> SCORM 1.2
       -> MemorySimulationPersistence       -> headless tests
       -> StandalonePersistenceAdapter      -> localStorage
```

The hosted Sites worker currently serves assets and an application-shell
fallback only. It has no API routes, identity handling, D1 binding, R2 binding,
or authoritative run processing.

## Reusable modules

### Simulation and ledger core

The existing core already provides several foundations required by the hosted
plan:

- commands with command, session, actor, organization, role, timestamp, and
  expected-state-version metadata;
- trusted execution context that is not learner-entered;
- separate accepted domain events and rejected attempt-audit events;
- append-only correction;
- optimistic asset-version checking;
- deterministic injected clock, random source, and identifier generator;
- pure state reconstruction;
- idempotent duplicate command handling by `commandId`;
- provenance, scoring, diagnostics, and causal reporting;
- a headless full-attempt test with no React, browser, SCORM, Moodle, or local
  storage.

### Cryptographic services

The cryptographic layer provides:

- canonical proposal serialization;
- SHA-256 proposal digests;
- genuine Ed25519 signing and verification through `SignatureProvider`;
- fixed educational identity and key fixtures;
- public-key fingerprints;
- identity, key-status, context, role, and organization authorization checks;
- independently verifiable evidence bundles.

Cryptographically verified endorsement policies are not implemented. The
ledger has older system-generated simulated endorsements, and the configuration
correctly keeps `endorsementPolicies` disabled.

### Scenario and configuration

`ScenarioDefinition` externalizes:

- organizations, actors, roles, and locations;
- initial assets and deterministic authored history;
- stage order, actions, completion conditions, hints, and checks;
- scoring and ledger configuration;
- trusted contexts, role handoffs, command templates, and journal limits.

`TraceChainConfiguration` externalizes package mode, scenario identity and
seed, feedback, hints, locale, technical features, and scoring. Guided,
Challenge, and Assessment packages use the same static application files with
different runtime JSON.

### Package generation

The Node generator:

- validates a preset or resolved configuration;
- builds the application once for multiple packages;
- writes external configuration, scenario, identity, key, and policy files;
- generates the SCORM manifest and build metadata;
- normalizes ZIP metadata;
- rejects dirty release builds;
- verifies package inventory, hashes, offline operation, and shared static
  assets.

The generator is currently a command-line program with most orchestration in
`scripts/build-scorm.mjs`. A hosted builder must extract a callable job service
from this implementation rather than create a second generator.

## Hard-coded and domain-specific boundaries

The current repository is configurable within the coffee supply-chain family,
but is not yet a domain-agnostic platform.

| Area | Current constraint | Implementation treatment |
|---|---|---|
| Command union | Supply-chain transaction types are TypeScript members | Preserve in the native coffee runtime; add generic pack node and action contracts beside it |
| Domain models | Assets assume batches, quantity units, custody, ownership, and locations | Wrap as one scenario-pack capability profile; do not generalize the working ledger prematurely |
| Stage routing | Nine `ScenarioStageId` values map to registered React stage components | Keep the native coffee renderer; use generic node renderers for portable packs |
| UI | Several stage components understand coffee-specific decisions | Reuse through the native coffee runtime while new nodes use generic evidence and decision components |
| Development build | Vite emits the standard coffee scenario and cryptographic registry | Replace the direct import with a selected development pack only after pack loading is stable |
| Package registry | The packaging entry explicitly knows the accepted coffee scenarios | Move future scenario discovery to validated pack manifests |
| Localization | English and Vietnamese catalogues are shared, but Vietnamese is the accepted package language | Let packs reference stable catalogue keys and validate every declared locale |
| Endorsements | Existing results are simulated, not signatures over one proposal digest | Complete the approved endorsement increment before claiming Phase 3 complete |

These constraints are bounded implementation profiles, not reasons for a
rewrite.

## Persistence and authority

Current authoritative state depends on delivery:

- SCORM: the LMS persists a compact TC3 journal.
- Standalone: browser local storage persists the same compact state.
- Headless tests: memory persistence.

There is no server event store, user database, assignment database, scenario
publication store, rubric store, object storage, or hosted authorization layer.
The Sites worker has only the `ASSETS` binding.

The compact SCORM journal remains appropriate for portable packages. Hosted
runs need a different persistence adapter with authoritative server sequence
numbers and append-only events. Hosted event storage must not be constrained by
SCORM's 4,096-character limit.

## Deployment and test map

```text
Vite build
  -> dist/
  -> SCORM generator -> deterministic ZIPs -> Moodle
  -> build-site       -> Cloudflare Worker + static client -> Sites
```

The untouched Phase 0 baseline passed:

- ESLint and strict TypeScript;
- 45 Vitest files and 536 tests;
- 3 Sites worker tests;
- 766-key English/Vietnamese parity;
- 978 scenario checks and 308 scenario-contract checks;
- CI matrix coverage for 92 Playwright tests;
- content-review regeneration;
- package-generator policy tests;
- Vite build;
- 213 SCORM verification checks for Guided, Challenge, and Assessment.

## Development risks

### Persisted identifier stability

Stage, decision, hint, command opcode, and scenario identifiers are positional
or externally visible. If their load-bearing order changes before release, the
active schema is upgraded and development attempts are reset.

### Parallel business logic

A new generic engine that reimplements coffee validation would create two
sources of truth. The native coffee runtime therefore calls the current core,
while the generic runtime executes only the declarative capabilities it owns.

### Hidden-state leakage

Hosted runs can keep actual state server-side and return role-filtered
projections. Offline SCORM packages necessarily contain their runtime files.
Secret assessment facts must therefore be omitted, pre-filtered, encrypted by
an external authority, or treated as inspectable in SCORM. The package must not
claim server-grade secrecy.

### Authentication versus simulation identity

Application users, simulation actors, organizations, and roles are four
different concepts. Authentication must never let a client self-assert a
simulation identity. Assignment and scenario rules select trusted simulation
context server-side.

### Database lock-in

The repository is already connected to Cloudflare Sites, whose durable
relational service is D1. Hosted persistence must remain behind repository and
event-store interfaces so a managed PostgreSQL adapter can be introduced
without replacing simulation services.

### Packaging reuse

The hosted graphical builder must invoke the existing Node packaging service.
Forking its validation, metadata, or ZIP logic would invalidate the shared-build
and reproducibility guarantees.

### Scope sequencing

The supplied roadmap states that endorsements are complete. Repository evidence
shows otherwise. Phase 3 remains open until endorsements use real signatures
over the same proposal digest and pass the approved Increment B gates.

## Phase 0 conclusion

Incremental refactoring is practical. The present command/event boundary,
scenario configuration, deterministic replay, and package generator are strong
enough to become shared platform services. The first implementation should add
a versioned scenario-pack envelope, competency and rubric contracts, a hosted
run event contract, validation tools, and one native coffee vertical slice
before introducing database or interface complexity.

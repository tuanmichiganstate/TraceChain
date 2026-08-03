# ADR 0002: Technical Laboratory runtime boundary

Status: accepted
Date: 27 July 2026

## Context

The approved Technical Laboratory plan adds seven short verification
experiments to both hosted and SCORM delivery. The repository audit found that
the required computations already exist, but the current learner runtime is
deliberately specialized:

- package configuration reserves `technical-lab`, while validation rejects it;
- the SCORM player routes the nine coffee stages through `ScenarioStageId`;
- SL1 persistence budgets coffee progress and Stage 3, 5, and 9 journals;
- the score engine implements the coffee 39/61 contract;
- hosted generic runs render authored professional scenario nodes, not
  interactive technical experiments;
- package jobs and the generator publish Guided, Challenge, and Assessment.

Adding seven laboratory identifiers to the coffee stage enum or representing
experiments as fake business transactions would make both models less honest.
Creating a second configuration, cryptographic implementation, or package
generator would violate the one-codebase boundary.

SimuLedger is still pre-release. Configuration and content contracts may be
upgraded directly; no migration readers or dual-format paths are required.

## Decisions

### Use one discriminated package configuration

Configuration Schema V2, introduced by ADR 0003, is a union:

- business simulation modes use the existing `sl1-v1` compatibility boundary;
- Technical Laboratory uses `tl1-v1`, an exact lab-pack identity, the accepted
  preset, and an ordered module list.

Business-only consumers narrow at the runtime/provider boundary. The future
top-level player dispatch will inspect the union and mount either the coffee
simulation or the laboratory shell.

### Keep product type separate from hosted run behavior

Technical Laboratory is an activity/content type. Hosted `tutorial`,
`standard`, `sandbox`, and `configured` values remain behavior settings.
Assignment contracts will gain a content-kind discriminator instead of adding
`technical-lab` to `HostedRunMode`.

### Publish a bounded laboratory content bundle

The Technical Laboratory contract contains:

- a versioned pack;
- seven ordered module definitions;
- reviewed renderer IDs;
- declarative experiment steps;
- educational fixture references;
- localization catalogues;
- the laboratory-specific 100-point scoring contract.

Content may select only registered renderers and action capabilities. It cannot
provide JavaScript, private-key material, or arbitrary executable expressions.
The existing publication metadata and content-hashing utilities remain the
model for immutable publication.

### Dispatch to a dedicated laboratory runtime

The laboratory will receive its own application shell, experiment state, score
projection, and final report. It will not add stages to `ScenarioStageId` or
reuse the coffee score components.

One headless experiment engine will serve hosted and SCORM delivery. Renderers
submit declarative actions to that engine. Hashing, canonical serialization,
Ed25519 signing and verification, identity resolution, authorization,
endorsement evaluation, state-version validation, ledger commitment, clocks,
and identifiers continue to come from shared SimuLedger services.

### Use a separate compact wire format behind the same persistence ports

Technical Laboratory uses the `TL1` compatibility boundary. The journal stores
bounded indexes and numeric input-edit deltas, never full computed hashes,
signatures, keys, or canonical payloads.

Editable source values have authored UTF-8 and mutation limits. Every action
has an authored maximum occurrence count. Package acceptance must calculate
the actual authored worst case and prove that it remains below the existing
3,800-character internal ceiling before a learner-facing module is added.

No SL1 migration or compatibility reader will be introduced.

### Extend the existing package pipeline only after the runtime is complete

The Technical Laboratory package uses the same static application build and
generator. Its runtime configuration, pack, modules, fixtures, and localization
remain external files. Hosted package jobs and Moodle deployment manage it as
the ninth accepted preset after the eight Operations and Audit packages.

## Increment boundaries

1. Configuration union, contracts, validation, renderer capability registry,
   and persistence-size proof.
2. Technical Laboratory shell and shared headless experiment engine.
3. TL1 and TL2.
4. TL3 and TL4.
5. TL5 and TL6.
6. TL7.
7. Scoring, hints, report, localization, and content review.
8. Hosted assignment integration.
9. SCORM packaging and exact-package Moodle acceptance.

Increments 1 through 8 and the packaging/tooling portion of Increment 9 are
implemented. Exact-package Moodle browser acceptance remains an operating gate
for a deployed release rather than evidence supplied by this ADR.

Each increment ends with the repository quality gate. Laboratory packages,
hosted assignments, and Moodle activities remain unavailable until their
corresponding integration increment is complete.

## Consequences

- Guided, Challenge, and Assessment retain their current domain and score
  semantics.
- Laboratory content cannot mutate the business ledger accidentally.
- Real technical results remain reusable and independently testable.
- Hosted and SCORM runs can replay the same bounded learner actions.
- A fourth package requires runtime work; changing the preset union alone is
  intentionally insufficient.
- The first release remains fixed to TL1–TL7 and 100 points. Curated subsets
  require separate published scoring contracts later.

## Explicitly not decided here

This ADR does not authorize Merkle proofs, proof of work, mining,
cryptocurrency, learner-generated keys, production PKI, multi-user
endorsement, AI tutoring, or a generic visual laboratory authoring tool.

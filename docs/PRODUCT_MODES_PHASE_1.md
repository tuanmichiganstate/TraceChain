# Product modes roadmap: Phase 1 implementation

Status: implemented. Phase 2 shared-workspace benchmarks are documented
separately in `PRODUCT_MODES_PHASE_2.md`; live learner-screen rollout has not
started.
Starting commit: `c8dabc0c03652080ff9833351fe718076e78118e`

## Repository audit

The audit found two established configuration layers:

1. SCORM presets (`guided`, `challenge`, `assessment`, and
   `technical-lab`) selected package content and learner behavior.
2. Hosted run profiles (`tutorial`, `standard`, `sandbox`, and `configured`)
   controlled lower-level hints, retries, feedback, time limit, and outcome
   resolution.

Hosted profiles remain useful runtime contracts, but they are not the product
taxonomy. Configuration Schema V2 resolves both surfaces into one complete,
channel-neutral experience configuration.

The reusable boundaries already suitable for this work were:

- immutable scenario-pack versions;
- deterministic hosted event replay;
- external SCORM configuration and scenario data;
- canonical serialization and SHA-256 hashing;
- authoritative hosted assignment creation;
- D1 repositories behind application services;
- deterministic package generation and verification; and
- versioned assignment reports and exports.

No parallel scenario engine, persistence path, report engine, or package
generator was introduced.

## Current compatibility map

| Existing selector/profile | Resolved dimensions | Current delivery |
|---|---|---|
| Guided | Operations / Guided / Formative / Fixed | SCORM |
| Challenge | Operations / Challenge / Formative / Curated Variant | SCORM |
| Assessment | Operations / Challenge / Assessment / Fixed | SCORM |
| Technical Laboratory | Technical Laboratory / Practice / Formative / Fixed | SCORM configuration boundary |
| Tutorial | Operations / Guided / Formative / Fixed | Hosted |
| Standard | Operations / Challenge / Assessment / Fixed | Hosted |
| Sandbox, probabilistic | Operations / Practice / Sandbox / Seeded Stochastic | Hosted |
| Sandbox, forced | Operations / Practice / Sandbox / Fixed | Hosted |
| Configured, probabilistic | Operations / Challenge / Sandbox / Seeded Stochastic | Hosted |
| Configured, forced | Operations / Challenge / Sandbox / Fixed | Hosted |

Assessment remains Fixed because the active repository contains one reviewed
Assessment case, not a calibrated variant bank. That repository-required
deviation preserves present behavior and prevents metadata from making a claim
the content cannot support.

## Implemented contracts

Configuration Schema V2 adds:

- `activityType`;
- `supportProfile`;
- `deliveryPurpose`;
- `outcomeStrategy`;
- exact content references;
- resolved guidance, feedback, hint, retry, and decision policies;
- scoring-blueprint identity and official-score status;
- reporting policy;
- delivery and persistence policy; and
- locale.

The authoritative resolver is in `src/config/experience.ts`. SCORM-specific
validation remains in `src/config/validation.ts`, while hosted assignment
resolution is in `src/platform/runs/experience-configuration.ts`.

## Persistence and replay

Hosted assignments persist:

```text
experience configuration JSON
canonical configuration SHA-256
```

Run creation records both values in the first authoritative event. Replay
reconstructs the expected configuration from the exact published scenario
version and rejects a mismatch.

SCORM continues to persist its bounded runtime journal rather than duplicating
configuration inside learner progress. The embedded package configuration hash
remains the compatibility boundary.

Under the repository's pre-release policy, D1 schema installation now creates
only the active columns. No legacy assignment or run reader was added.

## Package, report, and export metadata

SCORM build information, artifact catalogs, hosted package jobs, and package
verification now identify:

- configuration schema;
- preset;
- four product dimensions;
- content pack and version;
- scoring blueprint and version;
- scenario identity; and
- configuration hash.

Hosted assignment reports contain the exact assignment configuration.
Assignment evidence export schema `2.0.0` and flat CSV layout V2 add the same
identity fields to stable export metadata.

## Behavior characterization

Tests pin the current product behavior:

- Guided remains immediate-feedback, hint-enabled, formative Operations.
- Challenge remains stage-end-feedback, limited-hint, curated Operations.
- Assessment remains final-feedback, no-hint, fixed reviewed Operations.
- Technical Laboratory retains its separately approved Practice boundary.
- Hosted profile behavior is unchanged after dimension resolution.
- Hosted assignment and run configuration hashes are deterministic.
- A stored or replayed configuration mismatch fails closed.

There are no new learner screens, controls, scores, hints, retries, or
scenario branches in Phase 1.

## Risks and controls

| Risk | Control |
|---|---|
| Flat mode logic reappears in UI | Components consume resolved policy fields, not preset names |
| Hosted and SCORM drift | Shared types, resolver, hash, and dimension validator |
| Incomplete Audit or Laboratory package | Runtime-specific validation rejects unavailable content |
| Mislabelled Assessment variation | Current fixed case is reported as Fixed |
| Stale development records | Direct schema upgrade and data reset; no fallback reader |
| Report loses interpretation context | Full configuration and hash travel with assignment and export |
| Package generator diverges | Existing generator and verifier were extended in place |

## Deferred scope

Phase 1 deliberately does not include:

- the shared visual workspace architecture;
- a Practice Operations case;
- Audit activities or findings;
- curated Assessment variants;
- learner-visible product-mode controls;
- unrestricted randomness;
- collaboration or AI; or
- a second package generator.

The next authorized increment is Phase 2, beginning with benchmark shared-shell
prototypes. It must not start automatically from this Phase 1 implementation.

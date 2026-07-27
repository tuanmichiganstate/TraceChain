# ADR 0003: Multidimensional experience configuration

Status: accepted
Date: 27 July 2026

## Context

TraceChain previously used two unrelated concepts called a mode:

- SCORM package presets selected `guided`, `challenge`, `assessment`, or
  `technical-lab`; and
- hosted scenario profiles selected `tutorial`, `standard`, `sandbox`, or
  `configured` runtime behavior.

Neither vocabulary could identify the professional activity, learner support,
delivery purpose, and outcome strategy independently. In particular,
Assessment is a delivery purpose rather than a learner-support profile, and
Audit is a professional activity rather than another presentation of
Operations.

The product-modes roadmap defines four independent dimensions:

```text
activityType
supportProfile
deliveryPurpose
outcomeStrategy
```

TraceChain is still in pre-release development. Repository policy requires
direct contract upgrades and development-data resets rather than migration
readers or dual-format compatibility code.

## Decision

### Use one channel-neutral Configuration Schema V2

`TraceChainExperienceConfigurationV2` is the shared contract for hosted and
SCORM delivery. Besides the four product dimensions, it resolves:

- exact content identity;
- guidance, feedback, hint, retry, and decision policy;
- scoring-blueprint identity and official-score status;
- reporting policy;
- delivery and persistence policy; and
- locale.

Business-simulation and Technical Laboratory package configurations extend
this shared contract with their runtime-specific fields. The existing `tc3-v2`
and `tl1-v1` compatibility boundaries continue to distinguish their compact
runtime journals; they are not product-mode fields.

### Keep preset and hosted profile IDs as selectors

Existing IDs remain stable authoring and instructor selectors. They are no
longer the authoritative description of the learner experience. One resolver
maps them to product dimensions, and the resulting complete configuration is
validated and hashed.

The current mappings are:

| Selector | Activity | Support | Delivery | Outcome |
|---|---|---|---|---|
| `guided`, `tutorial` | Operations | Guided | Formative | Fixed |
| `challenge` | Operations | Challenge | Formative | Curated variant |
| `assessment`, `standard` | Operations | Challenge | Assessment | Fixed |
| `technical-lab` | Technical Laboratory | Practice | Formative | Fixed |
| `sandbox` with probabilistic outcome | Operations | Practice | Sandbox | Seeded stochastic |
| `configured` with probabilistic outcome | Operations | Challenge | Sandbox | Seeded stochastic |
| `sandbox` or `configured` with forced outcome | Operations | Practice or Challenge | Sandbox | Fixed |

The roadmap's target Assessment mapping is Curated Variant. The repository's
current Assessment package and hosted Standard profile each use one reviewed
fixed case, so Phase 1 records them honestly as Fixed. A curated Assessment bank
requires the later variant and equivalence work; Phase 1 does not pretend it
already exists.

The lower-level hosted value `forced` currently means that replay selects one
stable authored result without a random draw. Product-level
`FORCED_CONDITION` remains reserved for a separately identified condition
override rather than being inferred from that runtime mechanism.

### Persist and report the resolved identity

Hosted assignments store the complete resolved configuration and its canonical
SHA-256 hash. The initial run event repeats that identity, and replay verifies
it against the exact immutable pack, scenario, and runtime profile.

SCORM packages embed the complete configuration. Package build information,
the hosted artifact catalog, package jobs, verification, and assignment
exports carry the schema version, four dimensions, content-pack identity, and
scoring-blueprint identity.

### Validate centrally and fail closed

The shared validator owns dimension compatibility and channel-neutral
invariants. Runtime validators add content and engine constraints. Unsupported
combinations, missing content, mismatched hashes, stale stored identities, and
incomplete package metadata are rejected rather than defaulted.

The current allowed matrix includes the roadmap mappings plus only the fixed
Assessment and fixed hosted Sandbox cases already required to preserve current
behavior. Audit configurations are representable but cannot be packaged before
Audit content exists.

### Upgrade development state directly

There is no reader for the previous flat package configuration, hosted
assignment record, package-job record, or evidence-export schema. Development
D1 data, local hosted runs, SCORM packages, browser state, and Moodle attempts
must be reset and regenerated against the active contracts.

## Consequences

- Hosted and SCORM delivery describe an experience using the same product
  vocabulary.
- A preset name cannot silently stand in for feedback, hints, retry, scoring,
  or outcome policy.
- Exact configuration identity is available in replay, package inspection,
  instructor reports, and exports.
- Guided, Challenge, Assessment, and Technical Laboratory learner behavior is
  unchanged in Phase 1.
- The schema can represent Audit and Practice without shipping either
  learner-facing activity prematurely.
- Old development artifacts fail honestly and must be regenerated.

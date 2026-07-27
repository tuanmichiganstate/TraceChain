# Product Modes Phase 3: Operations Support Profiles

Status: implemented locally; deployment and human acceptance remain separate
owner-controlled gates.

Starting commit: `ee783c598572ff213dae75b0508b281e6d0d959b`

## Boundary

Phase 3 makes Guided, Practice, and Challenge explicit support profiles for
Operations activities and adds one curated Practice case between the existing
Guided and Challenge experiences.

It extends the existing configuration, scenario, command, event, scoring,
persistence, localization, package-generation, and SCORM verification
boundaries. It does not add another player, transaction engine, scoring system,
storage format, or package generator.

The phase does not implement Audit activities, new Technical Laboratories, a
graphical policy editor, collaboration, AI, unrestricted randomness, or a
second official score.

## Support-profile contract

| Profile | Evidence and policy support | Feedback | Hints | Purpose |
|---|---|---|---|---|
| Guided | Direct early, suggested in the middle, absent late | Immediate | Enabled | First supported encounter |
| Practice | Suggested on request throughout | Immediate | Enabled on request | Independent formative bridge |
| Challenge | No evidence or policy prompts | Stage end | Limited | Curated transfer case |

The support resolver consumes the configured `GuidancePolicy`. Components do
not infer this behavior from a package name. Guided fading uses authored
early, middle, and late stage phases. Practice presents suggestions in a closed
native disclosure so the learner chooses whether to inspect them. Challenge
does not render the support panel.

The prompts identify which professional evidence category or policy boundary
to inspect. They do not disclose the authored answer, change ledger truth, or
alter command validation.

Hosted Sandbox Practice resolves the same guidance, feedback, hint, and retry
policy semantics. Phase 3 does not fork the hosted simulation engine or add a
second hosted case system.

## Curated Practice case

The new case is:

```text
Scenario: SCN_COFFEE_PRACTICE@1.0.0
Variant bank: BANK_COFFEE_PRACTICE_V1@1.0.0
Learner reference: PR-01
Estimated duration: 28 minutes
```

It uses the existing nine-stage coffee journey, command engine, consequence
rules, cryptographic services, and scoring blueprint. Its authored facts differ
from both Standard Coffee and the Challenge bank:

- manifest quantity: 680 kg;
- received quantity: 85 kg;
- roasted quantity: 68 kg;
- package count: 680;
- certificate content invalid, with a recognized and authorized issuer;
- discrepancy caused by a unit mismatch; and
- recall source in the roasted lineage.

The case uses stable authored evidence and fixed option ordering. Its only
variant is selected through the existing deterministic variant-bank mechanism,
so replay records the same compact variant assignment used by Challenge.

## Scoring and persistence

Phase 3 preserves:

```text
Maximum score: 100
Operational points: 39
Knowledge points: 61
```

The Practice bank is derived from the same assessment blueprint contract and
is validated against that split. Existing scorable item identifiers, hint
targets, item ceilings, mitigation ceilings, and append-only correction
behavior are unchanged.

No persistence schema or migration reader was added. The TC3 compact journal
stores the resolved configuration identity and deterministic Practice variant
assignment, while commands, audit outcomes, events, score, and report remain
replay-derived. The authored worst-case Practice path is included in the
existing 3,800-character and section-budget test.

## Packaging

The package generator now accepts four presets in one build:

```text
guided
practice
challenge
assessment
```

The Practice artifact is:

```text
TraceChain_Practice_PracticeCase_vi_v1.0.0.zip
```

Dirty development builds use the established `_NON_RELEASE` suffix. All four
packages reuse identical static application assets; only external
configuration, scenario, bank, manifest, and build metadata differ as
authored.

The instructor package-job contract, fresh-install D1 schema, graphical job
form, package verifier, and Docker Moodle deployment scripts recognize
Practice. The Moodle scripts manage four separately reset activities, but
Phase 3 implementation does not itself deploy them.

## Verification

Automated coverage includes:

- exact product-dimension resolution for Practice;
- invalid support, feedback, and hint combinations;
- Guided fading, Practice on-request support, and Challenge absence;
- Practice scenario and variant-bank validation;
- deterministic configuration and scenario hashing;
- exact 100-point and 39/61 scoring contract;
- authored TC3 worst-case size and section budgets;
- independent Practice runtime loading;
- immediate Practice feedback and optional support disclosure;
- locale parity and scenario contracts;
- four-package inventory, metadata, and shared-asset verification; and
- shell and PHP syntax for the four-activity Moodle tooling.

The repository gate and complete configured browser matrix are the final local
acceptance gates. Moodle deployment, Moodle learner acceptance, real
screen-reader testing, and Vietnamese subject-expert review remain external
human or environment gates and must not be inferred from local automation.

## Upgrade policy

TraceChain remains pre-release. Phase 3 upgrades the active preset, schema,
fresh-install database, package, and validation contracts directly. It adds no
legacy aliases, migration readers, fallback package formats, or dual behavior.

## Phase boundary

Phase 3 ends after the Operations Guided, Practice, and Challenge profiles and
the curated Practice case pass the repository and browser gates.

Phase 4 Audit work must not begin automatically.

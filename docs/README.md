# SimuLedger documentation

This index separates current implementation documentation from active human
validation and historical delivery records.

Use the current documents below when changing the product. Archived plans
explain how the repository reached its present design, but they are not the
current implementation contract.

## Core technical references

- [Architecture](ARCHITECTURE.md) — runtime layers, dependency direction, and
  architectural invariants.
- [Domain model](DOMAIN_MODEL.md) — assets, transactions, events, hashing, and
  time.
- [Scenario flow](SCENARIO_FLOW.md) — the learner journey and consequential
  decision semantics.
- [Scoring model](SCORING_MODEL.md) — the fixed 100-point contract, hints, and
  mitigation ceilings.
- [Future ledger adapters](FUTURE_LEDGER_ADAPTERS.md) — boundaries for later
  external-ledger integrations.

## Hosted platform contracts

- [Application access administration](APPLICATION_ACCESS_ADMINISTRATION_V1.md)
- [Hosted role workspaces](HOSTED_ROLE_WORKSPACES_V1.md)
- [Hosted runtime profiles](HOSTED_RUN_MODES_V1.md)
- [Hosted coffee API](HOSTED_STAGE3_API.md)
- [LTI 1.3 Core, Scenario Author launch, Deep Linking, AGS, and NRPS](LTI_1_3_INSTRUCTOR_WORKSPACE_V1.md)
- [Scenario-pack contract](SCENARIO_PACK_V2.md)
- [Assignment evidence export](ASSIGNMENT_EXPORT_V3.md)
- [Run replay](RUN_REPLAY_V1.md)
- [Rubric moderation](RUBRIC_MODERATION_V1.md)
- [Competency reporting](COMPETENCY_REPORT_V1.md)
- [Curriculum overlays](CURRICULUM_OVERLAY_V2.md)
- [Decision and outcome reporting](DECISION_OUTCOME_REPORT_V1.md)
- [Counterfactual branch foundation](COUNTERFACTUAL_BRANCH_FOUNDATION_V1.md)
- [Counterfactual export](COUNTERFACTUAL_EXPORT_V1.md)

## Authoring and delivery

- [Content authoring](CONTENT_AUTHORING.md)
- [Scenario authoring](SCENARIO_AUTHORING_V2.md)
- [Localization guide](LOCALIZATION_GUIDE.md)
- [Staff portrait assets and runtime rules](STAFF_PORTRAIT_ASSET_BRIEFS.md)
- [Learner evidence sufficiency audit](LEARNER_EVIDENCE_SUFFICIENCY_AUDIT.md)
- [Controlled seeded scenario variation](CONTROLLED_SEEDED_SCENARIO_VARIATION.md)
- [Technical Laboratory runtime boundary](adr/0002-technical-laboratory-runtime-boundary.md)
- [Hosted SCORM package jobs](SCORM_PACKAGE_JOBS_V1.md)
- [Moodle acceptance testing](MOODLE_TESTING.md)

## Product direction

- [Post-platform learning roadmap](POST_PLATFORM_ROADMAP.md) — ranked future
  learning, adoption, collaboration, and ecosystem priorities.
- [Pilot and human-validation records](pilot/README.md) — active evidence that
  cannot be replaced by automated tests.

## Decisions and generated review material

- [Architecture decisions](adr/) — accepted and superseded ADRs are retained
  as decision history.
- [Bilingual content-review pack](content-review/MANIFEST.md) — generated,
  deterministic review material. Do not edit the generated HTML or JSON
  directly.

## Historical records

[Archived plans, phase records, baselines, and implementation notes](archive/)
remain available for provenance. A completed plan belongs in the archive rather
than beside current contracts. One-time task prompts may be removed after their
lasting constraints have been incorporated into current documentation.

## Maintenance rule

Every new document must have one clear role:

1. Current implementation contract or operating guide
2. Active pilot or human-review record
3. Architecture decision
4. Generated review artifact
5. Historical record

When implementation is complete, update the current contract and archive its
delivery plan. Do not retain two documents that claim to be the current source
of truth.

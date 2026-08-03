# Post-platform priorities 5, 6, 7, 8, and 11 implementation record V1

**Status:** Technical candidate; pilot and institutional acceptance remain
external.

**Recorded:** 2026-07-26

This record describes the deliberately bounded implementation of five
post-platform roadmap priorities. It does not claim that the pending pilot,
subject review, privacy review, or real assistive-technology gates have passed.

## Priority 5: bounded Simulation Director

Scenario-pack schema `1.5.0` adds versioned `instructorIncidents`. An incident
declares:

- exact workflow nodes at which it may be released;
- roles to which it is visible;
- existing evidence records to release;
- localized title and explanation; and
- bounded effects on declared professional-consequence dimensions.

Only an instructor who owns the assignment, or an administrator, may release
an incident. The orchestrator obtains the current trusted learner context and
does not accept learner-entered role identity. Release appends one
`INSTRUCTOR_INCIDENT_RELEASED` event with instructor attribution and exact pack,
scenario, incident, and run versions. Duplicate delivery of the same command is
idempotent.

The event does not rewrite a decision, advance workflow, edit hidden actual
state, or enter a simulated ledger. Replay checks the exact authored incident,
workflow boundary, role, and evidence list before reconstructing the release.
The instructor review exposes only scenario-authored controls.

The pharmaceutical transfer case contains one calibration-review incident at
the transfer-triage boundary. The coffee runtime currently exposes no incident
because none is authored for it.

## Priority 6: one bounded institutional integration

The first integration is a stable hosted assignment deep link:

```text
/learner?assignmentId={assignmentId}
```

It filters the authenticated learner workspace to one already provisioned
assignment. It never starts an attempt automatically and cannot grant roster
membership. A missing or unauthorized assignment produces an honest
unavailable message.

This is not an LTI, OIDC, roster-sync, or grade-return implementation.
Authentication, roster provisioning, and grade return remain institution-owned.
SCORM export remains unchanged.

## Priority 7: descriptive process analytics

The assignment endpoint:

```text
GET /api/v1/assignments/{assignmentId}/process-analytics
```

is available only to the managing instructor or an administrator. It derives a
versioned report from authoritative events and exact assignment content:

- evidence-inspection order;
- policy-consultation order;
- evidence and policy citations;
- decision submissions;
- confidence and probability responses where authored;
- elapsed intervals between recorded submissions;
- rejected-attempt and mitigation event references; and
- scenario-authored professional consequences.

Every observation retains its source event ID and sequence number. The
instructor report links those observations back to exact replay events.
Interpretation is fixed as:

```text
DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE
```

Elapsed intervals are not presented as attention. The report does not infer
motivation or ability, assign psychological strategy labels, or automate
high-stakes decisions. Pilot data are still required before adding calibrated
process classifications, difficulty estimates, or claims about learning.

## Priority 8: minimal controlled-study metadata

Assignment schema `1.2.0` adds one required resolved `research` configuration.
It is either exactly disabled or contains:

- experimental-condition ID;
- random-assignment record ID;
- fixed scenario seed;
- consent-status reference;
- optional pre-test and post-test linkage IDs;
- blinded-rater handling flag;
- intervention version; and
- retention-policy reference.

Research-enabled assignments require an authored supplied-seed mode. The fixed
seed controls run creation, so every assigned run receives the approved study
condition rather than a hidden runtime default. Bounded identifier validation
rejects free-form or unbounded values.

Assignment export schema `1.5.0` records this metadata and adds a deterministic
assignment-scoped research participant ID. Identified and pseudonymous exports
remain available. Pseudonymization is not anonymization, and the UI and export
documentation say so.

SimuLedger does not manage consent, ethics approval, recruitment, statistical
analysis, or retention enforcement. The metadata must be used only under an
approved external privacy and research protocol.

## Priority 11: professional consequences

Decision options now use the direct current-schema field:

```text
professionalConsequenceEffects
```

The generic runtime deterministically aggregates option effects and released
incident effects against scenario-declared dimensions. The learner sees
localized safety, cost, delay, compliance, and evidence-quality measures with
their direction and unit.

These measures are explicitly diagnostic. They do not alter the academic score,
create a second grade, reward speed, or introduce coins, lives, badges, or a
leaderboard.

## Current-schema upgrade policy

This development repository uses direct upgrades and no migration adapters.
Scenario packs older than `1.8.0`, assignments without the `1.2.0` research
configuration, and assignment exports older than `1.5.0` are not current
contracts.

The D1 `assignments` table now requires `research_configuration_json`.
Development databases created from an older schema must be reset and recreated
from `db/schema.ts`; no historical learner deployment is being preserved.

## Preserved boundaries

This increment does not add:

- arbitrary instructor editing of actual or hidden state;
- free-form live incidents;
- LTI, institutional SSO, roster synchronization, or grade return;
- learner profiling or automated high-stakes analytics;
- a survey, ethics-review, recruitment, or statistics platform;
- generic game currency or a speed leaderboard;
- collaboration, AI, SaaS administration, or a marketplace; or
- any change to SCORM persistence or academic scoring.

## Remaining external work

The implementation is not classroom-validated until the existing roadmap gates
are completed:

- learner and instructor pilot;
- pharmaceutical subject-expert review;
- Vietnamese subject review;
- privacy and research-governance review;
- real screen-reader and keyboard task review;
- scenario calibration; and
- institutional launch acceptance if the deep link is adopted.

Automated repository checks establish technical consistency only.

# Product modes Phase 4: Guided Audit

> This is the historical Phase 4 boundary. Phase 5 and scenario-pack V1.8 are
> documented in `PRODUCT_MODES_PHASE_5.md`.

## Decision

Phase 4 adds the Audit foundation and one fixed Guided Audit case to the hosted
instructor-ready platform. Audit is a distinct professional activity, not an
Operations screen with its action controls disabled.

The implementation remains inside the existing platform:

- one scenario-pack contract;
- one assignment and authenticated run API;
- one append-only event-store port;
- one deterministic replay boundary;
- one competency and rubric evidence model; and
- one learner and instructor hosted application.

It does not add another database aggregate or a parallel transaction engine.

## Runtime boundary

Scenario-pack V1.7 adds the `tracechain-audit-v1` hosted runtime. The runtime
loads one immutable authored source process and maintains a separate
append-only workpaper history.

The source contains ledger transactions, rejected attempts, supporting
evidence, policies, organization context, and current asset records. Only
records authored as accepted ledger transactions enter the learner's ledger
projection. Rejected attempts remain available for professional review but
never become transactions, change source state, or affect asset versions.

The audit workpaper history records:

- scope and evidence inspection;
- evidence bookmarks;
- source-record inspection;
- bounded drafts;
- submitted, amended, and withdrawn findings;
- evidence and policy citations;
- severity, materiality, confidence, root cause, and recommendation; and
- the final audit conclusion.

Amendments append a new revision. They do not erase the earlier submission.
Replay reconstructs the same source and workpaper state from the exact pack
version and ordered event sequence.

## Guided coffee-control case

`scenario-packs/guided-coffee-audit/tracechain.pack.json` defines one fixed
Guided case. It includes three authored findings:

1. an expired certificate was accepted;
2. a 900 kg receipt discrepancy lacks a recorded investigation; and
3. a recall was first attempted under an unauthorized role.

It also includes two defensible unusual events:

1. a valid endorsed append-only quantity correction; and
2. a three-hour transport delay with no evidence of loss or policy breach.

The case intentionally combines accepted ledger evidence, a rejected attempt,
and off-chain records. It teaches that unusual history is not automatically a
finding and that rejected activity may matter to an audit without entering the
ledger.

## Workbench

The hosted learner workspace reuses the approved Audit visual grammar:

- Audit scope;
- Evidence inventory;
- Ledger and source-record review;
- Findings and workpapers; and
- Audit conclusion.

The finding builder is structured rather than an MCQ. The learner cites
evidence and policy, classifies severity and materiality, records confidence,
selects a root cause and proportionate recommendation, and may add a bounded
description. Guided feedback appears after a finding is submitted. Ground
truth is not included in the initial learner projection.

## Scoring and reporting

The case uses the approved transparent 100-point blueprint:

| Dimension | Points |
|---|---:|
| Detection of true findings | 25 |
| Avoidance of false positives | 15 |
| Evidence selection and corroboration | 15 |
| Policy and control application | 10 |
| Severity, materiality, and root-cause analysis | 10 |
| Recommendation quality and proportionality | 10 |
| Audit conclusion and communication | 15 |
| **Total** | **100** |

The default pass score is 70. The scoring engine consumes the append-only
finding and conclusion state; UI components do not award points. The completed
learner projection includes score lines, confirmed and unsupported findings,
missed material findings, and worked explanations. The instructor's exact
sequence replay contains the same derived report plus the full workpaper
timeline and competency evidence.

## Schema and validation

Scenario-pack validation checks:

- source, evidence, policy, entity, finding, decoy, and conclusion references;
- learner-visible evidence sufficiency;
- supported severities, materiality, root causes, and recommendations;
- decoy explanations;
- fixed Guided support;
- completion bounds;
- exact scoring total and pass score; and
- bilingual localization coverage.

TraceChain is pre-release, so the active pack contract was upgraded directly
from 1.6.0 to 1.7.0. There is no migration reader or compatibility alias.

## Deliberate Phase 4 boundary

Phase 4 does not add:

- Practice Audit, Audit Challenge, or Audit Assessment;
- an Audit variant bank;
- Audit SCORM persistence or packages;
- Moodle Audit acceptance;
- automated anomaly highlighting;
- source-ledger mutation from audit actions;
- free-form author expressions; or
- new instructor authentication or deployment behavior.

Those boundaries prevent the first Audit increment from turning into a second
application. Phase 5 may add one curated Practice Audit case and SCORM delivery
only after this hosted Guided foundation is green.

## Verification

Automated coverage must prove:

- source immutability;
- rejected attempts stay outside ledger projections;
- append-only finding revision history;
- command idempotency and exact replay;
- deterministic 100-point scoring;
- transparent decoy feedback;
- valid pack and localization contracts;
- hosted runtime selection and learner rendering; and
- the complete repository quality gate.

Real screen-reader and Vietnamese subject-expert acceptance remain the
repository-wide open human-review items described in `AGENTS.md`.

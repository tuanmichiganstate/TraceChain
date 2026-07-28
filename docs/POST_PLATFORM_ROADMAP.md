# TraceChain post-platform learning roadmap

**Status:** Canonical product guidance after the instructor-ready platform.

## Purpose

TraceChain has reached the instructor-ready single-learner boundary. The hosted
platform supports authenticated application roles, exact-version assignments,
server-authoritative runs, evidence-linked decisions, replay, rubric ratings,
competency evidence, deterministic exports, scenario-pack authoring, graphical
SCORM generation, and hosted counterfactual comparison.

The next phase must improve demonstrated learning value rather than add features
indiscriminately. Work should follow one of three directions:

1. deepen learning and assessment quality;
2. add socially authentic collaboration; or
3. expand adoption and the scenario ecosystem.

## Product baseline

This roadmap assumes that the following baseline has been implemented, accepted,
and documented:

- instructor-ready hosted platform;
- authenticated application roles and role-based access control;
- immutable versioned scenarios, policies, rubrics, and competency definitions;
- server-authoritative event history and exact replay;
- Guided, Challenge, Assessment, and Technical Laboratory delivery where their
  content is approved;
- graphical SCORM generation from approved platform content;
- evidence-linked assessment and competency reporting;
- hosted counterfactual replay and decision comparison; and
- accepted accessibility, browser, deployment, and LMS evidence for the current
  release boundary.

Before starting any roadmap initiative, populate and approve a baseline record:

```text
Platform release:
Source commit:
Deployment revision:
Database schema version:
Scenario schema version:
Counterfactual schema version:
Accepted package versions:
Acceptance date:
Verification evidence:
```

If any listed baseline capability is incomplete, experimental, or unaccepted,
complete and accept that foundation before beginning a dependent roadmap item.
Do not create a post-platform workaround around unfinished core functionality.

## How to use this roadmap

This document ranks post-platform product investments. It is not an instruction
to implement every initiative in one development cycle.

Each initiative requires:

1. an explicit product-owner decision;
2. a repository-grounded implementation plan;
3. bounded scope and acceptance criteria;
4. a green technical and content gate; and
5. pilot or operational evidence before the next major initiative begins.

The coding agent must not move automatically from one ranked initiative to the
next. A completed initiative returns to product review before later work is
authorized.

## Current product correction

Counterfactual replay is implemented rather than planned. The hosted platform
already supports:

- authored decision and bounded condition interventions;
- exact role-visible fork reconstruction;
- immutable assessed source runs;
- deterministic copy-on-write branch replay;
- aligned named stochastic draws;
- downstream command reuse and pause on divergence;
- original and alternative timelines;
- academic and non-grade comparison dimensions;
- isolated and compound comparison classification;
- learner reflection; and
- authenticated branch and assignment exports.

The next counterfactual work is pilot validation and content calibration, not a
second implementation.

## 2026-07-26 execution checkpoint

Repository work authorized for immediate items 1–4 produced:

- a draft pilot protocol, immutable execution record, and candidate platform
  baseline;
- a technically complete pharmaceutical transfer-case candidate with two
  authored counterfactual points and five comparison dimensions;
- independent adopted demonstration course and program curriculum overlays,
  with observation-linked report V2; and
- an explicit re-ranking review.

This checkpoint does not close the external exit gates. The pilot is
`NOT_STARTED`; pharmaceutical subject review, learner-transfer evidence,
difficulty calibration, real assistive-technology review, and Vietnamese
subject review remain pending. Consequently the re-ranking review records an
evidence-based deferral rather than inventing a new order. See:

- `POST_PLATFORM_BASELINE_V1.md`;
- `PILOT_VALIDATION_PROTOCOL_V1.md`;
- `PILOT_EXECUTION_RECORD_V1.md`;
- `PHARMACEUTICAL_TRANSFER_ACCEPTANCE_V1.md`;
- `CURRICULUM_OVERLAY_V2.md`; and
- `ROADMAP_RERANKING_REVIEW_V1.md`.

## 2026-07-26 priorities 5, 6, 7, 8, and 11 technical checkpoint

A later authorized implementation increment added bounded technical candidates
for:

- a scenario-authored, append-only Simulation Director incident release;
- one stable authenticated assignment deep link;
- event-linked descriptive process observations;
- fixed-seed controlled-study assignment metadata and pseudonymous research
  participant exports; and
- scenario-authored diagnostic professional consequences.

This implementation does not override the roadmap's evidence gates. In
particular, process analytics are available for transparent inspection but must
not be used to infer learner traits or make high-stakes decisions before pilot
validation. The later bounded Moodle integration now implements verified
LTI 1.3 launches, assignment Deep Linking, final AGS outcome return, and
explicit course-scoped NRPS learner synchronization. It still does not provide
general institutional SSO, scheduled directory synchronization, or Moodle
SCORM-attempt access. See `LTI_1_3_INSTRUCTOR_WORKSPACE_V1.md`.

## 2026-07-28 decision-process evidence checkpoint

The hosted runtime now turns evidence inspection and policy consultation into
real, append-only process evidence. Released evidence exposes its title and
learner-visible metadata, but the learner API withholds record content until
the contextual inspection command is durably recorded. Each record permits one
first-inspection event, and only inspected evidence may be cited. Learners also
see a bounded authored policy library, submit `CONSULT_POLICY` through the same
authoritative command pipeline, and may cite only rules they actually
consulted. Each current policy carries a localized learner-readable statement
that is withheld until consultation; raw configuration stays out of the main
learner flow. Duplicate delivery is idempotent, exact replay reconstructs both
sets, and process analytics derive inspection, consultation, and citation
counts from the authoritative events rather than a parallel tracking system.
The native coffee certificate flow and pharmaceutical transfer case exercise
both boundaries before their consequential decisions. This checkpoint adds no
score, SCORM behavior, migration path, or new operating mode.

## Ranked investments

| Rank | Initiative | Classroom value | MOOC value | Relative effort | Decision |
|---:|---|---|---|---|---|
| Delivered | Counterfactual replay | Very high | Very high | Complete | Pilot and calibrate |
| 1 | Pilot, validity, accessibility, and calibration | Very high | Very high | Medium | Do now |
| 2 | Complete scenario content in another discipline | Very high | Very high | Medium to high | Build content before marketplace infrastructure |
| 3 | OBE and curriculum crosswalk overlays | Very high | High | Medium | Add as versioned institutional or program mappings |
| 4 | Become the Blockchain introduction | High for novices | Very high | Medium | Build only if pilots identify an onboarding need |
| 5 | Bounded Simulation Director | Very high | Medium | Medium | Start with authored incident release |
| 6 | LMS and institutional interoperability | High | Very high | Medium to high | Prioritize if hosted adoption is the main goal |
| 7 | Descriptive process analytics | High | Very high at scale | Medium | Add after pilot data exist |
| 8 | Minimal research-study support | High strategically | High strategically | Medium | Extend assignments and exports, not a research suite |
| 9 | Transparent adaptive recommendations | Medium | Very high | Medium | Wait for multiple calibrated scenarios |
| 10 | Collaboration ladder | Very high | High asynchronously | High | Peer review, then asynchronous handoff |
| 11 | Authentic professional game mechanics | High | High | Low to medium | Author them inside scenarios |
| 12 | AI support | Medium to high | Very high potential | High operational risk | Author assistance first, formal grading last |
| 13 | Advanced laboratories and real-ledger adapter | Medium | Medium | Medium to high | Require explicit learning outcomes |
| 14 | Multi-tenant SaaS | Low direct learning value | Low direct learning value | Very high | Defer until demand is demonstrated |

## Priority 1: validate the current product

Run staged pilots with:

- learners new to blockchain;
- learners who have studied blockchain;
- lecturers using assignment and reporting tools;
- an author outside supply-chain education;
- real assistive-technology users;
- hosted-platform users; and
- Moodle SCORM users.

Measure:

- understanding of ledger integrity versus factual truth;
- understanding of signature validity, identity, authorization, endorsement,
  and state validity as distinct concepts;
- transfer from Guided to Challenge and Assessment cases;
- evidence-opening order and evidence cited in decisions;
- decision-process quality versus realized outcome;
- confidence calibration and revision after feedback;
- rubric inter-rater reliability;
- scenario and variant difficulty;
- instructor task completion and usability;
- counterfactual reflection quality;
- accessibility with real assistive technology; and
- disciplinary content validity.

Use `PILOT_VALIDATION_PROTOCOL_V1.md` as the operational specification. It must
be versioned and approved before data collection. If it does not yet exist, the
first deliverable is to create it for product-owner and research-method review.
The protocol should define participant groups, instruments, measures, manual
accessibility tasks, rubric-reliability procedures, scenario-calibration
methods, data-retention rules, success thresholds, and decision rules.

Do not let the coding agent invent educational-validity thresholds. Do not claim
learning effectiveness from satisfaction ratings alone.

### Exit gate

Proceed to the next major initiative only when:

- critical learner and instructor usability tasks are completed successfully;
- no unresolved accessibility blocker remains;
- core conceptual distinctions are measured directly;
- rubric inter-rater reliability reaches the approved threshold;
- scenario difficulty and scoring issues are documented and addressed;
- hosted and SCORM experiences behave consistently where intended;
- counterfactual comparison is understood as reflective exploration rather than
  grade replacement; and
- pilot data are complete enough to support a product decision.

## Priority 2: build a transfer case, not a marketplace

The pack lifecycle, importer, validator, publication controls, and generic
runtime already exist. The immediate content gap is a second complete case.

The pharmaceutical cold-chain pack is the selected first transfer case. Its
purpose is to test whether a learner can apply these concepts outside coffee:

- ledger integrity does not prove physical conditions;
- off-chain evidence may conflict with an intact signed record;
- investigation and disposition should be proportionate;
- patient safety, compliance, delay, and cost may trade off; and
- a professional justification should cite the relevant evidence and policy.

The pharmaceutical case must not be a cosmetic conversion of the coffee
scenario. It must introduce at least one genuinely new:

- evidence structure;
- professional or regulatory policy;
- risk trade-off;
- decision pattern; and
- causal consequence pattern.

It must reuse the generic engine without pharmaceutical-specific core logic.
Only after several reviewed packs exist should TraceChain add an external pack
registry, institutional sharing workflow, or marketplace.

### Exit gate

The transfer case is complete only when:

- it uses the existing engine without core-code specialization;
- evidence, decisions, policies, consequences, and competency mappings pass
  validation;
- subject experts approve the case;
- difficulty is calibrated against the coffee scenarios;
- transfer is demonstrated rather than merely changing names and quantities;
- counterfactual-eligible decisions are reviewed;
- accessibility and localization review pass; and
- hosted and SCORM acceptance pass where the pack supports both delivery paths.

## Priority 3: add a curriculum crosswalk overlay

Crosswalks map stable TraceChain performance indicators to versioned external
outcomes:

```text
TraceChain performance indicator
  -> course learning outcome
  -> program performance indicator
  -> optional DACUM task, graduate attribute, or accreditation outcome
```

### Ownership boundary

Scenario packs own:

- stable TraceChain competencies;
- TraceChain performance indicators;
- observable evidence definitions; and
- authoritative internal competency targets.

Institutions, programs, or courses own:

- CLO mappings;
- PLO and program performance-indicator mappings;
- DACUM duty and task mappings;
- graduate-attribute mappings;
- accreditation mappings;
- approval status;
- effective dates; and
- institutional reporting rules.

External curriculum mappings are therefore separate, versioned institutional or
program overlays. They reference stable TraceChain indicator IDs but remain
independent from scenario-pack versions.

A scenario pack may include non-authoritative suggested mappings, but an
institution must explicitly adopt, revise, or reject them before curriculum
reporting uses them. DACUM mapping may remain maintained outside TraceChain and
be imported when needed.

### Crosswalk requirements

- every overlay has an owner, version, status, effective date, and supported
  framework version;
- mappings reference stable TraceChain indicator IDs;
- every external outcome has a localized title and explicit type;
- mappings distinguish primary, supporting, and contextual alignment;
- reports preserve scenario, competency, evidence, framework, and crosswalk
  versions;
- evidence counts remain linked to originating observations;
- import and export use a documented stable format; and
- no mapping converts one simulation into a claim of program-level mastery.

The initial report is a coverage and evidence projection. It is not an
attainment calculator.

### Exit gate

The first crosswalk release must demonstrate:

- one course-level mapping;
- one program-level mapping;
- separation between scenario content and institutional overlay ownership;
- version-preserving reports;
- links from projected evidence to original observations; and
- no automated program-attainment claim.

## Priority 4: Become the Blockchain introduction

Build this only if pilot evidence shows that novice learners need an onboarding
activity before the professional cases.

A short optional module may let learners:

1. create a transaction;
2. canonically serialize it;
3. calculate its hash;
4. sign it;
5. verify identity and authorization;
6. add it to a simplified block;
7. link it to a previous block;
8. compare copies held by different organizations;
9. alter one historical record; and
10. distinguish tamper evidence from factual truth.

Keep it short and separate from professional scenarios.

## Priority 5: bounded Simulation Director

After validation, add instructor-controlled incident release into individual
runs.

Suitable incidents include:

- a new laboratory result;
- certificate investigation;
- sensor failure;
- transport delay;
- audit request;
- key-status change;
- contamination notice; and
- regulatory instruction.

Simulation Director events must be:

- authored in the scenario pack;
- versioned;
- append-only;
- role-filtered;
- permission-controlled;
- timestamped and attributable to the instructor;
- replayable; and
- included in reports as instructor-released events.

For formal assessment:

- available incidents and release conditions must be defined before the run;
- instructor actions must be logged;
- learners whose performances are compared must receive equivalent incident
  conditions unless the difference is an explicit experimental treatment;
- injected incidents must not alter a submitted historical decision; and
- reports must distinguish scenario-generated, instructor-released, and
  learner-generated events.

The first release must not permit arbitrary editing of hidden state or
unstructured instructor-authored events during a live run.

## Priority 6: LMS and institutional interoperability

If hosted adoption is the main goal, add one bounded institutional integration
before attempting a generic interoperability framework.

Current checkpoint: the bounded Moodle LTI 1.3 integration implements Core
launch, one-assignment Deep Linking, final AGS outcome return, and
instructor-initiated NRPS synchronization. Broader institutional
interoperability remains deferred.

Possible first scope:

- institutional OIDC or LMS launch;
- roster synchronization;
- deep linking to a specific TraceChain assignment;
- grade and completion return;
- stable scenario and assignment identification;
- retry and error handling; and
- audit logging.

Keep SCORM export available. Hosted integration should provide richer replay,
evidence, rubric, and analytics capabilities than SCORM can carry.

## Priority 7: descriptive process analytics

Add only after sufficient pilot data exist.

Potential analyses include:

- evidence-opening order;
- evidence cited versus overlooked;
- decision timing;
- confidence calibration;
- hint use;
- retry and mitigation behavior;
- process score versus realized outcome;
- common policy or evidence errors;
- counterfactual reflection patterns;
- scenario difficulty; and
- rubric disagreement.

Process analytics must remain descriptive and evidence-linked.

The platform must not:

- assign psychological labels;
- infer motivation or ability from one trace;
- treat time-on-screen as attention without qualification;
- expose identifiable learner traces beyond authorized users; or
- use analytics for automated high-stakes decisions without validation.

Every derived process pattern must preserve its rule or model version and link
back to the underlying events.

## Priority 8: minimal research-study support

Extend existing assignments and exports with only the minimum research metadata
needed for controlled studies:

- experimental-condition ID;
- random-assignment record;
- fixed scenario and seed;
- consent-status reference;
- pseudonymous participant ID;
- pre-test and post-test linkage;
- blinded-rater option;
- de-identified export; and
- intervention-version metadata.

Research support must not become a general survey platform, statistical-analysis
package, ethics-review system, participant-recruitment service, or institutional
research-administration system.

Research use requires approved privacy, ethics, retention, and access rules.

## Priority 9: transparent adaptive recommendations

Wait until multiple calibrated scenarios and cross-scenario evidence exist.

Begin with transparent rules rather than a black-box model. Each recommendation
must:

- cite the relevant competency or performance indicator;
- link to observed evidence;
- explain why the activity is recommended;
- identify the recommendation-rule version;
- permit instructor override; and
- avoid making a learning-path decision from one coffee attempt.

## Priority 10: collaboration ladder

Introduce collaboration gradually:

1. anonymous rationale review;
2. asynchronous organizational handoff; and
3. shared synchronous runs.

Anonymous peer review should use a limited rubric and preserve instructor
control over formal scores.

Before asynchronous organizational handoff begins, approve a dedicated
collaboration plan covering:

- shared-session authority;
- role assignment;
- learner-to-learner endorsement;
- communication;
- concurrency;
- reconnection;
- team versus individual assessment;
- privacy; and
- contribution evidence.

Asynchronous handoff is a new collaborative product boundary, not a small UI
feature. Shared synchronous runs must wait until the asynchronous model and its
assessment rules are validated.

## Priority 11: authentic professional game mechanics

Use scenario-authored professional consequences rather than generic points,
coins, lives, badges, or speed leaderboards.

Suitable mechanics include:

- operational delay;
- investigation cost;
- unnecessary recall cost;
- consumer- or patient-safety exposure;
- compliance risk;
- confidentiality exposure;
- evidence quality;
- trust between organizations;
- blocked transactions; and
- reputation consequences.

These mechanics remain diagnostic unless a transparent, versioned scoring rule
explicitly incorporates them.

Do not reward speed when careful evidence review is part of the intended
competency. Do not create a single leaderboard that encourages risky decisions
or evidence skipping.

## Priority 12: AI support

If evidence demonstrates a need, add AI in this order:

1. draft-only scenario-author assistance;
2. grounded learner-debrief assistance;
3. evidence-linked rubric suggestions with human authority; and
4. constrained simulated organizations that submit ordinary commands.

AI requirements:

- cite exact scenario evidence and rubric criteria;
- never mutate authoritative state directly;
- never invent scenario facts;
- preserve human authority for publication and formal grading;
- record model, prompt, and policy versions; and
- provide a path to reject, revise, or disable suggestions.

Do not begin with autonomous formal grading.

## Priority 13: advanced laboratories and real-ledger adapter

Prefer this order:

1. key compromise and revocation;
2. privacy and selective disclosure;
3. policy upgrade and governance;
4. Merkle inclusion proof;
5. proof-of-work comparison; and
6. an optional development-ledger adapter.

Advanced laboratories require explicit learning outcomes and independent
acceptance criteria.

Proof of work, mining, cryptocurrency, and a Merkle tree remain absent from the
main permissioned coffee ledger. A real-ledger adapter must remain optional and
must not weaken deterministic assessment or historical replay.

## Priority 14: multi-tenant SaaS

Do not begin multi-tenant SaaS work until several institutions demonstrate a
real operational need.

Possible later capabilities include:

- institution-level administration;
- tenant-specific branding;
- regional data hosting;
- tenant-specific retention rules;
- organization-level analytics;
- licensing or subscriptions;
- support tooling;
- public APIs; and
- service-level monitoring.

Do not build SaaS infrastructure simply because the architecture permits it.

## Decision gates

Do not begin:

- adaptive pathways before several calibrated scenarios exist;
- process classification before sufficient pilot data exist;
- collaborative handoff before a dedicated collaboration plan is approved;
- collaborative shared runs before asynchronous handoff is validated;
- AI grading before human rubric reliability is established;
- marketplace infrastructure before external pack demand exists;
- real-ledger integration without a specific technical learning outcome; or
- multi-tenant SaaS before multiple institutions require it.

## Feature retirement

Pilot and operational evidence may justify simplifying, disabling, or removing a
feature.

Reconsider a feature when it:

- is rarely used;
- does not improve demonstrated learning;
- creates disproportionate authoring, testing, support, or infrastructure cost;
- reduces accessibility;
- duplicates LMS functionality;
- confuses learners about the blockchain model; or
- weakens assessment validity.

Versioned historical runs must remain replayable even when a feature is retired
from new assignments. Retirement must preserve the scenario, policy, rubric,
model, and crosswalk versions needed to interpret historical evidence.

## Immediate sequence and exit gates

### 1. Execute the pilot protocol

Run the approved pilot on the current platform and counterfactual flow.

**Exit gate:** the Priority 1 acceptance conditions are satisfied and a product
review approves continuation.

### 2. Complete the pharmaceutical transfer case

Build, review, calibrate, and accept the pharmaceutical cold-chain pack.

**Exit gate:** the Priority 2 acceptance conditions are satisfied and the pack
shows genuine transfer beyond coffee.

### 3. Add the curriculum crosswalk overlay

Implement one course-level and one program-level mapping without changing
scenario-pack ownership.

**Exit gate:** the Priority 3 acceptance conditions are satisfied and reports
preserve evidence and mapping provenance.

### 4. Re-rank the roadmap

Use:

- pilot evidence;
- authoring effort;
- instructor demand;
- learner outcomes;
- accessibility findings;
- scenario-transfer findings;
- operational cost; and
- institutional integration demand.

Do not preserve the current ranking merely because it appears in this document.

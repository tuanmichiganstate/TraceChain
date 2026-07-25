# TraceChain post-platform learning roadmap

Status: canonical product guidance after the instructor-ready platform.

## Purpose

TraceChain has reached the instructor-ready single-learner boundary. The hosted
platform supports authenticated application roles, exact-version assignments,
server-authoritative runs, evidence-linked decisions, replay, rubric ratings,
competency evidence, deterministic exports, scenario-pack authoring, graphical
SCORM generation, and hosted counterfactual comparison.

The next phase must improve demonstrated learning value rather than add
features indiscriminately. Work should follow one of three directions:

1. deepen learning and assessment quality;
2. add socially authentic collaboration; or
3. expand adoption and the scenario ecosystem.

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

## Ranked investments

| Rank | Initiative | Classroom value | MOOC value | Relative effort | Decision |
|---:|---|---|---|---|---|
| Delivered | Counterfactual replay | Very high | Very high | Complete | Pilot and calibrate |
| 1 | Pilot, validity, accessibility, and calibration | Very high | Very high | Medium | Do now |
| 2 | Complete scenario content in another discipline | Very high | Very high | Medium to high | Build content before marketplace infrastructure |
| 3 | OBE and curriculum crosswalks | Very high | High | Medium | Add as a versioned evidence-mapping layer |
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

Measure conceptual distinctions, decision transfer, evidence-use behavior,
rubric reliability, scenario difficulty, instructor task completion,
counterfactual reflection, accessibility, and content validity. Use
`PILOT_VALIDATION_PROTOCOL_V1.md` as the operational specification.

Do not claim learning effectiveness from satisfaction ratings alone.

## Priority 2: build a transfer case, not a marketplace

The pack lifecycle, importer, validator, publication controls, and generic
runtime already exist. The immediate content gap is a second complete case.

The pharmaceutical cold-chain pack is the first transfer case. Its purpose is
to test whether a learner can apply these concepts outside coffee:

- ledger integrity does not prove physical conditions;
- off-chain evidence may conflict with an intact signed record;
- investigation and disposition should be proportionate;
- patient safety, compliance, delay, and cost may trade off; and
- a professional justification should cite the relevant evidence and policy.

Only after several reviewed packs exist should TraceChain add an external pack
registry, institutional sharing workflow, or marketplace.

## Priority 3: add a curriculum crosswalk layer

Crosswalks map versioned TraceChain indicators to versioned external outcomes:

```text
TraceChain performance indicator
  -> course learning outcome
  -> program performance indicator
  -> optional DACUM task, graduate attribute, or accreditation outcome
```

Crosswalk requirements:

- definitions are versioned pack content;
- mappings reference stable TraceChain indicator IDs;
- every external outcome has a localized title and explicit type;
- mappings distinguish primary and supporting alignment;
- reports preserve the exact pack, scenario, and crosswalk versions;
- evidence counts remain linked to their originating observations; and
- no mapping converts one simulation into a claim of program-level mastery.

The initial report is a coverage and evidence projection. It is not an
attainment calculator.

## Later classroom-first path

After validation:

1. release authored incidents into individual runs;
2. add anonymous rationale review;
3. add asynchronous organizational handoff; and
4. consider shared synchronous runs only after individual and team assessment
   rules are stable.

Simulation Director events must be authored, append-only, role-filtered, and
replayable. The first version must not permit arbitrary hidden-state editing.

## Later MOOC-first path

After validation:

1. add one institutional launch, roster, and grade-return integration;
2. add descriptive process analytics;
3. add transparent instructor-overridable activity recommendations; and
4. consider grounded automated debriefing.

Adaptation requires multiple calibrated scenarios and cross-scenario evidence.
Do not infer a personalized pathway from one coffee attempt.

## AI order

If evidence demonstrates a need, add AI in this order:

1. draft-only scenario-author assistance;
2. grounded learner debrief assistance;
3. evidence-linked rubric suggestions with human authority; and
4. constrained simulated organizations that submit ordinary commands.

AI must not directly mutate authoritative state or invent scenario facts.

## Technical laboratory order

Prefer:

1. key compromise and revocation;
2. privacy and selective disclosure;
3. policy upgrade and governance;
4. Merkle inclusion proof;
5. proof-of-work comparison; and
6. an optional development-ledger adapter.

Proof of work, mining, cryptocurrency, and a Merkle tree remain absent from the
main permissioned coffee ledger.

## Decision gates

Do not begin:

- adaptive pathways before several calibrated scenarios exist;
- process classification before sufficient pilot data exist;
- collaborative shared runs before asynchronous handoff is validated;
- AI grading before human rubric reliability is established;
- marketplace infrastructure before external pack demand exists;
- real-ledger integration without a specific technical learning outcome; or
- multi-tenant SaaS before multiple institutions require it.

## Immediate sequence

1. Execute the pilot protocol on the current platform and counterfactual flow.
2. Complete and review the pharmaceutical transfer case.
3. Add and validate versioned curriculum crosswalks and evidence coverage.
4. Re-rank all later work using pilot evidence.


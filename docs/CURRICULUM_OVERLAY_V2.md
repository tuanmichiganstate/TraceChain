# Curriculum overlay V2

## Purpose

The curriculum-overlay layer connects TraceChain's versioned performance
indicators to institution-, program-, or course-owned outcomes without changing
simulation scoring or claiming that one activity proves mastery.

The overlay is not scenario content. Scenario packs own TraceChain
competencies, indicators, and observable evidence definitions. A separate
adopting authority owns the external mapping, its approval status, and its
effective date.

## Ownership and version boundary

Scenario-pack schema `1.5.0` contains no `curriculumCrosswalks` property.
Curriculum overlays use their own schema:

```text
schemas/tracechain-curriculum-overlay-v2.schema.json
```

Every overlay declares:

```text
overlay identity and version
institution, program, or course owner
draft, adopted, or retired status
effective date
adoption authority and timestamp
exact TraceChain framework versions
external framework identity and version
self-localized external outcomes
TraceChain indicator -> external outcome mappings
primary, supporting, or contextual alignment
```

Only explicitly adopted overlays appear in assignment reporting. An adopted
overlay must match the exact TraceChain framework versions supplied by the
assignment's immutable scenario pack. A newer overlay or scenario pack is not
substituted for historical evidence.

The repository uses direct upgrades. Older scenario-pack schemas and embedded
curriculum mappings are rejected; there is no migration adapter.

## Validation

Run:

```bash
npm run validate:curriculum-overlays
```

The validator rejects:

- missing or unsupported ownership, lifecycle, adoption, or date fields;
- missing English or Vietnamese values declared by the overlay;
- unknown or duplicate external outcomes;
- external outcomes with no mapping;
- unknown TraceChain indicators;
- TraceChain framework-version mismatches;
- duplicate mapping relationships;
- empty frameworks or overlays; and
- unsupported outcome or alignment values.

The validator is part of `npm run quality`.

## Evidence projection

`createAssignmentCurriculumCrosswalkReport` accepts:

- the exact scenario pack;
- independently stored curriculum overlays; and
- the assignment's competency-evidence report.

It includes compatible adopted overlays only. For each learner and external
outcome it reports:

- mapped indicator IDs;
- unique competency-evidence observations;
- exact competency, indicator, and evidence-rule versions;
- the source event IDs behind every observation; and
- unique current rubric ratings.

The class projection adds:

- primary, supporting, and contextual indicator IDs;
- scenario target types;
- assigned learners;
- learners with evidence; and
- aggregate observation and current-rating counts.

Evidence and ratings shared by several mapped indicators are counted once by
their stable run and record identifiers.

Every report contains:

```text
EVIDENCE_CROSSWALK_NO_ATTAINMENT_INFERENCE
```

The report has no pass rule, threshold, performance level, mastery flag, or
official grade. It is a version-preserving evidence projection, not an
attainment calculator.

## Hosted instructor delivery

The hosted platform exposes:

```text
GET /api/v1/assignments/{assignmentId}/curriculum-crosswalks
GET /api/v1/assignments/{assignmentId}/curriculum-crosswalks.json
```

The route name describes the curriculum crosswalk function; the returned
contract is `AssignmentCurriculumOverlayReportV2` with schema `2.0.0`. Both
routes require an instructor, rater, or administrator role. Learners cannot
request the class projection.

The instructor report identifies the overlay owner, mapping and framework
versions, effective date, localized outcomes, three alignment strengths,
learners with evidence, unique observations, and current ratings.

## Seeded demonstration overlays

The repository includes two clearly labelled educational demonstrations:

```text
curriculum-overlays/pharmaceutical-pilot-course.overlay.json
curriculum-overlays/pharmaceutical-pilot-program.overlay.json
```

The first is course-owned and maps the pharmaceutical evidence-evaluation and
proportionate-action indicators to two course outcomes. The second is
program-owned and demonstrates primary, supporting, and contextual
relationships to two program outcomes.

These files do not claim adoption by a real institution. Their owners are
`TRACECHAIN_DEMO_COURSE` and `TRACECHAIN_DEMO_PROGRAM`, and
`educationalDemoOnly` is true.

## Current boundary

Implemented:

- typed overlay and report contracts;
- standalone JSON Schema and runtime validation;
- exact TraceChain framework compatibility checks;
- one adopted demonstration course overlay;
- one adopted demonstration program overlay;
- deterministic observation-linked evidence projection;
- bilingual instructor presentation; and
- deterministic JSON download.

Deferred:

- graphical overlay editing;
- CSV import or export;
- external framework catalogue import;
- institution-specific attainment rules; and
- automatic claims about course or program mastery.

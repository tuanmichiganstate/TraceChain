# Curriculum crosswalk V1

## Purpose

The curriculum-crosswalk layer connects TraceChain's versioned performance
indicators to institution-owned outcomes without changing simulation scoring
or claiming that one activity proves mastery.

The initial implementation is a pack contract, validator, sample
pharmaceutical crosswalk, and deterministic evidence report. It is not a
curriculum-management system or an attainment calculator.

## Authored contract

Every scenario pack uses schema `1.3.0` and contains
`curriculumCrosswalks`. The collection may be empty. A populated crosswalk
declares:

```text
crosswalk identity and version
effective date
external framework identity and version
localized external outcomes
TraceChain indicator -> external outcome mappings
primary or supporting alignment
```

Supported external outcome types are:

```text
COURSE_LEARNING_OUTCOME
PROGRAM_LEARNING_OUTCOME
PERFORMANCE_INDICATOR
GRADUATE_ATTRIBUTE
QUALIFICATION_FRAMEWORK_OUTCOME
DACUM_TASK
ACCREDITATION_OUTCOME
OTHER
```

The crosswalk references stable indicator IDs already defined by the same
pack. One indicator can map to several external outcomes through one mapping.
Each external outcome must receive at least one mapping.

## Validation

The scenario-pack validator rejects:

- unknown TraceChain indicators;
- duplicate mappings for one indicator;
- unknown or duplicate external outcomes;
- external outcomes with no mapping;
- empty frameworks or crosswalks;
- invalid semantic versions or effective dates;
- unsupported outcome or alignment values; and
- missing localized titles.

The current development policy is direct upgrade: schema `1.3.0` is the only
accepted scenario-pack schema. No migration adapter or silent default inserts
the required collection.

## Evidence projection

`createAssignmentCurriculumCrosswalkReport` accepts:

- the exact scenario pack; and
- an existing assignment competency-evidence report.

It refuses pack or scenario version mismatches. For each learner and external
outcome it reports:

- mapped indicator IDs;
- unique competency-evidence observations; and
- unique current rubric ratings.

The class projection adds:

- primary and supporting indicator IDs;
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
official grade. Institutions may use the linked evidence in a separately
approved assessment process, but TraceChain does not infer attainment from the
mapping.

## Seeded example

The pharmaceutical cold-chain pack defines
`CROSSWALK_PHARMA_PILOT_CLO@1.0.0`. It maps:

- evidence evaluation as a primary relationship for
  `PHARMA.COLD_CHAIN.PI1`;
- proportionate action as a primary relationship for
  `PHARMA.COLD_CHAIN.PI2`; and
- evidence-, policy-, and uncertainty-based justification as supporting both
  outcomes through `PHARMA.COLD_CHAIN.PI3`.

The external framework and outcome titles are self-localized in English and
Vietnamese as immutable pack content.

## Current boundary

Implemented:

- typed contracts;
- JSON Schema and runtime validation;
- a versioned sample crosswalk;
- deterministic learner and class evidence projection; and
- unit tests for deduplication, mismatch rejection, and no-attainment output.

Deferred:

- graphical crosswalk editing;
- instructor report UI;
- CSV export;
- external framework import;
- institution-specific attainment rules; and
- automatic claims about course or program mastery.

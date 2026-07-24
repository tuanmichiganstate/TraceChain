# Assignment competency evidence report V1

Status: implemented for the hosted instructor platform.

## Purpose

The report groups already recorded competency evidence and current manual
rubric ratings for one exact assignment. It supports instructor review without
creating a second score or claiming that one simulation proves stable
competence.

The interpretation marker is:

```text
EVIDENCE_ONLY_NO_COMPETENCE_INFERENCE
```

## Authorization and route

Only an authenticated `instructor`, `rater`, or `administrator` may request:

```text
GET /api/v1/assignments/{assignmentId}/competencies
```

Learners cannot call this class-report route.

## Version boundary

The report is constructed from:

- the assignment's exact pack ID and version;
- the assignment's exact scenario ID and version;
- the scenario's versioned competency targets;
- versioned competency frameworks and indicators;
- append-only `COMPETENCY_EVIDENCE_RECORDED` events; and
- the current append-only manual rating revision per rubric criterion and run.

Generation fails rather than combining mismatched pack, scenario, framework,
rubric, run, rating, or evidence records.

## Learner projection

Every assigned learner receives one row for every competency indicator targeted
by the scenario, including unobserved indicators. Each indicator contains:

```text
framework and framework version
competency and competency version
indicator and indicator version
target type
evidence count
latest observation time, when present
observation IDs, rule IDs, source event IDs, and run IDs
current rubric ratings linked to that indicator
```

An unobserved indicator has zero evidence and an empty observation list. The
platform does not synthesize a performance level from that absence.

## Class projection

For each targeted indicator, the class summary reports:

```text
assigned learner count
learners with recorded evidence
total evidence records
current rating count
rating distribution by authored numeric rubric level
```

Ratings remain criterion judgments. A rating can appear under each indicator
explicitly mapped by that versioned rubric criterion. The report does not
average levels, convert them into the existing 100-point SCORM score, or infer
a durable competency result.

## Current limit

Configurable multi-observation rules, recency rules, critical-error overrides,
and cross-scenario competence judgments remain later Phase 4 work. Until those
authored rules exist, TraceChain reports evidence and ratings rather than a
derived competency level.

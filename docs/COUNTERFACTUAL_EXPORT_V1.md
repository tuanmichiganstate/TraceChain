# Counterfactual comparison export V1

Status: implemented for the hosted instructor-ready platform.

## Scope

The export contract covers hosted decision-counterfactual branches. It does
not add branch persistence to SCORM, expose hidden actual state, or alter an
official grade.

Authenticated branch participants may download:

```text
GET /api/v1/counterfactuals/{branchId}/export.json
GET /api/v1/counterfactuals/{branchId}/export.csv
```

The managing instructor or an administrator may request:

```text
GET /api/v1/assignments/{assignmentId}/counterfactual-report
```

All responses use the exact source assignment, pack, scenario, configuration,
seed, fork state, and role-visible information boundary. A learner receives
the same role-filtered projections used by the comparison interface, never
the server-only actual or RNG state.

## Branch JSON

The versioned document contains:

```text
schemaVersion   1.0.0
exportType      TRACECHAIN_COUNTERFACTUAL_COMPARISON
generatedAt     UTC request time
metadata        immutable CounterfactualRunMetadataV1
comparison      CounterfactualComparisonV1
reflection      bounded reflection or null
```

Metadata fixes the source and branch identifiers, fork sequence and node,
trusted fork context, exact pack and scenario versions, configuration hash,
source seed, source state and information-state hashes, intervention,
classification mode, creator, and creation time.

The comparison contains only role-visible source, fork, and alternative
projections. It labels the source as assessed and the alternative as
exploratory, preserves both timelines, names information revealed later, and
states that the official grade did not change.

## Branch CSV

CSV uses RFC 4180 quoting, CRLF line endings, and these record types:

```text
counterfactual
original_timeline_event
alternative_timeline_event
comparison_dimension
reflection
```

The fixed header is:

```text
export_schema_version
record_type
counterfactual_id
source_run_id
fork_sequence_number
fork_node_id
decision_id
classification
created_by_user_id
recorded_at
sequence_number
event_id
event_type
dimension_id
evaluation_status
source_pack_id
source_pack_version
source_scenario_id
source_scenario_version
reflection_id
payload_json
```

Nested values use canonical JSON. Spreadsheet formula prefixes are neutralized
in direct text cells. The filenames are:

```text
TraceChain_{branchId}_counterfactual_v1.json
TraceChain_{branchId}_counterfactual_v1.csv
```

## Assignment report

The assignment report is a normal authenticated JSON API response with:

```text
schemaVersion   1.0.0
reportType      TRACECHAIN_ASSIGNMENT_COUNTERFACTUAL_REPORT
assignmentId
generatedAt
branches
```

Each branch record names the source learner, immutable branch metadata,
`CREATED`, `IN_PROGRESS`, or `COMPLETED` status, an available comparison,
an optional reflection, and `originalOfficialGradeChanged: false`.

The report contains no inferred class-level competence or claim that the
explored choice caused every difference. Dimensions without authored value
rules retain `AWAITING_AUTHORED_EVALUATION_RULE`.

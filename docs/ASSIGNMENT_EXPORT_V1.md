# Assignment evidence export V1

Status: implemented for the hosted instructor platform.

## Purpose

An assignment export is a point-in-time evidence snapshot for one exact
assignment. It preserves the identifiers and versions required to interpret
the evidence and contains:

- assignment and feedback-release metadata;
- the provisioned learner roster;
- hosted run status and event counts;
- complete append-only run events;
- complete append-only manual rubric rating revisions; and
- complete append-only rubric moderation resolutions.

Exports are generated synchronously from the authoritative D1 records. They do
not create another copy of run state, alter an assignment, or append run
events.

## Authorization and routes

Only an authenticated `instructor`, `rater`, or `administrator` may download an
assignment export.

```text
GET /api/v1/assignments/{assignmentId}/export.json
GET /api/v1/assignments/{assignmentId}/export.csv
```

Both responses use `Cache-Control: no-store` and an attachment filename:

```text
TraceChain_{assignmentId}_evidence_v1.json
TraceChain_{assignmentId}_evidence_v1.csv
```

Learners cannot call these routes.

## JSON contract

The JSON document has:

```text
schemaVersion       1.0.0
exportType          TRACECHAIN_ASSIGNMENT_EVIDENCE
generatedAt         UTC export timestamp
assignment          exact HostedAssignmentV1
participants        assignment and learner identifiers
runs                learner, status, and event count
events              complete RunEventV1 envelopes
ratingRevisions     complete ManualRubricRatingV1 history
moderationResolutions complete RubricModerationResolutionV1 history
dataDictionary      versioned dataset and field definitions
```

The assignment carries the exact pack and scenario identity. Every event
retains its pack, scenario, actor, organization, role, causation, sequence,
state-hash, and payload evidence. Every rating revision retains its rubric
version, criterion, evidence links, rater, and timestamp. Every moderation
resolution retains its source rating IDs, moderator, rationale, and revision.

Generation fails as an invariant error if:

- an event belongs to a run outside the assignment;
- an event's pack or scenario version differs from the assignment;
- a report event count differs from the authoritative event stream;
- a rating revision belongs to another assignment or run;
- a moderation resolution refers to another assignment, run, or unknown source
  rating; or
- a run identifier appears more than once.

The export therefore does not silently combine evidence interpreted under
different content versions.

## CSV contract

The CSV layout identifier is:

```text
TRACECHAIN_ASSIGNMENT_EVIDENCE_FLAT_V1
```

CSV uses RFC 4180 quoting and CRLF line endings. It is one normalized table so
it can be opened directly without an archive or a second export service.
`record_type` identifies each row:

| `record_type` | Meaning |
|---|---|
| `assignment` | Exact assignment and version metadata |
| `participant` | One provisioned learner |
| `run` | One hosted learner run |
| `event` | One authoritative append-only run event |
| `rating_revision` | One append-only manual rating revision |
| `moderation_resolution` | One append-only score-resolution revision |

The fixed columns are:

```text
export_schema_version
record_type
assignment_id
learner_user_id
run_id
sequence_number
event_id
event_type
recorded_at
authenticated_user_id
simulation_actor_id
organization_id
role_id
causation_id
pack_id
pack_version
scenario_id
scenario_version
mode
status
event_count
rating_id
resolution_id
rubric_id
rubric_version
criterion_id
rating_revision
rating_level
rater_user_id
linked_evidence_ids_json
source_rating_ids_json
comment
payload_json
```

Columns that do not apply to a row type are empty. Nested values use canonical
JSON. Text beginning with a spreadsheet formula prefix is escaped with a
leading apostrophe in CSV only. The JSON export retains the original text.

## Interpretation and privacy

- `generatedAt` records when the snapshot was requested; it is not a run
  event.
- All authoritative run, rating, and moderation timestamps are UTC.
- A newer export may contain later events, rating revisions, or resolutions.
- The JSON data dictionary and this document define export schema V1.
- User IDs are server-provisioned identifiers. Pseudonymization is not yet an
  assignment option, so exported files must be handled as assessment records.
- Export access does not imply that learners may see withheld feedback.

Changing column meaning, record types, or required JSON fields requires a new
export schema version.

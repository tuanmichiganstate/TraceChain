# Assignment evidence export V1

Status: implemented for the hosted instructor platform.

## Purpose

An assignment export is a point-in-time evidence snapshot for one exact
assignment. It preserves the identifiers and versions required to interpret
the evidence and contains:

- assignment and feedback-release metadata;
- the provisioned learner roster;
- hosted run status, event counts, authoritative event-span timing, and
  event-derived activity counts and rejection findings;
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
GET /api/v1/assignments/{assignmentId}/export.json?identity=pseudonymous
GET /api/v1/assignments/{assignmentId}/export.csv?identity=pseudonymous
```

Both responses use `Cache-Control: no-store` and an attachment filename:

```text
TraceChain_{assignmentId}_evidence_v1.json
TraceChain_{assignmentId}_evidence_v1.csv
TraceChain_{assignmentId}_pseudonymous_evidence_v1.json
TraceChain_{assignmentId}_pseudonymous_evidence_v1.csv
```

Learners cannot call these routes.

## JSON contract

The JSON document has:

```text
schemaVersion       1.4.0
exportType          TRACECHAIN_ASSIGNMENT_EVIDENCE
identityMode        identified or pseudonymous
generatedAt         UTC export timestamp
assignment          exact HostedAssignmentV1
participants        assignment and learner identifiers
runs                learner, status, event count, timing, and activity
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
Each run records `startedAt`, `lastActivityAt`, nullable `completedAt`, and
`elapsedSeconds`, plus an `activity` object. The elapsed value is the
whole-second difference from the first authoritative event to `RUN_COMPLETED`,
or to the latest recorded event while the run is active. It is therefore
stable evidence, not a live wall-clock timer. `activity` derives evidence
inspection, policy consultation, cited-evidence, decision-attempt,
rejected-attempt, and mitigation counts from the immutable event stream. Its
`rejectionFindings` array counts the stable validation-rule IDs recorded by
rejected submitted actions. A rejected action can contribute more than one
finding, so the finding total need not equal `rejectedAttemptCount`. When a
rejected decision has no validation-rule IDs, the deterministic fallback is
`DECISION_REJECTED:{commandType}`. These findings are diagnostic evidence,
not a second grade or a technical-error classification.

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
The assignment row's `payload_json` includes `exportIdentityMode` so a renamed
CSV remains self-describing.
For a `run` row, `recorded_at` is `startedAt` and `payload_json` contains
`startedAt`, `lastActivityAt`, nullable `completedAt`, `elapsedSeconds`, and
the event-derived `activity` object.

## Interpretation and privacy

- `generatedAt` records when the snapshot was requested; it is not a run
  event.
- Identified export remains the default.
- Pseudonymous export replaces each server-owned learner user ID with a stable
  assignment-scoped `LEARNER_…` code in the assignment roster, participant and
  run records, authenticated learner event context, and exact learner-ID values
  inside event payloads.
- The pseudonym derives deterministically from the assignment ID and learner
  user ID using a domain-separated SHA-256 input. The same learner receives a
  different code in another assignment.
- Instructor, rater, moderator, simulation actor, organization, role, run,
  event, evidence, and rating identifiers remain unchanged.
- No identity mapping is included in the pseudonymous file.
- Pseudonymization is not anonymization. Run content, timestamps, decisions,
  and other evidence may still permit re-identification and must be handled as
  assessment records.
- All authoritative run, rating, and moderation timestamps are UTC.
- A newer export may contain later events, rating revisions, or resolutions.
- The JSON data dictionary and this document define export schema V1.
- Export access does not imply that learners may see withheld feedback.

Changing column meaning, record types, or required JSON fields requires a new
export schema version.

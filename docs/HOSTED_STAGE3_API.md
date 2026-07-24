# Hosted coffee migration: Stages 3 through 9

Status: implemented locally; production publication requires a committed and
pushed source state.

## Purpose

This is the first server-authoritative path through the instructor-ready
platform architecture and its first adjacent-stage expansion. It proves:

```text
published scenario pack
-> authenticated application principal
-> assigned learner run
-> role-filtered evidence
-> atomic professional decision
-> genuine signature and authorization check
-> accepted transaction or rejected audit attempt
-> genuine sender-and-receiver custody endorsement
-> transport-condition commitment
-> receipt and separate ownership transfer
-> retained discrepancy attempt and bounded mitigation
-> genuine producer-and-processor correction endorsement
-> append-only correction commitment
-> transformation with an input-to-output provenance edge
-> transformation-provenance decision
-> packaging, distribution ownership, and retail dispatch
-> deterministic tamper demonstration and data-governance classification
-> descendant recall-scope decision
-> retained unauthorized recall attempt
-> trusted regulator handoff and authorized recall commitment
-> blockchain-suitability debrief
-> competency and rubric evidence
-> instructor timeline
-> exact event replay
```

The service reuses the existing coffee command, rule, Ed25519, authorization,
endorsement, event, state-version, scripted-transaction, and ledger services
through the transitional `CoffeeStage3HostedAdapter`. The name remains until
the staged migration covers the complete coffee journey; it does not denote a
second transaction engine.

## Authentication and identity

The Sites dispatcher supplies the verified email in:

```text
oai-authenticated-user-email
```

The worker resolves that email against `application_users` and
`application_role_assignments` in D1. Request bodies cannot grant an
application role or self-assert simulation actor, organization, or role.

For an empty deployment, the optional runtime variable
`TRACECHAIN_BOOTSTRAP_ADMIN_EMAILS` may contain a comma-separated email
allowlist. The first matching, deployment-authenticated request provisions
`administrator`, `instructor`, and `scenario-author` roles. The allowlist is
server-owned, and removing it stops further bootstrap provisioning without
deleting already provisioned roles.

Mutating API requests require a same-origin `Origin` header and JSON content.

## D1

The logical Sites binding is:

```json
{
  "d1": "DB",
  "r2": null
}
```

The current schema is in `db/schema.ts`; migration history begins at
`db/migrations/0001_instructor_platform_foundation.sql` and adds assignments
and assessment records in `db/migrations/0002_assignments.sql`.

Tables:

- `application_users`
- `application_role_assignments`
- `scenario_pack_versions`
- `assignments`
- `assignment_learners`
- `hosted_run_events`
- `rubric_rating_revisions`

`hosted_run_events` enforces unique `(run_id, sequence_number)`,
`(run_id, idempotency_key)`, and `event_id`. D1 batch execution makes one
command's event batch atomic. Ordered events remain authoritative; snapshots
are not yet introduced.

## API

All endpoints use `/api/v1`.

| Method and path | Application role | Result |
|---|---|---|
| `GET /session` | provisioned user | Server-owned user ID, email and roles |
| `POST /scenario-packs/publish` | scenario author or administrator | Immutable pack identity |
| `POST /assignments` | instructor or administrator | Active assignment bound to one exact published scenario and provisioned learner roster |
| `GET /assignments/:assignmentId` | instructor, rater or administrator | Assignment metadata and feedback-release state |
| `POST /assignments/:assignmentId/start-run` | instructor or administrator | New run using server-owned assignment configuration |
| `GET /assignments/:assignmentId/report` | instructor, rater or administrator | Learner, run, completion, event-count and current-rating report |
| `POST /assignments/:assignmentId/feedback-release` | instructor or administrator | One-way release of current feedback |
| `POST /runs` | instructor, scenario author or administrator | New assigned hosted coffee run metadata |
| `GET /runs/:runId` | assigned learner | Role-filtered projection only |
| `POST /runs/:runId/commands` | assigned learner | Persisted command result and new projection |
| `GET /runs/:runId/timeline` | instructor, rater or administrator | Ordered attributed event timeline |
| `GET /runs/:runId/competencies` | instructor, rater or administrator | Evidence grouped by indicator |
| `GET /runs/:runId/rubric-evidence` | instructor, rater or administrator | Observable evidence per criterion |
| `GET /runs/:runId/ratings` | instructor, rater or administrator | Current manual rating revision per criterion |
| `POST /runs/:runId/ratings` | instructor, rater or administrator | Evidence-linked append-only manual rating revision |
| `GET /runs/:runId/feedback` | assigned learner | Released manual feedback, or an explicit withheld result |

The hosted application route `/instructor` is a thin workspace over these
endpoints. It resolves the deployment-authenticated session, creates
exact-version assignments, accepts one exact run or assignment ID, presents
the attributed timeline and evidence projections, records rubric ratings, and
releases feedback. It does not create a second reporting model or duplicate
replay logic.

The first command set is deliberately bounded:

```text
INSPECT_EVIDENCE
SUBMIT_CERTIFICATE_DECISION
SUBMIT_CERTIFICATE_TRANSACTION
CREATE_CUSTODY_TRANSFER_PROPOSAL
ENDORSE_CUSTODY_TRANSFER
COMMIT_CUSTODY_TRANSFER
RECORD_TRANSPORT_CONDITION
RECEIVE_BATCH
PURCHASE_ON_RECEIPT
SUBMIT_DISCREPANCY_DECISION
INVESTIGATE_DISCREPANCY
CREATE_CORRECTION_PROPOSAL
ENDORSE_CORRECTION
COMMIT_CORRECTION
TRANSFORM_BATCH
SUBMIT_KNOWLEDGE_DECISION
PACKAGE_BATCH
TRANSFER_DISTRIBUTION_OWNERSHIP
DISPATCH_BATCH
RUN_TAMPER_DEMONSTRATION
SUBMIT_DATA_GOVERNANCE_DECISION
SUBMIT_RECALL_SCOPE_DECISION
SUBMIT_RECALL_TRANSACTION
REQUEST_RECALL_HANDOFF
RESUBMIT_AUTHORIZED_RECALL
```

Each command carries a client-generated `commandId`, `runId`, and expected run
version. The server obtains authenticated user identity and scenario-controlled
simulation context independently.

## Replay and audit separation

Every event records previous and resulting state hashes. Replay re-executes the
existing signing, authorization, and transaction services and rejects:

- event sequence gaps;
- state-hash mismatches;
- pack, scenario, content-hash, or run mismatches; and
- transaction summaries that disagree with regenerated outcomes.

The authorized certifier case anchors and issues the certificate through
accepted ledger mutation events. The transporter case produces a real valid
signature but fails authorization. That failure remains an attempt-audit event,
creates no ledger mutation, and still supports competency evidence and the
instructor timeline. An authorized certificate path continues under the
producer context. The custody proposal creates no ledger mutation, the
logistics role endorses the same digest, and only the final endorsed commitment
changes custody. A proposal that also claims to transfer ownership remains
audit evidence and can be corrected. The transport record then commits under
the logistics context.

The processor then records physical receipt and the producer records the
separate ownership transfer. Stage 5 permits exactly one initial discrepancy
decision. Overwrite and delete choices regenerate a rejected attempt-audit
event without changing the ledger, then require the single authored
investigation step. A sound initial decision skips that mitigation. The
processor signs a linked correction proposal, the producer endorses the same
digest, and only the final endorsed commitment appends the correction. The
original 1,000 kg manifest remains unchanged while the effective corrected
value becomes 100 kg. Every step, including rejected audit history, is
regenerated during replay.

Stage 6 transforms that corrected green-coffee batch into the authored 82 kg
roasted batch and records the provenance relationship. The bounded knowledge
decision records whether the learner recognizes that relationship without
exposing correctness in the learner projection. Stage 7 packages the batch
into 820 units, transfers ownership to the distributor, hands trusted execution
context to the distributor, and commits dispatch to the retailer. Replay
regenerates the same transactions, provenance, and evidence.

Stage 8 seals accepted hosted transactions into deterministic blocks, then uses
the existing real SHA-256 integrity service to demonstrate how changing one
ordered transaction invalidates its block and every later chain link. The
original ledger is never mutated by the demonstration. A bounded knowledge
decision and six-item data-governance classification retain only authored
option codes and do not expose correctness in the learner projection.

Stage 9 stores one bounded descendant-lot scope before any recall transaction is
attempted. The stage begins under the retailer's trusted execution context. An
unauthorized submission produces an attempt-audit event, creates no ledger
mutation, and remains visible in the instructor timeline. The scenario then
hands trusted context to the regulator; the authorized resubmission commits the
same stored scope and changes affected asset state exactly once. A final bounded
knowledge decision completes the nine-stage run. Replay regenerates both the
rejected attempt and accepted recall from the ordered command evidence.

## Assignment and assessment boundary

Assignments reference one immutable published pack and scenario version, one
hosted mode, and a bounded roster of already provisioned learners. The normal
assignment start route obtains pack, scenario, mode, and assignment identity
from that server record. The earlier direct run-creation route remains for
compatibility with the vertical-slice tests and existing integrations.

Manual rubric ratings do not change the simulation event log or the existing
100-point SCORM score. Each save appends a new criterion revision with the
rater, exact rubric version, authored level, bounded comment, timestamp, and
links to observable run evidence. Optimistic criterion revisions and command
IDs make retries deterministic and prevent silent overwrites.

Feedback release is one-way in this increment. Learners receive no manual
ratings through the feedback endpoint until an instructor explicitly releases
the assignment. The assignment report keeps observable event counts,
completion, and manual ratings separate; it does not invent a second overall
grade.

## Current limits

- The complete current nine-stage coffee journey is hosted for one assigned
  learner run.
- Exact-version assignment creation, a provisioned learner roster,
  assignment-bound run start, manual rating, feedback release, and a focused
  assignment report are implemented.
- Course, roster-provisioning, moderation, and learner portal screens are not
  implemented.
- CSV/JSON exports and graphical package jobs are not implemented.
- The hosted service exposes both the custody-transfer and quantity-correction
  endorsement policies.
- SCORM continues to use TC3 and is unchanged by hosted D1 persistence.

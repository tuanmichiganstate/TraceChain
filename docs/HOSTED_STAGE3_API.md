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
  "r2": "ARTIFACTS"
}
```

The current schema is in `db/schema.ts`; migration history begins at
`db/migrations/0001_instructor_platform_foundation.sql` and adds assignments
and assessment records in `0002_assignments.sql`, rubric moderation in `0003`,
resolved assignment-mode configuration in `0004`, pack retirement metadata in
`0005`, and content-addressed SCORM package jobs in `0006`.

Tables:

- `application_users`
- `application_role_assignments`
- `scenario_pack_versions`
- `assignments`
- `assignment_learners`
- `hosted_run_events`
- `rubric_rating_revisions`
- `rubric_moderation_resolutions`
- `scorm_package_jobs`

`hosted_run_events` enforces unique `(run_id, sequence_number)`,
`(run_id, idempotency_key)`, and `event_id`. D1 batch execution makes one
command's event batch atomic. Ordered events remain authoritative; snapshots
are not yet introduced.

## API

All endpoints use `/api/v1`.

| Method and path | Application role | Result |
|---|---|---|
| `GET /session` | provisioned user | Server-owned user ID, email and roles |
| `POST /scenario-packs/validate` | scenario author or administrator | Path-specific validation report without persistence |
| `POST /scenario-packs/import` | scenario author or administrator | Validated mutable draft |
| `GET /scenario-packs` | instructor, scenario author or administrator | Versioned scenario library |
| `GET /scenario-packs/:packId/versions/:version` | instructor, scenario author or administrator | Exact stored pack |
| `GET /scenario-packs/:packId/versions/:version/preview` | instructor, scenario author or administrator | Deterministic role-and-mode preview |
| `GET /scenario-packs/:packId/compare` | instructor, scenario author or administrator | Stable path comparison between exact versions |
| `POST /scenario-packs/:packId/versions/:version/publish` | scenario author or administrator | Immutable publication |
| `POST /scenario-packs/:packId/versions/:version/retire` | scenario author or administrator | Idempotent retirement metadata |
| `POST /scenario-packs/publish` | scenario author or administrator | Immutable pack identity |
| `POST /assignments` | instructor or administrator | Active assignment bound to one exact published scenario and provisioned learner roster |
| `GET /assignments/:assignmentId` | instructor, rater or administrator | Assignment metadata and feedback-release state |
| `GET /learner/assignments` | learner | Only the signed-in learner's assignment and run summaries |
| `POST /assignments/:assignmentId/start-run` | assigned learner, instructor or administrator | New run using server-owned assignment configuration |
| `GET /assignments/:assignmentId/report` | instructor, rater or administrator | Learner, run, completion, authoritative event-span timing, event-derived activity, event-count and current-rating report |
| `GET /assignments/:assignmentId/monitor` | instructor, rater or administrator | Replay-derived current stage, elapsed time, pending actions, last activity, and technical status without hidden outcomes |
| `GET /assignments/:assignmentId/competencies` | instructor, rater or administrator | Versioned learner and class competency evidence without inferring stable competence |
| `GET /assignments/:assignmentId/decision-outcomes` | instructor, rater or administrator | Completed-run authored decision evidence beside realized outcomes; active-run correctness and outcomes remain hidden |
| `GET /assignments/:assignmentId/export.json` | instructor, rater or administrator | Versioned assignment, roster, complete event, rating, and moderation evidence with an embedded data dictionary |
| `GET /assignments/:assignmentId/export.csv` | instructor, rater or administrator | The same evidence in the documented flat CSV V1 layout |
| `POST /assignments/:assignmentId/feedback-release` | instructor or administrator | One-way release of current feedback |
| `POST /runs` | instructor, scenario author or administrator | New assigned hosted coffee run metadata |
| `GET /runs/:runId` | assigned learner | Role-filtered projection only |
| `POST /runs/:runId/commands` | assigned learner | Persisted command result and new projection |
| `GET /runs/:runId/timeline` | instructor, rater or administrator | Ordered attributed event timeline |
| `GET /runs/:runId/replay?sequence=:number` | instructor, rater or administrator | Deterministic role-filtered state immediately after one authoritative event |
| `GET /runs/:runId/competencies` | instructor, rater or administrator | Evidence grouped by indicator |
| `GET /runs/:runId/rubric-evidence` | instructor, rater or administrator | Observable evidence per criterion |
| `GET /runs/:runId/ratings` | instructor, rater or administrator | Current manual rating revision per criterion |
| `POST /runs/:runId/ratings` | instructor, rater or administrator | Evidence-linked append-only manual rating revision |
| `POST /runs/:runId/moderation` | instructor or administrator | Evidence-linked append-only rubric score resolution |
| `GET /runs/:runId/feedback` | assigned learner | Released manual feedback and that learner's evidence-only competency profile, or an explicit withheld result |
| `GET /scorm-package-jobs` | instructor or administrator | Authorized package-job history |
| `POST /scorm-package-jobs` | instructor or administrator | Exact verified Guided or Challenge artifact |
| `GET /scorm-package-jobs/:jobId` | owner or administrator | Package identity and download URL |
| `GET /scorm-package-jobs/:jobId/download` | owner or administrator | Exact content-addressed ZIP |

The hosted `/instructor`, `/learner`, and `/author` routes are thin workspaces
over these endpoints. They do not create a second reporting, replay, authoring,
or package-generation model. See `docs/HOSTED_ROLE_WORKSPACES_V1.md`.

Assignments retain the fully resolved published mode configuration. Sandbox
and Configured probabilistic cases record deterministic random-draw and
realized-outcome events; Standard and Tutorial can force an authored outcome
without consuming a draw. See `docs/HOSTED_RUN_MODES_V1.md`.

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

`SUBMIT_CERTIFICATE_DECISION` is one atomic professional response. In the
current 1.6 coffee pack it requires one inspected evidence citation, the
applicable certificate-issuer policy citation, a confidence value from 1
through 5, an adverse-event probability estimate from 0 through 100 percent,
and the existing bounded justification. The exact ranges come from the decision
node's `structuredResponse`; they are not learner-selected defaults. The
applicable policy comes from the scenario's proposal binding rather than a
learner-entered identifier. Those values are retained in the decision event and
reproduced by replay without changing the existing scoring contract.

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
completion, authoritative first/latest/completion timestamps, event-span
duration, event-derived activity counts, and manual ratings separate; it does
not invent a second overall grade. Activity covers evidence inspections, policy
consultations, cited evidence, decision attempts, rejected attempts, and
mitigation. It also returns deterministic rejection findings from recorded
validation-rule IDs, with a command-type fallback for rejected decisions that
have no rule ID. A single rejected attempt may contribute multiple findings.
They remain diagnostic evidence rather than another grade or a technical
failure. Active-run report duration stops at the latest recorded event and
is stable across reads. The report response schema is `1.3.0`. Its live-status
panel is a refreshable projection of the same authoritative replay used by run
review. Current stage and pending actions are limited to the active trusted
role. A replay failure is reported as a technical status requiring attention;
learner decision rejections are not misclassified as technical failures.

The versioned decision/outcome report replays the same exact pack and event
stream. It returns the seven bounded authored decision results only after a
run completes, and keeps the realized outcome separate from that evidence.
Active runs return no correctness or outcome data. The projection adds no
score and does not expose the scenario seed or random draw. See
`docs/DECISION_OUTCOME_REPORT_V1.md`.

## Current limits

- The complete current nine-stage coffee journey is hosted for one assigned
  learner run.
- Exact-version assignment creation, a provisioned learner roster,
  assignment-bound run start, manual rating, feedback release, and a focused
  assignment report are implemented. Stable JSON and CSV assignment evidence
  exports include exact content versions, complete event streams, append-only
  rating and moderation revisions, authoritative event-span timing,
  event-derived activity summaries, and the V1 data dictionary. The assignment
  competency
  report links targeted indicator versions to observable evidence and current
  ratings while explicitly avoiding a single-simulation competence inference.
  Versioned declarative evidence rules are executed against their referenced
  source-event type and bounded payload condition before evidence is appended;
  non-matching rules fail the prospective command batch without persisting
  partial learner state.
  The instructor workspace exposes the same data as expandable per-learner
  profiles with evidence recency, rubric comments, and supporting event
  actions that focus the existing run timeline, plus the current class rating
  distribution for each indicator. It also compares completed-run authored
  decision evidence with realized outcomes while concealing both for active
  runs.
- The assignment live monitor reports learner status, current workflow stage,
  wall-clock elapsed time, last activity, active-role pending actions, and
  replay health without returning hidden outcome state. This live value is
  distinct from the stable event-span timing in the assignment report.
- Instructor timeline replay reconstructs the exact role-filtered view at a
  selected event sequence and never returns hidden actual state.
- Course and roster-provisioning screens are not implemented.
- The learner, instructor/rater/administrator, and author workspaces are
  implemented. The author workspace includes a self-localized pharmaceutical
  starter for validation and preview; the complete hosted runtime remains the
  coffee journey.
- Graphical Guided and Challenge package jobs reuse the exact Node-generated
  artifacts and content-addressed R2 storage.
- The hosted service exposes both the custody-transfer and quantity-correction
  endorsement policies.
- SCORM continues to use TC3 and is unchanged by hosted D1 persistence.

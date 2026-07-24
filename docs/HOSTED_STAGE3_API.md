# Hosted Stage 3 vertical slice

Status: implemented locally; production publication requires a committed and
pushed source state.

## Purpose

This is the first server-authoritative path through the instructor-ready
platform architecture. It proves:

```text
published scenario pack
-> authenticated application principal
-> assigned learner run
-> role-filtered evidence
-> atomic professional decision
-> genuine signature and authorization check
-> accepted transaction or rejected audit attempt
-> competency and rubric evidence
-> instructor timeline
-> exact event replay
```

The service reuses the existing coffee Stage 3 command, rule, Ed25519,
authorization, event, state-version, and ledger services through
`CoffeeStage3HostedAdapter`. It does not copy certificate business rules into a
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
`db/migrations/0001_instructor_platform_foundation.sql`.

Tables:

- `application_users`
- `application_role_assignments`
- `scenario_pack_versions`
- `hosted_run_events`

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
| `POST /runs` | instructor, scenario author or administrator | New assigned Stage 3 run metadata |
| `GET /runs/:runId` | assigned learner | Role-filtered projection only |
| `POST /runs/:runId/commands` | assigned learner | Persisted command result and new projection |
| `GET /runs/:runId/timeline` | instructor, rater or administrator | Ordered attributed event timeline |
| `GET /runs/:runId/competencies` | instructor, rater or administrator | Evidence grouped by indicator |
| `GET /runs/:runId/rubric-evidence` | instructor, rater or administrator | Observable evidence per criterion |

The first command set is deliberately bounded:

```text
INSPECT_EVIDENCE
SUBMIT_CERTIFICATE_DECISION
SUBMIT_CERTIFICATE_TRANSACTION
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
instructor timeline.

## Current limits

- Only the Stage 3 certificate slice is hosted.
- Run assignment is supplied during instructor run creation; general
  assignment, course, and roster workflows are not implemented.
- The APIs exist, but dedicated learner and instructor portal screens do not.
- Manual ratings, feedback release, class reports, exports, and graphical
  package jobs are not implemented.
- Cryptographic endorsement policies are complete in the reusable
  Guided/Challenge simulation engine. The hosted Stage 3 compatibility endpoint
  does not yet expose the later custody-transfer or correction endorsement
  flows.
- SCORM continues to use TC3 and is unchanged by hosted D1 persistence.

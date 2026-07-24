# Hosted run replay V1

Status: implemented for the hosted instructor platform.

## Purpose

Instructor replay reconstructs the deterministic run state immediately after a
selected authoritative event. It uses the same event reducer, exact scenario
pack, cryptographic evidence, and state-hash checks as live hosted run loading.
It is not a separate replay implementation.

## Authorization and route

Only an authenticated `instructor`, `rater`, or `administrator` may request:

```text
GET /api/v1/runs/{runId}/replay?sequence={positiveInteger}
```

If `sequence` is omitted, the endpoint reconstructs the latest event. A
sequence below 1 or above the current event count is rejected. Learners cannot
call this instructor route.

## Response contract

`InstructorRunReplayV1` contains:

```text
schemaVersion
run and assignment identity
learner identity
exact pack and scenario identity
selected sequence and total event count
selected event attribution and resulting state hash
role-filtered LearnerRunProjectionV1
```

The projection contains the business, ledger, information, policy, and
workflow records visible to the active simulation role at that event. It does
not contain `actualState`.

The instructor interface places the selected event payload beside that
role-filtered projection. For structured decisions, the payload includes the
submitted rationale, cited evidence identifiers, confidence, and risk estimate
when those fields were authored. This allows review of what the learner said
against what the active role could see at the time, without revealing hidden
outcomes.

## Determinism and integrity

For a selected sequence, the service:

1. loads the original ordered event stream;
2. takes events from sequence 1 through the selected event;
3. verifies every sequence number and previous-state hash;
4. applies the existing asynchronous run reducer;
5. verifies every resulting-state hash; and
6. creates the same role-filtered projection used by the hosted learner view.

Repeated requests over the same stored event stream return the same replay
evidence. The response adds no generated timestamp or identifier.

Replay never:

- changes the run;
- appends an event;
- re-runs a learner command against current content;
- substitutes a newer scenario version;
- reveals hidden actual state; or
- bypasses role-based instructor authorization.

## Instructor interface

Each timeline row offers a keyboard-accessible replay control. The compact
result shows the selected event, replay position, active role, workflow node,
visible evidence count, permitted actions, selected event response, and
expandable role-visible evidence. Supporting-event links in competency
profiles load and focus the exact timeline row before replay. This keeps the
first instructor workspace useful without introducing a second simulation
screen.

# Hosted role workspaces V1

TraceChain relies on deployment authentication and server-provisioned
application roles. A request body cannot grant an application role or assert a
simulation identity.

## Routes

| Route | Application role | Capability |
|---|---|---|
| `/platform` | any provisioned role | Show only the workspaces granted by server-owned roles |
| `/learner` | learner | List own assignments, start or resume own run, inspect role-visible evidence, and submit the bounded command path |
| `/instructor` | instructor | Create assignments, monitor reports, replay runs, rate evidence, release feedback, export records, and generate SCORM packages |
| `/instructor` | rater | Review evidence and save append-only ratings without assignment, publication, moderation, or package controls |
| `/author` | scenario-author | Import, edit, validate, preview, compare, publish, and retire scenario packs |
| `/instructor` and `/author` | administrator | Management, moderation, package, and authoring controls |

The UI is a thin client. Every privileged action is authorized again in the
worker and repository layer.

The assignment live monitor is refresh-based rather than a separate real-time
transport. It reconstructs each started run through the existing deterministic
service and exposes only status, wall-clock elapsed time, the active role's
workflow stage and pending actions, and replay health. Hidden authored outcomes
remain excluded.

The assignment report records stable timing from the authoritative event log:
the first event, latest activity, completion event when present, and their
whole-second span. An active run's report duration stops at its latest recorded
event, unlike the live monitor's wall-clock value. It also derives bounded
counts for evidence inspections, policy consultations, cited evidence,
decision attempts, rejected attempts, and mitigation directly from that same
immutable event log. These counts describe observable activity; they are not a
second score. The report also includes expandable learner competency profiles.
Each profile presents the exact
scenario version's targeted indicators, observation counts and recency,
current rubric comments, and source-event references. It can load and focus a
referenced event in the existing run timeline. It does not derive a second
score or claim stable competence from one run.

## Learner authority boundary

`GET /api/v1/learner/assignments` joins the authenticated user ID to the
server-owned assignment roster. A learner starts a run with only a command ID
and run ID. Assignment, scenario, mode, seed policy, learner identity, and
authored outcome come from trusted server records.

Learner command bodies contain the decision payload, command ID, run ID, and
expected run version. Simulation actor, organization, and role are created by
the orchestrator from the scenario-controlled trusted context.

The certificate vertical slice also projects its authored response
requirements into the learner's role-visible policy state. The learner submits
the business judgment, bounded rationale, inspected-evidence citations,
confidence, and adverse-event probability estimate atomically. The server
validates those fields against the exact scenario version before appending the
decision event.

The API returns `LearnerRunProjectionV1`, which excludes actual state,
scenario seeds, outcome draws, authored correctness, and unreleased feedback.

## Current administrative boundary

User and roster provisioning remain deployment administration. TraceChain does
not implement passwords, institutional directory synchronization, course
management, multi-tenant administration, or collaborative multi-learner runs.

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

## Learner authority boundary

`GET /api/v1/learner/assignments` joins the authenticated user ID to the
server-owned assignment roster. A learner starts a run with only a command ID
and run ID. Assignment, scenario, mode, seed policy, learner identity, and
authored outcome come from trusted server records.

Learner command bodies contain the decision payload, command ID, run ID, and
expected run version. Simulation actor, organization, and role are created by
the orchestrator from the scenario-controlled trusted context.

The API returns `LearnerRunProjectionV1`, which excludes actual state,
scenario seeds, outcome draws, authored correctness, and unreleased feedback.

## Current administrative boundary

User and roster provisioning remain deployment administration. TraceChain does
not implement passwords, institutional directory synchronization, course
management, multi-tenant administration, or collaborative multi-learner runs.

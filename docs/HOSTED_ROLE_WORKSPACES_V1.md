# Hosted role workspaces V1

SimuLedger relies on deployment authentication or a verified Moodle LTI 1.3
launch, followed by server-provisioned application roles. A request body
cannot grant an application role, assert a Moodle context, or assert a
simulation identity.

## Routes

| Route | Application role | Capability |
|---|---|---|
| `/platform` | any provisioned role | Show only the workspaces granted by server-owned roles |
| `/learner` | learner | List own assignments, start or resume own run, inspect role-visible evidence, and submit the bounded command path |
| `/learner` | Moodle LTI learner | The same learner workspace, restricted to the one verified course assignment carried by the signed activity launch |
| `/instructor` | instructor | Select a published runnable scenario and learner roster, create and close assignments, monitor reports, replay runs, rate evidence, release feedback, export records, and generate SCORM packages |
| `/instructor` | Moodle LTI instructor | The same instructor workspace under the verified Moodle course context; no learner, author, rater, or administrator role is inferred |
| `/instructor` | rater | Review evidence and save append-only ratings without assignment, publication, moderation, or package controls |
| `/author` | scenario-author | Import, edit, validate, preview, compare, publish, and retire scenario packs |
| `/author` | Moodle LTI Scenario Author activity | The same author workspace with only session-scoped `scenario-author`; requires a full Instructor role and an exact resource-link ID in the server allowlist |
| `/instructor` and `/author` | administrator | Management, moderation, package, and authoring controls |
| `/admin` | administrator | Provision application access, assign server-owned roles, and disable or reactivate users |

The UI is a thin client. Every privileged action is authorized again in the
worker and repository layer.

An LTI launch uses a separate HTTP-only session and carries the verified
issuer, client, deployment, course context, and resource-link identity.
Assignments created in that session are bound to the course context, and
assignment-, run-, and counterfactual-specific API requests cannot cross into
another Moodle course. When the signed instructor launch contains NRPS 2.0,
the assignment form can explicitly synchronize and select active learners from
that exact course; no background synchronization occurs. LTI does not read
SCORM attempts. For activities created through Deep Linking, AGS returns final
completion and an existing automatic score when the runtime has one; generic
evidence-based runs remain pending manual grading. See
`docs/LTI_1_3_INSTRUCTOR_WORKSPACE_V1.md`.

The Scenario Author activity is a separately allowlisted resource link.
Moodle controls who may open that activity; SimuLedger additionally requires
the signed full Instructor role and the exact server-configured resource-link
ID. The resulting session is deliberately not an instructor or administrator
session. A custom LTI parameter cannot elevate an ordinary instructor link.

An LTI Deep Linking launch is narrower than the instructor workspace. It lists
only active SimuLedger assignments already bound to the verified Moodle course
and returns one signed resource link, or an empty response when the instructor
cancels. It cannot open reports, create assignments, or select content from
another course.

Assignment creation loads the versioned scenario library and offers only
published scenarios with a registered hosted runtime. Selecting one binds its
exact pack and scenario versions and limits the mode control to the modes
authored in that scenario. Draft, retired, and preview-only packs remain
available to authors but cannot be assigned accidentally. Under direct hosted
authentication, the same form loads active application users with the
server-provisioned learner role. Under an LTI instructor session, it loads only
active synchronized learners from the exact verified Moodle course. Optional
Moodle names and email addresses are display labels; the durable external
identity remains the signed platform subject. The instructor selects the
bounded roster rather than copying internal identifiers. Disabled users,
inactive memberships, and non-learners are not offered.

An instructor may also set optional opening and closing times. The browser
accepts local date-time input, while the API normalizes and stores immutable UTC
timestamps. Opening is inclusive and closing is exclusive. The learner list
shows a server-observed availability status, and the worker checks the
authoritative clock again before creating a run. Closing the start window does
not prevent an already-started run from being resumed.

Assignment closure is one-way and idempotent. It records the authenticated
instructor or administrator and server time, then prevents new run creation.
Runs that already started and all existing event, rating, and report evidence
remain unchanged and accessible.

The administrator workspace also exposes the latest 100 access-change commands
as a read-only audit. Performer identity comes from the authenticated principal,
and the underlying append-only records cannot be edited from the workspace.

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
second score. It also aggregates deterministic validation-rule findings from
rejected submitted actions. One rejected attempt can expose multiple findings;
the class summary therefore reports occurrences independently from attempt
counts and does not classify learner decisions as technical failures. The
report also includes expandable learner competency profiles.
Each profile presents the exact
scenario version's targeted indicators, observation counts and recency,
current rubric comments, and source-event references. It can load and focus a
referenced event in the existing run timeline. It does not derive a second
score or claim stable competence from one run.

The separate process-analytics projection distinguishes policy consultation
from policy citation. Consultation counts come from `POLICY_CONSULTED`; citation
counts come from the bounded `citedPolicyIds` recorded by
`DECISION_SUBMITTED`. Both remain linked to the immutable source events and
neither changes the academic score.

Assignment evidence downloads are identified by default. An instructor may
instead request deterministic assignment-scoped learner pseudonyms in JSON or
CSV. Staff, run, event, evidence, and simulation-role identifiers remain
available for interpretation, so the result is pseudonymous rather than
anonymous.

The decision/outcome section is another read-only replay projection. For
completed runs it reports whether each bounded decision matched the authored
response and shows the realized scenario outcome separately. It adds no grade
and exposes neither authored correctness nor hidden outcomes for active runs.
See `docs/DECISION_OUTCOME_REPORT_V1.md`.

## Learner authority boundary

`GET /api/v1/learner/assignments` joins the authenticated user ID to the
server-owned assignment roster. Each result includes the availability status
observed by the server. A learner starts a run with only a command ID and run
ID. Assignment, scenario, mode, seed policy, availability, learner identity,
and authored outcome come from trusted server records. The start endpoint does
not trust a possibly stale client status.

Learner command bodies contain the decision payload, command ID, run ID, and
expected run version. Simulation actor, organization, and role are created by
the orchestrator from the scenario-controlled trusted context.

The certificate vertical slice also projects its authored response
requirements into the learner's role-visible policy state. The learner submits
the business judgment, bounded rationale, inspected-evidence citations,
confidence, and adverse-event probability estimate atomically. The server
validates those fields against the exact scenario version before appending the
decision event. Its applicable issuer-authorization rule begins as an available
reference. The learner must durably submit `CONSULT_POLICY` before the
localized rule statement is revealed or may be cited.

For the coffee certificate flow and generic hosted cases, release makes the
evidence title and learner-visible attributes available but not its record
content. The contextual evidence control first appends `EVIDENCE_INSPECTED`;
only the resulting projection contains the content and permits it to be cited.
One evidence item creates at most one first-inspection event, while duplicate
delivery of the same command remains idempotent.

The API returns `LearnerRunProjectionV1`, which excludes actual state,
scenario seeds, outcome draws, authored correctness, and unreleased feedback.

## Current administrative boundary

Application-user and role provisioning are available in the administrator
workspace. Direct hosted access still uses the hosting layer's verified email.
Moodle instructor and learner access may instead use a verified LTI 1.3
subject, role, and course context. A learner activity grants access only to the
exact assignment in its signed custom claim. A verified instructor may
explicitly synchronize the exact course's NRPS learner snapshot for subsequent
assignment creation. SimuLedger does not implement passwords, general
institutional directory synchronization, scheduled roster synchronization,
multi-tenant administration, or collaborative multi-learner runs.
See `docs/APPLICATION_ACCESS_ADMINISTRATION_V1.md`.

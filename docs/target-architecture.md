# Target architecture

Status: Phase 0 target for the instructor-ready configurable platform
Canonical roadmap: `docs/CANONICAL_INSTRUCTOR_READY_PLATFORM_PLAN.md`

## Architectural objective

TraceChain will support two delivery channels from one versioned content and
simulation system:

1. Server-authoritative, individual hosted runs with instructor workflows.
2. Portable SCORM packages with compact deterministic replay.

The hosted platform adds identity, authorization, publication, assignments,
event storage, replay, assessment, reporting, exports, and package-generation
jobs around the reusable simulation core. It does not introduce collaborative
multi-learner runs.

As of 24 July 2026, the authenticated Stage 3 vertical slice implements the
memory and D1 event stores, D1 pack publication, server-authoritative commands,
role-filtered learner projection, exact replay, and instructor evidence APIs.
The portals, full coffee migration, assignments, ratings, exports, hosted
package jobs, and endorsement increment remain later gates.

## Target layers

```text
Applications
  learner portal
  instructor portal
  author portal
  administrator and optional rater surfaces
  SCORM player

Application services
  authentication and application-role authorization
  scenario-pack import, validation, versioning and publication
  assignment and individual-run orchestration
  trusted simulation-context selection
  evidence and decision services
  rubric, competency, feedback, replay and export services
  SCORM package-generation jobs

Reusable platform core
  versioned competency, rubric and scenario-pack contracts
  generic workflow nodes and declarative conditions/effects
  command and event contracts
  role-filtered projection
  deterministic random streams
  replay and evidence linkage

Existing simulation capabilities
  coffee compatibility adapter
  commands, validation and accepted/audit events
  ledger, state versions, provenance and correction
  Ed25519 signatures and authorization
  scoring and causal reporting

Ports
  event store
  content repository
  assignment and rating repository
  object store
  clock, random source and identifiers
  package-generation service
  learning-platform reporting

Adapters
  D1 hosted repositories
  R2 evidence/export objects when uploads are introduced
  memory adapters for tests
  SCORM persistence and reporting
  standalone development persistence
  future PostgreSQL repository
  future real-ledger adapter
```

## Deployment shape

The connected Cloudflare Sites project remains the first hosted deployment.

```text
Browser
  -> Sites Worker
       -> authenticated-user headers / platform sign-in boundary
       -> application-role authorization
       -> API routes and role-filtered projections
       -> D1 structured records
       -> R2 evidence and export files, when required
       -> static learner/instructor client assets
```

The first hosted foundation uses D1 because the repository is already connected
to Sites and D1 is the platform-owned durable relational service. Repositories
and event-store ports isolate SQL and preserve a future PostgreSQL deployment
option. R2 is not declared until the first upload or export-file workflow is
implemented.

Institutional OIDC remains the production preference where the deployment
environment supplies it. The first Sites implementation may use forwarded
authenticated-user identity, with all application-role authorization enforced
server-side. No password system will be built in TraceChain.

## Identity model

```text
AuthenticatedUser
  userId
  verified external identity

ApplicationRoleAssignment
  learner | instructor | scenario-author | administrator | rater

RunParticipant
  assignmentId
  runId
  userId
  simulationRoleId

TrustedSimulationContext
  actorId
  organizationId
  roleId
```

The server derives trusted simulation context from the published scenario,
assignment, run state, and permitted handoffs. No command payload may self-assert
actor, organization, role, application role, or rater authority.

## Scenario-pack model

A pack is an immutable, content-addressed version envelope:

```text
ScenarioPackVersion
  schemaVersion
  packId
  version
  status
  supportedLocales
  manifest
  competency references
  policies
  rubrics
  scenarios
  asset hashes
  publication metadata
```

Draft content may change. Validation produces structured diagnostics. Publishing
freezes the exact definition and content hash. Editing a published pack creates
a new version. Runs retain an exact pack-version reference.

The first pack contains a compatibility scenario node that delegates to the
current coffee stage engine. New domain packs use generic briefing, evidence,
decision, transaction, policy, communication, stochastic, consequence,
feedback, reflection, and completion nodes. This permits migration without
duplicating coffee business rules.

Scenario data is declarative. Imported content cannot contain executable code.
Approved extension components are selected from a server-maintained registry,
not imported by path or source.

## Run state and authority

Hosted `RunState` contains:

```text
actualState
businessState
ledgerState
informationState
policyState
workflowState
rngState
```

Only a role-filtered projection is returned to a learner. Hidden actual state
is never serialized into learner HTML, static assets, or API responses.

Hosted commands include:

- run and scenario-version identity;
- idempotency key;
- expected state version;
- authenticated user attribution;
- trusted simulation context derived by the server;
- causation and correlation identifiers.

The event store assigns one strictly increasing sequence number per run. A
command transaction:

1. checks the idempotency key;
2. loads the exact published scenario version and current run version;
3. derives trusted context;
4. verifies signatures, authorization, policy, and state versions;
5. produces prospective events and state;
6. appends events atomically;
7. updates a snapshot when policy permits;
8. returns the new role-filtered projection.

Snapshots are caches. Ordered events remain authoritative.

## Event contract

Every hosted event carries:

```text
eventId
runId
sequenceNumber
serverTimestampUtc
optionalClientTimestamp
authenticatedUserId
simulationActorId
organizationId
roleId
eventType
packId and packVersion
scenarioId and scenarioVersion
payload
causationId
correlationId
previousStateHash
resultingStateHash
```

Raw event payloads are schema-versioned. Assessment evidence stores event
references and rule versions rather than copying facts that can drift.

## Delivery modes

Current package presets and hosted run behavior are separate axes:

| Existing delivery preset | Typical hosted behavior |
|---|---|
| Guided | Tutorial |
| Challenge | Standard or Configured |
| Assessment | Standard or Configured |
| Technical Laboratory | Tutorial or Sandbox |

The persisted package-mode vocabulary remains unchanged. Hosted run
configuration adds `tutorial`, `standard`, `sandbox`, and `configured`
behavior without reinterpreting existing TC3 data.

## SCORM boundary

The SCORM player continues to own:

- compact TC3 replay inputs;
- package-local scoring and feedback;
- LMS completion, success, score, and interactions;
- offline operation.

The hosted platform owns:

- assignments and authenticated users;
- authoritative event history;
- role-filtered hidden state;
- evidence telemetry;
- manual ratings and moderation;
- class reporting and rich exports.

The graphical builder submits a validated package-generation job to a wrapper
around the existing Node generator. A job records source commit, pack version,
configuration hash, scenario hash, application-build hash, status, logs, and
artifact metadata. The builder does not reimplement manifest or ZIP generation.

## Assessment architecture

```text
RunEvent
  -> AutomatedEvidenceRule(version)
  -> CompetencyEvidence(event references)
  -> RubricCriterion(version)
  -> Automated or ManualRating
  -> CompetencyResult(policy version)
```

Observable evidence, process score, realized business outcome, rubric judgment,
competency result, and optional overall score are distinct records.

## Security boundaries

- Authentication identifies an application user; server authorization grants
  application capabilities.
- Simulation identity is scenario-controlled and independent of application
  role.
- Published content and run events are immutable.
- Imported packs are schema-validated and sanitized.
- No arbitrary code, HTML scripts, or learner-supplied executable expressions.
- Administrative, publication, rating, moderation, and export actions are
  audit logged.
- Evidence objects use authorized, expiring access rather than public paths.
- All authoritative timestamps are UTC.
- Learner exports can use pseudonymous identifiers.

## Migration sequence

### Foundation

1. Add the canonical plan, current architecture, target architecture, and ADR.
2. Add versioned competency, rubric, scenario-pack, and run-event contracts.
3. Add structured pack validation and a command-line validator.
4. Add a standard-coffee vertical-slice pack that references the existing
   stage engine.

### Hosted run vertical slice

5. Add memory repositories and a server-authoritative run service.
6. Add role-filtered projection and exact event replay tests.
7. Add D1 schema and repository adapters.
8. Add authenticated API boundaries and application-role authorization.
9. Expose one evidence view, structured decision, ledger transition, rubric
   evidence, competency result, and instructor timeline.

### Product expansion

10. Migrate the complete coffee scenario into the pack envelope.
11. Complete cryptographic endorsement Increment B.
12. Add assignments, ratings, feedback release, reports, replay, and exports.
13. Extract the Node package generator into a hosted job service and build the
    graphical builder.
14. Add deterministic hosted modes and stochastic outcomes.
15. Add pack import, immutable publication, preview, comparison, retirement,
    localization workflow, and additional packs.

Collaborative multi-learner orchestration remains deferred.

## Foundation acceptance

The first implementation gate is green when:

- the untouched existing learner and SCORM gates remain green;
- pack, competency, rubric, and event schemas are versioned and validated;
- invalid packs return path-specific diagnostics;
- one coffee vertical-slice pack validates without duplicating business rules;
- published content has an immutable content identity;
- hosted event and projection contracts are testable without React or SCORM;
- no hidden-state field is included in a learner projection;
- the architectural deviations are documented.

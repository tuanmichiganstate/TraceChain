# TraceChain scenario-pack V1

The V1 scenario-pack format is the first additive contract for the hosted
instructor platform. It does not replace the existing `ScenarioDefinition`,
SCORM runtime, or coffee business rules.

The normative machine-readable schema is
`schemas/tracechain-scenario-pack-v1.schema.json`. Runtime validation adds
cross-reference, localization, graph-reachability, compatibility, and
executable-content checks that JSON Schema alone cannot express.

## Validate a pack

The repository's first pack is:

```text
scenario-packs/standard-coffee-stage3/tracechain.pack.json
```

Validate it with:

```bash
npm run validate:platform-pack
```

Validate one or more explicit paths with:

```bash
npm run validate:platform-pack -- path/to/pack.json another/pack.json
```

Diagnostics use stable codes and JSON-style paths:

```text
UNKNOWN_INDICATOR_REFERENCE $.scenarios[0].competencyTargets[0].indicatorIds[0]
```

The validator is part of `npm run quality`.

## Envelope

A pack contains:

- a semantic schema, pack, and content version;
- lifecycle status;
- supported locales and localization references for the manifest and content;
- versioned competency frameworks and performance indicators;
- analytic rubrics and declarative evidence rules;
- one or more scenario versions;
- referenced asset hashes; and
- publication metadata for immutable published or retired versions.

Every localized object contains a stable `localizationKey`. The repository
validator confirms that key exists in every locale declared by the pack. Actual
learner-facing copy remains in `src/locales/`, preserving TraceChain's single
localization system. Competency, indicator, rubric, evidence-rule,
organization, role, policy, evidence, decision, node, transition, and
compatibility references are validated.

## Workflow nodes

V1 permits these declarative node types:

```text
BRIEFING
EVIDENCE_RELEASE
DECISION
TRANSACTION_PROPOSAL
ENDORSEMENT
POLICY_CHECK
COMMUNICATION
STOCHASTIC_EVENT
CONSEQUENCE
FEEDBACK
REFLECTION
COMPLETION
```

Transitions use the constrained conditions `ALWAYS`,
`DECISION_OPTION_SELECTED`, `POLICY_RESULT`, or `EVENT_OCCURRED`. Imported
packs cannot provide JavaScript, functions, modules, or source-code snippets.
Every node must be reachable from the entry node, and at least one completion
node must be reachable.

Every authored free-text input declares a maximum length. Decision fields use
stable option IDs and JSON-compatible authored values.

## Competencies and rubrics

The first pack seeds BC1–BC8 and PC1–PC10 as data. Each competency and
performance indicator has its own version. Scenario targets explicitly mark
each competency relationship as `primary`, `supporting`, or `contextual`.

Rubric levels are numeric and localized. Criteria reference observable
indicators and versioned declarative evidence rules. Evidence rules retain an
event type and constrained comparison operation; they do not execute imported
expressions.

This hosted competency layer is separate from the current 100-point SCORM score.
The foundation does not change existing items, hints, mitigation ceilings, or
the 39/61 operational/knowledge split.

## Publication

Draft and validated definitions may be replaced. `publishScenarioPack`
constructs a published version using:

```text
SHA-256(canonical pack content + publication identity, excluding contentHash)
```

The result is deeply frozen in memory. `MemoryScenarioPackRepository` rejects a
replacement of a published version. Durable adapters must enforce the same
unique `(packId, version)` and immutable-publication rule transactionally.

Editing published content requires a new semantic content version. Existing
runs keep their exact pack and scenario versions.

## Existing coffee compatibility

The first pack decomposes the Stage 3 certificate experience into declarative
briefing, evidence, decision, proposal, policy, consequence, and completion
nodes. Its compatibility block points to:

```text
adapter: tracechain-coffee-v2
scenario: SCN_COFFEE_001@2.1.0
stage: STG_03_ANCHOR_CERTIFICATE
```

The proposal binds to the existing `SUBMIT_CERTIFICATE_DECISION` command,
`ISSUE_CERTIFICATE` action, and `AUTH_ISSUE_CERTIFICATE` policy. The pack does
not copy certificate authorization, ledger mutation, scoring, mitigation, or
audit-event rules. Those remain in the existing simulation core.

The compatibility adapter is a migration seam. It may be removed only after a
generic capability passes behavior-equivalence tests against the existing
coffee stage.

## Hosted run authority

The hosted event contract assigns one sequence number per run and includes
authenticated user attribution separately from simulation actor, organization,
and role. `MemoryRunEventStore` and `D1RunEventStore` implement the same append
and idempotency port.

The learner projection contains only role-visible business, evidence, policy,
workflow, and shared-ledger state. It never contains `actualState`, `rngState`,
visibility rules, or actions granted to another role.

D1 stores the exact ordered event envelope as JSON behind relational run,
sequence, event, and idempotency constraints. A batch append is atomic.
`D1ScenarioPackRepository` applies the same immutable-publication rule as the
memory repository, and verifies content identity when definitions are loaded.
A future PostgreSQL adapter can implement these ports without changing the core
contracts.

## Current boundary

The first hosted vertical slice now provides:

- deployment-authenticated identity mapped to server-owned application roles;
- a D1 schema plus event, pack, and principal repositories;
- a server-authoritative, single-learner Stage 3 run;
- role-filtered evidence, atomic decision submission, a real signed
  authorization check, accepted or rejected transaction history, competency
  evidence, exact replay, and instructor timeline/rubric APIs;
- request idempotency, optimistic run versions, same-origin mutation checks,
  immutable pack content hashes, and hidden-state filtering; and
- an optional server-managed initial-administrator allowlist for an empty D1
  deployment.

It does not yet provide:

- application-role administration screens or general assignment management;
- the complete server-backed coffee journey;
- instructor timeline, rubric, learner, or author portal screens;
- a graphical SCORM builder; or
- cryptographically verified endorsement-policy integration.

Those remain sequenced in `docs/target-architecture.md`. SCORM continues to use
the current compact deterministic TC3 journal.

# TraceChain scenario-pack V1.2

The V1.2 scenario-pack format is the active contract for the hosted
instructor platform. It does not replace the existing `ScenarioDefinition`,
SCORM runtime, or coffee business rules.

The normative machine-readable schema is
`schemas/tracechain-scenario-pack-v1.schema.json`. Runtime validation adds
cross-reference, localization, graph-reachability, runtime-profile, and
executable-content checks that JSON Schema alone cannot express.

## Validate a pack

The repository packs are:

```text
scenario-packs/standard-coffee-stage3/tracechain.pack.json
scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json
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
validator confirms that key exists in every locale declared by the pack.
Native application packs may resolve those keys from `src/locales/`; portable
disciplinary packs may include bounded `localizationCatalogs` as immutable
pack data. Embedded catalogues must cover every supported locale and override
application values only inside that pack. Competency, indicator, rubric, evidence-rule,
organization, role, policy, evidence, decision, node, transition, and native
runtime references are validated.

Every scenario must provide `modeConfigurations`, `outcomeModels`, and
`counterfactualComparisonDimensions`; no application default or older pack
shape is accepted. An empty comparison-dimension array is valid for scenarios
that do not yet support counterfactual exploration.

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

A decision may also declare a bounded `structuredResponse`. V1 supports
scenario-controlled evidence- and policy-citation counts, a numeric confidence
range, and an adverse-event probability percentage range. Each field
independently declares whether it is required. Runtime validation rejects empty
definitions, inverted ranges, and a required citation field with a zero-item
minimum. Hosted command validation then confirms that cited evidence was
actually inspected and that cited policies are bound to that decision's
transaction proposal. These fields remain part of the atomic decision event;
they do not create a second score.

An eligible decision may also declare a bounded `counterfactual` contract. It
defines the release boundary, permitted creator roles, authored alternative
option IDs, comparison-dimension references, downstream replay policy, branch
limit, reflection requirement, and localized entry label. Alternatives must
belong to that exact decision, and dimensions must belong to that exact
scenario. The validator rejects unknown references and unrestricted
expressions.

The coffee scenario currently enables this contract for the certificate,
quantity-discrepancy, and recall-scope decisions. The comparison dimensions are
academic score, non-grade process quality, consumer safety, business cost,
compliance, and evidence quality. This schema addition does not itself expose
a learner workflow or change any official grade.

## Competencies and rubrics

The coffee pack seeds BC1–BC8 and PC1–PC10 as data. The pharmaceutical starter
demonstrates the independent `PHARMA.COLD_CHAIN` namespace. Each competency and
performance indicator has its own version. Scenario targets explicitly mark
each competency relationship as `primary`, `supporting`, or `contextual`.

Rubric levels are numeric and localized. Criteria reference observable
indicators and versioned declarative evidence rules. Evidence rules retain an
event type and constrained comparison operation; they do not execute imported
expressions. The hosted run service evaluates those rules before it records
competency evidence. `EVENT_OCCURRED` requires the authored event type,
`FIELD_EQUALS` compares one scalar event-payload field, and `FIELD_IN` compares
one scalar field against an authored set. `fieldPath` is a bounded,
dot-separated path relative to the source event payload; array traversal and
prototype fields are rejected. A recorded evidence event retains the exact
rule ID, rule version, indicator IDs, and only the source event IDs that
matched.

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

## Native coffee runtime

The first pack began with the Stage 3 certificate experience and now continues
through Stage 4 custody and transport plus Stage 5 receipt, discrepancy
mitigation, and append-only correction, then Stage 6 transformation and Stage 7
distribution, Stage 8 tamper and data-governance reasoning, and Stage 9 recall
scope, trusted regulator handoff, and final debrief. It decomposes those stages into
declarative briefing, evidence, decision, proposal, endorsement, policy,
consequence, feedback, and completion nodes. Its native runtime profile points
to:

```text
runtime: tracechain-coffee-v2
scenario: SCN_COFFEE_001@2.2.0
stage: STG_03_ANCHOR_CERTIFICATE
```

The native action bindings reuse the existing certificate, custody-transfer,
transport, receipt, ownership-transfer, and correction actions. Certificate
authorization, sender-and-receiver custody endorsement, and
producer-and-processor correction endorsement remain in the existing
simulation core, as do transformation, provenance, packaging, dispatch, ledger
mutation, tamper detection, recall, scoring, mitigation, scripted manifest, and
audit-event rules.

The generic hosted runtime remains separate and is used only by packs whose
workflow is fully expressed by its supported declarative node set.

## Hosted run authority

The hosted event contract assigns one sequence number per run and includes
authenticated user attribution separately from simulation actor, organization,
and role. `MemoryRunEventStore` and `D1RunEventStore` implement the same append
and idempotency port. Both can load an exact sequence-bounded prefix without
materializing later events.

The learner projection contains only role-visible business, evidence, policy,
workflow, and shared-ledger state. It never contains `actualState`, `rngState`,
visibility rules, or actions granted to another role.

D1 stores the exact ordered event envelope as JSON behind relational run,
sequence, event, and idempotency constraints. A batch append is atomic.
`D1ScenarioPackRepository` applies the same immutable-publication rule as the
memory repository, and verifies content identity when definitions are loaded.
A future PostgreSQL adapter can implement these ports without changing the core
contracts.

Counterfactual branches use copy-on-write history. Immutable
`counterfactual_runs` metadata records the source run, exact fork sequence,
pack and scenario versions, source configuration and seed, trusted fork
context, and source state and role-visible information hashes. Source events
remain in the source stream; only branch-local suffix events use the branch
run ID. Reconstruction composes the referenced source prefix with that suffix
through a runtime adapter and fails closed if any version, configuration,
state, or information hash no longer agrees. No source event or source score
is rewritten.

## Current boundary

The first hosted vertical slice now provides:

- deployment-authenticated identity mapped to server-owned application roles;
- a D1 schema plus event, pack, and principal repositories;
- a server-authoritative, single-learner run through Stages 3 through 9;
- role-filtered evidence, atomic decision submission, a real signed
  authorization check, real custody and correction endorsements, accepted or
  rejected transaction history, deterministic tamper evidence, a scoped recall
  with trusted regulator handoff, competency evidence, exact replay, and
  instructor timeline/rubric APIs;
- exact-version assignments, assignment-bound run creation, append-only manual
  rating revisions, one-way feedback release, and a focused assignment report;
- request idempotency, optimistic run versions, same-origin mutation checks,
  immutable pack content hashes, and hidden-state filtering; and
- an optional server-managed initial-administrator allowlist for an empty D1
  deployment.

The hosted role workspaces, identified or pseudonymous JSON/CSV exports,
moderation, deterministic run modes, author lifecycle, and graphical
Guided/Challenge package jobs are now implemented. Application-user access and
role provisioning are available in the administrator workspace; course
management remains deployment administration. The pharmaceutical starter
now validates, previews, and runs through the bounded generic hosted runtime.
That runtime executes authored `BRIEFING`, `EVIDENCE_RELEASE`, `DECISION`,
`CONSEQUENCE`, `FEEDBACK`, and `COMPLETION` nodes, preserves deterministic
outcome and event replay, projects only role-visible evidence, and records
authored competency evidence. Business consequences appear in the run, while
authored feedback remains unavailable until the assignment's feedback release.
Other V1 node types remain unavailable for assignment until their runtime
behavior is implemented. SCORM continues to use the current compact
deterministic TC3 journal.

The hosted decision-counterfactual workflow is available for completed source
runs at authored decision points. It reconstructs the exact role-visible fork
projection, submits a real alternative command, reuses compatible downstream
commands, pauses instead of inventing a choice when the path diverges, and
compares the assessed source with the ungraded branch. Learners may create
branches only for their own Sandbox runs after the authored release boundary;
managing instructors and administrators remain assignment-scoped. Reflections
are stored as practice evidence and never modify the source run or official
grade. Assignment configuration selects a subset of the authored points,
applies a stricter bounded branch maximum where requested, and controls
instructor-only or Sandbox learner availability. Branch comparison JSON/CSV
and the managing instructor's assignment counterfactual report retain exact
source-version identity without exporting hidden actual state to learners.

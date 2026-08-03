# Hosted counterfactual replay V1

This contract covers hosted-only scenario eligibility, copy-on-write replay,
authenticated decision and authored-condition interventions, comparison, and
reflection. It does not add learner-created branches to SCORM or alter an
official grade.

## Repository decision

Counterfactual branches are specialized hosted runs rather than a separate
simulation aggregate. They use the same scenario pack, runtime service,
command validation, event reducers, state hashing, authorization checks, and
event store as the source run.

The repository already provides the reusable prerequisites used here:

- immutable published scenario-pack versions;
- server-authoritative append-only run events;
- exact event replay and sequence-bounded replay;
- separate actual, business, ledger, information, policy, workflow, and RNG
  state;
- role-filtered learner projections;
- stable authored decision and workflow-node identifiers;
- deterministic source seeds and persisted outcome resolution;
- instructor timeline and point-in-time replay; and
- Sandbox assignment mode.

Probabilistic outcomes use stable named draw keys derived from the exact
scenario version, source seed, stochastic model, named random stream,
occurrence key, and relevant entity. A branch reuses the same draw for the
same semantic event, while a branch-only occurrence receives its own
deterministic draw. Sequential RNG consumption is not a counterfactual
alignment mechanism.

## Storage

`counterfactual_runs` stores immutable branch metadata. The existing
`hosted_run_events` table remains authoritative for events:

```text
source run events 1..forkSequenceNumber
+
branch run events 1..N
```

The source prefix is referenced, never copied. Branch suffix sequence numbers
start at one because they belong to a separate run stream.

`counterfactual_reflections` stores at most one immutable, bounded reflection
per branch. Its five required responses are each limited to 1,000 characters.
The reflection is practice evidence and is not a simulation event, grade, or
competency-attainment update.

## Fidelity boundaries

Branch metadata fixes:

- source run, pack, scenario, and semantic versions;
- deterministic source seed;
- a SHA-256 hash of the resolved source run configuration;
- source state hash at the fork;
- role-visible information-state hash at the fork;
- trusted actor, organization, and role context;
- intervention and comparison mode; and
- creator and creation time.

Reconstruction replays the source prefix through the registered runtime
adapter, checks every boundary, rebinds the in-memory fork state to the branch
run, and then replays the branch suffix. A mismatch fails closed.

Every submitted source command now places its normalized replay intent on the
first event in its causation batch. The intent omits source command ID, source
run ID, and source expected version. Automatic replay supplies the same command
ID in the branch-local stream, targets the branch run, and uses the current
branch version. Missing replay intent is a current-contract failure; there is
no legacy fallback or migration reader.

## Authenticated API

The hosted worker exposes:

```text
GET  /api/v1/runs/{runId}/counterfactual-points
POST /api/v1/runs/{runId}/counterfactuals
GET  /api/v1/counterfactuals/{branchId}
POST /api/v1/counterfactuals/{branchId}/commands
POST /api/v1/counterfactuals/{branchId}/complete
GET  /api/v1/counterfactuals/{branchId}/comparison
POST /api/v1/counterfactuals/{branchId}/reflection
GET  /api/v1/counterfactuals/{branchId}/export.json
GET  /api/v1/counterfactuals/{branchId}/export.csv
GET  /api/v1/assignments/{assignmentId}/counterfactual-report
```

All routes resolve the exact source assignment, package, scenario, source run,
and authenticated principal. A learner can create a branch only from their own
completed Sandbox run. The scenario-authored availability boundary and creator
role must permit the request. An instructor must manage the source assignment;
an administrator remains assignment-scoped through the source run.

The server, not the client, supplies creator identity and creation time. For a
decision counterfactual, the first branch command must use the recorded
intervention ID, match the authored decision, select only authored
alternatives, and differ from the original choice. For a condition
counterfactual, the server accepts only an authored condition and value,
reconstructs the alternative trusted runtime condition at the fork, and
resubmits the original decision itself. The client cannot edit arbitrary
actual state or replace the original decision in a condition comparison.

## Assignment controls

`HostedAssignmentV1` stores one resolved counterfactual configuration. There
are no runtime defaults or older assignment readers. An instructor selects:

- whether counterfactual replay is enabled;
- the exact authored decision-node IDs that remain eligible;
- a maximum of 1 through 20 branches per creator and decision;
- instructor-only access or learner access after completion or feedback
  release; and
- whether the authored reflection is required.

Learner-created branches remain limited to Sandbox assignments. The effective
branch limit is the lower of the scenario-authored and assignment-authored
limits. Assignment creation rejects unknown decision nodes, conflicting mode
and learner-access settings, duplicate IDs, empty enabled selections, and
unbounded limits.

## Downstream replay

After the intervention, the runtime tries each normalized source command in
the original order:

1. Retarget it to the branch and current branch version.
2. Submit it through the ordinary hosted command service.
3. Preserve the source command ID for deterministic proposal identities.
4. Stop when the branch completes.
5. Pause on a workflow-precondition failure.

A pause is an exploratory branch, not an error and not an invitation to invent
a default. The learner or instructor submits the required later action through
the ordinary action form. Every manually changed downstream command makes the
comparison compound. If every downstream action remains valid, the comparison
is classified as a single intervention.

## Comparison

The comparison response contains:

- original assessed and alternative exploratory decisions;
- a decision or condition intervention type and the exact authored condition
  change where applicable;
- the exact role-visible information state at the fork;
- record identifiers revealed only after the fork;
- original and branch event timelines;
- changed role-visible business records;
- ledger and workflow-position differences;
- single-intervention or exploratory-branch classification; and
- an explicit guarantee that the source grade, completion, ratings, and
  competency evidence were not changed.

The six authored comparison dimensions resolve through explicit runtime metric
IDs. Academic score reuses the existing SimuLedger scoring engine. Process
quality, safety, cost, compliance, and evidence quality are deterministic
non-grade diagnostics. Each changed value carries an authored causal
classification; a compound branch is marked as involving later decisions
rather than attributing every result to the first intervention.

## Interface

The completed-run learner workspace and released-feedback instructor review
offer the same explorer. It:

- lists only eligible historical decisions and authored condition changes;
- shows the evidence and policies visible at the fork;
- prevents submission until at least one original choice changes;
- submits the alternative through the real runtime;
- keeps the source decision unchanged for a condition comparison;
- continues a divergent branch with the existing hosted action controls;
- presents assessed and exploratory paths distinctly;
- stacks comparison panels on mobile and uses synchronized columns at wider
  viewports;
- keeps long state and event values inside bounded, wrapping disclosures; and
- captures the five authored reflection prompts after branch completion.

The hindsight notice states that the interface reconstructs the historical
information boundary but cannot remove knowledge remembered from later in the
completed attempt.

## Reporting and exports

Each comparison has authenticated JSON and normalized CSV downloads. Both
contain exact branch metadata, source version and hashes, original and
alternative role-filtered projections, timelines, comparison dimensions, and
the optional bounded reflection. They never export hidden actual or RNG state
to a learner.

The assignment counterfactual report lists every branch for its source learner
run, its created, in-progress, or completed state, its comparison when one can
be produced, and its reflection. It also summarizes branch counts, decision
versus condition exploration, isolated versus compound comparisons,
frequently explored fork nodes, and average academic/process deltas. These are
descriptive exploration analytics, not competency inferences. Only the
managing instructor or an administrator may request the report. Every record
states that the original official grade was not changed. See
`docs/COUNTERFACTUAL_EXPORT_V1.md`.

## Source immutability

Creating, running, comparing, and reflecting on a branch never appends an event
to the source stream. The branch has no route that updates the source score,
completion status, competency evidence, rating, moderation resolution, or LMS
grade. The alternative is always labelled exploratory and ungraded.

## Current boundary

The coffee pack authors three eligible points:

1. Certificate decision
2. Quantity-discrepancy decision
3. Recall-scope decision

It also authors one bounded condition comparison at the certificate fork:
recognized authorized certifier versus recognized but unauthorized logistics
signer. The same original certificate decision is replayed under the selected
condition, and the comparison states that visible evidence changed.

The current release deliberately does not implement arbitrary condition
editing, comparison across scenario versions, AI-generated alternatives,
official-grade replacement, or persistent SCORM branches. The one condition
adapter is specific to the coffee runtime; another runtime must explicitly
implement and validate its own authored condition keys before enabling them.

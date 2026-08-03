# SimuLedger Instructor-Ready Configurable Platform Refactor and Implementation Plan

## Active pre-release upgrade policy

SimuLedger has no student or production data to preserve. Upgrade every active
contract directly, reset development data and generated packages, and maintain
one current implementation. Do not add backfills, compatibility adapters, dual
formats, or old-version readers.

## 1. Instructions to the coding agent

Refactor the existing SimuLedger application into a configurable, domain-agnostic platform for blockchain-enabled business simulations. Preserve the current working functionality and existing technology stack wherever reasonable. Do not perform a full rewrite unless the repository audit shows that incremental refactoring is impractical.

Before writing production code:

1. Inspect the repository, database, deployment configuration, and current scenario flow.
2. Produce a brief current-state architecture map and identify reusable modules, hard-coded scenario logic, and direct-upgrade risks.
3. Establish or repair the automated test baseline.
4. Propose any deviations from this plan before implementing them.
5. Implement the work in small, reviewable phases while keeping one current implementation.

The core application must not hard-code a particular academic major, institution, scenario, role, asset type, or competency set. New scenario packs should be addable mainly through validated configuration rather than application-code changes.

### Selected product boundary

The approved endpoint is **Stopping Point B: Instructor-ready configurable platform**.

This plan therefore includes a hosted instructor-facing platform with authenticated application roles, scenario and assignment management, single-learner server-backed runs, evidence and decision capture, replay, rubric scoring, competency reporting, exports, deterministic run modes, scenario-pack authoring and validation, and graphical SCORM package generation.

The platform must continue to support portable Guided, Challenge, Assessment, and Technical Laboratory SCORM packages generated from the same versioned scenario and configuration system.

This plan does **not** include collaborative multi-learner runs in which different learners simultaneously control different organizations. Learner-to-learner endorsement, shared team state, real-time communication, concurrent role play, and contribution analytics are deferred as a separate future product initiative.

The coding agent must treat this document as the single canonical roadmap. Do not implement the deferred collaborative product unless the product owner approves a new plan.

### Deployment model

The target is a hosted web platform, not a desktop application.

Use the existing application stack where reasonable. Unless the repository audit demonstrates a stronger fit with an existing backend stack, prefer:

- TypeScript throughout the shared application and domain layers;
- a hosted web frontend for learner, instructor, author, rater, and administrator interfaces;
- a server API for authentication, authorization, scenario publication, assignments, authoritative run processing, replay, ratings, reporting, exports, and package-generation jobs;
- PostgreSQL with JSON or JSONB support for versioned definitions, events, and queryable metadata;
- object storage for uploaded evidence and media;
- the existing Node-based SCORM generator as the authoritative packaging engine, invoked by both the CLI and the hosted graphical builder;
- institutional OIDC or another managed authentication provider where available, rather than implementing password security from scratch.

The first deployment may target one institution or one managed installation. Multi-tenant SaaS administration is not required.

### Dual delivery model

The platform supports two delivery channels:

1. **Hosted runs:** learners complete individually assigned simulations in the hosted platform. The server stores authoritative events and enables rich instructor replay, rubric scoring, competency evidence, and class reporting.
2. **SCORM export:** instructors generate portable SCORM packages for Moodle or another LMS. SCORM delivery retains the compact package-specific tracking model and cannot be assumed to provide the full hosted analytics experience.

The graphical package builder belongs inside the instructor portal and must call the same validated configuration, scenario, manifest, metadata, and packaging logic as the existing CLI. Do not create a second package-generation implementation.

---

## 2. Product objective

SimuLedger should become a configurable simulation platform in which learners:

- participate in multi-organization business processes;
- inspect blockchain and non-blockchain evidence;
- interpret transactions, assets, identities, endorsements, and policies;
- make consequential professional decisions;
- explain and justify those decisions;
- receive structured feedback; and
- generate auditable evidence of blockchain and professional/business competencies.

The platform must support multiple disciplinary scenario packs, such as supply chain, finance, accounting and audit, information systems, healthcare, logistics, public administration, and law, without changing the core simulation engine.

---

## 3. Design principles

### 3.1 Configuration over hard-coded behavior

Roles, organizations, assets, evidence, policies, decisions, branches, outcomes, feedback, and competency targets must be defined in versioned scenario configuration wherever possible.

### 3.2 Separation of three states

Every run must distinguish:

1. **Actual state** — what is objectively true in the simulated world.
2. **Ledger state** — what has been recorded in the simulated blockchain.
3. **Information state** — what a particular learner or role is allowed to see at a particular time.

Hidden actual state must never be sent to the learner client before it is legitimately revealed.

### 3.3 Reproducible simulation

All probabilistic events must use a deterministic pseudo-random number generator with a stored seed. The same scenario version, initial state, seed, and sequence of learner actions must reproduce the same results.

### 3.4 Process and outcome are separate

The quality of a learner's decision must be scored using the evidence available when the decision was made. A favorable random outcome must not convert a poor decision into a good one, and an unfavorable random outcome must not penalize a defensible decision.

### 3.5 Evidence traceability

Every competency judgment or score must link back to observable evidence, such as event-log entries, evidence views, decisions, cited documents, explanations, or communication records.

### 3.6 Version everything that affects interpretation

At minimum, version:

- competency frameworks;
- performance indicators;
- scenario definitions;
- policies and rule sets;
- rubric definitions;
- feedback definitions;
- scenario-pack manifests; and
- export schemas.

Published versions must be immutable. Revisions create new versions.

### 3.7 Core engine and scenario packs are separate

The core engine provides generic simulation, blockchain, evidence, decision, assessment, logging, and reporting capabilities. Scenario packs provide disciplinary content and configuration.

---

## 4. User roles and permissions

Implement role-based access control for the following application-level roles.

### Learner

- start or join assigned runs;
- view only information permitted by the simulation role;
- inspect evidence and ledger records;
- make decisions and submit explanations;
- view feedback and results when allowed by the run mode.

### Instructor or facilitator

- create assignments;
- select scenario versions and run modes;
- assign individual learners to simulation roles;
- monitor progress;
- view run timelines and replays;
- score manual rubric criteria;
- release feedback;
- view competency reports and export data.

### Scenario author

- create, import, validate, duplicate, test, version, publish, and retire scenario packs and scenarios;
- define competency targets, policies, evidence, decision nodes, consequences, and feedback;
- preview scenarios as different roles.

### Administrator

- manage users, permissions, global settings, competency frameworks, data-retention settings, and system-level audit logs.

### Optional rater role

- view anonymized assigned responses;
- score selected rubric criteria;
- remain blind to other raters' scores until submission, when configured.

---

## 5. Internal competency framework

Create a configurable competency layer. Seed the system with the following default framework, but store it as data rather than hard-coded constants.

### 5.1 Blockchain competencies

| Code | Competency |
|---|---|
| BC1 | Explain the role and structure of a shared or permissioned ledger in a multi-organization process. |
| BC2 | Interpret transactions, asset states, provenance records, and transaction histories. |
| BC3 | Evaluate identity, authorization, digital signatures, and endorsement evidence. |
| BC4 | Interpret smart-contract rules, transaction validation, and governance policies. |
| BC5 | Use blockchain records to support traceability, auditability, and accountability. |
| BC6 | Distinguish record integrity from data accuracy, completeness, and factual truth. |
| BC7 | Evaluate privacy, confidentiality, access control, cybersecurity, and data-governance implications. |
| BC8 | Assess the suitability, value, risks, and limitations of blockchain for a professional process. |

### 5.2 Professional and business competencies

| Code | Competency |
|---|---|
| PC1 | Define and frame a professional or organizational problem. |
| PC2 | Locate, select, compare, and evaluate evidence from multiple sources. |
| PC3 | Identify operational, financial, fraud, compliance, data, and stakeholder risks. |
| PC4 | Apply policies, regulations, controls, and organizational rules. |
| PC5 | Make defensible decisions under uncertainty and competing objectives. |
| PC6 | Recommend proportionate corrective, preventive, or risk-mitigation actions. |
| PC7 | Communicate and justify decisions using evidence. |
| PC8 | Exercise ethical, responsible, and sustainable professional judgment. |
| PC9 | Collaborate, negotiate, escalate, and coordinate across organizational boundaries. |
| PC10 | Reflect on outcomes, recognize limitations, and revise professional judgment. |

### 5.3 Performance indicators

Each competency must contain one or more observable performance indicators. Indicators must be individually versioned and addressable by code.

Example:

```text
BC6 — Distinguish integrity from truth

BC6.PI1 Recognizes that a valid signature establishes attribution, not factual accuracy.
BC6.PI2 Compares an immutable record with relevant off-chain evidence.
BC6.PI3 Identifies possible false, incomplete, or biased initial input.
BC6.PI4 Explains the limitation of relying exclusively on ledger integrity.
```

A scenario decision may target multiple indicators. Every target must be marked as primary, supporting, or contextual.

### 5.4 Optional domain competencies

Scenario packs may define additional domain-specific competencies using namespaced codes, for example:

```text
FIN.CR1   Credit-risk assessment
AUD.AE1   Audit-evidence evaluation
SCM.QA1   Supply-chain quality assurance
HLT.PR1   Pharmaceutical provenance
```

The core engine must not assume any particular domain competency.

---

## 6. Scenario-pack architecture

### 6.1 Pack contents

A versioned scenario pack should contain:

- pack manifest;
- supported languages;
- glossary;
- organizations and simulation roles;
- asset and transaction types;
- evidence-item types;
- policy and governance definitions;
- one or more scenario definitions;
- competency and performance-indicator references;
- rubric definitions;
- feedback content;
- optional media assets; and
- optional custom visual components declared through an approved extension interface.

### 6.2 Scenario authoring strategy

For the first implementation, use a validated JSON or YAML scenario format plus an import and validation interface. Do not block the platform refactor on building a complete visual scenario editor.

Add a visual editor in a later phase after the schema and engine stabilize.

### 6.3 Scenario lifecycle

Support these statuses:

```text
draft -> validated -> published -> retired
```

Rules:

- Draft scenarios may be edited.
- Published scenario versions are immutable.
- Editing a published scenario creates a new version.
- Existing runs remain linked to their original version.
- Retired scenarios remain available for historical replay but cannot be newly assigned by default.

---

## 7. Scenario-definition model

Use a formally validated schema. The exact syntax may follow the existing stack, but the model must support the following concepts.

```json
{
  "schemaVersion": "1.0.0",
  "scenario": {
    "id": "coffee-shipment-discrepancy",
    "version": 1,
    "packId": "coffee-supply-chain",
    "title": "Conflicting Quality Evidence",
    "status": "draft",
    "supportedModes": ["tutorial", "standard", "sandbox", "configured"],
    "competencyTargets": [
      {
        "competencyId": "BC6",
        "indicatorIds": ["BC6.PI1", "BC6.PI2", "BC6.PI3"],
        "targetType": "primary"
      },
      {
        "competencyId": "PC5",
        "indicatorIds": ["PC5.PI1", "PC5.PI2"],
        "targetType": "primary"
      }
    ],
    "organizations": [],
    "roles": [],
    "assetTypes": [],
    "initialState": {
      "actualState": {},
      "businessState": {},
      "ledgerState": {},
      "visibilityState": {}
    },
    "policies": [],
    "evidenceItems": [],
    "nodes": [],
    "stochasticEvents": [],
    "rubrics": [],
    "feedbackRules": []
  }
}
```

### 7.1 Required node types

Support at least:

- narrative or briefing node;
- evidence-release node;
- decision node;
- transaction-proposal node;
- endorsement node;
- policy-check node;
- communication node for simulated stakeholder messages or evidence requests;
- stochastic-event node;
- consequence node;
- feedback node;
- reflection node; and
- completion node.

### 7.2 Conditions and effects

Each action or branch may contain:

- preconditions;
- role and authorization requirements;
- required evidence or policy checks;
- state mutations;
- ledger events;
- information releases;
- competency-evidence events;
- scoring evidence; and
- transition to the next node.

Use a safe declarative rule format. Do not execute arbitrary scenario-supplied code.

---

## 8. Simulation state model

Maintain a server-side run state with at least these partitions:

```text
RunState
├── actualState       Hidden truth and latent conditions
├── businessState     Operational, financial, and organizational variables
├── ledgerState       Assets, transactions, signatures, endorsements, validity, and history
├── informationState  Evidence visibility by participant, role, and time
├── policyState       Active rules, thresholds, permissions, and exceptions
├── workflowState     Current node, completed nodes, pending actions, and deadlines
└── rngState          Seed, stream position, and recorded draws
```

The learner-facing API must return a role-filtered projection, not the complete run state.

Use optimistic concurrency or equivalent protection to prevent conflicting state transitions. All commands must support idempotency keys.

---

## 9. Simulated enterprise-blockchain engine

Implement enterprise-blockchain semantics at the application level. A real distributed blockchain network is not required for the first release.

The engine must support:

- organizations and identities;
- role-based permissions;
- assets and asset state;
- transaction proposals;
- real cryptographic digital signatures and signature verification using educational identities;
- authorization checks that remain separate from signature validity;
- cryptographically verified endorsement requests and results;
- endorsement policies;
- transaction ordering sequence;
- validation rules;
- valid and invalid transaction status;
- ledger commitment;
- asset-version history;
- transaction provenance;
- privacy and visibility rules; and
- an append-only audit trail.

Provide an abstraction interface so a real Hyperledger Fabric or other ledger adapter could be added later without replacing the scenario engine.

### 9.1 Transaction explanation view

For each transaction, allow the learner to inspect:

- proposer;
- organization and role;
- signing identity;
- endorsements requested and received;
- applicable endorsement policy;
- policy result;
- validation result;
- commit time and sequence;
- asset-state change;
- visibility restrictions; and
- relevant warnings or limitations.

### 9.2 Transaction lifecycle visualization

Display a comprehensible lifecycle:

```text
Proposal -> Endorsement -> Ordering -> Validation -> Commitment -> Asset-state update
```

Do not imply that valid signatures, successful consensus, or immutability prove that the underlying content is true.


### 9.3 Cryptographic authenticity boundary

The following mechanisms should be genuinely computed when enabled:

- canonical proposal serialization;
- SHA-256 proposal digests;
- digital signing;
- signature verification;
- public-key fingerprint calculation;
- authorization evaluation; and
- endorsement-policy evaluation over signatures on the same proposal digest.

The following remain educational simulations unless a later product phase explicitly replaces them:

- organizational certificate issuance and trust anchors;
- private-key custody;
- network communication;
- ordering service;
- distributed consensus; and
- production identity management.

The interface and documentation must distinguish these categories clearly. A valid signature proves attribution to an educational key and integrity of the signed content. It does not prove authorization, policy satisfaction, factual truth, or absence of collusion.

---

## 10. Policy and governance engine

Create a configurable policy layer covering:

- role authorization;
- separation of duties;
- approval thresholds;
- required documents;
- required endorsements;
- smart-contract conditions;
- privacy and access rules;
- escalation requirements;
- exception and override permissions;
- compliance rules; and
- consequence rules.

Requirements:

1. Policies are versioned.
2. Policy evaluation returns a structured result and human-readable explanation.
3. Scenario authors can specify whether learners may inspect a policy.
4. The event log records which policy the learner viewed or cited.
5. Invalid actions may be blocked, allowed with a warning, or allowed and penalized, depending on scenario configuration.

---

## 11. Evidence workspace

Create a learner evidence workspace that can contain:

- blockchain transactions and asset history;
- identity and authorization records;
- signatures and endorsements;
- policy documents;
- smart-contract results;
- invoices and payment documents;
- certificates and laboratory reports;
- sensor and Internet-of-Things data;
- shipping and logistics documents;
- insurance records;
- emails and stakeholder statements;
- regulations and organizational procedures;
- dashboards, charts, or calculations; and
- off-chain external records.

Each evidence item should support metadata such as:

```text
source
owner
creation time
availability time
signature status
ledger status
completeness
reliability classification
access permission
cost or time required to obtain
related assets and transactions
```

Scenario authors must be able to create evidence that is accurate, inaccurate, incomplete, conflicting, irrelevant, authentic but misleading, forged, delayed, or role-restricted.

The application must log which evidence was opened, in what order, for how long, and whether it was cited in the final decision.

---

## 12. Professional decision console

Every consequential decision node should support a configurable structured response.

Possible actions include:

- approve;
- reject;
- suspend;
- investigate;
- request additional information;
- request another endorsement;
- escalate;
- report suspected misconduct;
- initiate a recall;
- release or withhold payment;
- recommend mitigation;
- authorize an exception; and
- propose an alternative action.

Configurable response fields should include:

- selected action;
- written rationale;
- cited evidence items;
- cited policies or rules;
- confidence rating;
- perceived probability of an adverse event;
- estimated operational or financial impact;
- recommendation to another stakeholder; and
- optional reflection.

The scenario author controls which fields are required.

Record drafts and revisions where permitted, but distinguish drafts from final submissions.

---

## 13. Run modes

Support at least four modes.

### Tutorial mode

- fixed or controlled scenarios;
- hints and scaffolding;
- immediate or staged feedback;
- retry and revision options;
- worked explanations;
- optional guided tour of blockchain concepts.

### Standard mode

- fixed scenario version;
- standardized information and timing;
- limited or no hints;
- delayed feedback;
- configurable backtracking and revision;
- suitable for formal performance tasks.

### Sandbox mode

- broad branching;
- replay and experimentation;
- optional probabilistic outcomes;
- low-stakes or no formal scoring;
- comparison of alternative decisions.

### Configured mode

- explicit seed and condition settings;
- fixed or probabilistic outcomes;
- configurable feedback timing;
- exact reproducibility;
- useful for standardized cohorts or controlled comparisons.

Represent mode behavior as configuration, including:

```text
allowHints
allowRetry
allowBacktracking
feedbackTiming
showScores
outcomeStrategy
seedPolicy
timeLimit
allowCommunication
allowEvidenceRequests
```

---

## 14. Controlled stochastic-outcome engine

Create a deterministic probability engine with:

- named random streams;
- seed creation or supplied seed;
- supported distributions, initially Bernoulli and weighted categorical;
- conditional probabilities;
- recorded probability parameters;
- recorded random draw;
- recorded realized outcome; and
- replay support.

Example:

```json
{
  "id": "contamination-outcome",
  "distribution": "bernoulli",
  "probability": 0.2,
  "stream": "quality-events",
  "onTrue": "contamination-confirmed",
  "onFalse": "shipment-safe"
}
```

Store the probability model and draw separately from the learner's score.

For standard mode, allow the scenario author to force an outcome rather than draw randomly.

---

## 15. Event logging and telemetry

Use an append-only event log as the authoritative record of each run. State snapshots may be added for performance, but must be reproducible from events.

Each event must include:

```text
eventId
runId
sequenceNumber
serverTimestamp
optionalClientTimestamp
actorId or pseudonymous participant ID
simulationRoleId
organizationId
eventType
scenarioId and scenarioVersion
payload
causationId
correlationId
previousStateHash
resultingStateHash
```

### 15.1 Minimum event types

- RunCreated
- ParticipantJoined
- RoleAssigned
- StageEntered
- EvidenceAvailable
- EvidenceOpened
- EvidenceClosed
- PolicyOpened
- LedgerRecordViewed
- InformationRequested
- InformationReleased
- TransactionProposed
- SignatureApplied
- EndorsementRequested
- EndorsementGranted
- EndorsementRejected
- TransactionValidated
- TransactionCommitted
- DecisionDraftSaved
- DecisionSubmitted
- EvidenceCited
- PolicyCited
- ConfidenceRecorded
- RiskEstimateRecorded
- MessageSent
- RandomDrawMade
- OutcomeRealized
- FeedbackReleased
- FeedbackViewed
- ReflectionSubmitted
- RubricRated
- RunCompleted

Client interaction data may be buffered, but authoritative decision and state-transition events must be committed server-side.

---

## 16. Replay engine

Provide a run replay that can reconstruct:

- the role-filtered screen at each point;
- evidence available at the time;
- evidence inspected;
- policies consulted;
- decisions and revisions;
- transaction lifecycle;
- random draws and outcomes;
- feedback released; and
- competency evidence generated.

Acceptance requirement:

```text
same scenario version + same initial state + same seed + same ordered commands = same final state and outcomes
```

Replay must never use current scenario content in place of the original version used by the run.

---

## 17. Rubric and assessment engine

Support analytic rubrics with configurable levels. Seed a default five-level scale:

```text
0 Not demonstrated
1 Emerging
2 Developing
3 Proficient
4 Advanced
```

Allow packs to provide alternative labels while preserving the numeric representation.

### 17.1 Suggested rubric dimensions

- problem identification;
- evidence relevance;
- source and evidence reliability;
- blockchain interpretation;
- risk analysis;
- policy and control application;
- decision appropriateness;
- proportionality of response;
- recognition of uncertainty and limitations;
- ethical and responsible judgment;
- communication and justification; and
- collaboration or escalation.

### 17.2 Automated evidence rules

Support declarative rules that can create indicator evidence from events, for example:

- required evidence was inspected;
- a conflicting record was identified;
- an endorsement was verified;
- an unauthorized action was rejected;
- the correct affected assets were traced;
- a mandatory escalation occurred;
- a decision was submitted without required support.

Automated results must retain links to the source events and rule version.

### 17.3 Manual ratings

Allow instructors or raters to score:

- written rationale;
- quality of recommendations;
- recognition of assumptions;
- ethical reasoning;
- communication quality; and
- other complex evidence.

Store rater, rubric version, criterion, score, comment, timestamp, and linked evidence.

### 17.4 Separate result types

Store and report separately:

1. raw observable evidence;
2. rubric or indicator judgment;
3. decision-process score;
4. realized business outcome; and
5. optional overall scenario score.

Do not require an overall score. If one is configured, the formula must be transparent and versioned.

---

## 18. Competency evidence and reporting

For each learner, show:

- competency and indicator;
- scenarios in which evidence was observed;
- evidence count and recency;
- rubric ratings;
- direct links to supporting events and responses;
- current performance level;
- assessor comments; and
- unresolved or contradictory evidence.

Do not infer stable competence from a single decision by default. Support configurable evidence rules such as:

```text
minimum number of observations
minimum number of distinct scenarios
minimum number of scenario families
required performance level
critical-error override
recency rule
```

### Instructor reports

Provide:

- learner competency profile;
- class competency distribution;
- scenario and decision-item performance;
- evidence-usage patterns;
- common errors;
- completion and timing data;
- process-score versus realized-outcome comparison; and
- downloadable evidence records.

---

## 19. Instructor and author interfaces

### 19.1 Scenario library

- filter by pack, domain, status, mode, version, competency, and language;
- preview scenario metadata;
- duplicate a draft;
- compare versions;
- publish or retire according to permission.

### 19.2 Assignment creation

- choose scenario version;
- choose mode;
- set dates and time limits;
- configure individual learner participation;
- assign simulation roles;
- set seed strategy and outcome strategy;
- configure feedback release;
- configure scoring and required response fields.

### 19.3 Live monitor

- learner status;
- current stage;
- time elapsed;
- pending actions;
- technical errors;
- do not reveal hidden outcomes unless the instructor has explicit permission.

### 19.4 Review and scoring

- timeline and replay;
- learner response beside evidence available at the decision time;
- rubric panel;
- links to cited and overlooked evidence;
- blind-rater workflow where configured;
- moderation and score-resolution workflow.

### 19.5 Import and validation

For the first version, allow authors to upload a scenario-pack archive or JSON/YAML file. Return:

- schema errors;
- missing references;
- unreachable nodes;
- invalid transitions;
- permission or visibility conflicts;
- invalid competency references;
- missing rubric criteria;
- non-deterministic configuration warnings; and
- potential exposure of hidden state.

---

## 20. Deferred collaborative multi-user product

Collaborative multi-learner simulation is outside the selected product boundary.

Do not implement in this plan:

- multiple learners controlling different organizations in one shared run;
- learner-to-learner transaction proposals or endorsements;
- shared team decisions;
- real-time learner communication;
- concurrent organization queues;
- reconnection and conflict handling for collaborative sessions;
- individual contribution analytics inside a team result.

The current command, event, identity, authorization, endorsement, and state-version architecture must remain reusable by a future collaborative service, but no collaborative UI or orchestration should be added now.

A later collaborative initiative requires a separate approved plan covering shared-session authority, concurrency, communication, role assignment, moderation, and team-versus-individual assessment.

---

## 21. Optional introductory blockchain activity

Add an optional short “Become the Blockchain” tutorial pack in which learners:

- create a transaction;
- sign it;
- add it to a simplified block;
- link it to a previous block;
- distribute ledger copies;
- alter one historical record; and
- observe the inconsistency.

Keep this separate from the main professional decision scenarios.

---

## 22. Core user-interface screens

### Learner screens

1. Dashboard and assigned runs
2. Run lobby and simulation-role briefing
3. Scenario workspace with:
   - case brief;
   - current tasks;
   - evidence library;
   - blockchain ledger and transaction view;
   - policies and rules;
   - simulated communication and evidence-request panel where enabled;
   - structured decision console;
   - progress and time information;
4. Outcome and consequence view
5. Feedback and debrief
6. Competency evidence profile where enabled

### Instructor screens

1. Scenario and pack library
2. Assignment configuration
3. Live run monitor
4. Run timeline and replay
5. Rubric scoring and moderation
6. Learner and class competency reports
7. Export center

### Author screens

1. Pack import and validation
2. Draft scenario metadata editor
3. Scenario preview by role and mode
4. Version comparison and publishing
5. Later: visual workflow and evidence editor

---

## 23. Recommended persistence model

Use the existing persistence stack if suitable. A relational database with JSON support is recommended.

Core entities:

```text
users
application_roles
organizations
simulation_roles
competency_frameworks
competencies
performance_indicators
scenario_packs
scenario_pack_versions
scenarios
scenario_versions
scenario_indicator_mappings
policy_definitions
rubric_definitions
rubric_criteria
assignments
runs
run_participants
run_events
run_snapshots
decisions
decision_evidence_links
manual_ratings
competency_evidence
competency_results
feedback_releases
exports
audit_logs
```

Recommended storage approach:

- relational columns for IDs, versions, status, ownership, and query-critical metadata;
- JSON or JSONB for versioned scenario definitions and event payloads;
- object storage for uploaded evidence files and media;
- append-only protection for run events and published content.

---

## 24. Logical API surface

Adapt names to the existing stack, but preserve the capability boundaries.

### Competencies

```text
GET    /api/competency-frameworks
GET    /api/competencies
GET    /api/performance-indicators
POST   /api/competency-frameworks          admin only
POST   /api/competencies                   admin only
```

### Packs and scenarios

```text
POST   /api/scenario-packs/import
GET    /api/scenario-packs
GET    /api/scenarios
GET    /api/scenarios/{id}/versions/{version}
POST   /api/scenarios/{id}/validate
POST   /api/scenarios/{id}/publish
POST   /api/scenarios/{id}/retire
```

### Assignments and runs

```text
POST   /api/assignments
GET    /api/assignments/{id}
POST   /api/assignments/{id}/start-run
POST   /api/runs/{id}/join
GET    /api/runs/{id}/view
POST   /api/runs/{id}/commands
GET    /api/runs/{id}/timeline
GET    /api/runs/{id}/replay
POST   /api/runs/{id}/complete
```

Use a command endpoint or typed command endpoints for actions. Every mutating command must accept an idempotency key and expected state version.

### Ratings and reports

```text
POST   /api/ratings
GET    /api/runs/{id}/competency-evidence
GET    /api/learners/{id}/competency-profile
GET    /api/assignments/{id}/reports
POST   /api/exports
GET    /api/exports/{id}
```

---

## 25. Data export

Support CSV and JSON exports with stable, documented schemas.

Provide separate export sets for:

- participants and roles;
- assignments and run configuration;
- scenario and framework versions;
- event timeline;
- evidence interactions;
- decisions and explanations;
- confidence and risk estimates;
- ledger transactions;
- random draws and realized outcomes;
- rubric ratings;
- competency evidence and results; and
- feedback and reflection.

Include a generated data dictionary with each export version.

---

## 26. Security, privacy, and integrity

Requirements:

- role-based access control;
- server-side enforcement of scenario visibility;
- hidden actual state never embedded in client bundles or API responses;
- encrypted transport;
- secure file access for evidence attachments;
- pseudonymous learner identifiers in exports where configured;
- audit logging for administrative and scoring actions;
- configurable retention and deletion;
- separation of application secrets from scenario configuration;
- validation and sanitization of imported pack content;
- no arbitrary script execution from scenario files;
- protection against tampering with published scenarios, run events, and ratings.

All authoritative timestamps should be stored in UTC.

---

## 27. Accessibility, localization, and usability

Design for:

- keyboard navigation;
- screen-reader labels;
- sufficient contrast;
- clear status and error messages;
- accessible tables and timelines;
- alternatives to color-only indicators;
- configurable time limits and accommodations;
- localization of interface and scenario content; and
- at least English and Vietnamese language support if compatible with the current application plan.

Do not store learner-visible text directly in core business logic.

---

## 28. Testing requirements

### Unit tests

- scenario-schema validation;
- state transitions;
- policy evaluation;
- endorsement rules;
- visibility projection;
- deterministic random draws;
- automated evidence rules;
- rubric calculations;
- version and immutability rules.

### Integration tests

- pack import and publication;
- run creation and completion;
- evidence visibility by role;
- transaction lifecycle;
- event persistence and snapshots;
- replay reconstruction;
- manual rating workflow;
- export generation;
- authorization boundaries.

### End-to-end tests

- learner completes a tutorial scenario;
- learner completes a standard scenario;
- same seed and actions reproduce the same outcome;
- hidden truth is not exposed;
- instructor reviews and scores a response;
- competency evidence links to the correct events;
- a published scenario version remains unchanged after a new version is created;
- the current SimuLedger scenario remains playable through its native runtime profile.

### Scenario validation tests

Create a test runner that can simulate all declared branches and flag:

- unreachable nodes;
- dead ends;
- invalid state references;
- contradictory permissions;
- missing evidence references;
- impossible policy requirements;
- missing completion paths; and
- non-reproducible stochastic configuration.

---

## 29. Direct upgrade of the current SimuLedger application

1. Inventory the current stages, roles, assets, decisions, ledger functions, scoring, and stored data.
2. Define the current scenario pack representing the coffee simulation.
3. Convert hard-coded stages into versioned scenario nodes.
4. Replace development records with the current asset, transaction, and event structures.
5. Keep identifiers only when the current source contracts require them.
6. Add regression tests that preserve the intended learner flow and outcomes.
7. Switch to the upgraded engine directly after its acceptance tests pass.
8. Remove superseded hard-coded logic in the same delivery.

Do not create a second parallel implementation or retain a compatibility path
for superseded business logic.

---

## 30. Recommended implementation phases

### Phase 0 — Repository audit and foundation

Deliverables:

- current-state architecture document;
- dependency and database map;
- direct-upgrade risks;
- automated test baseline;
- architectural decision records;
- agreed implementation sequence.

### Phase 1 — Core schemas and versioning

Implement:

- competency framework and indicators;
- scenario-pack and scenario schemas;
- pack import and validation;
- versioning and immutable publication;
- basic user roles and permissions;
- native runtime profile for the current coffee scenario.

Exit criteria:

- a valid scenario pack can be imported;
- an invalid pack returns actionable errors;
- a published version cannot be edited;
- the current scenario exists as a draft pack.

### Phase 2 — Run engine and event store

Implement:

- run creation;
- three-state model;
- role-filtered view projection;
- append-only event log;
- command handling and idempotency;
- workflow nodes and transitions;
- state snapshots.

Exit criteria:

- one learner can complete a fixed scenario;
- all actions are event logged;
- hidden state remains server-side;
- state can be reconstructed from events.

### Phase 3 — Evidence, decisions, and blockchain semantics

Implement:

- evidence workspace;
- evidence visibility and metadata;
- professional decision console;
- transaction lifecycle;
- educational identities with real digital signatures and verification;
- authorization, cryptographically verified endorsements, validation, and history;
- policy engine;
- transaction explanation view.

Exit criteria:

- a scenario can present conflicting ledger and off-chain evidence;
- the learner can cite evidence and policy in a decision;
- the system records the complete decision context.

### Selected continuation after real signatures and endorsement policies

Real digital signatures, authorization, and endorsement policies complete the cryptographic trust and multi-organization approval portion of Phase 3. The selected endpoint is the instructor-ready configurable platform.

Continue with all of the following:

1. Phase 4 assessment, competency evidence, reporting, replay, and exports.
2. Instructor assignment creation, review, rubric scoring, feedback release, moderation, and class reporting.
3. A hosted graphical SCORM package builder backed by the existing package-generation engine.
4. Phase 5 run modes and deterministic stochastic outcomes.
5. Phase 6 scenario-pack authoring, validation, versioning, publication, preview, localization workflow, and additional disciplinary packs.
6. A visual scenario editor only after the declarative schema, importer, validator, and branch-testing tools are stable.
7. Guided, Challenge, Assessment, and Technical Laboratory package delivery from the same platform definitions.

The platform is complete at the end of Phase 6 when instructors can configure, assign, monitor, replay, score, report, export, author, validate, publish, and package single-learner simulations.

Collaborative multi-learner runs remain deferred.

#### Optional technical additions

The following are optional and require explicit learning objectives:

- Merkle inclusion-proof laboratory;
- key compromise and revocation case;
- proof-of-work comparison laboratory; and
- cryptocurrency or tokens only in a separate scenario about settlement, incentives, carbon credits, or token economics.

Do not add proof of work, mining, or cryptocurrency to the main permissioned coffee ledger.

### Phase 4 — Assessment, reporting, and replay

Implement:

- rubric definitions;
- automated evidence rules;
- manual scoring;
- competency evidence links;
- learner and class reports;
- exact run replay;
- CSV and JSON exports.

Exit criteria:

- every score links to observable evidence;
- process score and realized outcome are separate;
- instructor can replay and score a run;
- export contains documented version metadata.

### Phase 5 — Modes and stochastic engine

Implement:

- tutorial, standard, sandbox, and configured modes;
- deterministic random engine;
- outcome and feedback timing controls;
- forced versus probabilistic outcomes;
- scenario comparison and replay.

Exit criteria:

- same seed and same actions reproduce the same outcome;
- standard mode can disable randomness;
- tutorial feedback does not leak into standard mode.

### Phase 6 — Authoring improvements and disciplinary expansion

Implement:

- visual scenario editor;
- pack templates;
- domain competency namespaces;
- additional scenario packs;
- localization workflow;
- improved preview and branch-testing tools.

---

## 31. Instructor-ready platform release boundary

The selected platform release is complete only when it includes:

1. authenticated learner, instructor, scenario-author, administrator, and optional rater roles;
2. configurable blockchain and professional competency frameworks;
3. validated, versioned scenario packs and immutable publication;
4. the current coffee simulation registered through its native scenario-pack runtime;
5. actual, ledger, business, and role-filtered information-state separation;
6. server-authoritative, append-only run events for hosted single-learner runs;
7. evidence workspace and detailed evidence-use logging;
8. structured decisions with rationale, citations, confidence, and risk estimate;
9. real educational digital signatures, authorization, cryptographically verified endorsements, policies, transaction validation, and history;
10. analytic rubrics with manual and declarative automated scoring;
11. competency evidence reports for learners and classes;
12. exact run replay;
13. CSV and JSON exports with documented schemas;
14. assignment creation and feedback-release controls;
15. tutorial, standard, sandbox, and configured run modes;
16. deterministic stochastic outcomes and forced-outcome controls;
17. scenario-pack import, validation, preview, version comparison, publication, and retirement;
18. a hosted graphical SCORM package builder that reuses the existing Node packaging engine;
19. Guided, Challenge, Assessment, and Technical Laboratory package outputs where their content is complete and accepted; and
20. English and Vietnamese platform localization workflows, with release acceptance performed separately for each supported package and interface language.

A full collaborative multi-learner mode, learner-to-learner endorsement, real-time communication, multi-tenant SaaS administration, and real blockchain integration are not required for this selected endpoint.

---

## 32. Definition of done

The refactor is successful when all of the following are true:

- A new disciplinary scenario pack can be added without modifying core application logic.
- Every scenario and policy used in a run has an immutable version reference.
- Hidden actual state is never exposed before authorized revelation.
- The same version, seed, and action sequence reproduce the same run.
- Evidence inspection, decisions, explanations, and confidence are fully logged.
- Learners can inspect simulated blockchain transactions and understand identity, endorsement, validation, and asset history.
- The system can represent a valid and immutable record whose content is nevertheless inaccurate.
- Decision-process quality is stored separately from realized outcome.
- Every competency score links to specific observable evidence.
- Instructors can replay, score, report, and export a run.
- Instructors can create assignments and generate validated SCORM packages through the graphical builder.
- Scenario authors can import, validate, preview, version, publish, and retire scenario packs.
- Hosted learner runs remain individual; no collaborative team workflow is required.
- The existing SimuLedger coffee experience works through the new engine.
- Automated tests cover the critical state, permission, randomization, scoring, versioning, and replay behavior.

---

## 33. Coding constraints

- Use the existing application stack unless a change is justified in an architectural decision record.
- Keep business and scenario logic out of UI components.
- Use type-safe request, event, and scenario schemas.
- Maintain one current fresh-install database schema and reset development
  databases after contract changes.
- Do not hard-code scenario IDs, organizations, roles, asset types, policies, outcomes, or competency mappings in core services.
- Do not execute arbitrary code from imported scenario packs.
- Make command handlers idempotent.
- Add structured logging and meaningful error codes.
- Document public APIs and the scenario schema.
- Include seed data and one complete example scenario pack.
- Upgrade pre-release contracts directly and remove superseded formats in the
  same delivery.
- Do not implement collaborative multi-learner sessions, learner-to-learner endorsements, or real-time communication under this plan.

---

## 34. First tasks for the coding agent

Start with the following concrete sequence:

1. Audit the repository and write `docs/current-architecture.md`.
2. Write `docs/target-architecture.md` based on this plan.
3. Define the competency, performance-indicator, scenario-pack, scenario-version, run-event, and rubric data models.
4. Publish a versioned JSON Schema for scenario packs.
5. Build a command-line or admin validation tool for scenario packs.
6. Create the append-only run-event store and role-filtered state projection.
7. Convert one existing SimuLedger stage into the new schema as a vertical slice.
8. Add the evidence workspace and structured decision submission for that stage.
9. Add one policy check and one simulated blockchain transaction lifecycle.
10. Add event replay and a basic instructor timeline.
11. Add a simple rubric and competency-evidence view.
12. Expand the vertical slice into the complete current coffee scenario only after the architecture has passed tests.
13. Add assignment creation, instructor review, manual rubric scoring, and class reporting for single-learner runs.
14. Expose the existing Node SCORM package generator through a hosted graphical builder job flow.
15. Add deterministic run modes, scenario-pack publication, preview, and authoring workflows.
16. Stop after the Phase 6 instructor-ready platform acceptance criteria are met; do not begin collaborative multi-user work.

The first vertical slice should prove the full chain:

```text
scenario configuration
-> role-filtered evidence
-> learner inspection
-> decision and justification
-> state and ledger transition
-> event log
-> rubric evidence
-> competency report
-> replay
```

# TraceChain Canonical UI/UX Authenticity Improvement Plan

## 1. Purpose

Implement the recommendations in
`TraceChain_UI_UX_Authenticity_Review_and_Improvement_Recommendations.md`
without changing TraceChain's simulation, scoring, cryptographic, persistence,
or packaging architecture.

The outcome is a clearer simulation workspace in which learners can immediately
distinguish:

1. Learning guidance
2. A role-specific professional application
3. Blockchain evidence and transaction state
4. An organizational decision
5. An academic knowledge checkpoint
6. A causal debrief

This is an interface and interaction-structure program. It is not a new
blockchain-feature cycle.

## 2. Baseline and repository findings

| Item | Current state |
|---|---|
| Planning baseline | `master` at `2c20fc61333e59299eb986e9c2cef602834c81b2` |
| Application version | `2.0.0` |
| Before-audit package | `artifacts/ui-audit/2c20fc6/` |
| Documented interface families | 31 |
| Documented states | 112 |
| Public deployment | Older than the audit commit; the mismatch is recorded in the audit |
| Scenario-author library | Confirmed defect: a default API is recreated in `ScenarioAuthorScreen` on each render |
| Locale-aware quantities | Already implemented through `Translator.formatNumber`; no current `toLocaleString("vi-VN")` call remains under `src/` |
| Human screen-reader review | Not yet completed |

The audit at `2c20fc6` is the immutable “before” baseline for later comparison.
Future screenshots must identify their own commit and must not overwrite it.

Recording the deployment mismatch satisfies the review's immediate requirement.
Do not update the hosted site or Moodle merely to remove that mismatch. Deploy
only when the product owner explicitly requests it.

## 3. Scope

### In scope

- Fix the scenario-author library render loop.
- Verify and document the already-completed locale-aware number formatting.
- Conduct and record human screen-reader checks.
- Establish a layered visual architecture.
- Build six coded benchmark surfaces:
  - Stage 3 Certificate Verification Console
  - Stage 5 Receiving and Discrepancy Management
  - Stage 8 Blockchain Verification Laboratory
  - Stage 9 Recall Command Center
  - Ledger and transaction explorer
  - Mobile logistics handoff
- Separate professional decisions from knowledge checkpoints.
- Reduce long-document interaction through purposeful panes, tabs,
  disclosures, and focused task surfaces.
- Apply the validated architecture to the remaining learner, report,
  instructor, and author surfaces.
- Preserve Vietnamese and English parity.
- Preserve keyboard, screen-reader, mobile, browser, SCORM, and hosted-platform
  behavior.

### Explicitly out of scope

- New blockchain mechanisms
- New scenario decisions
- New academic points or scoring rules
- Changes to the 100-point total or 39/61 split
- Changes to hint targets or ceilings
- Changes to command, event, or audit semantics
- Changes to deterministic replay
- Changes to TC3 journal semantics or storage limits
- Persistent SCORM counterfactual branches
- New backend or authentication behavior
- New collaboration behavior
- AI features
- Merkle trees, proof of work, mining, or cryptocurrency
- A generic design-system product or external component library
- Decorative cyberpunk styling, fake terminals, or fake device frames
- A compatibility mode for the old interface
- Data or UI migrations

## 4. Non-negotiable architecture constraints

1. Keep one application codebase and one static application build.
2. Guided, Challenge, and Assessment use the same redesigned components.
3. Presentation components consume current projections and submit through the
   existing orchestrator.
4. React components must not recreate signing, authorization, endorsement,
   state-version, scoring, or ledger logic.
5. Accepted domain events, simulation decision events, and attempt-audit events
   retain their current separation.
6. Rejected actions never enter ledger projections.
7. Learner identity and organizational role continue to come from trusted
   execution context.
8. The original scoring item IDs, points, hints, mitigation caps, and feedback
   timing remain unchanged.
9. Browser presentation state is never authoritative business state.
10. All learner-facing strings remain in `src/locales/`.
11. Status meaning continues to use text and glyphs, not color alone.
12. Existing authenticity claims remain exact: real computation stays labeled
    real, educational simulation stays labeled simulated, and absent mechanisms
    stay absent.
13. No old/new UI feature flag or compatibility layer is added. Each approved
    screen replaces its prior presentation directly.
14. No migration code is added. This redesign must not require a persistence or
    package-schema migration.

## 5. Target visual architecture

### 5.1 Learning shell

Purpose:

- Mission and stage identity
- Current role and organization
- Progress and save state
- Required work
- Hints and glossary access
- Brief instructional guidance

Desktop treatment:

- Slim rail or compact strip
- Secondary visual weight
- Collapsible detail
- No duplication of the professional task form

Mobile treatment:

- Compact role/task header
- Mission detail in an accessible disclosure
- Progress and save status remain visible without consuming most of the first
  viewport

The current `StageShell`, `TopBar`, hint panel, and required-action projection
remain the source behavior. Their presentation is reorganized rather than
reimplemented.

### 5.2 Role-specific professional application

The primary workspace uses role and task language instead of assignment-page
language.

| Stage | Application identity |
|---|---|
| Stage 2 | Lot Registration |
| Stage 3 | Certificate Verification Console |
| Stage 4 | Logistics Handoff |
| Stage 5 | Receiving and Discrepancy Management |
| Stage 6 | Production Transformation |
| Stage 7 | Packaging and Distribution |
| Stage 9 | Recall Command Center |

These applications share structure and tokens but may differ in information
hierarchy, operational status, documents, actions, and density.

Do not build a generic schema-driven application renderer. Use a small shared
shell with explicit stage composition so one developer can maintain it.

### 5.3 Blockchain inspector

The technical layer is a separate docked or disclosed surface built from the
existing transaction, signature, endorsement, ledger, and provenance
projections.

Sections may include:

- Proposal
- Canonical payload
- Digest
- Signature
- Identity
- Authorization
- Endorsements
- Validation
- Ordering
- Block
- Ledger
- Provenance

Desktop:

- Docked side panel, split pane, or selected-record detail
- Dense neutral surface
- Monospace only for technical identifiers

Mobile:

- Full-width drawer or dedicated panel
- One selected technical record at a time
- Long values wrap and remain copyable

Do not show every hash or signature by default.

### 5.4 Professional decision console

A professional decision must look and read differently from a knowledge check.

The console may present:

- Recommended organizational action or available operational actions
- Evidence citations
- Rationale
- Risk or confidence where already captured by the scenario
- Authorization context
- A specific organizational confirmation action
- A transaction receipt or rejected system response

It must submit the same existing decision or command. This work does not add
new rationale, citation, confidence, or risk fields unless those fields already
exist in the scenario contract.

### 5.5 Assessment checkpoint

`KnowledgeCheckPanel` becomes an explicitly academic, compact layer.

Requirements:

- A visible “knowledge checkpoint” identity
- Submission copy distinct from an organizational action
- Lower visual weight than the professional workspace
- Feedback that remains governed by the configured feedback timing
- Existing retries, item IDs, scores, hints, and ceilings preserved

The checkpoint may appear as a drawer, bottom sheet, compact interstitial, or
separate section chosen consistently by viewport. It must remain fully
keyboard-operable and must not trap focus unexpectedly.

### 5.6 Platform workspaces

Instructor and author routes use an enterprise workspace grammar:

- Persistent local navigation
- Summary metrics
- Filters and data tables
- List/detail or timeline/detail panes
- Configuration side panels
- Audit history
- Focused drill-down instead of one continuously stacked report

This layer is implemented only after the learner benchmark screens validate the
shared visual direction.

## 6. Component strategy

Evolve the existing component system rather than creating a parallel one.

| Current component | Planned responsibility |
|---|---|
| `StageShell` | Compose learning context, role application, inspector access, checkpoint, and progression |
| `TopBar` | Compact persistent context; avoid duplicating the role-app header |
| `WorkspaceTabs` | Become the entry point to a focused inspector; preserve ARIA tab behavior |
| `TransactionAction` | Retain command lifecycle behavior; render inside professional action and receipt surfaces |
| `EndorsedTransactionAction` | Retain proposal and handoff behavior; expose endorsement progress in the role application |
| `KnowledgeCheckPanel` | Render as the distinct assessment checkpoint |
| `SignatureTrustSummary` | Remain the compact trust evidence component |
| `LedgerExplorer` | Move to record selection plus focused detail instead of expanding the entire chain |
| `TransactionHistory` | Support compact list/detail presentation |
| `ProvenanceViewer` | Remain the authoritative graph; receive stage-specific prominence |
| `FinalReport` | Become a dashboard with expandable causal and technical detail |

Add only the small presentation primitives needed to avoid duplication:

```text
src/components/simulation-workspace/
  simulation-workspace.tsx
  role-application-header.tsx
  professional-decision-console.tsx
  assessment-checkpoint.tsx
  evidence-document.tsx
  transaction-receipt.tsx
  inspector-surface.tsx
  field-task-layout.tsx
```

Exact filenames may follow existing conventions. Do not create a second state,
command, or transaction model in this directory.

Presentation metadata such as role-application titles should live in a small
typed UI registry keyed by existing stage IDs. Do not modify scenario schemas
solely for visual chrome in this cycle.

## 7. Responsive layout contract

### Desktop, 1440 × 1024

- Role and mission are identifiable in the first viewport.
- Primary evidence, operational action, and current transaction status are
  visible without traversing the whole page.
- The learning layer is secondary.
- The inspector is available without inserting the entire ledger into the
  document flow.
- Stage pages should normally remain within roughly two viewport heights when
  technical disclosures are closed.

### Laptop, 1280 × 800

- The professional workspace remains primary.
- Learning and inspector regions may collapse.
- No required action becomes unreachable.
- No sticky element covers focused controls.

### Mobile, 390 × 844

- One task at a time.
- Role-specific field header where the stage represents field work.
- Large operational action targets.
- Evidence and inspector details open as explicit secondary surfaces.
- No desktop-only split pane is merely stacked in full.

### Minimum supported viewport, 320 × 640

- No unintended horizontal page scrolling.
- Technical values wrap.
- Tables use labeled scroll regions or alternative stacked records.
- Focused controls remain visible below sticky UI.
- Status never depends on color.

## 8. Delivery sequence

### Increment 0: Defects, verification, and baseline

#### 0.1 Fix the scenario-author render loop

Cause:

```ts
export function ScenarioAuthorScreen({
  api = createScenarioAuthoringApi(),
})
```

The default object changes on each render and retriggers the effect that depends
on `api`.

Implementation:

- Create one stable default API instance outside render, or memoize it once.
- Preserve explicit API injection in tests.
- Add a regression test that:
  - fails against the current implementation;
  - loads the library once;
  - keeps rows visible after an unrelated state change;
  - does not repeatedly call `loadSession` or `listPacks`.

Do not redesign the author screen in this increment.

#### 0.2 Verify number localization

The recommendation is already satisfied in current source:

- `asset-card.tsx` uses `t.formatNumber`.
- `provenance-viewer.tsx` uses `t.formatNumber`.
- `src/localization/i18n.ts` owns locale-aware formatting.

Work:

- Retain or strengthen the existing English/Vietnamese regression test.
- Confirm repository search finds no hard-coded `vi-VN` quantity or number
  formatting in learner components. The deterministic scenario-clock date
  formatter is a separate concern.
- Correct this item in the next audit record; do not make a redundant code
  change.

#### 0.3 Human screen-reader review

Run and document:

- VoiceOver with Safari on macOS
- One additional screen-reader/browser pairing when available
- Start, Stage 3 rejection, Stage 4 handoff, Stage 5 correction, inspector tabs,
  Stage 9 recall, final report, instructor report, and author validation

Record:

- Heading navigation
- Landmark navigation
- Form labels and instructions
- Status announcements
- Disclosure and tab operation
- Focus order and focus restoration
- Long technical-value behavior
- Any mismatch between visual and spoken order

Automated accessibility tests remain required but do not replace this record.

#### 0.4 Preserve the baseline

- Keep `artifacts/ui-audit/2c20fc6/` unchanged.
- Store future comparison artifacts under their own commit directory.
- Record the hosted deployment mismatch until an explicitly authorized
  deployment occurs.

#### Increment 0 gate

- Scenario-author regression test passes.
- Locale regression tests pass.
- Human screen-reader findings are recorded and blocking issues are triaged.
- `npm run quality` passes.
- No UI redesign has begun.

### Increment 1: Six coded benchmark surfaces

Implement the smallest shared layout foundation needed for these six surfaces.
Do not redesign the other screens yet.

#### 1.1 Stage 3 Certificate Verification Console

Structure:

```text
Certificate document | Verification console
Professional decision
Blockchain inspector
Knowledge checkpoint
```

Required behavior:

- Certificate claims, issuer, validity, and storage classification read as a
  document/evidence surface.
- Hash, signature, identity, key status, authorization, and ledger anchoring
  read as system verification.
- Accept, hold, reject, and review are organizational actions.
- A valid signature with unauthorized signer is presented as a rejected system
  response, not quiz feedback.
- Existing atomic decision, mitigation, score, hint, and audit behavior remains
  exact.

#### 1.2 Stage 5 Receiving and Discrepancy Management

Use a focused case-management workspace:

```text
Overview | Investigation | Correction | History
```

Required behavior:

- Manifest quantity, scale reading, variance, and investigation status dominate
  the initial view.
- Initial action remains immutable after submission.
- Rejected overwrite/delete remains in audit history and outside the ledger.
- Mitigation remains bounded.
- Correction proposal, endorsement state, lineage, and effective current value
  are separated but easy to relate.
- Completion requirements remain visible without rendering every section at
  once.

Presentation tabs are not authoritative state. On resume, select a sensible tab
from reconstructed simulation state.

#### 1.3 Stage 8 Blockchain Verification Laboratory

Required behavior:

- Technical inspection is the primary grammar.
- Block, transaction, digest, previous hash, and integrity state use
  record-selection and focused comparison.
- The tampered copy is clearly separate from the authoritative attempt.
- Signature tamper evidence remains genuine.
- Knowledge checks remain visibly academic and separate.
- No proof-of-work, mining, cryptocurrency, or Merkle presentation is added.

#### 1.4 Stage 9 Recall Command Center

Required behavior:

- Contaminated source, affected descendants, locations, custody, evidence
  strength, risk, and recall scope lead the screen.
- Provenance and scope selection receive primary visual space.
- Trusted role context and regulator handoff remain explicit.
- Unauthorized submission remains an audit attempt.
- Authorized resubmission remains a separate accepted action.
- `INT_RECALL_SCOPE` and `INT_RECALL_COMMITTED` keep their exact score
  responsibilities.

#### 1.5 Ledger and transaction explorer

Replace full-chain document expansion with:

- Compact transaction/block list
- Current selection
- Focused record detail
- Integrity and immutable-history markers
- Copy and verify actions already supported
- Clear current-state versus history labeling

All records remain available. The redesign changes information density and
navigation, not ledger content or verification.

#### 1.6 Mobile logistics handoff

At 390 px and 320 px, Stage 4 should read as a field task:

- Role/application header
- Current shipment
- Sender confirmation
- Receiver acknowledgement
- Endorsement progress
- Large current action
- Compact transaction receipt
- Inspector evidence in a secondary disclosure

Use the same semantic components and command path as desktop. Do not create a
separate mobile simulation or decorative phone frame.

#### Increment 1 recognition check

Before extending the redesign, show the benchmark screens without explanatory
captions to a small group representing learners and instructors.

Ask each participant to identify:

- Current role
- Current professional task
- Instruction versus operation
- Business state versus ledger history
- Professional decision versus knowledge checkpoint
- Whether a transaction is proposed, rejected, pending, or committed

Record accuracy, hesitation, and incorrect interpretations. The benchmark gate
passes when:

- Most participants identify the role and task without coaching.
- Professional decisions and knowledge checks are not routinely confused.
- Business evidence and blockchain evidence are distinguishable.
- No serious accessibility or mobile blocker remains.

Do not tune a numeric threshold after seeing results. Define the participant
count and pass threshold in the study note before running it.

#### Increment 1 technical gate

- Existing stage behavior and scores are unchanged.
- Guided and Challenge use the same components.
- 1440, 1280, 390, and 320 viewport checks pass.
- No unintended horizontal page scrolling.
- Keyboard flows pass.
- Automated accessibility checks pass.
- `npm run quality` passes.
- Chromium Playwright flows pass during each slice.
- Full Chromium, Firefox, WebKit, and Mobile Safari matrix passes at the
  completed benchmark gate.
- No deployment occurs unless explicitly requested.

### Increment 2: Shared layer components

Consolidate only patterns proven by the benchmark.

Deliver:

- Learning shell
- Role-application header and workspace
- Inspector surface
- Evidence-document presentation
- Professional-decision console
- Assessment checkpoint
- Transaction receipt
- Transaction lifecycle presentation
- Field-task layout

Requirements:

- Remove benchmark-only duplication.
- Keep stage-specific composition explicit.
- Preserve existing component APIs where that reduces risk, but do not retain
  obsolete markup solely for compatibility.
- Remove replaced CSS rather than layering permanent override piles.
- Keep status colors reserved for verdicts.
- Use darker technical neutrals only for the inspector, not as a decorative
  “blockchain theme.”
- Support reduced motion; no required animation.
- Keep strings in both locale catalogues.

#### Increment 2 gate

- Shared components cover all six benchmark screens without conditional
  component sprawl.
- No second state or action architecture exists.
- Locale parity and accessibility tests pass.
- CSS and component tests pin the selected visual distinctions.
- `npm run quality` passes.
- Full browser matrix runs at this major gate.

### Increment 3: High-value learner stages

Apply the validated shared components completely to Stages 3, 5, 8, and 9.

For each stage:

1. Characterize existing commands, decisions, scores, hints, feedback, replay,
   and resume behavior.
2. Add a failing UI test for the intended distinction.
3. Replace the presentation in one coherent slice.
4. Confirm every original authored path.
5. Confirm Guided, Challenge, and Assessment timing where applicable.
6. Capture desktop and mobile comparison evidence.
7. Run the slice gate before moving to the next stage.

The final Increment 3 gate must prove:

- Stage 3 communicates document, trust, authorization, organizational action,
  and checkpoint as separate concepts.
- Stage 5 no longer behaves as one continuously stacked 6,000 px case page.
- Stage 8 is visibly a technical inspector without implying absent consensus
  mechanisms.
- Stage 9 is visibly a recall command center with provenance as primary
  evidence.
- Scores, hints, mitigation, event histories, and causal reports are unchanged.
- TC3 remains within its existing bound.
- SCORM resume works at the same consequential boundaries.
- `npm run quality` and the full Playwright matrix pass.

### Increment 4: Extend the validated system

Proceed only after the learner benchmark is successful.

#### 4.1 Remaining learner stages

- Stage 1: light orientation and role transition
- Stage 2: lot-registration application and transaction receipt
- Stage 4 desktop: logistics sender/receiver workspace
- Stage 6: production transformation application
- Stage 7: packaging and distribution application

#### 4.2 Modes

- Guided: instruction and hints remain available through the learning shell.
- Challenge: reduced guidance remains configuration-derived.
- Assessment: checkpoint and feedback visibility remain controlled by existing
  final-feedback rules.

Do not create mode-specific copies of screens.

#### 4.3 Final report

Recompose the existing report into:

- Score summary
- Diagnostic dimensions
- Causal timeline
- Key decisions
- Mitigations
- Remaining consequences
- Expandable technical evidence

The single academic score remains authoritative. Diagnostic dimensions remain
non-grade outputs.

#### 4.4 Counterfactual replay

Retain the assessed-original versus exploratory-alternative distinction.
Improve comparison navigation and density without changing branch, attribution,
reflection, or grade-preservation logic.

#### 4.5 Instructor workspace

Introduce:

- Persistent workspace navigation
- Summary and filtering
- Assignment/run selection
- Timeline and replay drill-down
- Report drill-down
- Configuration side panel
- Audit history

Do not add instructor capabilities in this cycle.

#### 4.6 Authoring workspace

After the render-loop fix is stable, reorganize:

- Pack library
- Editor
- Validation
- Preview
- Version lifecycle

Do not add a generic policy editor or change the scenario schema.

#### 4.7 Graphical package builder

Recompose the existing preset-based package job interface only. Do not create a
second packaging implementation.

#### Increment 4 gate

- All current routes and 31 documented interface families are represented.
- Guided, Challenge, and Assessment share static application assets.
- Hosted and SCORM flows remain behaviorally consistent where they share
  components.
- Final report, counterfactual, instructor, and author flows remain accessible.
- `npm run quality` and the full Playwright matrix pass.

## 9. Visual-language rules

| Layer | Required identity |
|---|---|
| Instruction | Light, spacious, secondary, collapsible |
| Professional application | Role title, operational hierarchy, task status, focused actions |
| Blockchain inspector | Dense, structured, technical-neutral, state-oriented |
| Evidence document | Document structure, source, date, issuer, reliability metadata |
| Professional decision | Organizational action, evidence context, confirmation, receipt |
| Knowledge checkpoint | Explicit academic label, compact question, distinct submit language |
| Mobile field task | Current task, asset, evidence, large action, compact receipt |
| Instructor | Dashboard, filters, tables, drill-down, replay |
| Author | Library, editor, validation, preview, lifecycle |

Shared constraints:

- Green, amber, and red remain verdict colors.
- Card roles remain distinguishable without using verdict color.
- Technical identifiers wrap safely.
- Provenance remains oldest-to-newest and points down where presented as a
  vertical chain.
- Neutral status remains glyph-free.
- Focus rings remain visible.
- Sticky elements never obscure focused controls.
- Motion is optional and never required to understand state.

## 10. Testing strategy

### 10.1 Behavior characterization

Before changing each benchmark:

- Record existing state transitions.
- Pin consequential command counts.
- Pin ledger and audit projection counts.
- Pin score and hint results.
- Pin resume checkpoints.
- Pin final causal evidence.

### 10.2 Component tests

Add tests for:

- Layer landmarks and accessible names
- Professional-decision versus checkpoint labels
- Inspector disclosure and record selection
- Transaction receipt status
- Role-application identity
- Mobile task action order
- Focus restoration
- Long-value wrapping hooks

### 10.3 Integration tests

Retain and extend:

- Stage 3 authorized and unauthorized certificate paths
- Stage 4 endorsement handoff
- Stage 5 rejected overwrite and correction mitigation
- Stage 8 hash and signature tamper
- Stage 9 unauthorized attempt and regulator resubmission
- Final report
- Guided, Challenge, and Assessment feedback timing
- Resume and replay

### 10.4 Accessibility

Automated:

- Heading hierarchy
- Landmarks
- Unique IDs
- Accessible names
- Tab and disclosure semantics
- Keyboard-only completion
- 320 px overflow
- Status announcements

Manual:

- VoiceOver/Safari
- Additional screen-reader/browser pairing when available
- Reading order in split panes
- Drawer opening, focus containment, closing, and restoration
- Technical-value verbosity
- Table alternatives

### 10.5 Visual and browser checks

Required viewports:

- 1440 × 1024
- 1280 × 800
- 390 × 844
- 320 × 640

Iteration policy:

- Run focused unit/integration tests and Chromium during a slice.
- Run `npm run quality` before every commit.
- Run the full browser matrix at Increment 1, 2, 3, and 4 gates rather than
  after every small CSS adjustment.
- Do not remove WebKit or Mobile Safari coverage to shorten a gate.

### 10.6 Package checks

At major learner-interface gates:

- Generate Guided, Challenge, and Assessment packages from one static build.
- Verify identical static application assets.
- Verify configuration and scenario identity.
- Verify offline operation.
- Verify SCORM resume, score, completion, and success status.
- Confirm suspend-data bounds.

Moodle acceptance and hosted deployment occur only when explicitly requested.

## 11. Measurement and comparison

Create a new audit artifact after Increment 1 and Increment 4 using the same
viewports and source metadata as the baseline.

Compare:

- Role recognition
- Task recognition
- Professional-decision versus checkpoint recognition
- Business-state versus ledger-history recognition
- Proposal/rejected/pending/committed recognition
- First-action visibility
- Closed-state page height
- Mobile horizontal overflow
- Keyboard task completion
- Screen-reader findings

Use screenshots and observed task behavior. Do not claim improved authenticity
from color or subjective preference alone.

## 12. Risks and controls

| Risk | Control |
|---|---|
| Cosmetic reskin without experiential change | Gate on role/layer recognition and task flow |
| New UI duplicates domain state | Components consume existing providers and projections only |
| Tabs hide required work | Required-action projection and deterministic resume-tab selection remain visible |
| Nested scrolling harms accessibility | Prefer page-level focus and bounded panels; test keyboard and screen readers |
| Inspector overwhelms novices | Progressive disclosure and Guided learning shell |
| Mobile becomes a stacked desktop page | Field-task composition and one-current-task contract |
| Stage-specific designs become unmaintainable | Small shared shell plus explicit stage composition |
| CSS overrides accumulate | Remove replaced rules in each slice |
| Assessment behavior drifts | Pin item IDs, points, feedback timing, and hint ceilings |
| Authenticity copy becomes inaccurate | Run existing hash/signature/package evidence checks |
| Deployment interrupts development | No deployment without explicit product-owner request |

## 13. Commit and release discipline

- Prepare one coherent, green change per increment or stage slice.
- Do not combine a visual slice with unrelated feature work.
- Do not commit or push until requested.
- Before any commit, run `npm run quality`.
- Do not use the quality-gate bypass for implementation changes.
- Do not add migration or compatibility commits.
- Do not update Moodle or the hosted site during ordinary iteration.
- When deployment is explicitly requested, deploy once from a green committed
  SHA and record that exact revision.

## 14. Completion criteria

This plan is complete when:

1. The scenario-author library is stable.
2. Locale-aware quantities are verified and documented accurately.
3. Human screen-reader findings are recorded and blocking issues are resolved.
4. The before-audit remains preserved.
5. The six benchmark surfaces pass the recognition and technical gates.
6. Learners can identify role and task without relying on assignment numbering.
7. Professional decisions and knowledge checkpoints have distinct interaction
   grammars.
8. Business evidence and blockchain evidence are visibly separate.
9. Stage 5, the ledger explorer, instructor replay, and reports no longer rely
   on one extremely long expanded page.
10. Selected mobile stages behave as focused field tasks rather than simple
    desktop reflow.
11. All original commands, events, scores, hints, mitigations, replay, resume,
    and causal reports remain correct.
12. Guided, Challenge, and Assessment still use one static application build.
13. Vietnamese and English remain complete.
14. Accessibility and the supported browser matrix pass.
15. No deferred feature, migration layer, or parallel simulation system has
    been introduced.

## 15. Final implementation report

Report:

1. Starting and final commits
2. Defects fixed
3. Baseline audit retained
4. Layer architecture implemented
5. Benchmark screens completed
6. Recognition-test method and results
7. Stage-by-stage behavior preservation
8. Professional-decision and checkpoint separation
9. Desktop, laptop, mobile, and minimum-mobile results
10. Accessibility results, including human screen-reader evidence
11. Page-height and task-focus comparison
12. Scoring, hint, mitigation, and causal-report confirmation
13. SCORM and hosted behavior confirmation
14. Browser matrix results
15. Package identity and static-build confirmation
16. Remaining limitations
17. Deployment status
18. Confirmation that no migration or deferred feature was added

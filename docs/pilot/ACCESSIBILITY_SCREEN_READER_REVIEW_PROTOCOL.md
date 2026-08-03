# SimuLedger Human Screen-Reader Review Protocol

## Purpose

Record the human screen-reader evidence required by the UI/UX authenticity
improvement plan.

Automated accessibility checks remain useful, but they do not establish whether
the interface is understandable when heard in sequence. This protocol must be
completed by a person using the screen reader. Agent-driven or scripted browser
checks must be labeled separately and do not satisfy this record.

## Build identity

Complete before each session:

| Field | Value |
|---|---|
| Source commit | |
| Application version | |
| Scenario ID and version | |
| Configuration or preset | |
| Package or hosted build | |
| Browser and version | |
| Screen reader and version | |
| Operating system | |
| Locale | |
| Reviewer | |
| Review date | |

Use a local production build or a deployment whose metadata exactly matches the
recorded commit. Use fictional test accounts and deterministic scenarios.

## Required pairings

Minimum:

1. VoiceOver with Safari on macOS
2. One additional pairing when available, preferably NVDA with Firefox or
   Chrome on Windows

Repeat the critical learner flow in Vietnamese and English. Platform screens may
be sampled in both locales once shared navigation and controls have been
verified.

## General checks for every surface

Record pass, fail, or not applicable for:

- Page title identifies the application and task.
- One logical level-one heading exists.
- Heading levels form a useful navigation outline.
- Landmarks identify navigation, main content, complementary evidence, and
  forms where present.
- Visual reading order matches spoken order.
- Current role and organization are announced before role-dependent actions.
- Controls have concise, unique accessible names.
- Instructions are announced before the control they govern.
- Validation errors identify both the problem and the affected control.
- Dynamic status is announced once rather than repeatedly.
- Focus moves to new task content after stage navigation.
- Opening a dialog, drawer, disclosure, or inspector moves focus predictably.
- Closing it returns focus to the invoking control.
- Disabled controls explain the unmet condition in adjacent readable content.
- Tables have useful headers and do not become an unstructured stream.
- Long hashes, signatures, and identifiers do not dominate ordinary navigation.
- Status meaning is available without color.
- Read-only and review modes are announced honestly.

## Required task walkthroughs

### 1. Start and orientation

Tasks:

- Navigate by headings and landmarks.
- Identify mode, scenario, duration, scoring, hints, and technical disclosure.
- Start the activity.
- Confirm focus reaches the Stage 1 heading.

Record:

- Whether the activity sounds like one coherent task rather than a collection
  of disconnected cards.
- Whether score and hint consequences are understandable before starting.

### 2. Stage 3 certificate and authorization rejection

Tasks:

- Identify certificate content, issuer, validity, and storage choice.
- Submit the authored unauthorized case.
- Hear signature validity, identity recognition, authorization failure, and
  transaction rejection.
- Open and close technical evidence.
- Complete the available mitigation.

Record:

- Whether signature validity is distinguishable from authorization.
- Whether the rejected action sounds like a system outcome rather than quiz
  feedback.
- Whether raw technical values can be skipped or collapsed.

### 3. Stage 4 endorsement handoff

Tasks:

- Identify sender, receiver, and current custody.
- Create the proposal.
- Review endorsement progress.
- Perform the permitted role handoff.
- Endorse and commit.

Record:

- Whether the two organizational roles remain distinguishable.
- Whether pending, satisfied, ordered, and committed states are clear.
- Whether focus remains predictable across the handoff.

### 4. Stage 5 discrepancy and append-only correction

Tasks:

- Compare manifest quantity and physical scale reading.
- Submit the authored rejected overwrite or deletion attempt.
- Review feedback without losing the initial decision.
- Complete mitigation and correction endorsement.
- Inspect correction lineage and effective current value.

Record:

- Whether original record, correction record, and effective value are distinct.
- Whether rejected audit history is distinguishable from ledger history.
- Whether long content remains navigable without excessive heading or landmark
  repetition.

### 5. Evidence workspace and ledger

Tasks:

- Open the reference workspace.
- Move among all tabs using screen-reader and keyboard commands.
- Select current state, history, ledger, provenance, and glossary.
- Inspect one transaction and one block.
- Close the workspace and return to the invoking control.

Record:

- Tab name, selection, and panel relationship.
- Whether hashes can be bypassed efficiently.
- Whether current business state and immutable history are distinguishable.

### 6. Stage 8 integrity and signature tamper

Tasks:

- Run the hash-tamper demonstration.
- Review each failure step and the authoritative-ledger conclusion.
- Run the signature-tamper demonstration.
- Compare original and modified proposal digests.

Record:

- Whether the sequence communicates cause and effect.
- Whether the modified copy is clearly non-authoritative.
- Whether genuine computation and simulated network claims remain clear.

### 7. Stage 9 recall and regulator handoff

Tasks:

- Inspect provenance.
- Select recall scope.
- Submit under the initial unauthorized context.
- Review the audit outcome.
- Perform the regulator handoff and authorized resubmission.
- Confirm commitment.

Record:

- Whether scope quality and authorization quality are separate.
- Whether the initial rejected attempt remains understandable.
- Whether provenance relationships are clear in spoken order.

### 8. Final causal report

Tasks:

- Navigate score, dimensions, causal explanations, decisions, hints, and
  traceability metadata.
- Follow one earlier decision to one delayed consequence.

Record:

- Whether the academic score is distinguishable from diagnostic dimensions.
- Whether causal explanations are understandable without reading every card.
- Whether technical evidence is optional rather than unavoidable.

### 9. Instructor report and replay

Tasks:

- Choose an assignment and learner run.
- Navigate timeline and evidence.
- Open a replay point.
- Review rubric and moderation controls.

Record:

- Whether list/detail context remains clear.
- Whether filters and tables have useful names.
- Whether replayed state is distinguishable from current state.

### 10. Scenario author validation

Tasks:

- Confirm the library loads once and remains populated.
- Load the starter.
- Change one draft value.
- Validate.
- Review issues or success.
- Return to the library.

Record:

- Whether editor fields identify their scenario context.
- Whether validation summary and individual issues are navigable.
- Whether library, editor, preview, and lifecycle actions are distinct.

## Issue record

Create one row per issue:

| ID | Severity | Surface | Pairing | Locale | Steps | Expected | Observed | Evidence | Resolution |
|---|---|---|---|---|---|---|---|---|---|

Severity:

- Blocker: required task cannot be completed.
- High: state, authorization, score, or consequence is materially
  misunderstood.
- Medium: task is completable but inefficient or confusing.
- Low: minor verbosity, wording, or navigation friction.

## Gate

Human screen-reader review passes when:

- No blocker remains.
- No unresolved high-severity issue can change the learner's decision, score
  understanding, authorization understanding, or ability to complete a task.
- Required dialogs, drawers, disclosures, tabs, handoffs, and stage transitions
  have predictable focus behavior.
- The reviewer can distinguish professional action, blockchain evidence,
  knowledge checkpoint, and causal debrief.
- The completed evidence record identifies the exact tested commit.

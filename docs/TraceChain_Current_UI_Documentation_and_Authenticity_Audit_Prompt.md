# TraceChain Current UI Documentation and Authenticity Audit

Perform a comprehensive visual and interaction audit of the current TraceChain implementation.

The purpose of this task is to create an evidence package that the product owner can send to an external UI/UX reviewer.

This is a documentation and screenshot task only.

Do not:

- redesign the interface;
- change production components;
- modify CSS;
- rewrite learner-facing text;
- add new illustrations;
- implement recommendations;
- create a new feature branch;
- commit or push changes;
- generate speculative mockups;
- present planned but unimplemented screens as though they exist.

Document the application exactly as it currently works.

The audit must help a reviewer answer this question:

> Does TraceChain look and behave like an immersive professional business and blockchain simulation, or does it still look primarily like an ordinary online assignment containing instructions, forms, and multiple-choice questions?

## 1. Establish the exact application version

Before taking screenshots:

1. Record the current branch.
2. Record the full commit SHA.
3. Record the working-tree status.
4. Record the application version.
5. Record the scenario and configuration versions.
6. Record the current deployment revision, where available.
7. Record whether the public deployment matches the current commit.

Use a local production build as the screenshot source of truth.

Use the public deployment only when its recorded build metadata matches the local commit and configuration. If it does not match, document the difference and capture the local production build.

Do not take screenshots from a development interface containing developer overlays, debug controls, hot-reload UI, or browser extensions.

Use deterministic scenarios, fixed seeds, fixed role context, and test accounts.

Do not include real personal data, credentials, private keys, access tokens, or hidden actual-state data in screenshots.

## 2. Audit actual implementation, not roadmap assumptions

Inspect:

- routes;
- screen components;
- stage components;
- shared layout components;
- dialog and disclosure components;
- evidence views;
- ledger and transaction views;
- decision components;
- feedback components;
- report components;
- instructor screens;
- author screens;
- configuration-builder screens;
- responsive behavior;
- Playwright fixtures and scenario drivers.

Create an implementation inventory before screenshotting.

For every screen or feature mentioned in planning documents, classify it as:

- implemented and reachable;
- implemented but hidden behind configuration;
- partially implemented;
- planned only;
- removed or obsolete.

Do not fabricate screenshots for planned-only screens.

## 3. Define the visual layers

Classify every visible area into one of these layers:

### A. Instructional shell

Examples:

- learning objectives;
- stage instructions;
- explanatory text;
- hints;
- glossary guidance;
- progress;
- learning feedback;
- scoring explanations.

### B. Assessment layer

Examples:

- multiple-choice questions;
- answer submission;
- correctness feedback;
- score;
- attempts;
- hint penalties;
- rubrics;
- competency results.

### C. Professional business workspace

Examples:

- role context;
- organizational task;
- operational evidence;
- certificates;
- manifests;
- sensor records;
- laboratory results;
- policy documents;
- professional decisions;
- rationale;
- confidence;
- risk estimates;
- mitigation actions.

### D. Blockchain system interface

Examples:

- asset state;
- transaction proposal;
- canonical transaction data;
- transaction digest;
- digital signature;
- signer identity;
- authorization;
- endorsement policy;
- endorsement progress;
- ordering;
- validation;
- commitment;
- block;
- block hash;
- previous-block hash;
- ledger history;
- provenance;
- state version;
- rejected transaction or audit event.

### E. Device or application simulation

Examples:

- simulated mobile field app;
- simulated warehouse terminal;
- laboratory system;
- regulator console;
- certificate-verification terminal;
- blockchain explorer;
- logistics dashboard;
- desktop decision workstation.

### F. Platform and administration

Examples:

- learner dashboard;
- assignment list;
- instructor monitor;
- scenario library;
- package builder;
- rubric scoring;
- reports;
- author validation;
- publishing.

For every screenshot, identify which layers are visible.

Also state whether those layers are visually distinguishable or whether they all use essentially the same cards, headings, backgrounds, buttons, and spacing.

## 4. Screen inventory

Create a complete inventory of all currently implemented screens and materially different states.

At minimum, inspect the following where implemented.

### Learner entry and orientation

- Start screen
- Assignment or run dashboard
- Run lobby
- Role briefing
- Guided package start
- Challenge package start
- Assessment start
- Technical Laboratory start

### Guided simulation

Capture every stage at least once:

- Stage 1 orientation
- Stage 2 asset or batch creation
- Stage 3 certificate and storage decision
- Stage 4 custody and transport
- Stage 5 discrepancy, investigation, and correction
- Stage 6 transformation
- Stage 7 packaging, ownership, or dispatch
- Stage 8 tamper or integrity verification
- Stage 9 recall and debrief
- Final report

### Challenge simulation

Capture:

- Challenge start
- Each materially different decision screen
- Expired-certificate condition
- Quantity discrepancy
- Branching provenance
- Recall selection
- Challenge feedback
- Challenge final report

Do not duplicate every Guided screenshot when the Challenge layout is identical. Document reused layouts and capture every materially different state.

### Evidence workspace

Capture all implemented views, including:

- current state;
- transaction history;
- ledger explorer;
- selected block;
- selected transaction;
- transaction explanation;
- provenance or traceability;
- glossary;
- policy view;
- document or evidence viewer;
- identity and authorization evidence;
- signature evidence;
- endorsement evidence.

### Transaction lifecycle

Capture the implemented transaction lifecycle states:

- before proposal;
- proposal prepared;
- signed;
- signature valid;
- signature invalid;
- identity recognized;
- identity unknown;
- authorized;
- unauthorized;
- endorsement pending;
- endorsement satisfied;
- proposal mismatch;
- ordering;
- validation passed;
- validation failed;
- stale state version;
- committed;
- rejected;
- ledger and asset state after commitment.

Only capture states that are currently implemented and reachable.

### Professional decision-making

Capture:

- decision before input;
- evidence citation;
- policy citation;
- action selection;
- rationale entry;
- confidence entry;
- risk estimate;
- validation error;
- confirmation;
- committed initial decision;
- feedback;
- mitigation opportunity;
- mitigation submitted;
- consequence shown later;
- causal final-report explanation.

### Assessment and instructional interruption

Capture:

- MCQ before answering;
- MCQ after answering;
- correct feedback;
- incorrect feedback;
- retry;
- hint disclosure;
- hint already used;
- zero-points-at-risk message;
- locked Continue state;
- completion state.

### Error, recovery, and edge states

Capture:

- fatal configuration error;
- incompatible saved-state message;
- persistence failure or recovery screen;
- offline or platform failure where implemented;
- unauthorized action;
- invalid transaction;
- no-data or empty state;
- loading state;
- disabled control with explanation.

### Hosted platform screens

Where currently implemented, capture:

#### Learner

- dashboard;
- assigned runs;
- run lobby;
- scenario workspace;
- outcome;
- debrief;
- competency profile;
- counterfactual comparison.

#### Instructor

- scenario library;
- assignment configuration;
- live monitor;
- timeline;
- replay;
- rubric scoring;
- moderation;
- learner report;
- class report;
- export center;
- graphical SCORM package builder.

#### Scenario author

- pack import;
- validation results;
- metadata editor;
- role preview;
- version comparison;
- publish;
- retire;
- visual editor, only if implemented.

## 5. Screenshot protocol

Use Playwright or equivalent deterministic browser automation.

### Primary viewport

```text
1440 × 1024
```

Use this for every unique desktop screen.

### Laptop viewport

```text
1280 × 800
```

Use this for dense screens where vertical space materially changes the experience.

### Mobile viewport

```text
390 × 844
```

Use this for:

- start screen;
- role briefing;
- one ordinary stage;
- Stage 3;
- Stage 5;
- Stage 8;
- Stage 9;
- evidence workspace;
- transaction details;
- decision console;
- final report.

### Minimum supported viewport

```text
320 × 640
```

Use this for the most information-dense implemented screens:

- transaction explanation;
- ledger details;
- signature or endorsement evidence;
- Stage 5 correction;
- Stage 9 recall;
- decision console.

### Screenshot rules

- Use 100% browser zoom.
- Wait for fonts, images, data, and transitions to settle.
- Do not include browser developer tools.
- Do not add decorative device frames to the raw screenshots.
- Capture the actual responsive interface.
- Use full-page screenshots when page structure matters.
- Also capture focused component screenshots for dense interfaces.
- Preserve sufficient surrounding context to identify the screen.
- Use PNG.
- Do not compress screenshots until text becomes difficult to read.
- Use consistent scenario state and seed.
- Capture clean screenshots before adding annotations.

## 6. Clean and annotated versions

For every important screen, create:

1. A clean screenshot
2. An annotated copy with numbered callouts

The annotated copy should identify major interface zones.

Example:

```text
1. Application header and role context
2. Learning instruction
3. Operational evidence
4. Blockchain transaction panel
5. Decision console
6. Assessment question
7. Reference workspace
8. Progress and navigation
```

Annotations must not cover important text.

If producing annotated PNGs is impractical, create a component map in Markdown that refers to the clean screenshot by numbered regions.

## 7. Screenshot naming convention

Use stable, descriptive filenames.

Example:

```text
L-GUIDED-S03-CERTIFICATE-BEFORE-D1440.png
L-GUIDED-S03-CERTIFICATE-AFTER-D1440.png
L-GUIDED-S03-AUTH-REJECTED-D1440.png
L-GUIDED-S05-CORRECTION-D1440.png
L-GUIDED-S05-CORRECTION-M390.png
L-GUIDED-S09-RECALL-D1440.png
L-GUIDED-FINAL-REPORT-D1440.png
L-CHALLENGE-S09-RECALL-D1440.png
I-ASSIGNMENT-CONFIG-D1440.png
A-PACK-VALIDATION-D1440.png
```

Prefixes:

```text
L = learner
I = instructor
A = author
P = platform or administration
```

Viewport suffixes:

```text
D1440
L1280
M390
M320
```

## 8. Per-screen documentation

For every unique screen, create a record containing:

```text
Screen ID
Screenshot filename
Route or navigation path
Application role
Simulation role
Organization
Scenario
Scenario version
Mode
Stage or node
Viewport
Purpose
Entry condition
Exit condition
```

Then describe every visible region in reading order.

For each region, record:

- region number;
- visible title;
- purpose;
- component name;
- source file;
- important CSS class or selector;
- data shown;
- user controls;
- possible states;
- what happens after interaction;
- whether it is instructional, assessment, business, blockchain, device, or platform UI;
- whether it uses real computation, simulated data, or explanatory content;
- whether it is always visible, collapsible, modal, tabbed, or secondary;
- whether the same component appears elsewhere.

Do not write design recommendations in this section. Describe the current interface objectively.

## 9. Visual-language inventory

Create a visual-language matrix covering:

- page backgrounds;
- card backgrounds;
- border styles;
- shadows;
- corner radius;
- spacing;
- typography;
- heading hierarchy;
- body text;
- monospace text;
- data density;
- table styles;
- status badges;
- success treatment;
- warning treatment;
- failure treatment;
- blockchain data treatment;
- document treatment;
- decision controls;
- MCQ controls;
- primary buttons;
- secondary buttons;
- iconography;
- illustrations;
- diagrams;
- tabs;
- disclosures;
- sticky elements;
- mobile patterns.

Compare these interface categories:

```text
Instructional content
MCQ and assessment
Evidence document
Professional business application
Blockchain explorer
Transaction terminal
Decision console
Mobile or device simulation
Instructor platform
```

State whether each category has a distinct visual grammar or whether the same generic card design is used throughout.

## 10. Authenticity-separation audit

For every unique screen, score the following from 1 to 5.

```text
1 = not distinguishable
3 = partly distinguishable
5 = immediately distinguishable
```

Score:

- instruction versus operational application;
- MCQ versus professional decision;
- business evidence versus blockchain record;
- current business state versus ledger history;
- transaction proposal versus committed transaction;
- valid signature versus authorization;
- endorsement progress versus ordinary checklist;
- rejected attempt versus committed ledger transaction;
- desktop application versus mobile field application;
- learner simulation versus ordinary online assignment.

For each score, provide one or two factual sentences explaining the current evidence.

Do not propose a solution yet.

## 11. Interaction-flow documentation

Document the current learner flow as implemented.

At minimum:

```text
Orientation
→ role briefing
→ inspect evidence
→ make decision
→ prepare transaction
→ sign or authorize
→ collect endorsement, where applicable
→ validate
→ commit or reject
→ inspect ledger consequence
→ answer interpretation question
→ receive feedback
→ mitigate, where available
→ continue
→ final causal report
```

Identify:

- where the user moves between instructional and authentic application layers;
- where an MCQ interrupts an operational flow;
- where a business decision becomes a blockchain record;
- where feedback appears;
- where ledger consequences become visible;
- where the interface returns to assignment-style presentation;
- whether screen changes make these transitions obvious.

Create a flow diagram or Mermaid diagram and reference the related screenshots.

## 12. Authenticity boundary documentation

For every blockchain-related screen, record what is genuinely computed and what remains simulated.

Possible real mechanisms include:

- SHA-256;
- canonical serialization;
- digital signatures;
- signature verification;
- authorization evaluation;
- endorsement-policy evaluation;
- state-version validation;
- hash chaining;
- integrity verification.

Possible simulated mechanisms include:

- organizational PKI;
- private-key custody;
- network communication;
- ordering service;
- distributed consensus;
- nodes;
- production identity management.

The description must match the current code.

Do not infer that a mechanism is real merely because the UI displays a value.

Reference the relevant implementation files and tests.

## 13. Screen and component coverage table

Create a final table with one row per screen or state:

```text
Screen ID
Implemented?
Screenshot captured?
Desktop?
Mobile?
Component description complete?
Interaction documented?
Authenticity layers classified?
Code reference included?
```

List planned but unimplemented screens separately.

## 14. Required artifacts

Create this output structure:

```text
artifacts/ui-audit/<short-commit-sha>/
  README.md
  SCREEN_INDEX.md
  SCREEN_CATALOG.md
  COMPONENT_CATALOG.md
  VISUAL_LANGUAGE_MATRIX.md
  AUTHENTICITY_SEPARATION_AUDIT.md
  INTERACTION_FLOW.md
  IMPLEMENTED_VS_PLANNED.md
  SCREENSHOT_MANIFEST.json

  screenshots/
    desktop/
    laptop/
    mobile/
    minimum-mobile/
    annotated/
    components/

  TRACECHAIN_UI_AUDIT.html
  TRACECHAIN_UI_AUDIT.pdf
```

### README.md

Include:

- commit;
- build version;
- deployment revision;
- audit date;
- screenshot browser;
- viewport sizes;
- scenario seeds;
- test accounts;
- known limitations;
- artifact index.

### SCREEN_INDEX.md

Include thumbnail links and one-sentence descriptions for every screenshot.

### SCREEN_CATALOG.md

Contain the complete per-screen documentation.

### COMPONENT_CATALOG.md

Describe reusable components and where they appear.

### TRACECHAIN_UI_AUDIT.html

Create a self-contained report that displays:

- screenshots;
- annotations;
- screen descriptions;
- interaction flow;
- visual-language matrix;
- authenticity scores.

### TRACECHAIN_UI_AUDIT.pdf

Generate from the HTML report.

Make text and screenshots readable at normal PDF zoom.

### SCREENSHOT_MANIFEST.json

For every image, record:

```json
{
  "screenId": "",
  "filename": "",
  "route": "",
  "role": "",
  "scenario": "",
  "mode": "",
  "stage": "",
  "state": "",
  "viewport": {
    "width": 0,
    "height": 0
  },
  "fullPage": true,
  "sourceCommit": ""
}
```

## 15. Packaging for review

Create:

```text
TraceChain_UI_Audit_<short-commit-sha>.zip
```

Include:

- Markdown reports;
- HTML report;
- PDF report;
- clean screenshots;
- annotated screenshots;
- manifest.

Do not include:

- source code;
- node_modules;
- credentials;
- database dumps;
- private keys;
- hidden scenario truth;
- student information;
- unrelated build artifacts.

## 16. Final report to the product owner

Report:

1. Commit and build audited
2. Public deployment match or mismatch
3. Number of implemented screens found
4. Number of unique states documented
5. Number of screenshots captured by viewport
6. Implemented versus planned screens
7. Screens with the strongest visual authenticity
8. Screens where instruction, MCQ, ledger, and decision UI are visually hardest to distinguish
9. Screens where mobile and desktop experiences differ materially
10. Any screens that could not be reached and why
11. Artifact folder path
12. PDF path
13. ZIP path
14. Confirmation that no production UI code was changed
15. Confirmation that no commit or push was performed

Do not provide redesign recommendations in this task.

The deliverable should be factual enough that another UI/UX reviewer can review the complete current experience without running the application.

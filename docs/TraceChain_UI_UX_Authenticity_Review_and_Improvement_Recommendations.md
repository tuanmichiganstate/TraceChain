# TraceChain UI/UX Authenticity Review and Improvement Recommendations

## Overall verdict

Your concern is correct.

TraceChain already has **substantial functional authenticity**. It has real hashes, signatures, authorization, endorsements, transaction states, provenance, rejected audit events, causal reporting, role context, and distinct business-versus-ledger state. It is no longer merely a sequence of MCQs.

However, its **visual and experiential authenticity remains moderate**. Most of the application still looks like one well-designed university web application composed of white cards, rounded borders, standard fields, navy buttons, explanatory text, and vertically stacked forms. The underlying mechanisms are authentic, but the interface does not consistently make the learner feel that they have entered:

- a certifier’s verification system;
- a logistics handoff terminal;
- a processing-plant receiving application;
- a blockchain explorer;
- a regulator’s recall command center;
- or a field mobile application.

The audit reaches the same conclusion. It describes one restrained university-style visual system shared across instruction, MCQs, professional decisions, blockchain data, and instructor administration. The blockchain explorer has the clearest distinct grammar, while professional decisions and MCQs remain visually similar.

## The main issue is not insufficient blockchain data

The strongest parts of the current design are already the domain-specific components:

- signature and authorization summary;
- endorsement progress;
- ledger explorer;
- provenance graph;
- correction lineage;
- counterfactual comparison;
- causal report.

The problem is that these components are usually embedded inside the same general card and page structure used for instructional content and ordinary form controls.

The audit scores support this diagnosis:

- Business evidence versus blockchain record is often **4/5**.
- Current state versus ledger history is often **4/5 or 5/5**.
- Signature validity versus authorization is often **4/5**.
- Endorsement progress versus an ordinary checklist is often **4/5**.
- MCQ versus professional decision is frequently only **2/5 or 3/5**.
- Desktop application versus mobile field application is usually **2/5**.
- Learner simulation versus ordinary online assignment is commonly around **3/5**.

So the conceptual distinctions exist. The visual language does not signal them strongly enough.

## The long assignment page effect

Many important screens are extremely long:

- Stage 5 Challenge decision: approximately 6,200 px high.
- Ledger explorer: approximately 9,000 px high.
- Current-state workspace: approximately 9,100 px high.
- Instructor replay: approximately 7,900 px high.
- Instructor report: approximately 5,700 px high.

That produces a document-reading experience rather than the feeling of operating a professional system.

Even when individual components are strong, the learner experiences them as:

> Scroll down, read a card, complete a form, inspect another card, answer a question, then continue scrolling.

The interaction-flow audit confirms that instructions, professional actions, blockchain processing, and MCQs remain within one page and one typography system. Mobile simply rearranges the same components into one column rather than presenting a distinct field application.

## Recommended design direction

TraceChain should become a **simulation workspace containing several clearly differentiated application layers**, rather than one page containing every type of content.

I recommend four persistent visual layers.

### 1. Learning shell

This contains:

- stage number;
- role;
- mission;
- learning support;
- progress;
- hints;
- glossary;
- brief instructional guidance.

It should be visually light and secondary. It may appear as:

- a slim left rail;
- a collapsible mission drawer;
- a brief overlay when a stage begins;
- or a compact top strip.

It should not occupy the same primary visual space as the operational application.

### 2. Role-specific professional application

The central workspace should look like the system used by the current role.

Examples:

- **Producer:** Lot Registration
- **Certifier:** Certificate Verification Console
- **Transporter:** Logistics Handoff App
- **Processor:** Receiving and Discrepancy Management
- **Factory:** Production Transformation System
- **Regulator:** Recall Command Center

These applications should share a common TraceChain design system but differ in:

- screen title;
- navigation;
- terminology;
- data hierarchy;
- operational controls;
- role-specific status;
- typical documents;
- density and arrangement.

The learner should immediately recognize:

> I am now working in the certifier’s system.

rather than:

> I am now on Question 3 of the assignment.

### 3. Blockchain inspector

Blockchain evidence should occupy a clearly separate, dockable technical surface.

Possible sections:

- Proposal
- Canonical payload
- Digest
- Signatures
- Identity
- Authorization
- Endorsements
- Validation
- Ordering
- Block
- Ledger
- Provenance

This can use a denser visual grammar:

- tighter spacing;
- monospace identifiers;
- structured transaction states;
- darker slate or technical-neutral surfaces;
- chain and block relationships;
- clear immutable/history markers;
- copy and verify actions.

It does not need a stereotypical neon crypto theme. Authenticity should come from data structure, system state, and interaction, not decorative cyberpunk styling.

### 4. Learning checkpoint and debrief

MCQs and academic feedback should be explicitly labeled as a different layer.

For example:

```text
Kiểm tra hiểu biết
```

or:

```text
Learning checkpoint
```

It could open as:

- a right-side drawer;
- a bottom sheet;
- a short interstitial screen;
- or a separate debrief step after the professional action.

It should not use the same large choice rows as a business decision.

A learner should be able to distinguish immediately:

- **Professional decision:** what the organization will do.
- **Knowledge check:** what the learner understands about what occurred.

## Separate professional decisions from MCQs

This is probably the highest-value visual correction.

At present, both commonly use radio buttons, checkbox-style choice rows, a submit button, and feedback beneath the choice.

Professional decisions should instead look like professional workflows.

For example:

```text
Recommended action

[ Suspend the lot ]
[ Continue under review ]
[ Reject the certificate ]

Evidence cited
[ Certificate record ]
[ Issuer registry ]

Rationale
[ Text area ]

Risk level
Low  Medium  High

[ Confirm organizational decision ]
```

The MCQ should remain simpler:

```text
Knowledge checkpoint

What does the valid signature prove?

○ The certificate is factually correct
○ The signed content has not changed
○ The issuer is automatically authorized

[ Submit answer ]
```

These two interfaces should not share the same visual weight or submission language.

## Stage-specific redesign direction

### Stage 2: Producer registration system

Present the task as a lot-registration application:

- lot ID;
- crop type;
- source farm;
- harvest date;
- quantity;
- owner;
- current custodian;
- create-record action;
- transaction receipt after submission.

The blockchain inspector should show the resulting proposal and first block separately.

### Stage 3: Certificate verification console

This should be one of the flagship screens.

Suggested structure:

```text
Certificate document       Verification console
---------------------      -------------------------
Certificate preview        Content hash
Issuer                     Signature status
Validity period             Identity recognition
Certification claims        Authorization
Storage classification      Ledger anchor
```

Then show the organizational decision separately:

```text
Accept, hold, reject, or request review
```

A rejected authorization should feel like a professional system response, not quiz feedback.

### Stage 4: Logistics handoff application

Present sender and receiver as two operational parties:

```text
Sender confirmation
Receiver acknowledgement
Endorsement policy
Handoff status
Custody state
```

The learner should see that the proposal is pending because another organization has not yet endorsed it.

### Stage 5: Plant receiving and discrepancy system

This should be the strongest professional screen.

Use an operational comparison:

```text
Manifest quantity         Scale reading
1,000 kg                  100 kg

Variance
900 kg

Status
Investigation required
```

Then separate:

- incident investigation;
- cause assessment;
- correction proposal;
- endorsement status;
- ledger history;
- effective current value.

Do not stack every element into one long page. Use tabs, split panes, or a case-management workspace.

### Stage 8: Blockchain verification laboratory

This stage can intentionally use the most technical visual grammar:

- block chain;
- transaction digest;
- previous-block hash;
- tampered copy;
- signature verification;
- comparison view;
- integrity status.

This should feel like a forensic or technical inspection console, not another business form.

### Stage 9: Regulator recall command center

Use a regulator-style dashboard:

- contaminated source lot;
- provenance graph;
- affected descendants;
- locations and custody;
- evidence strength;
- recall scope;
- consumer-risk summary;
- authorization status;
- recall commitment.

The provenance graph and recall selection should dominate the screen. Instruction should be secondary.

### Final report

Replace the extremely long report page with a debrief dashboard:

- score summary;
- competency dimensions;
- causal timeline;
- key decisions;
- mitigations;
- remaining consequences;
- expandable technical evidence.

Use a timeline or causal map rather than a long sequence of similarly styled cards.

## Mobile should be more than responsive reflow

The audit correctly states that mobile is currently the same application arranged into one column.

For selected roles, mobile should feel like a field application.

Good candidates:

- producer lot registration;
- transporter handoff;
- warehouse receipt;
- package scanning;
- evidence capture.

A mobile field screen could have:

- role-specific app header;
- location and connectivity status;
- current task;
- scan or select asset;
- evidence attachment;
- signature or confirmation;
- large operational action;
- compact transaction receipt.

Desktop screens should not simply place the entire mobile page inside a decorative phone frame. Use a device frame only when the screen is genuinely intended to represent a field device. Otherwise use a responsive professional application.

## Instructor and author interfaces also need their own grammar

The hosted instructor and author screens currently reuse much of the same generic card, table, form, and button system as the learner application.

They should look like enterprise platform screens:

- persistent navigation;
- filters;
- data tables;
- split panes;
- status summaries;
- timeline/replay controls;
- report drill-down;
- configuration side panels;
- bulk actions;
- audit history.

The instructor report should not be one 5,700 px page. It should become a dashboard with drill-down panels.

The audit also found a real scenario-author defect: the library reloads repeatedly because a default API object is recreated on every render. That should be fixed separately from the visual redesign.

## Recommended visual grammar

| Layer | Recommended visual identity |
|---|---|
| Instruction | Light, spacious, secondary, collapsible |
| Professional application | Role-specific app chrome, operational density, authentic labels |
| Blockchain inspector | Technical, structured, monospace, state-oriented |
| Evidence document | Document-like layout, source and reliability metadata |
| Professional decision | Action, rationale, evidence citations, risk and confirmation |
| MCQ | Explicitly academic checkpoint, compact and separate |
| Mobile field app | Task-focused, large actions, scan/evidence workflow |
| Instructor platform | Enterprise dashboard, tables, filters, replay and drill-down |
| Authoring platform | Editor, validation, preview, version lifecycle |

## What not to do

Do not solve this by:

- making every blockchain screen black;
- adding neon colors;
- placing fake terminal text everywhere;
- adding decorative phone frames to every mobile screenshot;
- hiding instructional guidance completely;
- recreating the full complexity of SAP, Fabric Explorer, or a real warehouse system;
- displaying every hash and signature by default;
- adding animations that slow down repeated work;
- using realism that makes the activity harder to understand.

The goal is **authentic abstraction**.

The interface should resemble professional systems enough to establish context, but remain simplified enough that the learner can focus on the intended decision.

## Recommended implementation priority

### P0: Correct current defects and establish the design baseline

- Fix the scenario-author library render loop.
- Deploy or record the audited commit so production and audit no longer differ.
- Remove hard-coded `vi-VN` number formatting.
- Complete human screen-reader testing.
- Preserve the current audit as the “before” baseline.

The audit was performed at commit `2c20fc6`, while the public deployment still pointed to an older commit.

### P1: Create a visual architecture and prototype benchmark screens

Do not redesign all screens at once.

Prototype:

1. Stage 3 Certificate Verification Console
2. Stage 5 Receiving and Discrepancy Management
3. Stage 8 Blockchain Verification Laboratory
4. Stage 9 Recall Command Center
5. Ledger and transaction explorer
6. Mobile logistics handoff

Test whether students can identify, without explanation:

- which role they are performing;
- whether they are reading instruction or operating a system;
- whether they are viewing business state or ledger history;
- whether they are making a professional decision or answering a knowledge question.

### P2: Implement the shared shell and layer-specific components

Build:

- learning shell;
- role-app shell;
- blockchain inspector;
- evidence document viewer;
- professional decision console;
- assessment checkpoint;
- transaction receipt;
- transaction lifecycle;
- device-app shell.

### P3: Redesign the high-value stages

Implement Stage 3, Stage 5, Stage 8, and Stage 9 first.

These stages contain the strongest distinctions and will establish whether the new visual approach works.

### P4: Extend the system

Then apply the validated approach to:

- remaining learner stages;
- Challenge and Assessment;
- causal report;
- counterfactual replay;
- instructor workspace;
- authoring interface;
- graphical package builder.

## Final judgment

TraceChain does **not** need more blockchain functionality to solve the current immersion problem.

It needs a clearer separation between:

```text
Learn about the task
Operate the professional system
Inspect the blockchain evidence
Make the organizational decision
Demonstrate understanding
Reflect on the outcome
```

The existing implementation already provides the data and state distinctions needed to support this. The redesign should expose those distinctions through different interface grammars, screen structures, and interaction patterns.

The strongest next move is a **coded prototype sprint for the six benchmark screens**, followed by a small learner-recognition test before changing all 112 documented screens.

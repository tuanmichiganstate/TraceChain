# TraceChain Contextual Staff Portraits and Role Presence Implementation

Implement a contextual human-presence system for TraceChain so learners can see the fictional staff member, manager, employee, specialist, or public-agency officer associated with the professional action they are performing.

The purpose is to increase immersion and role clarity. The portraits should help learners feel that they are operating within a real supply chain and interacting with recognizable organizational actors, rather than completing an ordinary online assignment.

This is not a request to place decorative faces everywhere. Portraits must provide role, organizational, evidentiary, or narrative value.

Work from the latest repository state. Preserve the existing simulation engine, command and event model, scenario architecture, scoring, SCORM behavior, hosted-platform behavior, cryptographic evidence, accessibility, and deterministic replay.

This is a single-developer project. Do not create additional branches or pull requests unless direct work on the current branch is technically blocked.

## 1. Product objective

When a learner begins or performs an action associated with a particular professional role, the interface should make the responsible person and organization immediately recognizable.

Examples:

- Farm production manager creating the coffee batch
- Certification officer reviewing and issuing a certificate
- Logistics coordinator preparing a custody transfer
- Receiving manager investigating a quantity discrepancy
- Quality or laboratory specialist providing evidence
- Factory manager approving a correction
- Retail operations staff receiving packaged goods
- Regulatory officer defining and authorizing a recall

The learner should understand:

```text
Who am I acting as?
Which organization do I represent?
What professional responsibility do I have?
Which system or workplace am I operating in?
Who produced or reviewed this evidence?
```

The portrait system must support the broader UI authenticity direction:

```text
Learning instruction
Professional application
Business evidence
Blockchain evidence
Professional decision
Knowledge checkpoint
```

The portrait belongs primarily to the professional application and evidence layers. It should not make the instructional shell or MCQ layer look like a social-media feed.

## 2. Core design principle

Use portraits to reinforce professional context, not to decorate every card.

A portrait is appropriate when it helps identify:

- the current simulation role;
- the responsible staff member;
- the source of a document or statement;
- the person receiving a role handoff;
- the person requesting or approving an action;
- the professional context of a decision;
- the author of an operational message or evidence item.

A portrait is usually not appropriate for:

- generic instructional text;
- glossary entries;
- ordinary MCQs;
- block rows;
- raw transaction hashes;
- technical validation rules;
- every status notice;
- every button;
- every ledger event.

The UI must remain business-first and evidence-first.

## 3. Audit the current implementation first

Before writing production code, inspect:

- scenario organizations and roles;
- simulation-role handoffs;
- stage briefs;
- professional decision components;
- evidence-item metadata;
- transaction proposer and signer displays;
- signature and authorization summaries;
- endorsement handoffs;
- causal reports;
- hosted learner workspace;
- instructor replay;
- scenario-pack schema;
- scenario-authoring interface;
- SCORM package generator;
- runtime asset loading;
- current illustration assets;
- responsive layouts;
- accessibility patterns;
- localization architecture.

Create a short implementation note identifying:

1. Every current role and organization in Guided, Challenge, and Assessment configurations
2. Every screen where a portrait would provide genuine contextual value
3. Screens where a portrait would be redundant or distracting
4. Existing avatar, image, card, media, or evidence-source components that can be reused
5. Whether scenario packs already support media assets and attribution metadata
6. How portrait assets should be bundled so Guided and Challenge packages continue to work offline
7. How portrait references can remain scenario-driven rather than hard-coded in stage components

Do not add portraits directly to individual stage components before defining the shared model.

## 4. Character and staff-profile model

Add a scenario-driven staff-profile model equivalent to:

```ts
interface ScenarioStaffProfile {
  readonly staffProfileId: string;

  readonly displayNameKey: string;
  readonly roleTitleKey: string;
  readonly organizationId: string;

  readonly locationId?: string;
  readonly departmentKey?: string;

  readonly portraitAssetId: string;
  readonly portraitAltKey: string;

  readonly shortProfileKey?: string;
  readonly professionalResponsibilityKey?: string;

  readonly visibility:
    | "LEARNER_VISIBLE"
    | "INSTRUCTOR_ONLY";

  readonly fictional: true;
}
```

Follow existing repository naming conventions rather than these exact names.

Requirements:

- Staff profiles belong to scenario or scenario-pack data.
- Shared UI components must not hard-code coffee-specific people.
- Every referenced organization must exist.
- Every referenced portrait asset must exist.
- Every learner-visible name, title, department, profile, and alt text must have locale keys.
- Staff profiles are versioned with the scenario pack.
- Published staff profiles are immutable with the published scenario version.
- Scenario authors may reuse one staff profile across several related actions.
- The same role may use different staff profiles in another scenario variant.
- One person may hold one clear simulation role within a scenario unless the scenario explicitly explains otherwise.
- The model must not imply that the fictional person is a real employee of a real institution.

## 5. Separate human presence from cryptographic identity

This distinction is mandatory.

A staff portrait represents a fictional human actor in the scenario.

A digital signature represents an educational cryptographic key associated with an organization.

The UI must not imply that:

- the portrait authenticates the transaction;
- the person’s face is used for biometric verification;
- the portrait is the public key identity;
- the photograph proves the person signed;
- the photograph proves the business statement is true.

Use separate labels and visual regions.

Example:

```text
Current staff member
Nguyễn Lan Anh
Certification Officer

Signing organization
Lâm Đồng Certification Authority

Cryptographic identity
Key CERT-LD-01
Signature valid
```

Do not place the portrait inside a signature-verification badge in a way that suggests facial or biometric verification.

## 6. Recommended initial staff roster

Derive the final roster from the actual scenario roles and organizations.

The first release should normally include approximately six to eight fictional profiles, such as:

1. Farm production manager
2. Certification officer
3. Logistics coordinator or dispatch manager
4. Processing-plant receiving manager
5. Factory quality or laboratory specialist
6. Packaging or retail operations manager
7. Regulatory recall officer
8. Optional auditor or compliance reviewer, only where the scenario already uses that role

Do not invent roles that have no action, evidence, or decision in the current scenario.

For every proposed profile, create a roster table containing:

```text
Staff profile ID
Fictional name
Role title
Organization
Location
Stages or actions
Evidence authored or reviewed
Portrait asset
Reason the portrait adds value
```

## 7. Portrait asset policy

Use only approved, fictional, locally bundled portrait assets.

Acceptable sources:

- AI-generated fictional portraits approved by the product owner
- Properly licensed stock portraits with documented rights
- Original commissioned photography with explicit consent and release

Do not:

- scrape images from the web;
- use a real employee’s photograph without documented consent;
- use celebrities or recognizable public figures;
- imitate a specific real person;
- use student or instructor photos;
- embed institutional credentials or access badges that could be mistaken for real credentials;
- use real private information;
- load portraits from third-party URLs at runtime.

Every portrait must include provenance metadata equivalent to:

```ts
interface PortraitAssetMetadata {
  readonly assetId: string;
  readonly sourceType:
    | "AI_GENERATED"
    | "LICENSED_STOCK"
    | "ORIGINAL_WITH_RELEASE";

  readonly licenseOrApprovalReference: string;
  readonly fictionalSubject: boolean;
  readonly filePath: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}
```

The provenance metadata is for authoring and audit. It does not need to appear prominently to learners.

If approved portrait files are not currently available:

1. Implement the scenario schema, asset manifest, shared UI components, validation, and fallback behavior.
2. Create `docs/STAFF_PORTRAIT_ASSET_BRIEFS.md`.
3. Produce one detailed visual brief per required profile.
4. Use clearly marked development placeholders only in local development.
5. Do not ship generic web images or unapproved temporary portraits in release packages.
6. Stop before release packaging and report which approved assets are still required.

## 8. Visual direction for portraits

Use a coherent professional-documentary style.

Recommended visual direction:

- Fictional Vietnamese or regionally appropriate professionals
- Natural workplace or neutral staff-photo lighting
- Professional but not corporate-glamour styling
- Realistic clothing appropriate to the role
- Subtle workplace context where useful
- Calm, competent, approachable expression
- No exaggerated cinematic drama
- No cyberpunk or cryptocurrency imagery
- No text embedded in the photograph
- No visible real-company logos
- No official government emblems unless they are fictional and scenario-approved
- No unsafe workplace behavior
- No stereotypical costume treatment

Use diversity deliberately and responsibly:

- Avoid making all leadership roles male.
- Avoid making all administrative or support roles female.
- Avoid using age, gender, ethnicity, clothing, or appearance as a shortcut for competence or authority.
- Represent professional roles with balanced dignity.
- Keep the character roster internally consistent across the scenario.

Recommended source format:

```text
Aspect ratio: 4:5 or 1:1
Master size: at least 1200 × 1500 for 4:5
Format: WebP for runtime
Color space: sRGB
No embedded text
```

Create optimized runtime variants as needed.

## 9. Scenario-pack asset architecture

Portraits should be scenario-pack assets rather than hard-coded application assets whenever practical.

A package may contain:

```text
scenario.json
tracechain.config.json
media/
  staff/
    farm-manager.webp
    certification-officer.webp
    logistics-coordinator.webp
    receiving-manager.webp
    regulator.webp
media-manifest.json
```

Requirements:

- Portraits must work offline in SCORM.
- Runtime paths must be relative and safe.
- No path traversal is permitted.
- Every referenced asset must be in the manifest.
- Hashes must be verified during package generation.
- Missing or mismatched assets must fail package validation.
- Guided and Challenge packages may use the same portraits or scenario-specific portraits.
- The shared application JavaScript and CSS build must remain identical across packages.
- Portrait media differences must remain external runtime content.
- Hosted deployments may store the same versioned media in object storage, but scenario versions must reference immutable assets.

Extend the SCORM package verifier to check:

- all portrait references resolve;
- hashes match;
- files are local;
- file formats are allowed;
- dimensions are sufficient;
- no runtime external URL is present;
- locale keys exist;
- release packages contain no development placeholders.

## 10. Shared UI components

Create shared components rather than custom portrait markup in every stage.

Use concepts equivalent to:

```text
StaffIdentityCard
ActiveRolePresence
EvidenceAuthorIdentity
RoleHandoffPanel
StaffPortrait
OrganizationIdentity
```

Follow existing repository conventions.

### StaffPortrait

Responsibilities:

- Load the approved asset
- Apply consistent cropping
- Provide accessible fallback
- Prevent layout shift
- Support compact, standard, and briefing sizes
- Support square or 4:5 rendering
- Never expose broken image UI

### ActiveRolePresence

Shows:

- portrait;
- fictional staff name;
- role title;
- organization;
- current professional responsibility;
- optional location;
- clear label such as `Current role` or `You are acting as`.

### EvidenceAuthorIdentity

Use when a document, message, report, or statement is meaningfully associated with a staff member.

Shows:

- compact portrait;
- name;
- role;
- organization;
- evidence creation or review time where relevant.

Do not use it when the source is an automated system, sensor, blockchain, or organization-level record without a specific person.

### RoleHandoffPanel

Shows outgoing and incoming professional contexts.

Example:

```text
Handoff

From
Trần Minh Quân
Logistics Coordinator
Việt Logistics

To
Lê Thu Hà
Receiving Manager
An Việt Processing Plant
```

The handoff panel must remain separate from cryptographic endorsement evidence.

## 11. Recommended placement

### Role briefing

At the beginning of a stage or role change, show a compact role-presence card.

Example:

```text
You are acting as

Nguyễn Lan Anh
Certification Officer
Lâm Đồng Certification Authority

Responsibility
Verify the certificate, issuer identity, authorization, and storage approach.
```

This should visually belong to the professional application, not the MCQ layer.

### Professional workspace header

Use a smaller persistent version near the role-specific application title.

Example:

```text
Certificate Verification Console

Nguyễn Lan Anh
Certification Officer
```

Do not repeat the large portrait in every card below.

### Evidence source

Show the staff profile when a person authored, signed, reviewed, measured, or submitted the evidence.

Examples:

- Laboratory report reviewed by a quality specialist
- Receiving record created by the plant manager
- Recall request issued by the regulator
- Statement from logistics staff

### Role handoff

Use a dedicated handoff state when the learner changes professional role or organization.

This is especially useful for:

- sender to receiver endorsement;
- processor to producer review;
- internal review to regulator recall authorization.

### Decision confirmation

A small identity summary may appear near the final action:

```text
This decision will be recorded for:
Lê Thu Hà, Receiving Manager
An Việt Processing Plant
```

Do not place a large portrait inside the confirmation button.

### Transaction and ledger views

Use portraits sparingly.

A transaction detail may show:

```text
Business actor
Lê Thu Hà
Receiving Manager

Organization
An Việt Processing Plant

Cryptographic signer
ORG_ANVIET_KEY_01
```

Do not add portraits to every ledger row or block. Use organization marks, role labels, and technical identifiers for dense ledger views.

## 12. Stage-specific first-release integration

Integrate the portrait system first into the stages where a human professional is central.

### Stage 2: Farm lot registration

Show:

- farm production manager;
- farm or cooperative organization;
- current responsibility;
- optional farm-location context.

The interface should feel like a lot-registration application.

### Stage 3: Certificate verification

Show:

- certification officer;
- certification organization;
- certificate reviewer identity;
- separate cryptographic signer and authorization information.

This is a flagship use case for distinguishing human role from digital identity.

### Stage 4: Logistics handoff

Show:

- sender or logistics coordinator;
- receiving staff member;
- role handoff;
- endorsement responsibilities.

### Stage 5: Receiving and discrepancy investigation

Show:

- plant receiving manager;
- optional quality or laboratory specialist when evidence is released;
- clear identity of who measured, reviewed, or proposed the correction.

This should help the discrepancy screen feel like a real case-management workflow.

### Stage 9: Recall command center

Show:

- internal operations reviewer before handoff;
- regulatory recall officer after authorized handoff;
- identity of the person issuing the recall decision.

The interface must still show the organization and cryptographic authorization separately.

### Final report

Use portraits only where they help explain the sequence of roles or key decisions.

Do not turn the final report into a staff gallery.

A compact role timeline may be appropriate:

```text
Producer → Certifier → Logistics → Processor → Regulator
```

## 13. Guided, Challenge, and Assessment behavior

### Guided

- Show staff name, portrait, role, organization, and responsibility.
- Role handoffs may include a short explanatory sentence.
- Portraits support orientation and scaffolding.

### Challenge

- Preserve portrait and role identity.
- Reduce explanatory guidance.
- Do not reveal the correct role or decision through portrait placement.
- Do not use a portrait as a visual hint that exposes the intended answer.

### Assessment

- Show only the professional identity information that would realistically be available.
- Do not add coaching text.
- Do not use a portrait to reveal authorization or correctness.
- Keep portrait treatment consistent across answer options and outcomes.

The same profile must not be associated only with correct actions while another profile is associated only with mistakes.

## 14. Hosted platform behavior

Extend portrait support to hosted surfaces where it adds professional context.

Possible uses:

- Learner run workspace
- Role portal
- Instructor replay
- Evidence timeline
- Scenario preview
- Assignment configuration preview

Do not add portraits to:

- user administration tables;
- competency matrices;
- generic reports;
- technical system logs;
- every instructor table row.

Distinguish:

- Application user avatar, if the platform later supports one
- Fictional scenario staff portrait
- Organization identity
- Cryptographic signing identity

These must be separate concepts in the data model and UI.

## 15. Scenario-authoring support

Add authoring support only to the extent required for versioned scenario profiles.

The author interface should allow an authorized scenario author to:

- select an approved portrait asset;
- enter fictional name;
- enter localized role title;
- assign organization;
- add short responsibility text;
- preview portrait crops;
- see where the profile is used;
- validate missing references;
- replace a portrait only by creating a new published scenario version.

Do not build unrestricted image generation or image editing inside TraceChain.

Do not allow authors to reference arbitrary remote image URLs.

## 16. Accessibility

Portraits must not carry essential meaning by themselves.

Requirements:

- Role, name, organization, and responsibility remain available as text.
- Do not communicate authorization, status, or correctness through the portrait.
- Do not embed text inside the image.
- Use appropriate alt-text strategy.
- Prevent duplicate screen-reader announcements.
- Maintain contrast around portrait containers.
- Provide a neutral fallback when an image cannot load.
- Ensure the fallback still identifies the role in text.
- Test at 200% browser zoom.
- Verify keyboard order does not stop unnecessarily on non-interactive images.
- Decorative portraits use empty alt text when the adjacent visible text already fully identifies the person.
- Informative evidence-source portraits may use concise alt text when the image itself adds context.

Recommended alt-text rule:

```text
If adjacent text already states name, role, and organization:
alt=""

If the portrait is the only identification in a compact evidence item:
alt="{name}, {role}, {organization}"
```

Do not describe age, gender, ethnicity, attractiveness, or physical features unless the scenario explicitly and legitimately requires that information.

## 17. Responsive behavior

### Desktop

Recommended sizes:

- Briefing portrait: approximately 88 to 112 px wide
- Workspace identity: approximately 48 to 64 px
- Evidence author: approximately 32 to 40 px
- Role handoff: approximately 56 to 72 px

Use a rounded rectangle or staff-ID style crop rather than defaulting to a social-media circle.

### Mobile

- Keep the portrait compact.
- Do not push the action below excessive introductory content.
- Stack portrait and role text only when width requires it.
- Preserve role and organization text.
- Avoid decorative background images behind form controls.
- Verify at 390 × 844 and 320 × 640.
- Prevent the portrait from covering toast notifications, sticky actions, or the blockchain inspector.

## 18. Performance

Portraits must not materially slow the SCORM activity.

Requirements:

- Use optimized WebP or another approved format.
- Preload only the current or immediately upcoming role portrait.
- Lazy-load portraits not needed above the fold.
- Include width and height attributes to prevent layout shift.
- Avoid loading the full staff roster at original resolution.
- Keep all assets available offline.
- Add a portrait-media budget to package verification.
- Record final package-size impact.

Recommended initial budget:

```text
Runtime portrait per profile:
preferably under 150 KB

Total initial staff portrait set:
preferably under 1.2 MB
```

Adjust only when visual quality or accessibility testing justifies it.

## 19. Privacy, ethics, and representation

Mandatory rules:

- Every person shown is fictional or has documented consent and release.
- No facial recognition or biometric processing is introduced.
- No learner photo is used as a scenario staff identity.
- No portrait is used to authenticate a command.
- No portrait claims that a real institution employs the fictional person.
- No portrait is generated to resemble a named real person.
- Do not use appearance as evidence of trustworthiness, competence, fraud, authority, or correctness.
- Do not associate one demographic group systematically with weak decisions, fraud, manual labor, or subordinate roles.
- Review the complete roster for balanced representation.
- Document asset provenance.
- Make replacement and retirement possible through scenario versioning.

## 20. Fallback behavior

If a portrait asset is missing or fails to load:

- Show a stable neutral silhouette or initials.
- Keep the same reserved dimensions.
- Continue showing name, role, and organization.
- Do not block the simulation.
- Log the missing asset in development and package validation.
- Release packages must fail verification when a required portrait is absent.
- Runtime fallback exists for resilience, not as permission to ship incomplete packages.

## 21. Initial visual asset briefs

Create `docs/STAFF_PORTRAIT_ASSET_BRIEFS.md`.

For each profile include:

```text
Profile ID
Fictional name
Role
Organization
Location
Scenario context
Clothing
Background
Expression
Lighting
Crop
Required portrait variants
Elements to avoid
Alt-text guidance
Asset status
Approval status
```

Example brief:

```text
Profile ID:
STAFF_FACTORY_RECEIVING_MANAGER

Role:
Receiving Manager

Context:
Processing-plant receiving and discrepancy investigation

Visual direction:
Professional factory staff portrait, clean processing environment visible but
softly out of focus, neutral workwear, no real logo, calm and attentive
expression, documentary staff-photo style, 4:5 crop.

Avoid:
Hard hat unless required by the actual environment, dramatic lighting, text,
real company branding, exaggerated industrial grime, clipboard posed as a
stereotype.
```

Do not commit image-generation prompts containing a request to imitate a real person.

## 22. Testing requirements

### Schema and validation tests

Test:

- valid staff profile;
- unknown organization;
- missing locale key;
- missing portrait asset;
- missing asset manifest entry;
- invalid remote URL;
- unsupported format;
- duplicate profile ID;
- profile visibility;
- scenario-version immutability;
- asset hash mismatch.

### Component tests

Test:

- role card rendering;
- compact portrait;
- missing-image fallback;
- decorative versus informative alt text;
- role handoff;
- evidence-author identity;
- long Vietnamese names and role titles;
- English locale;
- no cryptographic-identity confusion;
- no layout shift from missing dimensions.

### Integration tests

Verify:

- Stage 2 profile appears for the farm role.
- Stage 3 profile appears for the certification role.
- Stage 4 handoff shows sender and receiver.
- Stage 5 evidence source and receiving manager are distinct where authored.
- Stage 9 regulator appears only after the authorized role handoff.
- Challenge mode does not reveal the correct decision through portrait presence.
- Assessment mode remains neutral.
- SCORM package works offline.
- Hosted replay reconstructs the same staff profile for the original scenario version.
- Published historical runs retain the profile and image version they used.

### Accessibility tests

Verify:

- no essential meaning is image-only;
- no duplicate announcement;
- correct alt behavior;
- keyboard order remains logical;
- zoom and reflow;
- fallback remains understandable;
- status and authorization remain textual;
- portrait does not cover focused controls.

### End-to-end and visual tests

Capture at minimum:

1. Stage 2 role briefing
2. Stage 3 certificate verification
3. Stage 4 role handoff
4. Stage 5 discrepancy investigation
5. Stage 9 regulator handoff
6. Mobile Stage 4 handoff at 390 px
7. Mobile Stage 5 at 320 px
8. Missing-image fallback
9. Hosted learner workspace
10. Instructor replay showing the historical role identity

Run the existing browser matrix:

- Chromium
- Firefox
- WebKit
- Mobile Safari

## 23. Visual acceptance criteria

The implementation is acceptable when a reviewer can identify, without reading the full stage instructions:

- the current professional role;
- the represented organization;
- the staff member associated with the action;
- when a role handoff has occurred;
- whether the current surface is professional context rather than an MCQ;
- that human identity and cryptographic identity are different.

Portraits must:

- improve role recognition;
- improve narrative continuity;
- remain secondary to evidence and decisions;
- avoid excessive repetition;
- preserve mobile usability;
- preserve accessibility;
- work offline;
- remain scenario-driven.

## 24. Scope of the first release

Implement portrait support for:

1. Stage 2 farm production manager
2. Stage 3 certification officer
3. Stage 4 sender and receiver handoff
4. Stage 5 receiving manager and one evidence specialist where applicable
5. Stage 9 regulator handoff
6. Hosted learner run workspace
7. Instructor replay identity context
8. Scenario schema, asset manifest, package validation, localization, accessibility, and fallback behavior

Do not add portraits to every stage, MCQ, ledger row, report table, instructor table, or administration screen.

After this release, review the benchmark screenshots before expanding portrait use.

## 25. Explicitly out of scope

Do not implement:

- learner profile photos;
- instructor profile photos;
- facial recognition;
- biometric authentication;
- avatar customization;
- animated talking heads;
- lip synchronization;
- AI-generated video;
- voice cloning;
- automatic web-image sourcing;
- real employee directory integration;
- social-media style profile pages;
- a portrait on every transaction row;
- portrait-based correctness cues;
- a second character or dialogue engine;
- a chatbot persona for every staff member;
- unrestricted scenario-author image URLs.

## 26. Documentation

Add or update:

- staff-profile scenario schema documentation;
- media-manifest documentation;
- portrait asset policy;
- fictional-character disclosure;
- accessibility guidance;
- package-verifier rules;
- authoring guidance;
- `STAFF_PORTRAIT_ASSET_BRIEFS.md`;
- implementation status;
- UI authenticity documentation where appropriate.

Add a concise learner-facing disclosure only if needed:

```text
Nhân vật và hình ảnh trong mô phỏng được xây dựng phục vụ học tập và không đại
diện cho nhân sự có thật của các tổ chức.
```

English meaning:

```text
The people and images in this simulation are fictional and do not represent
real staff of the organizations shown.
```

Do not repeat this disclosure on every stage. Place it on the start screen, information panel, or credits.

## 27. Verification and delivery

After implementation:

1. Review the complete diff.
2. Run `git diff --check`.
3. Run schema and scenario validation.
4. Run locale parity and placeholder validation.
5. Run package generation and SCORM verification.
6. Run the complete quality gate.
7. Run the complete Playwright matrix.
8. Verify Guided, Challenge, and Assessment behavior.
9. Verify hosted replay and scenario versioning.
10. Verify offline operation.
11. Measure package-size impact.
12. Confirm no external image requests occur at runtime.
13. Confirm no unapproved assets or temporary placeholders remain.
14. Capture benchmark screenshots.
15. Create one focused commit and push using the repository’s current workflow.

Suggested commit message:

```text
Add scenario-driven staff portraits and role presence
```

## 28. Final report

Report:

1. Starting commit
2. Final commit
3. Staff-profile data model
4. Portrait asset and provenance model
5. Final staff roster
6. Screens and actions covered
7. Screens deliberately excluded
8. Approved portrait assets used
9. Missing assets or unresolved approvals
10. Human versus cryptographic identity separation
11. Guided, Challenge, and Assessment behavior
12. SCORM packaging behavior
13. Hosted-platform behavior
14. Accessibility behavior
15. Responsive behavior
16. Performance and package-size impact
17. Unit, integration, and scenario-validation results
18. Playwright results by project
19. Benchmark screenshots
20. Documentation added
21. Remaining limitations
22. Confirmation that no real personal data or unauthorized real-person imagery was used
23. Confirmation that local and remote branches match
24. Confirmation that the working tree is clean

The implementation is successful when the portraits help learners understand who is acting, where they are working, and what responsibility they hold, while the evidence, decision, transaction, and ledger interfaces remain the primary source of truth.

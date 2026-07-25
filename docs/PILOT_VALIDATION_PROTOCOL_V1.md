# TraceChain pilot and validation protocol V1

Status: implementation-ready protocol for the instructor-ready platform.

## 1. Purpose

This protocol evaluates whether TraceChain improves defensible professional
decision-making and whether instructors can operate the platform without
developer assistance.

It does not treat completion, satisfaction, or a high simulation score as
sufficient evidence of learning.

## 2. Pilot questions

The pilot must answer:

1. Can learners distinguish record integrity from factual truth?
2. Can learners distinguish signature validity, identity recognition,
   authorization, endorsement, and state validity?
3. Do decisions improve from Guided to Challenge?
4. Can learners transfer the reasoning to a pharmaceutical cold-chain case?
5. Which evidence and policies do learners inspect and cite?
6. Are confidence and risk estimates calibrated to the available evidence?
7. Do counterfactual comparisons improve causal explanations?
8. Do instructors apply the rubric consistently?
9. Can instructors create, assign, monitor, review, and export without
   developer help?
10. Can an external author validate and preview a pack without exposing hidden
    state?
11. Is the learner and instructor experience usable with real assistive
    technology?
12. Is the Vietnamese content accurate and professionally natural?

## 3. Participants

Recruit separate, clearly identified groups where practical:

- learners with no prior blockchain study;
- learners with prior blockchain study;
- lecturers who did not build TraceChain;
- a scenario author from another discipline;
- screen-reader and keyboard-only users;
- Vietnamese subject-matter reviewers;
- hosted-platform users; and
- Moodle SCORM users.

Record prior experience as study metadata. Do not infer it from performance.

## 4. Learning sequence

Use this default sequence:

```text
Pre-test
-> Guided coffee
-> Counterfactual exploration
-> Challenge A
-> Pharmaceutical transfer case
-> Post-test
-> Delayed transfer or retention task, when feasible
```

The original assessed run remains immutable. Counterfactual work is exploratory
and must not replace its score.

If an institution needs a comparison group, vary one authored condition at a
time, such as feedback timing or counterfactual access. Preserve exact
configuration, pack, scenario, policy, rubric, and seed identities.

## 5. Core measures

### 5.1 Concept discrimination

Use short pre/post items that separately test:

- hash or signature validity;
- signer recognition;
- role authorization;
- endorsement-policy satisfaction;
- stale state;
- ledger integrity; and
- truthfulness of the source claim.

Avoid items whose only cue is vocabulary used verbatim in the activity.

### 5.2 Decision quality and transfer

Compare:

- authored decision-process evidence;
- rubric ratings;
- relevant evidence citations;
- relevant policy citations;
- initial decision versus mitigation;
- Guided versus Challenge performance; and
- coffee versus pharmaceutical performance.

Do not convert a favorable realized outcome into a better process score.

### 5.3 Evidence behavior

Derive from append-only events:

- evidence inspections;
- policy consultations;
- inspection order;
- evidence cited versus available but not cited;
- decision attempts;
- rejected attempts;
- mitigation actions; and
- elapsed time from run and event timestamps.

Do not interpret an open document as proof that it was understood.

### 5.4 Confidence calibration

Where captured, compare confidence and adverse-event probability estimates
with:

- authored evidence quality;
- rubric-rated decision quality; and
- later revealed information.

Report calibration descriptively until a study protocol defines an accepted
statistical model.

### 5.5 Counterfactual reasoning

Review whether the learner can identify:

- information available at the original decision;
- information revealed later;
- direct intervention effects;
- downstream state effects;
- later-decision effects;
- stochastic outcome effects; and
- consequences that cannot be attributed confidently.

Use the five existing reflection prompts. Do not award a better official grade
for an exploratory branch.

### 5.6 Instructor and author usability

Observe whether a participant can independently:

- provision or select an eligible learner;
- create an exact-version assignment;
- choose a run mode;
- monitor and replay a run;
- follow evidence links;
- apply a rubric rating;
- release feedback;
- export identified and pseudonymous evidence;
- generate a SCORM package;
- import and validate a scenario pack;
- interpret validation errors; and
- preview role-visible content.

Record task success, critical errors, assistance required, and participant
comments. Time-on-task is diagnostic rather than a performance target.

## 6. Rubric reliability

For a reviewed sample:

1. Use at least two independent raters.
2. Hide the other rater's judgment until both submit.
3. Preserve each rating revision and linked evidence.
4. Calculate agreement by criterion.
5. Review disagreements against the rubric wording and evidence.
6. Revise a rubric only as a new version.

Do not average ratings automatically when the rubric does not authorize that
resolution.

## 7. Scenario calibration

For each exact scenario version, review:

- completion and abandonment;
- score distribution;
- decision-option distribution;
- evidence and policy use;
- hint use;
- mitigation frequency;
- common rejection findings;
- time by consequential stage;
- rubric distribution; and
- learner explanation quality.

Compare scenario variants only after checking that they target the same
constructs. Similar average scores do not by themselves prove equivalent
difficulty.

## 8. Accessibility acceptance

Automated accessibility checks remain necessary but insufficient.

Run manual checks with:

- a desktop screen reader;
- keyboard-only navigation;
- 320-pixel reflow;
- browser zoom;
- reduced motion where applicable;
- visible focus;
- status interpretation without color;
- live-region announcement frequency; and
- long technical evidence values.

Record browser, assistive technology, version, locale, route, task, observed
barrier, severity, and reproduction steps.

## 9. Content review

The Vietnamese reviewer should assess:

- technical accuracy;
- professional terminology;
- naturalness;
- ambiguity in decisions and feedback;
- consistency between learner text and actual behavior;
- distinction between real cryptography and simulated identity; and
- appropriateness for the intended educational level.

Use the generated bilingual content-review pack. Content changes must preserve
locale parity and pass the normal locale gate.

## 10. Data sources

Use existing versioned sources:

- assignment JSON or CSV export;
- competency evidence report;
- decision and outcome report;
- counterfactual branch export;
- counterfactual assignment report;
- rubric and moderation history;
- exact scenario-pack content hash;
- exact configuration and seed; and
- SCORM status and score records for Moodle delivery.

Supplement these with pre/post instruments, observed usability tasks, and
accessibility records. Keep external instrument identifiers in the study
record rather than embedding responses in simulation state.

## 11. Privacy and ethics

- Obtain the institutionally required approval and consent before research use.
- Define retention and deletion rules before recruitment.
- Use pseudonymous exports where identified data are unnecessary.
- State explicitly that pseudonymized data are not anonymous.
- Do not expose hidden scenario state or another learner's record.
- Keep teaching access separate from research access.
- Do not add analytics merely because the event log permits them.

## 12. Pilot exit criteria

The platform is ready for broader use when:

- core concept distinctions improve or identified misconceptions have a clear
  remediation plan;
- Guided-to-Challenge transfer can be interpreted without scoring anomalies;
- the pharmaceutical case provides meaningful cross-domain evidence;
- rubric disagreement is understood and acceptable for the intended use;
- instructors complete core tasks without developer intervention;
- no critical assistive-technology blocker remains;
- Vietnamese subject review is complete for released content;
- replay and exports reproduce the exact reviewed evidence; and
- the product team can identify which proposed next feature solves an observed
  problem.

If these criteria are not met, improve content, workflow, or measurement before
adding collaboration, AI, or advanced laboratories.


# TraceChain pilot execution record V1

This record separates repository readiness from evidence that requires real
participants, instructors, subject experts, or assistive-technology users. It
must be completed against one immutable platform baseline.

## Record identity

```text
Record version: 1.0.0
Record status: NOT_STARTED
Protocol version: 1.0.0
Instrument version: 1.0.0 proposed, not approved
Platform release: 2.0.0 development pilot candidate
Source commit: 81ba70c8ccdacc6a73300d4a414ca02a514dd91b
Deployment revision: Sites version 32; Moodle managed activities revision 81
Database schema version: current fresh-install D1 schema, no release label
Scenario schema version: scenario-pack 1.9.0; Audit 3.0.0
Counterfactual schema version: 1.0.0
Accepted package versions: listed under immutable study inputs
Pilot opened at: Not recorded
Pilot closed at: Not recorded
```

`NOT_STARTED`, `IN_PROGRESS`, `PAUSED`, and `COMPLETE` are the only record
statuses. `COMPLETE` requires every approved exit rule to contain linked
evidence.

## Approval evidence

| Approval | Decision | Person or authority | Date | Evidence reference |
|---|---|---|---|---|
| Product owner | Pending | Not recorded | Not recorded | Not recorded |
| Research method | Pending | Not recorded | Not recorded | Not recorded |
| Privacy and ethics | Pending | Not recorded | Not recorded | Not recorded |
| Accessibility plan | Pending | Not recorded | Not recorded | Not recorded |
| Vietnamese subject review | Pending | Not recorded | Not recorded | Not recorded |

## Cohorts

Record counts and recruitment sources without placing participant identity in
this document.

| Cohort | Planned | Consented | Completed | Evidence reference |
|---|---:|---:|---:|---|
| Learners new to blockchain | Not recorded | 0 | 0 | Not recorded |
| Learners with prior blockchain study | Not recorded | 0 | 0 | Not recorded |
| Independent lecturers | Not recorded | 0 | 0 | Not recorded |
| External scenario authors | Not recorded | 0 | 0 | Not recorded |
| Screen-reader users | Not recorded | 0 | 0 | Not recorded |
| Keyboard-only users | Not recorded | 0 | 0 | Not recorded |
| Vietnamese subject reviewers | Not recorded | 0 | 0 | Not recorded |
| Moodle SCORM users | Not recorded | 0 | 0 | Not recorded |
| Hosted-platform users | Not recorded | 0 | 0 | Not recorded |

## Immutable study inputs

| Input | Exact identifier and version | Content hash | Approval evidence |
|---|---|---|---|
| Guided coffee | Standard Coffee 2.3.0 | Recorded in package metadata | Approval pending |
| Challenge coffee | Challenge Bank 2.0.0 | Recorded in package metadata | Approval pending |
| Guided Audit | Guided Coffee Audit 2.0.0 | Recorded in package metadata | Approval pending |
| Practice Audit | Practice Coffee Audit 1.0.0 | Recorded in package metadata | Approval pending |
| Audit Challenge and Assessment | Challenge Coffee Audit Bank 1.0.0 | Recorded in package metadata | Calibration pending |
| Pharmaceutical transfer | `PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER@1.7.0` | Recorded in published pack source | Subject approval pending |
| Counterfactual definitions | Contract 1.0.0, exact source-pack versions | Recorded in source-pack content | Approval pending |
| Rubrics | Exact assignment rubric versions | Recorded at assignment creation | Approval pending |
| Competency definitions | Exact framework and overlay versions | Recorded in evidence exports | Approval pending |
| Pre-test | `P8-CONCEPT-A@1.0.0` proposed | `PHASE_8_PILOT_INSTRUMENTS_V1.md` | Method approval pending |
| Post-test | `P8-CONCEPT-B@1.0.0` proposed | `PHASE_8_PILOT_INSTRUMENTS_V1.md` | Method approval pending |
| Audit observation | `P8-AUDIT-OBS@1.0.0` proposed | `PHASE_8_PILOT_INSTRUMENTS_V1.md` | Method approval pending |
| Usability observation | `P8-USABILITY@1.0.0` proposed | `PHASE_8_PILOT_INSTRUMENTS_V1.md` | Method approval pending |
| Reflection rubric | `P8-REFLECTION@1.0.0` proposed | `PHASE_8_PILOT_INSTRUMENTS_V1.md` | Method approval pending |

## Technical readiness

Technical checks show that the product behaved as implemented. They do not
demonstrate learning effectiveness, content validity, or real accessibility.

| Gate | Result | Exact source or package | Evidence reference |
|---|---|---|---|
| Full repository quality gate | Passed: 798 Vitest and 16 worker tests plus all validators, builds, and package checks | `81ba70c8ccdacc6a73300d4a414ca02a514dd91b` | `PHASE_8_TECHNICAL_BASELINE_2026-07-27.md` |
| Hosted deterministic replay | Passed automated unit, worker, and browser coverage | Exact hosted source tree of `81ba70c8ccdacc6a73300d4a414ca02a514dd91b` | Technical baseline |
| Counterfactual source immutability | Passed automated coverage | Counterfactual contract 1.0.0 | Technical baseline |
| Browser matrix | 154 passed, 14 documented skips, 0 failed | Chromium, Firefox, WebKit, Mobile Safari | Technical baseline |
| Guided Moodle acceptance | Passed and synthetic data cleaned | Guided 2.3.0, Moodle revision 81 | Technical baseline |
| Challenge Moodle acceptance | Passed and synthetic data cleaned | Challenge Bank 2.0.0, Moodle revision 81 | Technical baseline |
| Practice, Assessment, and Audit Moodle acceptance | Passed for all four managed activities and synthetic data cleaned | Moodle revision 81 | Technical baseline |
| Hosted production reachability | Passed HTTP check; Sites version 32 | Exact application source tree | Technical baseline |
| Pharmaceutical hosted acceptance | Automated generic-runtime flow includes bounded evidence acquisition; representative-user acceptance pending | `PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER@1.7.0` | Current quality gate and human pilot required |
| Pharmaceutical SCORM acceptance | Not applicable; no approved pharmaceutical SCORM preset | Not applicable | `PHARMACEUTICAL_TRANSFER_ACCEPTANCE_V1.md` |

## Human evidence

| Question | Approved measure | Result | Evidence reference | Exit rule satisfied |
|---|---|---|---|---|
| Core concept discrimination | Not approved | Not collected | Not recorded | No |
| Guided-to-Challenge transfer | Not approved | Not collected | Not recorded | No |
| Pharmaceutical transfer | Not approved | Not collected | Not recorded | No |
| Evidence-use behavior | Not approved | Not collected | Not recorded | No |
| Confidence calibration | Not approved | Not collected | Not recorded | No |
| Rubric reliability | Not approved | Not collected | Not recorded | No |
| Instructor task completion | Not approved | Not collected | Not recorded | No |
| Counterfactual reflection | Not approved | Not collected | Not recorded | No |
| Assistive-technology usability | Not approved | Not collected | Not recorded | No |
| Vietnamese content validity | Not approved | Not collected | Not recorded | No |

## Findings and product decision

```text
Validated strengths: Not recorded
Observed barriers: Not recorded
Scoring or calibration findings: Not recorded
Content findings: Not recorded
Accessibility findings: Not recorded
Recommended removals or simplifications: Not recorded
Recommended next initiative: Not recorded
Decision authority: Not recorded
Decision date: Not recorded
```

Do not re-rank the product roadmap from this record while its status is
`NOT_STARTED`, while approval fields remain pending, or while required evidence
is missing.

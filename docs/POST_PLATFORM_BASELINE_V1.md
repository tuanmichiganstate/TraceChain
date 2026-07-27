# TraceChain post-platform baseline record V1

**Record status:** Immutable technical pilot candidate; human acceptance
pending.

**Recorded:** 2026-07-27

This record distinguishes an automated repository baseline from human
acceptance. It must not be cited as evidence of learning effectiveness,
disciplinary validity, scenario equivalence, instructor usability, or real
assistive-technology usability.

## Baseline identity

| Field | Recorded value | Status |
|---|---|---|
| Platform release | `2.0.0` development line | Candidate |
| Source commit | `81ba70c8ccdacc6a73300d4a414ca02a514dd91b` | Immutable |
| Hosted deployment | Sites version 32, exact application-source tree | Deployed |
| Moodle deployment | Six managed activities at revision 81 | Deployed and reset |
| Database schema | Current fresh-install D1 schema; no separate release label | Open baseline limitation |
| Scenario-pack schema | `1.9.0` | Implemented |
| Audit schema | `3.0.0` | Implemented |
| Counterfactual contract | `1.0.0` | Implemented |
| Curriculum-overlay schema | `2.0.0` | Implemented |
| Instrument pack | `PHASE_8_PILOT_INSTRUMENTS_V1.md` version 1.0.0 | Proposed, not approved |
| Pilot acceptance date | Not recorded | Pending |

## Automated evidence

The exact source commit passed:

- the complete repository quality gate;
- 798 unit and component tests;
- 16 hosted worker tests;
- deterministic hosted replay and counterfactual immutability coverage;
- scenario, pack, curriculum, locale, content, and evidence validation;
- all eight SCORM package builds and 688 package checks;
- the complete local Chromium, Firefox, WebKit, and Mobile Safari matrix;
- the GitHub Actions quality workflow;
- deployment and file verification for all six managed Moodle activities; and
- Moodle storage, resume, gradebook, relaunch, 4,096-character boundary, and
  cleanup acceptance for those activities.

Exact results and deployment identities are recorded in
`PHASE_8_TECHNICAL_BASELINE_2026-07-27.md`.

## Human acceptance still required

- Product-owner and research-method approval
- Privacy and ethics approval where required
- Learner concept, transfer, decision, and counterfactual evidence
- Instructor and author critical-task observation
- Rubric inter-rater reliability
- Vietnamese subject-expert approval
- Pharmaceutical subject-expert approval
- Real screen-reader and assistive-technology use
- Audit variant difficulty and item calibration
- Product-review decision after the approved evidence is complete

`PILOT_EXECUTION_RECORD_V1.md` remains `NOT_STARTED`. The technical candidate
does not authorize participant recruitment or data collection.

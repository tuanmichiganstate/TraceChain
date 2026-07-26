# TraceChain post-platform baseline record V1

**Record status:** Candidate, not approved for pilot data collection.

**Recorded:** 2026-07-26

This record distinguishes an automated repository baseline from human
acceptance. It must not be cited as evidence of learning effectiveness,
disciplinary validity, or real assistive-technology usability.

## Baseline identity

| Field | Recorded value | Status |
|---|---|---|
| Platform release | `2.0.0` development line | Candidate |
| Source commit | `088576970ae5648447d5baff20d906941b944d46` plus the uncommitted priorities 5, 6, 7, 8, and 11 candidate diff | Not immutable |
| Deployment revision | No deployment was requested or performed for this candidate | Not accepted |
| Database schema version | The current D1 foundation is created directly by `ensureD1FoundationSchema`; it has no separately recorded release version | Open baseline limitation |
| Scenario-pack schema | `1.5.0` | Implemented in candidate |
| Counterfactual contract | `1.0.0` | Implemented |
| Curriculum-overlay schema | `2.0.0` | Implemented in candidate |
| Accepted package versions | Prior evidence records Guided `2.2.0`, Challenge A `1.1.0`, and Assessment `2.2.0`; these are not acceptance evidence for the current working tree | Prior release only |
| Acceptance date | Not recorded for this candidate | Pending |

The source commit must be replaced with the final clean commit before this
record can become an immutable pilot baseline.

## Automated evidence

The repository contains automated coverage for:

- exact hosted replay and role-filtered projection;
- immutable assessed source runs and copy-on-write counterfactual branches;
- scenario-pack schema, semantics, and runtime compatibility;
- deterministic counterfactual metrics and authored decision points;
- competency evidence linked to source events;
- independently owned curriculum overlays and exact framework references;
- no curriculum attainment inference;
- bounded scenario-authored instructor incident release and exact replay;
- stable authenticated assignment deep linking without automatic attempt
  creation;
- event-linked descriptive process analytics with no-trait-inference limits;
- fixed-seed controlled-study metadata and pseudonymous participant exports;
- scenario-authored diagnostic professional consequences;
- SCORM package generation and verification for the supported coffee presets;
- localization parity and automated accessibility rules; and
- browser flows covered by the configured Playwright projects.

The exact results for this candidate belong in the pilot execution record only
after the final quality and browser gates are run against an immutable source
commit.

The uncommitted candidate passed `npm run quality` on 2026-07-26:

```text
Vitest: 77 files, 661 tests passed
Hosted site tests: 13 passed
Scenario contract: 441 checks passed
Platform packs: 2 packs, 11,508 checks passed
Curriculum overlays: 2 overlays, 332 checks passed
SCORM verification: 3 packages, 213 checks passed
```

The quality gate verified the configured 128-test browser matrix definition; it
did not execute that Playwright matrix in this run. The result establishes a
green repository candidate, not an accepted pilot release.

## Human acceptance still required

The following baseline assumptions in `POST_PLATFORM_ROADMAP.md` are not yet
accepted by repository evidence:

- real screen-reader and assistive-technology use;
- Vietnamese subject-expert approval;
- pharmaceutical subject-expert approval;
- rubric inter-rater reliability;
- learner transfer and concept-discrimination findings;
- instructor task completion without developer support;
- pharmaceutical difficulty calibration against coffee; and
- pilot approval under the applicable privacy and ethics process.

Until these are complete, the product is technically pilot-ready only after its
repository gates pass; it is not a validated learning intervention.

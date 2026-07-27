# TraceChain Phase 8 technical baseline

**Recorded:** 2026-07-27

**Application source commit:**
`81ba70c8ccdacc6a73300d4a414ca02a514dd91b`

**Status:** Automated technical baseline complete. Human pilot evidence not
collected.

This record establishes that the selected application build is technically
usable for an approved pilot. It is not evidence of learning effectiveness,
content validity, scenario equivalence, instructor usability, or real
assistive-technology accessibility.

## Hosted deployment

| Field | Result |
|---|---|
| Sites version | 32 |
| Production URL | `https://tracechain-simulation.tuan-michiganstate.chatgpt.site` |
| Application source | Exact tree of `81ba70c8ccdacc6a73300d4a414ca02a514dd91b` |
| HTTP check | 200 |
| Authenticated representative-user acceptance | Pending human pilot |

The Sites source repository uses a deployment merge commit whose tree is
byte-identical to the application source commit. The deployment record does not
replace the GitHub source identity.

## Repository and browser gates

| Gate | Result |
|---|---|
| `npm run quality` | Passed |
| Vitest | 107 files, 798 tests passed |
| Hosted worker tests | 16 passed |
| Scenario schema | 3,414 checks passed |
| Scenario contract | 540 checks passed |
| Platform packs | 5 packs, 26,250 checks passed |
| Curriculum overlays | 2 overlays, 332 checks passed |
| Content review | 2,438/2,438 strings verified |
| Learner evidence audit | 160 fields, no open blocker or high finding |
| SCORM verification | 688/688 checks across 8 packages |
| Shared SCORM application digest | `7c08bb20d161bdadace71e87084831c13223662fc1e3da2f2a9a7018b4b4c4ff` |
| Full local Playwright matrix | 154 passed, 14 documented skips, 0 failed |
| Browser projects | Chromium, Firefox, WebKit, Mobile Safari |
| GitHub Actions | Passed on the exact source commit |

GitHub Actions evidence:
`https://github.com/tuanmichiganstate/TraceChain/actions/runs/30266244531`

Routine CI ran quality, Chromium, and Firefox. The exact commit also passed the
complete four-project matrix locally. The documented skips are existing
project-specific accessibility skips; none was removed for this baseline.

## Moodle deployment and acceptance

The local Moodle demo deployed and reset these managed activities at revision
81:

1. Guided Operations
2. Practice Operations
3. Challenge Operations
4. Operations Assessment
5. Guided Audit
6. Practice Audit

Every deployed ZIP entry was verified against the Moodle content area.

`docker-moodle/run-acceptance.sh` passed for all six activities:

- mid-attempt suspend-data round trip;
- completed-attempt resume;
- score and gradebook communication;
- highest-attempt preservation after a lower second attempt;
- exact 4,096-character storage boundary; and
- cleanup of synthetic attempts and grades.

Audit Challenge and Audit Assessment are generated and package-verified but are
not managed by the six-activity Moodle demo script. They remain calibration
candidates, not accepted high-stakes activities.

## Exact package identities

| Preset | Scenario version |
|---|---|
| Guided Operations | Standard Coffee 2.3.0 |
| Practice Operations | Practice Case 1.0.0 |
| Challenge Operations | Challenge Bank 2.0.0 |
| Operations Assessment | Standard Coffee 2.3.0 |
| Guided Audit | Guided Coffee Audit 2.0.0 |
| Practice Audit | Practice Coffee Audit 1.0.0 |
| Audit Challenge | Challenge Coffee Audit Bank 1.0.0 |
| Audit Assessment | Challenge Coffee Audit Bank 1.0.0 |

All eight packages use the same static application digest recorded above.

## Automated accessibility boundary

Automated coverage passed for keyboard operation, focus visibility, semantic
structure, non-color status, reflow, 200% text size, long technical evidence,
and 320-pixel layouts where the configured project runs the check.

This does not close the human screen-reader gate. VoiceOver with Safari and one
additional pairing remain required under
`ACCESSIBILITY_SCREEN_READER_REVIEW_PROTOCOL.md`.

## Open human gates

- Product-owner and research-method approval
- Privacy and ethics approval where required
- Learner and instructor pilot participation
- Independent rubric ratings
- Vietnamese subject-expert review
- Pharmaceutical subject-expert review
- Real assistive-technology review
- Audit variant difficulty and item calibration
- Approval for consequential or high-stakes use

No participant data were created or inferred while producing this baseline.

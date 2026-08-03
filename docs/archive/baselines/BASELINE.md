# SimuLedger Version 2 release baseline

This record is reproducible from a clean checkout. Commands and results are
recorded only after their output has been inspected. The illustrated learner
experience is sourced from `7eabc16d6f7dffa22403a883b13273cf9c185f0f`.
The exact provenance commit and its GitHub run are reported after that commit is
created and pushed; neither identifier can be embedded in the commit itself.

## Implementation boundaries

| Phase | Commit | Result |
|---|---|---|
| Typed correction domain | `2373e163c38d22fd9bad4acda4305ef62500af16` | accepted |
| Stage 5 shipping-manifest repair | `d06df6ffa6d18cbcb2b0310606085deca5e67000` | accepted |
| Cross-layer scenario contracts | `6ad1e7148ec2e0766f3300004fce92b1379b9bb8` | accepted |
| Deterministic content-review generator | `4408452578ade427a993f6dc6faf009407fb33d0` | accepted |
| Version 2 release verification | `cad625a2d9477afbfb62d900dd3d34d9a70711a0` | local gate accepted; exact-HEAD CI follows the release metadata commit |
| Illustrated learner experience | `7eabc16d6f7dffa22403a883b13273cf9c185f0f` | responsive visual review and full local matrix accepted |

The Phase 3 clean-checkout boundary was verified by GitHub Actions run
`29889480310` at `6ad1e7148ec2e0766f3300004fce92b1379b9bb8`:

- quality job `88826862555`: success;
- e2e job `88826862522`: success.

## Release verification

| Check | Command | Inspected result |
|---|---|---|
| Aggregate gate | `npm run quality` | exit 0 |
| Unit/component | `npm run test` | 372 passed, 21 files |
| Locale parity | `npm run validate:locales` | 539 Vietnamese and 539 English strings |
| Scenario schema | `npm run validate:scenario-schema` | 351 checks |
| Scenario contracts | `npm run validate:scenario-contract` | 233 checks |
| Content review | `npm run verify:content-review` | 539/539, deterministic comparison, exit 0 |
| End-to-end | `npx playwright test` | 58 passed, 2 documented skips, exit 0 |
| Responsive UI review | Playwright-driven desktop and mobile simulation | start, Stages 1–9, 320 px reflow, and stage-entry focus inspected; 0 console errors |
| SCORM | `npm run verify:scorm` | 23/23 checks, 10 files, 843.6 kB |
| Moodle success | `./docker-moodle/run-acceptance.sh` | exit 0; storage, gradebook, highest-attempt grading, 4096-byte boundary, and cleanup passed |
| Moodle forced failure | `SIMULEDGER_ACCEPTANCE_FORCE_FAILURE=1 ./docker-moodle/run-acceptance.sh` | expected exit 1; cleanup passed and no synthetic grade or attempt remained |

The two expected Playwright skips are Safari/WebKit keyboard traversal. Safari
does not move focus with Tab under its default system preference. Keyboard
operability is exercised in every project; only the preference-dependent
traversal assertion is skipped.

The WebKit timeout allowance is limited to the two measured long walkthroughs
in `e2e/activity.spec.ts`; every other test and project retains the 90-second
default. This closes the former broad project-level timeout debt.

The visual review added three locally bundled editorial illustrations: the
farm-to-shelf coffee journey, the Stage 5 manifest/scale discrepancy, and the
Stage 9 laboratory-to-recall investigation. The reference workspace now opens
on demand, the mobile progress header is compact, the supply-chain flow stacks
without horizontal overflow at 320 px, and every stage transition moves scroll
and keyboard focus to the new heading.

## Release artifacts

| Artifact | Provenance |
|---|---|
| SCORM package | `simuledger-scorm-v2.0.0.zip` |
| SCORM source commit | `7eabc16d6f7dffa22403a883b13273cf9c185f0f` |
| SCORM SHA-256 | `de2f314d2224d5897ac128f3f7d6f1b210ddeb0ac800dc6f4eb05b21a902e765` |
| SCORM contents | 10 files, 863,876 bytes (843.6 kB), verifier 23/23; two consecutive rebuilds were byte-identical |
| Content-review artifact | `docs/content-review/simuledger-content-review.html` |
| Content-review source commit | `7eabc16d6f7dffa22403a883b13273cf9c185f0f` |
| Content-review SHA-256 | `6df203b5c5a5fb02f16a96b768f1f76fdb8e1c129ebd88743723ee3a9a2441d7` (231,666 bytes) |
| Content-review parity | 539/539 |
| Content-review status | not reviewed; Vietnamese subject-expert adjudication remains open |

The Version 1 package checksum
`5f2e0225708eefb45d2e6a041980ab6aa6fb3a0f564fa958dc6fb7841447b2bf`
is historical and is not the current package checksum.

**Every checksum in this table is evidence for the Version 2 release at
`7eabc16d6f7dffa22403a883b13273cf9c185f0f`, and is not updated by later work.**
Commits after the release regenerate both artifacts — any change to
`src/locales/` moves the content-review digest by construction — so a checksum
here will not match a later working tree, and is not meant to. What a later
checkout is held to is `npm run verify:scorm` and `npm run verify:content-review`,
which regenerate and compare against the tree they are run in; the manifest at
`docs/content-review/MANIFEST.md` carries the artifact's current digest and the
commit it was generated from. Restating these rows against a newer tree would
destroy the only record of what was actually released and verified.

## Stage 5 and M3 evidence

The committed ledger contains the scripted shipping manifest after custody
transfer and before the Stage 5 sensor event. Its typed metadata declares
`1000 KG`; the learner correction targets the manifest's `declaredQuantity`
and appends `100 KG` without mutating the manifest transaction. Live execution,
replay, learner display, and scoring share the effective-value resolver.

Stage 5 completion requires a committed `RECORD_CORRECTION` transaction for the
specific manifest target. Rejected and unrelated attempts do not complete it,
and a later valid correction cannot reverse completion. The cross-layer
contract suite audits those properties and all `DECISION_RECORDED` completion
conditions for rejected-attempt vulnerability.

M3 is re-evaluated only after the final local matrix and exact-HEAD GitHub jobs
are green.

## Controls and remaining human decisions

GitHub Actions reports `quality` plus Chromium/Firefox `e2e` on pushes and pull
requests. A nightly or manually requested run adds both WebKit shards and Mobile
Safari and reports the complete verdict as `full-e2e`. Required check
enforcement remains unavailable for this private repository on the current
plan. Repository visibility and billing were not changed.

Vietnamese subject-expert adjudication is a separate open human-review item;
this release does not claim it. The terminology question around “quyền lưu giữ”
is recorded in the content-review manifest.

The abandoned `wip/stage5-failed-dispatch-approach` branch and any stash are not
release inputs. Stage 5 uses no `DISPATCH_BATCH`, positional stash reference,
rejected-attempt completion shortcut, `DECISION_RECORDED` completion evidence,
or asset `quantity` shortcut for manifest metadata.

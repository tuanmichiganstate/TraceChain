# TraceChain Version 2 release baseline

This record is reproducible from a clean checkout. Commands and results are
recorded only after their output has been inspected. The exact release commit
and final GitHub run are reported after the immutable commit is created and
pushed; neither identifier can be embedded in the commit that creates it.

## Implementation boundaries

| Phase | Commit | Result |
|---|---|---|
| Typed correction domain | `2373e163c38d22fd9bad4acda4305ef62500af16` | accepted |
| Stage 5 shipping-manifest repair | `d06df6ffa6d18cbcb2b0310606085deca5e67000` | accepted |
| Cross-layer scenario contracts | `6ad1e7148ec2e0766f3300004fce92b1379b9bb8` | accepted |
| Deterministic content-review generator | `4408452578ade427a993f6dc6faf009407fb33d0` | accepted |
| Version 2 release verification | release source commit | local gate accepted; exact-HEAD CI follows the release commit |

The Phase 3 clean-checkout boundary was verified by GitHub Actions run
`29889480310` at `6ad1e7148ec2e0766f3300004fce92b1379b9bb8`:

- quality job `88826862555`: success;
- e2e job `88826862522`: success.

## Release verification

| Check | Command | Inspected result |
|---|---|---|
| Aggregate gate | `npm run quality` | exit 0 |
| Unit/component | `npm run test` | 371 passed, 21 files |
| Locale parity | `npm run validate:locales` | 528 Vietnamese and 528 English strings |
| Scenario schema | `npm run validate:scenario-schema` | 351 checks |
| Scenario contracts | `npm run validate:scenario-contract` | 233 checks |
| Content review | `npm run verify:content-review` | 528/528, deterministic comparison, exit 0 |
| End-to-end | `npx playwright test` | 58 passed, 2 documented skips, exit 0 |
| SCORM | `npm run verify:scorm` | 23/23 checks, 6 files, 134.4 kB |
| Moodle success | `./docker-moodle/run-acceptance.sh` | exit 0; storage, gradebook, highest-attempt grading, 4096-byte boundary, and cleanup passed |
| Moodle forced failure | `TRACECHAIN_ACCEPTANCE_FORCE_FAILURE=1 ./docker-moodle/run-acceptance.sh` | expected exit 1; cleanup passed and no synthetic grade or attempt remained |

The two expected Playwright skips are Safari/WebKit keyboard traversal. Safari
does not move focus with Tab under its default system preference. Keyboard
operability is exercised in every project; only the preference-dependent
traversal assertion is skipped.

The WebKit timeout allowance is limited to the two measured long walkthroughs
in `e2e/activity.spec.ts`; every other test and project retains the 90-second
default. This closes the former broad project-level timeout debt.

## Release artifacts

| Artifact | Provenance |
|---|---|
| SCORM package | `tracechain-scorm-v2.0.0.zip` |
| SCORM SHA-256 | `23d2642811e3a4fd9533bf3fdb4ef99162fe6f22fff95d940842218e2ca9cda3` |
| SCORM contents | 6 files, 137,644 bytes (134.4 kB), verifier 23/23 |
| Content-review artifact | `docs/content-review/tracechain-content-review.html` |
| Content-review SHA-256 | `da1929ac790ea1973b9e10c0bef977edff13c15116277ff84168c19bc800bb75` (226,632 bytes) |
| Content-review parity | 528/528 |
| Content-review status | not reviewed; Vietnamese subject-expert adjudication remains open |

The Version 1 package checksum
`5f2e0225708eefb45d2e6a041980ab6aa6fb3a0f564fa958dc6fb7841447b2bf`
is historical and is not the current package checksum.

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

GitHub Actions reports `quality` and `e2e` on pushes and pull requests. Required
check enforcement remains unavailable for this private repository on the
current plan. Repository visibility and billing were not changed.

Vietnamese subject-expert adjudication is a separate open human-review item;
this release does not claim it. The terminology question around “quyền lưu giữ”
is recorded in the content-review manifest.

The abandoned `wip/stage5-failed-dispatch-approach` branch and any stash are not
release inputs. Version 2 uses no `DISPATCH_BATCH`, positional stash reference,
rejected-attempt completion shortcut, `DECISION_RECORDED` Stage 5 evidence, or
asset `quantity` shortcut for manifest metadata.

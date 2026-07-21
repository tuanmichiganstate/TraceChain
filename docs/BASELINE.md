# Verified baseline

Reproducible from a clean checkout. Every claim below has a command beside it.

**Commit** `fd1bb13d161d3807dbf19fca210e707acbad09bf` · working tree clean

| Check | Command | Result |
|---|---|---|
| Aggregate gate | `npm run quality` | exit 0 |
| Unit/component | `npm run test` | 333 passed, 17 files |
| End-to-end | `npx playwright test` | 14 scenarios × 4 projects → 54 passed, 2 skipped |
| Locale parity | `npm run validate:locales` | 509 keys, vi/en in sync |
| Scenario schema | `npm run validate:scenario` | 348 checks |
| Review pack | `npm run verify:content-review` | 509/509 |
| SCORM package | `npm run verify:scorm` | 18/18, 6 files, 129.6 kB |
| Moodle acceptance | `./docker-moodle/run-acceptance.sh` | success path |
| Moodle cleanup trap | `TRACECHAIN_ACCEPTANCE_FORCE_FAILURE=1 ./docker-moodle/run-acceptance.sh` | exit 1, cleanup ran |

The two e2e skips are WebKit tab traversal: Safari ships with "Press Tab to
highlight each item" off, so Tab reaches nothing. Keyboard *operability* is
tested on all four projects; only *traversal* is skipped.

`validate:scenario` is the scenario **schema and consistency** baseline, not
scenario-contract coverage. It passed throughout while stage 5's manifest did
not exist. Cross-layer contract tests are unimplemented — see
[STAGE5_REPAIR.md](STAGE5_REPAIR.md).

## Commit gating — what it is and is not

`scripts/hooks/pre-commit` refuses a commit whose `npm run quality` is red. It
is versioned, and verified to refuse: staging a deliberate type error produces
`QUALITY GATE FAILED — commit refused`, exit 1, HEAD unmoved.

**It is a local early warning, not a repository-wide control.** Activation lives
in local git config, which a clone does not carry:

    npm run setup:hooks     # git config core.hooksPath scripts/hooks

A fresh clone gets the hook file and does not run it until that is done, and
`git commit --no-verify` bypasses it regardless. **This project has no CI**, so
there is currently no authoritative gate — the honest control hierarchy is:

| Layer | Status |
|---|---|
| Pre-commit hook | present, local, opt-in via `npm run setup:hooks` |
| Pre-push hook | not implemented |
| CI required check | **not implemented — the real gap** |

Until CI exists, a green tip depends on discipline plus this hook, which is
weaker than it sounds. Adding CI that runs `npm run quality` and
`npx playwright test` on every push is the durable fix.

## Artefacts

| | |
|---|---|
| SCORM package | `tracechain-scorm-v1.0.0.zip` |
| Package SHA-256 | `5f2e0225708eefb45d2e6a041980ab6aa6fb3a0f564fa958dc6fb7841447b2bf` |
| Package source commit | `07274457d769af099803a4b2555d3f06ea79ce7b` |
| Review pack | `docs/content-review/tracechain-content-review-2026-07-21.html` |
| Review pack SHA-256 | `3ec8c56f7b2d7f20ea21728320285e32bb6eecc6ae18d3a9ab4000981070dfda` |

### Package provenance

The package was built at `0727445`, not at the baseline commit. Every path
changed between them, in full:

```
docker-moodle/README.md
docker-moodle/acceptance-cleanup.php
docker-moodle/acceptance-force-failure.php
docker-moodle/acceptance.php
docker-moodle/run-acceptance.sh
docs/STAGE5_REPAIR.md
docs/content-review/MANIFEST.md
docs/content-review/tracechain-content-review-2026-07-21.html
package.json
scripts/verify-content-review.mjs
```

None is an input to the learner package: no runtime source, localization,
scenario definition, or packaging script. `package.json` changed only to add
`verify:content-review` to the script list. The list is recorded in full rather
than filtered, so the claim can be re-checked rather than trusted:

    git diff --name-only 07274457d769af099803a4b2555d3f06ea79ce7b HEAD

The stage 5 repair changes runtime source and will require a rebuild and a new
checksum.

## Environments

- **Moodle 5.0.1** (Docker, `docker-moodle/compose.yml`) — package install,
  player render, API discovery at parent depth 1, stage 1→2 walkthrough, and the
  CLI acceptance pass over storage and grading.
- **Moodle 5.2.1** (MAMP) — runtime boundaries only, driven through `window.API`
  because the player never rendered on that install: `suspend_data` refused
  above 4096 with error 405, resume with `entry=resume` and a byte-identical
  payload, score reaching the gradebook. No learner flow and no package
  verifier ran there.

## Status

Six milestones accepted. **M3 reopened**: its exit condition asserted the
scenario ran headless, which it did — over a ledger artifact the scenario claims
exists and never did.

Open: stage 5 domain-and-content repair (blocking); scenario-contract coverage;
deterministic review-pack generator; Vietnamese subject-expert adjudication.

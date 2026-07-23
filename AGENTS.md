# Working on TraceChain

Orientation is in `README.md` — what this is, the layout, the scripts, and the
constraints that break learner data if ignored. Read it first. This file covers
what that one does not: how to verify your work here, and the conventions a
change is expected to follow.

## The gate

```bash
npm run quality
```

Lint, typecheck, unit tests, site tests, locale audit, scenario schema and
contract validation, CI-matrix check, content-review regeneration, build, SCORM
package, package verification — in that order. It must exit 0 before any commit.

A versioned pre-commit hook enforces it (`git config core.hooksPath scripts/hooks`,
installed by `npm run setup:hooks`). `SKIP_QUALITY_GATE=1 git commit …` is the
escape hatch and is for docs-only changes.

Never pipe the gate through `head`/`tail` to read it — that reports the exit
code of the pager, not the gate. Run it, then check `$?`.

## Three ways to believe something passed when it did not

These have each already cost time on this repo.

- **Vitest does not typecheck.** A test file can print "3 passed" while `tsc`
  rejects it for referencing enum members that do not exist. `npm run typecheck`
  is the check, not a green Vitest run.
- **Playwright tests `dist/`, not your source.** If `npm run build` failed — a
  broken throwaway spec is enough to fail `tsc -b` — Playwright happily tests
  the previous build and passes. Confirm the build actually succeeded before
  trusting a screenshot or an e2e result.
- **A test that never failed proves nothing.** For a bug fix or a behaviour
  claim, run the test against the unfixed code first and watch it fail for the
  right reason. Mutation-check assertions that pin a decision (a glyph, a
  direction, an ordering) by reverting the code and confirming red.

## Deploying to the Moodle demo

```bash
./docker-moodle/deploy.sh              # build, package, verify, deploy
./docker-moodle/deploy.sh --no-build   # deploy the package already on disk
```

Docker Moodle on <http://localhost:8080>; see `docker-moodle/README.md`. The
script goes through `scorm_parse()` so the SCORM `revision` is bumped —
without that the browser keeps serving the previous build and your change looks
like it silently failed. It verifies every zip entry against what landed in the
content area, so a half-extracted package fails loudly.

Any PHP run inside the container must use `--user daemon`. Root leaves
root-owned files in `moodledata` that Apache cannot write.

## Conventions a change is expected to follow

**Strings.** No learner-facing text outside `src/locales/`. The validator
enforces it and also rejects Vietnamese in *source comments*, so write comments
in English even when quoting UI copy.

**Bold inside a sentence.** `t()` returns a string, so markup cannot come from
the catalogue. Two established patterns: a separate `…Label` key rendered in
`<strong>` for a leading label (see `start.scoringActionsLabel`), and the
`EmphasisedTerm` helper in `start-screen.tsx` for a term mid-sentence — it keeps
the sentence whole in one key and locates the term inside it. Do not split a
sentence into fragments a translator cannot reorder.

**Numbers in translated sentences** are formatted for the reading locale by
`interpolate` in `src/localization/i18n.ts` — Vietnamese writes 1,2 not 1.2.
Grouping is off deliberately: Vietnamese groups thousands with a full stop, so
enabling it would print "1.000 kg" beside the manifest panel's "1000 kg". With
grouping off an integer formats identically to `String`, which confines the
behaviour to decimals. A test asserts that blast radius.

**Card roles** (`src/styles/base.css`). Every panel in a stage carries one, and
they differ by weight and accent edge, never by hue — green/amber/red mean a
verdict everywhere else and cannot also mean "this is a form".

| Role | Treatment | Reads as |
|---|---|---|
| `card--brief` | navy tint, leading edge, flat | what the step asks of you |
| `card--work` | white, top edge, lifted | where you act |
| `card--reference` | white, flat | what you are reading |

Illustrated narrative cards (`story-card`, `discrepancy--illustrated`,
`recall-briefing`) are exempt; they were already distinct.

**Status pills.** `pass`/`warn`/`fail` carry ✓/⚠/✕; `neutral` carries no glyph,
deliberately — it is the absence of a verdict, so a mark there had nothing to
say. `ClassificationPill` keeps ●/○, which must survive being read in one hue.
`status-pill.test.tsx` holds this.

**Provenance arrows point down.** Every relationship label ends in "into" and
the asset it goes into is on the next line; both chains run oldest to newest
down the page. `provenance-viewer.test.tsx` holds direction and ordering.

## Claims the interface makes to learners

The activity now tells a class, in as many words, that the hashing is real
SHA-256 computed from the records themselves — in the ledger explorer, at the
stage 8 tamper conclusion, and on the stage 3 certificate.

That is true and verified: `hash-authenticity.test.ts` recomputes every block
and transaction digest with Node's own `crypto`, so swapping the vendored
implementation for a stub cannot satisfy both sides. `sha256.test.ts` separately
proves the primitive against the FIPS 180-4 vectors.

**Do not weaken any of that without changing the copy in the same commit.** What
is real: block, transaction, asset-state and document-content hashes; the chain
linkage; integrity verification; canonical serialization; Ed25519 signing and
signature verification over canonical transaction proposals. What is simulated
and labelled as such: organizational identity, educational key custody,
certificate issuance, endorsements, the network and ordering service. Absent
entirely: proof of work, mining, cryptocurrency, and any Merkle tree — a block
commits to the flat list of its transaction digests.

One subtlety if you touch hashing: a transaction's digest fixes its timestamp at
**ordering**, not at sealing. Reconstruct the payload from `orderedAt ??
createdAt`, as `integrity.ts` does.

## Open, and deliberately not done

- **Real screen-reader QA has never been run.** Roles, names and reading order
  are correct by construction and by axe, which is not the same thing.
- **No Vietnamese subject-expert review.** All copy to date is unreviewed by a
  domain teacher. `docs/content-review/` regenerates a bilingual pack for this.
- **`toLocaleString("vi-VN")` is hardcoded** — `grep -rn toLocaleString src/`
  finds both sites, in `provenance-viewer.tsx` and `asset-card.tsx`. Those two
  quantities ignore the active locale. Known; the fix is to route them through
  the translator like everything else.
- **Attempts completed under the old stage-wide hint policy** display scores
  recomputed under the current item-scoped one.
- The Moodle demo (cmid=2) carries leftover test attempts.
- Branch protection is unavailable on the current GitHub plan, so `master` is
  protected by the pre-commit hook and CI alone.

## Git

`master` is the default and small green changes land on it directly.
Multi-commit or exploratory work branches. Do not commit or push unless asked.
Trailer: `Co-Authored-By: <model name> <noreply@anthropic.com>`.

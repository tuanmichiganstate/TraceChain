# Architecture

## Layering

```
Presentation (React)
    ↓  commands only, never direct state mutation
Application services (session reducer, providers)
    ↓
Domain model and rule engine          ← pure, synchronous, no React
    ↓
Ledger adapter (SimulatedLedger)      ← the seam for Tier 2 and Tier 3
    ↓
Persistence adapter
    ↓
SCORM 1.2 / standalone storage
```

## Invariants

These are load-bearing. Breaking one breaks replay, testing, or both.

**The domain reducer is pure and synchronous.** `reduce(state, event) => state`
never hashes, never reads a clock, never imports React. This is why attempt
replay is deterministic and why every domain test is a plain function call.

**Hashes are metadata, never inputs to state transitions.** They are computed
*after* the reducer runs, at the ledger commit boundary, behind an injected
`HashFunction`. Nothing in the reducer depends on a digest.

**Time comes from the scenario clock, never the system clock.** Domain events
take their timestamps from `SCENARIO_TIMELINE`. A learner in Hanoi and a
learner in Berlin produce byte-identical hashes. System time is used only for
SCORM session time and elapsed-time analytics.

**Nothing is persisted that can be recomputed.** No asset snapshots, no
transaction bodies, no hashes, no blocks. Only the learner's decisions.

**Components depend on the adapter interface, not on arrays.** That is what
lets `ServerLedgerAdapter` and `FabricLedgerAdapter` drop in later. See
`docs/FUTURE_LEDGER_ADAPTERS.md`.

**The acting identity comes from the call, never from a stored default.** Rules
receive `ValidationRegistries` (who exists on the network) separately from the
`CommandContext` (who is acting now). These were one object until Milestone 2,
and the consequence was severe and silent: the engine spread a static context,
so every rule validated the *same* organization's permissions regardless of who
actually submitted the transaction. With one actor it was invisible; with seven
it made authorization meaningless. Splitting the types makes the mistake
unrepresentable.

**Stage completion conditions are monotonic: once true, true forever.** They
read history and existence -- transactions committed, questions answered, assets
created -- never mutable status. An earlier `ASSET_LIFECYCLE_STATUS` condition
broke this and the failure was severe: stages 5, 6 and 7 required assets to be
in states that the stage 9 recall then overwrote with RECALLED, so three
completed stages silently un-completed themselves and the learner could never
finish. The condition shape no longer exists.

**Seeded assets and seeded transactions are different things.** Seed assets are
genesis state -- the world the learner walks into -- and carry no transaction,
so the learner's own first transaction is genuinely in the first block. Seed
transactions replay through the real pipeline and are indistinguishable from
learner history, which is what makes the pre-committed dispatch error
uneditable.

---

## Deviations from the specification

Each of these is deliberate. The reasoning is recorded so a future maintainer
can re-litigate it with the facts rather than guess.

### 1. Vendored synchronous SHA-256 instead of `crypto.subtle` (§15.1)

`crypto.subtle.digest` was rejected for two reasons:

- It is **asynchronous**. Hashing is reachable from the commit path, from replay
  on load, and from integrity verification. Making it async forces `await`
  through all of those and into every test, for no behavioural gain.
- It is **undefined outside a secure context**. A Moodle instance served over
  plain HTTP — common on university intranets — would lose the entire ledger
  with no recovery path, and §15.1 forbids shipping the fallback in production.

`src/infrastructure/hashing/sha256.ts` produces byte-identical output and is
verified against the published FIPS 180-4 vectors *and* differentially against
Node's OpenSSL-backed implementation across block boundaries and multi-byte
UTF-8. `TextEncoder`, unlike `crypto.subtle`, has no secure-context requirement.

### 2. Nine stages instead of ten (§8)

Original stages 4 and 5 are merged into `STG_04_SHIP_AND_MONITOR`. Both are
logistics, and the custody handoff *is* the moment transport begins. All twelve
learning objectives in §2.2 survive; what was cut is repetition, to protect the
30–45 minute budget in §2.4.

### 3. `ORDERED` and `COMMITTED` given distinct meanings (§12, §15.6)

The specification left these in conflict: `STAGE_BOUNDARY` commit mode means
blocks form when a stage ends, yet §8.2 says the first transaction's commit
creates block 1 immediately. And `maxTransactionsPerBlock: 2` had no stated
flush algorithm for a stage emitting three or more transactions.

- `ORDERED` — accepted by the ordering service, in the pending queue. The event
  has been applied to world state, because the outcome is already determined.
- `COMMITTED` — sealed into a block, hash-linked to its predecessor.

At a stage boundary the queue drains into blocks of at most
`maxTransactionsPerBlock`, in order. Stage 2 seals immediately, because watching
a block form is that stage's entire purpose. The pending queue is shown to the
learner rather than hidden — ordering and commitment really are separate steps.

### 4. `VERIFY_PRODUCT` removed from `TransactionType` (§11)

Reading the ledger is a query, not a state change. Writing a transaction per
consumer scan had no corresponding past-tense event in §11, contradicted the
data-governance lesson in §25, and would pollute the ledger the learner is about
to inspect. Stage 8 verification is a read-only projection.

### 5. `learnerReference` not persisted (§21.3)

`hash(studentId + attemptId + scenarioId)` is a pseudonym, not anonymization —
student IDs are low-entropy and brute-forcible — and the LMS already knows
exactly who the learner is. Persisting it would spend 64 of 4096 suspend-data
characters for no benefit. The rule that matters, *no student identity on the
ledger*, is unchanged and is asserted by a test.

### 6. Corrections to blocking defects

| Defect | Correction |
|---|---|
| `RULE_TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT` compared raw numbers, so packaging 82 KG into 820 UNIT failed (`820 > 82`) and blocked stage 7 | `src/domain/units/convert.ts` normalizes to grams; `packageSizeGrams` added to `SupplyChainAsset` |
| §8.3 named `RULE_AUTHORIZED_CERTIFIER_REQUIRED`, §13.3 named `RULE_CERTIFIER_AUTHORIZED` for the same rule | Kept `RULE_CERTIFIER_AUTHORIZED` |
| §8.4 required rejecting a custody transfer that also moves ownership, but no rule existed to do it | `RULE_OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER` added (implemented in Milestone 2) |
| No `Location` entity despite `currentLocationId` and `RecallLocation` | `Location` model + `LOC_` prefix + five seeded locations |
| No scenario timeline, though three rules depend on ordered times | `src/scenarios/coffee-traceability/timeline.ts`, checked by `npm run validate:scenario` |
| `ScenarioDefinition` had only `seedAssets`, insufficient for committed authored history and distractor provenance chains | Added `seedTransactions` and `seedProvenanceEdges`; learner-dependent authored history uses deterministic `scriptedTransactions`, all through the real pipeline |

### 7. Additions the specification did not require

- **Review-mode guard.** `cmi.core.lesson_mode` and `cmi.core.credit` are read
  at initialization; all writes are suppressed in review or no-credit mode.
  Without this, relaunching a completed activity overwrites a good grade.

  Suppressing the writes is only half of it. `PlatformInitializationResult`
  carries `isReadOnly` into session state, so the interface knows too: the
  learner is told the attempt is read-only, the answer, hint, transaction and
  submit controls are disabled, and the save indicator is hidden — it reports
  success precisely because nothing was written, which is the one claim a
  learner in review mode must not be given. A guard the learner cannot see
  protects the grade and wastes their hour.

- **SCORM interactions are reporting, never state.** Answering a knowledge
  check writes `cmi.interactions.n` for the instructor's benefit. SCORM 1.2
  makes interactions **write-only** — they cannot be read back — so the attempt
  is always rebuilt from `cmi.suspend_data` alone. Responses are recorded as
  identifiers rather than translated labels, so a report means the same thing
  in either language.
- **Mock SCORM API** (`test/scorm-mock/`) enforcing the real 4096-character
  `suspend_data` ceiling, the 255-character `lesson_location` limit, the
  `lesson_status` vocabulary, and the session-time format. A suspend-data
  overflow fails CI rather than surfacing in front of a class.
- **Suspend-data budget test.** A pessimistic full attempt must encode to under
  3800 characters. Currently ~180.
- **One `aria-live` announcement per transaction**, not seven. The animated
  pipeline indicator is `aria-hidden`; the steps are a static ordered list.

---

### 8. Blocks link by their stored digest, not a recomputed one

`verifyIntegrity` checks each block twice and independently: its recorded digest
must match a recomputation of its contents, and the next block's recorded link
must match its digest. Because the two together leave nothing uncovered, the
linking value decides only *how many* blocks a single edit flags — never whether
tampering is caught.

Linking against the recomputed digest is the more obvious reading of "never
trust stored data", and it was left open through Milestone 5 as a decision to
take deliberately. Taken: **keep the stored digest.** It flags strictly more.
A forged block digest with untouched contents currently produces two findings —
the block fails its own check and its successor fails the link — where
recomputed linking would report only the first, because recomputation would
quietly "repair" the value the successor is compared against.

It also keeps the stage 8 escalation legible, with each step failing a
different layer: edit the quantity and the transaction fails its digest; forge
that digest and the block fails its own; forge the block digest and the next
block's link fails. Under recomputed linking the second and third steps
collapse into one, and the demonstration stops being able to show that there is
nowhere for the forgery to stop.

## Accessibility

Section 26's requirements are asserted in `src/app/accessibility.test.tsx`
rather than audited once and left to rot. A refactor that breaks the document
outline now fails CI.

What is tested:

- **One `h1`, in both the start screen and the running workspace.** The running
  workspace used to open at `h2` because the application title sat in a `span`,
  so navigating by heading landed inside the first stage with nothing above it
  naming what you were in.
- **No skipped heading level** anywhere in the workspace.
- **Every control has an accessible name**, and **no duplicate element ids** —
  a duplicate silently breaks every `aria-labelledby`, `aria-describedby` and
  `label for` pointing at it, because the reference resolves to whichever
  element comes first. Checked on stage 1 *and* on stage 5: stage 1 renders one
  of everything, so it could never catch the case that actually occurred —
  `TransactionPipeline` and `ValidationResults` hard-coded their heading ids and
  a stage showing three transaction panels issued each of them three times.
- **Exactly one `main` landmark**, and the skip link targets it.

What was verified in a real browser rather than jsdom, which has no layout:

- **Contrast.** Zero failures against WCAG AA (4.5:1 body, 3:1 large) across
  the workspace and all five reference panels.
- **Reflow at 320 px.** No horizontal scroll and no overflowing element, now
  asserted at three points in the activity rather than one. Measured in a real
  320 px viewport, because media queries then evaluate as they would on a phone
  — a probe `div` at 320 px inside a desktop window does not work, it keeps the
  desktop breakpoints and under-reports.

  **Stage 1 alone was not enough, and the gap shipped.** It has no transaction,
  so it renders no validation results, and the rule identifiers those carry are
  unbreakable 29-character tokens: every stage from 2 onwards scrolled sideways
  at 320 px while the suite stayed green. A second failure hid behind the same
  blind spot — a `fieldset` will not shrink below its min-content width unless
  told to, so the recall question's identifier-laden options set a floor no
  phone could meet. Both are fixed in `app.css`, and the reflow suite now walks
  to stage 5 on every engine and to the recall question on Chromium alone —
  fieldset sizing is CSS box behaviour rather than an engine quirk, and a fourth
  full walkthrough would put the WebKit suite back over the budget reclaimed
  above.
- **Focus.** `:focus-visible` carries a 3 px navy outline at 2 px offset,
  applied globally in `base.css`.
- **Reduced motion.** `prefers-reduced-motion: reduce` collapses the pipeline
  step duration to zero and neutralises animation and transition durations.

Colour never carries meaning alone: every pill pairs its colour with a distinct
glyph and a text label, so status survives greyscale, colour blindness and a
screen reader. The glyph is `aria-hidden`, so what is announced is the label.

**Verdicts and classifications are different components on purpose.**
`StatusPill` carries `pass`, `warn`, `fail` and `neutral` — answers to "was this
right". `ClassificationPill` carries `affected` and `unaffected` — an answer to
"did the contamination reach this lot", which is a fact about the goods. Stage 9
first used the verdict tones for it, so a learner who correctly identified
contaminated stock was handed a rejection cross for getting it right. Two types
rather than one widened union, because `validation-results.tsx` and
`transaction-history.tsx` both map a status enum onto `StatusTone`, and those
maps only mean anything while every member of it is a judgement.

Some things are neither. Stage 5's discrepancy panel puts a declared quantity
beside a measured one, and no pill fits: the manifest passed every rule when it
was filed and is inaccurate rather than invalid, and a scale reading is not a
validation outcome. The two figures are plain text under labels that say where
each came from, and the disagreement between them is written out. Colour there
follows the palette's ledger and physical-world meanings, with amber kept for
the mismatch.

### Three levels of accessibility evidence, not one

These are not interchangeable, and the difference is worth keeping visible:

1. **Automated assertions** (`src/app/accessibility.test.tsx`, `e2e/accessibility.spec.ts`)
   — the document outline, accessible names, unique ids, keyboard operability
   and 320 px reflow, on every commit. Stage 1 *and* stage 5, because stage 1
   renders one of everything and therefore could not catch a duplicate id.
2. **Accessibility-tree inspection** — ARIA snapshots taken during review to
   confirm reading order, that decorative glyphs are absent from the tree, and
   that live regions announce once. Useful, and still only a model of what
   assistive technology would do.
3. **A real screen reader** — VoiceOver, NVDA or equivalent, driven by a person.

**Open release QA item: run one complete stage 5 and stage 9 flow with a real
screen reader before the next formal release.** Levels 1 and 2 have been done
for the current work; level 3 has not, and nothing in levels 1 or 2 substitutes
for it.

## End-to-end testing

`npm run test:e2e` runs the Playwright suite in **Chromium, Firefox, WebKit and
an iPhone SE profile** — 18 scenarios each, 72 in all. They run against
`dist/`, the artefact that actually ships, not the dev server.

The unit and component suites already drive all nine stages in jsdom, so these
deliberately do not re-assert domain behaviour. They cover what only a real
browser can answer: layout, focus, real event ordering, a genuine page reload,
and whether four engines agree.

Everything is located by accessible role and visible Vietnamese text, never by
CSS class or test id. If a locator stops resolving, either an accessible name
changed — which a screen-reader user would also notice — or the interface moved.
A test id would hide both.

`e2e/scorm-harness.ts` installs a SCORM 1.2 API via `addInitScript`, which has
to run before the bundle loads: the adapter looks for `window.API` in its first
effect, so anything injected later arrives after the application has already
fallen back to standalone. The harness enforces the same two constraints real
Moodle does — `suspend_data` refused past 4096 characters with error 405, and
every call refused after `LMSFinish` — and logs writes, so a test can assert
review mode wrote *nothing at all* rather than merely wrote nothing harmful.

**Two scenarios are skipped on WebKit, and it is not a defect here.** Safari
ships with "Press Tab to highlight each item on a webpage" turned off, so Tab
moves focus nowhere: a probe against this build found focus still on `BODY`
after six presses, while Chromium reached the start button on the first. Users
who rely on the keyboard turn full keyboard access on. Keyboard *operability* is
covered on every engine; only Tab *traversal* is platform-dependent.

`test:e2e` is deliberately not part of `npm run quality`: it needs browser
binaries that a fresh clone does not have. Run `npx playwright install` once,
then it takes about 25 seconds for all four engines.

### How the suite is run in CI, and why it is shaped that way

Three durable constraints, none of them obvious from the workflow alone:

**One Playwright worker per runner, and that is measured.** The GitHub-hosted
runner is 2-core / 7 GB, so Playwright's `ceil(cores / 2)` default selects a
single worker. Two workers on one runner was tried against real CI and was worse
on both counts — slower, and three failures plus a flake with 90-second click
timeouts, two browsers starving each other on two cores. Retries then pay for
the contention a second time. Parallelism has to come from more runners, not
more workers per runner.

**One runner per browser project.** Each matrix job installs only the engine it
launches and runs one project, so the four run side by side instead of end to
end. `mobile-safari` is an iPhone SE profile that Playwright drives with WebKit,
which is why the matrix carries a separate browser column: the project and the
engine are not the same thing.

**WebKit is split across two shards, because it alone sets the duration.** On
this runner WebKit costs roughly five times what the same tests cost on Chromium
or Firefox — a gap that does not appear locally, where all four engines are
within a few seconds of each other. Every matrix entry carries a shard so the
command needs no conditional; `1/1` is the whole project. Sharding partitions
tests, it never drops them, and the totals are checked against the single-job
figures.

`fail-fast` is off: most of what this suite exists to answer is whether a break
is engine-specific, and stopping the other browsers on the first failure hides
exactly that. Each job uploads its report under its own name, since several jobs
writing one artifact name would collide.

A separate `e2e` job runs no tests and only reports whether every browser job
passed. It exists so that one stable name can be depended on — by a required
check, or by a reviewer skimming the list — rather than four that change
whenever a project is added or sharded. It is verified to go red when any single
browser job does.

## Dependencies

Zero runtime dependencies beyond `react` and `react-dom`. Each omission is
deliberate (§36 requires every major dependency to be justified):

| Need | Decision |
|---|---|
| i18n | ~40-line `t()` over a flat JSON map |
| State | `useReducer` + context; the domain is already a reducer |
| Graph rendering | Semantic HTML + CSS — §18.9 says avoid a graph library |
| Dates | Fixed ISO strings + `Intl.DateTimeFormat` |
| Hashing | Vendored SHA-256, ~150 lines |
| Fonts | System stack; renders Vietnamese correctly at zero bundle cost |
| SCORM ZIP | `adm-zip`, dev-only |

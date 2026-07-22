# Scoring model

100 points, 70 to pass. Six competency components, allocated by what the learner
demonstrates rather than by which screen they were on.

| Component | Points | Where the marks are |
|---|---|---|
| Transaction accuracy | 25 | Creating (4), custody scope (6), receiving (3), transforming (4), packaging (3), ownership transfer (5) |
| Traceability completeness | 20 | Transformation provenance (8), hash-chain integrity (7), dispatch (5) |
| Data governance | 15 | Storage choice (5), issuer authority (5), classification (5) |
| Compliance and correction | 15 | Sensor threshold (5), the correction transaction (10) |
| Recall performance | 20 | Recall scope precision (15), committing the recall (5) |
| Conceptual understanding | 5 | Blockchain versus a database (5) |

The allocation lives in `stages.ts`, item by item. `npm run validate:scenario`
checks each component's items sum to its declared budget, so a mistake there
fails the build rather than quietly changing what the activity is worth.

---

## What the score is computed from

```
interactions  ->  decisions  ->  score
```

- **Interactions** are the full record of what the learner did, kept in memory
  for the final report.
- **Decisions** are the compressed projection — option chosen, attempts taken —
  and the only part persisted, because the SCORM budget is 4096 characters.
- **Score** is a pure function of decisions and hints. Never a running total.

That last point is what makes reproducibility (§19.3) real rather than
aspirational: a learner who resumes gets the identical score they left with,
because it is recalculated rather than restored. A test asserts exactly that
round trip through the state codec.

## The deduction ladder

| Situation | Credit |
|---|---|
| Correct first attempt | 100% |
| Correct on the second | 80% |
| Correct after a hint | 70% |
| Correct after several | 60% |
| Never correct | 0% |

A hint is treated as no worse than a second attempt: a learner who asks for help
before guessing should not do worse than one who guesses twice.

**A hint caps the items it names, and nothing else.** Every hint declares
`targetScorableItemIds`: the scorable items its text genuinely assists. Opening
it caps exactly those at `afterHintCredit`, and the scenario validator holds
each target to a real, uniquely-named scorable item in the hint's own stage.
Nothing is inferred from stage membership.

Four consequences, none of them obvious enough to leave unwritten:

- **The cap is retroactive** for a targeted item. Score is a pure function of
  decisions and hints, so it cannot depend on which came first: opening a hint
  after answering that item correctly still lowers it to 70%.
- **A second hint on the same item costs nothing further.** The cap is a
  ceiling, not a deduction, so it cannot apply twice.
- **Items already below the ceiling are untouched** — an item on its third
  attempt is at `multipleAttemptCredit`, which is lower, and an item never
  answered correctly is at zero. A cap can only lower credit that exists.
- **Everything else keeps full credit**, including other items in the same
  stage. The learner is told which activities a hint will affect, the ceiling,
  and the points still at stake, before deciding to open it — all three derived
  from the same configuration the engine applies, so the figure shown cannot
  drift from the figure charged.

Multi-item hints are represented by listing more than one target, and are
allowed only when the hint's text genuinely helps with each. No hint in the
coffee scenario currently needs one.

### The decision, and why

Hints were originally scoped by stage: opening one capped every scorable item
around it. That was never written down as a choice, and it produced results
nobody would have chosen deliberately. Stage 9's hint says to follow provenance
links rather than trust a product name — help with one 15-point question — and
it also repriced the recall transaction and an entirely separate question about
whether a blockchain is warranted at all. Seven and a half points for help with
four and a half points' worth of difficulty.

**Decided: hints cap only the items they support.** Two alternatives were
considered and rejected. Keeping the stage-wide rule is simple and was already
tested, but charges a learner for work the hint did not touch, which is the
hardest kind of mark to defend when a student asks. Making the cap apply only to
work completed after the hint was opened fixes the retroactivity but not the
scope, and would need scoring to gain a chronology it does not have — the codec
stores decisions, not their order relative to hints, so it would cost a saved
state schema bump for the smaller half of the problem.

Retroactivity is kept deliberately. Without it, "answer first, then open the
hint to check" would be free, and the hint would stop being a considered choice.

### What it cost, and what happened to attempts in flight

Across a perfect attempt using every hint, the maximum loss falls from 22.5
points to 13.2. Per hint:

| Hint | Stage | Targets | At risk |
|---|---|---|---|
| `HINT_CREATE_BATCH_FIELDS` | 2 | `INT_CREATE_BATCH` | 1.2 |
| `HINT_CERTIFICATE_STORAGE` | 3 | `INT_CERTIFICATE_STORAGE_CHOICE` | 1.5 |
| `HINT_CUSTODY_VERSUS_OWNERSHIP` | 4 | `INT_CUSTODY_TRANSFER_SCOPE` | 1.8 |
| `HINT_CORRECTION_MECHANISM` | 5 | `INT_CORRECTION_RECORDED` | 3.0 |
| `HINT_TRANSFORMATION_YIELD` | 6 | `INT_TRANSFORM_BATCH` | 1.2 |
| `HINT_RECALL_PROVENANCE` | 9 | `INT_RECALL_SCOPE` | 4.5 |

**No migration is needed and none is performed.** `HINT_IDS` did not move, so
the hint bitmap in `cmi.suspend_data` means exactly what it meant before, and
the codec format is unchanged — old state decodes as it always did. The score
itself was never stored: it is recomputed from decisions and hints on every
load, which is what makes recalculation safe rather than a reinterpretation.

The recomputation is one-directional. The new rule caps a subset of what the old
one capped, so a resumed attempt can only score the same or higher; no learner
loses a mark they had already been awarded, and a test asserts that across every
combination of hints. A grade already written to the LMS is untouched: it lives
in the gradebook, not in suspend data, and a relaunch of a completed attempt is
read-only, so nothing can overwrite it. The scenario version moves to 2.1.0 to
record the content change; it is not part of any storage key.

## Two provisions that keep exploration safe

**The procedural floor.** A required action — creating the batch, recording the
correction — cannot be skipped, so a learner who eventually gets it right keeps
at least 60%. Grinding someone to zero for taking four attempts at a form would
penalise exactly the experimentation a simulation is for.

The floor does *not* extend to questions. Getting a knowledge check wrong scores
zero, because guessing must not pay the same as knowing.

**The global cap.** Total points lost to retrying stop at 40.

Worth knowing: **under the shipped configuration this cap never binds.** A 60%
floor across 100 points limits retry loss to exactly 40 — precisely the cap. It
is kept as a guard against a *harsher* ladder, since the ladder is content
configuration and lowering `multipleAttemptCredit` should not be able to make
the activity unpassable by accident. A test covers both facts.

## Recall precision, scored strictly

§19.3 permits this, and recall is where precision actually matters.

```
credit = 1 − (missed / affected) − 0.5 × (overSelected / affected)
```

Missing an affected lot costs twice what over-recalling does, because the
consequences differ: leaving contaminated product on a shelf is worse than
destroying good stock. Both are errors and both cost.

This is what the near-miss distractor lot exists to test. A learner who sweeps
up `BAT_PACKAGED_COFFEE_002` — same co-operative, same variety, same plant, same
roasting day — has pattern-matched rather than followed the provenance graph,
and the scoring says so while still leaving them comfortably able to pass.

## The stage 1 diagnostic is not scored

§8.1 requires this. Penalising a learner for a starting assumption teaches
defensive guessing rather than honest self-assessment, and the question exists
to surface what they already believe.

## Completing without passing

Explicitly supported (§19.6). Completion requires all nine stages finished, the
recall committed, and the debrief answered. Passing requires 70 points. A
learner can do the first without the second, and the SCORM status distinguishes
them.

Completion also cannot happen early: the debrief question is a completion
condition of the final stage, so the activity is not finished until it is
answered.

## Where the code is

| Concern | File |
|---|---|
| Score calculation | `src/domain/scoring/score-engine.ts` |
| Interaction record and compression | `src/domain/scenario/interaction-log.ts` |
| Stage completion | `src/domain/scenario/stage-completion.ts` |
| Point allocation | `src/scenarios/coffee-traceability/stages.ts` |
| Ladder and thresholds | `src/scenarios/coffee-traceability/scoring.ts` |

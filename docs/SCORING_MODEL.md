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

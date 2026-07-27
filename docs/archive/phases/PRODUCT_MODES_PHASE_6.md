# Product Modes Phase 6: Audit Challenge and Assessment Candidate

## Outcome

Phase 6 extends the existing Audit activity rather than adding another
simulation or scoring engine.

It delivers:

- three complete immutable Audit Challenge cases;
- one explicit equivalence blueprint across those cases;
- deterministic Audit variant selection;
- persist-before-reveal TA2 SCORM replay;
- exact case-reference reporting;
- a reduced-support Challenge configuration;
- a no-hint, one-shot, final-feedback Assessment configuration;
- shared hosted allocation policies; and
- review-only calibration summaries.

The bank is deliberately marked `DRAFT`. It is ready for expert review and
pilot calibration, but TraceChain does not claim that it is already suitable
for consequential high-stakes use.

## Direct schema upgrade

The pre-release no-migration policy applies:

| Contract | Active version |
|---|---|
| Scenario pack | `1.9.0` |
| Audit case | `3.0.0` |
| Audit SCORM journal | `TA2` |
| Audit application compatibility | `ta2-v1` |

No TA1 reader, alias, fallback, or dual-format path remains.

## Complete curated cases

`PACK_CHALLENGE_COFFEE_AUDIT@1.0.0` contains:

| Case | Reference | Main authored pattern |
|---|---|---|
| Audit Challenge A | `AC-01` | Expired certificate, documented correction, remediated recall attempt |
| Audit Challenge B | `AC-02` | Reduced-support evidence pattern with a different finding/decoy arrangement |
| Audit Challenge C | `AC-03` | Receiving variance and valid correction evidence with a different conclusion |

The selected unit is a whole scenario and Audit case. Findings, decoys,
evidence, policies, conclusions, and scoring are never assembled independently
at runtime.

The equivalence blueprint fixes the target indicators, seven 100-point score
roles, evidence roles, material-finding and decoy ranges, policy and evidence
volume, duration range, and complexity band. Distinct answer-pattern hashes are
required.

The Operations Practice and Challenge banks now declare the same categories of
equivalence evidence: competency targets, evidence roles, consequential
decision roles, feedback policy, hint policy, duration range, and complexity
band.

## Deterministic assignment and replay

For Audit Challenge and Assessment SCORM packages:

1. the delivery adapter initializes;
2. existing TA2 progress is loaded;
3. a 128-bit attempt seed is generated only when no assignment exists;
4. selection algorithm `1` chooses one immutable bank member;
5. the exact assignment is encoded and durably committed;
6. only then is the selected case rendered; and
7. resume reconstructs the assignment from the stored index, seed, source, and
   immutable bank.

TA2 stores compact commands and assignment inputs, not derived events,
classifications, scores, or reports. Replay regenerates those results through
the shared Audit command service.

Worst-case tests cover every complete Audit bank member using the authored
maximum record counts and maximum UTF-8 field lengths. The existing
3,800-character internal ceiling is unchanged.

## Challenge and Assessment behavior

Challenge uses:

- Challenge support;
- stage-end feedback;
- one on-request hint;
- append-only workpaper revision; and
- a formative score.

Assessment uses:

- the same immutable bank and scoring blueprint;
- final feedback only;
- no hints;
- one-shot finding submission; and
- an official-score configuration.

Before completion, Assessment projections contain submitted work but no
classification feedback or report. Completion releases the normal evidence-
linked report. The package description states that the bank remains
calibration-pending.

## Hosted allocation foundation

The shared allocator supports:

- balanced assignment;
- without-replacement assignment;
- manual assignment; and
- same-as-previous assignment.

Tie breaking is deterministic from the exact bank identity and attempt seed.
Every result includes an audit record with the strategy, candidate set,
selected index, count-state hash, and without-replacement cycle status.

The Audit wrapper returns the normal immutable Audit assignment. The hosted
runtime accepts that assignment only when it resolves to its exact selected
scenario. Phase 7 may expose these policies through instructor controls; Phase
6 does not add that UI.

## Calibration reporting

The calibration projection reports per exact variant:

- sample size;
- mean score and pass rate;
- mean completion time;
- item performance;
- evidence use;
- hint use;
- mitigation;
- false positives;
- missed findings; and
- rubric ratings.

Reports are explicitly `reviewOnly`, record the bank review status, and always
state that automatic score rescaling was not applied. Empty variants remain in
the report so missing pilot coverage is visible.

## Packaging

The CLI builds eight packages from one static application build:

1. Guided Operations
2. Practice Operations
3. Challenge Operations
4. Assessment Operations
5. Guided Audit
6. Practice Audit
7. Audit Challenge
8. Audit Assessment

Audit bank data remains in the external `audit-scenario-pack.json`; it is not
compiled into the JavaScript bundle. The verifier checks the bank identity,
complete-case hashes, embedded bank bytes, variant metadata, TA2 marker, and
shared static application digest.

SCORM variation reduces casual answer copying. It is not secure examination
delivery because every complete case is present in the static package.
Higher-stakes delivery should use hosted allocation after review and
calibration.

## Remaining human gate

The following work cannot be truthfully completed by code:

- Vietnamese subject-expert review;
- formal assessment review;
- pilot sample collection;
- difficulty and item calibration; and
- approval for consequential use.

Those gates require a new immutable bank version if review changes authored
content. Phase 6 provides the evidence and reports needed to perform them; it
does not manufacture a review status.

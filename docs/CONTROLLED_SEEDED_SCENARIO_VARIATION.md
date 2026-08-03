# Controlled seeded scenario variation

Status: SCORM Challenge development MVP implemented; human review, hosted
allocation, and formal Assessment variation remain gated.

This document records the implemented subset of the controlled seeded scenario
variation plan. It is the current contract for Challenge package variation and
supersedes older references to a single fixed Challenge A package.

## Purpose

Controlled variation reduces casual copying by giving an attempt one coherent,
curated case with different identifiers, quantities, evidence, incident causes,
and recall structures. It is not an exam-security mechanism. A technically
capable learner can inspect the static files in a SCORM package.

SimuLedger does not generate case facts independently at runtime. Every
selectable case is a complete authored `ScenarioDefinition` that passes the
same domain, replay, scoring, localization, and completion contracts.

## Current mode policy

- Guided uses the fixed Standard Coffee scenario.
- Challenge uses `BANK_COFFEE_CHALLENGE_V1` version `1.0.0`.
- Assessment remains fixed until reviewed and pilot-calibrated variants exist.
- Option order remains fixed. No unsafe answer shuffling is implemented.
- A restart inside one LMS attempt retains the assigned Challenge case.
- A new LMS attempt can receive the same or a different case. SCORM 1.2 cannot
  guarantee balanced or non-repeating allocation across attempts.

## Challenge bank

The bank contains three complete cases under the common scenario identity
`SCN_COFFEE_CHALLENGE@2.0.0`:

| Reference | Certificate evidence | Discrepancy evidence | Recall source |
|---|---|---|---|
| `CH-01` | Valid content, unrecognized issuer | Cause not established | Packaged lot |
| `CH-02` | Recognized authorized issuer, expired certificate | Deliberate falsification | Roasted batch |
| `CH-03` | Valid certificate and authorized issuer | Confirmed typing error | Green-coffee batch |

The cases also vary quantities and identifiers. Their consequential answer
patterns are different, while their decision IDs, hint targets, completion
conditions, journal bounds, point values, and score components remain
structurally equivalent.

The bank is deliberately marked `DRAFT`. Repository validation is not a
substitute for Vietnamese subject-expert review or pilot calibration.

## Assessment blueprint

The versioned Challenge blueprint is derived from the concrete scorable items
and validated against every case:

- total: 100 points;
- operational: 39 points;
- knowledge: 61 points;
- passing score baseline: 70;
- identical item identifiers, maxima, and score components.

No new points, hint targets, or mitigation ceilings are introduced.

## Deterministic selection

Selection algorithm version 1 computes SHA-256 over canonical content:

```text
domain
bank ID
bank version
attempt seed
```

The digest interpreted as an unsigned integer is reduced modulo the immutable
variant count. The same bank version and attempt seed therefore select the same
variant in every supported environment.

For a new browser attempt, a 128-bit seed is obtained from
`crypto.getRandomValues` and encoded as unpadded base64url. The seed is used
only to select among complete authored cases. It does not generate business
facts or answer order.

## Persist before reveal

Challenge startup is transactional:

1. Initialize the SCORM adapter, or the standalone adapter when SCORM is absent.
2. Load SL1.
3. If the attempt has no assignment, generate the attempt seed.
4. Select the case and construct compact assignment metadata.
5. Encode a prospective SL1 snapshot.
6. Save and commit that snapshot.
7. Only then mount the scenario and learner interface.

If the save fails, the selected case is not published to the learner. On resume,
the compact seed and index reconstruct the assignment and are checked against
the exact bank before scenario rendering.

## SL1 contract

SL1 now has 12 positional fields. The last field is either `null` for a fixed
scenario or:

```text
[variant index, attempt seed, assignment-source index]
```

Bank ID, bank version, variant ID, variant version, content hash, case
reference, and selection algorithm are reconstructed from the immutable bank.
They are not redundantly persisted.

Bank packages reject SL1 without an assignment. Fixed packages reject SL1 with
one. This is a direct pre-release schema upgrade; there is no migration reader
or compatibility alias.

The assignment is included in the documented SL1 metadata budget. Actual
worst-case Guided and Challenge journals must stay below the 3,800-character
internal ceiling.

## Runtime and package architecture

The shared JavaScript and CSS application build contains no selected case.
Challenge packages add external runtime data:

```text
simuledger.config.json
scenario.json
scenario-variant-bank.json
build-info.json
```

`scenario.json` is the validated representative scenario used for package
identity and startup validation. `scenario-variant-bank.json` contains the
complete immutable bank. The generator records the bank byte hash and every
canonical variant content hash in `build-info.json`.

The SCORM verifier checks:

- bank-file presence agrees with configuration;
- bank ID and version agree with configuration;
- at least three unique variant and case references exist;
- every variant matches the configured scenario family and version;
- every canonical content hash is correct;
- bank bytes and variant hashes agree with build metadata;
- Guided and Challenge still share one identical static application build.

The release Challenge filename is:

```text
SimuLedger_Challenge_ChallengeBank_vi_v2.0.0.zip
```

Dirty development output adds `_NON_RELEASE`.

## Learner and support traceability

The Challenge start screen tells the learner that case facts can differ and
must be judged from the evidence in the assigned case. It shows a short support
reference such as `CH-01`, not an answer-pattern label. The same reference
appears in the final report.

Internal answer-pattern hashes and variation profiles are never shown in the
learner flow.

## Verification

The executable checks cover:

- deterministic selection and compact assignment reconstruction;
- invalid seed rejection;
- bank structural and scoring equivalence;
- three distinct consequential answer patterns;
- complete headless transaction paths for all three cases;
- persist-before-render and no redraw on resume;
- SL1 worst-case size with real assignment metadata;
- runtime bank and build-metadata hash verification;
- full Challenge browser flow and assigned-case resume;
- external bank packaging and shared static application bytes.

## Deferred gates

The following are intentionally not claimed complete:

- Vietnamese subject-expert review;
- learner pilot calibration and item analysis;
- hosted authoritative, balanced, manual, or without-replacement allocation;
- instructor distribution controls;
- a variable formal Assessment bank;
- cross-attempt non-repetition in standalone SCORM;
- Moodle acceptance of the final clean release packages.

Those gates must be completed before the bank status changes from `DRAFT` or a
formal variable Assessment package is released.

## Hosted integration boundary

The hosted coffee application does not currently execute a packaged
`ScenarioDefinition`. Its native `simuledger-coffee-v2` runtime uses a separate
two-value `Stage3CaseVariant` outcome (`authorized-certifier` or
`unauthorized-transporter`) selected through a published hosted scenario pack.
That outcome changes the certificate submitter, but it does not represent the
complete certificate, discrepancy, provenance, and recall differences in
`CH-01` through `CH-03`.

Mapping the three Challenge references onto those two hosted values would
therefore claim variation that the server did not actually execute. Hosted
allocation remains a separate increment requiring:

- a server-owned immutable run-to-variant assignment record;
- hosted pack support for complete bank members and their hashes;
- a runtime that consumes the selected complete scenario;
- balanced, manual, and without-replacement allocation policies;
- replay, counterfactual, export, and instructor-distribution projections bound
  to that assignment.

Until those foundations exist, the hosted learner run and its official evidence
remain unchanged. The SCORM implementation does not write hosted database state
or alter hosted counterfactual records.

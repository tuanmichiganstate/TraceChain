# TraceChain Phase 8 pilot instruments V1

**Instrument version:** 1.0.0

**Status:** Proposed for research-method and product-owner review.

**Data collection authorized:** No. These instruments may be reviewed and
revised, but they must not be used with participants until the approval and
threshold records in `PILOT_VALIDATION_PROTOCOL_V1.md` are complete.

## Purpose

This pack supplies the external measures that the simulation event log cannot
provide by itself. It does not add a learner score, change an official grade,
or infer competence from one run.

The instruments are intentionally kept outside application and SCORM state.
The pilot record should store only their identifiers and versions. Participant
responses belong in the approved study-data location, not in this repository.

## Instrument registry

| Instrument ID | Purpose | Respondent | Data source |
|---|---|---|---|
| `P8-CONCEPT-A` | Pre-test concept discrimination | Learner | External response form |
| `P8-CONCEPT-B` | Parallel post-test concept discrimination | Learner | External response form |
| `P8-AUDIT-OBS` | Finding, evidence, severity, and report review | Researcher or instructor | Audit assignment report plus review form |
| `P8-USABILITY` | Critical learner, instructor, and author tasks | Observer | Task observation form |
| `P8-RATER` | Criterion-level rubric agreement | Independent raters | Existing immutable rating history plus analysis record |
| `P8-REFLECTION` | Counterfactual causal reasoning | Independent raters | Counterfactual reflection export |
| `P8-AT` | Real assistive-technology review | Accessibility reviewer | `ACCESSIBILITY_SCREEN_READER_REVIEW_PROTOCOL.md` |
| `P8-VI` | Vietnamese technical and professional content review | Subject reviewer | Generated bilingual content-review pack |

## Concept-discrimination forms

### Administration

Use Form A before the learning sequence and Form B afterward. The research
method reviewer may counterbalance the forms if that design is approved.

For each claim, the learner selects:

```text
Supported by the information
Not supported by the information
Cannot be determined from the information
```

The learner then gives one short reason. Score the selected judgment and the
reason separately. A vocabulary match without a defensible reason is not full
evidence of understanding.

### Form A: `P8-CONCEPT-A`

#### A1 — Integrity and truth

A temperature record has a valid hash and a valid signature. Later, an
inspection finds that the sensor was installed in the wrong compartment.

- `A1-INTEGRITY`: The signed record has not changed since it was signed.
- `A1-TRUTH`: The record proves the product remained within the required
  temperature range.

#### A2 — Signature, identity, and authorization

A recognized transport organization signs a quality-certificate proposal with
its active educational key. Network policy permits only an accredited
certifier to issue that certificate.

- `A2-SIGNATURE`: The transport organization approved the exact signed
  proposal.
- `A2-IDENTITY`: The signer is a recognized organizational identity in the
  stated network.
- `A2-AUTHORIZATION`: The transport organization was permitted to issue the
  certificate.

#### A3 — Endorsement and state validity

The required producer and processor both validly endorse a correction for
asset version 4. Before commitment, another accepted transaction advances the
asset to version 5.

- `A3-POLICY`: The required organizations endorsed the same version-4
  proposal.
- `A3-COMMIT`: The endorsed proposal may be committed against version 5
  without revision.

#### A4 — Business state and ledger history

The ledger retains an original quantity record of 1,000 kg and a later
append-only correction to 100 kg. The correction is accepted and current.

- `A4-HISTORY`: Ledger history should still show both the original record and
  the correction.
- `A4-CURRENT`: The effective current business quantity is 100 kg.

#### A5 — Tamper evidence and source truth

A downloaded transaction copy no longer matches its recorded digest. The
authoritative ledger copy still verifies.

- `A5-TAMPER`: The downloaded copy changed after the recorded digest was
  created.
- `A5-TRUTH`: The verified authoritative transaction proves the original
  business statement was factually true.

#### A6 — Professional decision and knowledge check

One task asks a learner to define canonical serialization. Another asks the
learner, acting as processor, whether to hold a lot after reviewing conflicting
certificate and quantity evidence.

- `A6-KNOWLEDGE`: Defining canonical serialization is a knowledge check.
- `A6-DECISION`: Choosing whether to hold the lot is a professional decision
  whose consequences depend on evidence and policy.

### Form B: `P8-CONCEPT-B`

#### B1 — Integrity and truth

A signed pharmacy custody record verifies. Later evidence shows that the
operator entered the wrong medicine lot number before signing.

- `B1-INTEGRITY`: The custody record has not changed since signing.
- `B1-TRUTH`: Verification proves that the entered lot number was correct.

#### B2 — Signature, identity, and authorization

A recognized warehouse employee uses an active key to sign a medicine-release
proposal. Policy permits only the responsible pharmacist to authorize release.

- `B2-SIGNATURE`: The employee approved the exact signed proposal.
- `B2-IDENTITY`: The signer is a recognized identity in the stated network.
- `B2-AUTHORIZATION`: The employee was permitted to authorize release.

#### B3 — Endorsement and state validity

All required organizations validly endorse a transfer for inventory version 7.
The inventory advances to version 8 before the transfer is committed.

- `B3-POLICY`: The organizations endorsed the same version-7 proposal.
- `B3-COMMIT`: The endorsed proposal may be committed against version 8
  without revision.

#### B4 — Business state and ledger history

The ledger retains an original package count of 600 and a later accepted
correction to 60.

- `B4-HISTORY`: Both records belong in the immutable history.
- `B4-CURRENT`: The effective current business count is 60.

#### B5 — Tamper evidence and source truth

A locally edited certificate copy fails signature verification. The original
signed copy verifies.

- `B5-TAMPER`: The edited copy is not the content that the signer approved.
- `B5-TRUTH`: Verification of the original proves every claim in the
  certificate is factually true.

#### B6 — Professional decision and knowledge check

One task asks what a hash is. Another asks whether to quarantine a shipment
after comparing temperature, calibration, stability, and custody evidence.

- `B6-KNOWLEDGE`: Explaining a hash is a knowledge check.
- `B6-DECISION`: Choosing whether to quarantine is a professional decision.

### Researcher scoring key

| Item suffix | Expected judgment |
|---|---|
| `INTEGRITY`, `SIGNATURE`, `IDENTITY`, `POLICY`, `HISTORY`, `CURRENT`, `TAMPER`, `KNOWLEDGE`, `DECISION` | Supported |
| `AUTHORIZATION`, `COMMIT`, `TRUTH` | Not supported |

The parallel forms target the same constructs but use different surface
details. Similar totals do not by themselves establish that the forms are
equivalent. Report results by construct and item before using an aggregate.

## Audit observation instrument: `P8-AUDIT-OBS`

Create one record per completed Audit run from the exact assignment report and
the approved reviewer record.

Required fields:

```text
participant pseudonym
run ID
activity and support profile
variant bank, version, variant, and content hash
authored true findings available
confirmed true findings
missed true findings
unsupported findings
authored decoy opportunities
selected authored decoys
severity judgments made
severity judgments matching the approved key
distinct relevant evidence citations
distinct relevant policy citations
report-quality rubric ratings
completion time
hints used
mitigations used
```

Report:

- finding sensitivity as confirmed true findings divided by authored true
  findings;
- unsupported findings per completed run;
- authored-decoy selection as selected decoys divided by authored decoy
  opportunities;
- severity accuracy as matching judgments divided by severity judgments made;
- evidence and policy use as counts and distributions, not proof that opened
  material was understood;
- report quality by approved rubric criterion; and
- every measure by exact variant before combining variants.

Do not label an unsupported finding as a psychological trait. Do not rescale a
score automatically because one variant has a different observed mean.

## Critical-task observation instrument: `P8-USABILITY`

For every task record:

```text
participant pseudonym
role group
delivery channel
task ID
started and completed timestamps
completed without assistance
assistance count
critical error count
observer note
issue reference
```

### Learner tasks

1. Start or resume the assigned activity.
2. Find and cite decision-relevant evidence.
3. Distinguish a professional action from a knowledge checkpoint.
4. Complete a role handoff.
5. Interpret a rejected action without erasing it.
6. Complete and interpret a causal report.
7. Explore one counterfactual without treating it as grade replacement.

### Instructor tasks

1. Create an exact-version assignment.
2. Select the intended activity, support, purpose, and outcome dimensions.
3. Monitor and replay one learner run.
4. Follow evidence to a finding or decision.
5. Apply one rubric rating.
6. Release feedback.
7. Export identified and pseudonymous evidence.
8. Generate one SCORM package and interpret its resolved preview.
9. Interpret an Audit variant-distribution and calibration view.

### Author tasks

1. Import the Audit starter or another disciplinary pack.
2. Identify one validation failure.
3. Correct and validate the draft.
4. Preview role-visible content.
5. Compare versions.
6. Explain why findings and decoys do not mutate the source ledger.

Time-on-task is diagnostic. Do not set a speed threshold unless the approved
study method justifies it.

## Rater reliability instrument: `P8-RATER`

Select the sample before raters see each other's judgments. Preserve:

```text
sample ID
run and evidence references
rubric and criterion versions
rater pseudonym
rating level
rating revision
rated timestamp
moderation resolution, if any
```

Calculate agreement by criterion using the method approved in the protocol.
Do not silently average disagreement or replace the underlying rating history.

## Counterfactual reflection rubric: `P8-REFLECTION`

Rate each criterion independently on an approved ordinal scale. The proposed
four-level anchors are:

| Level | Anchor |
|---:|---|
| 0 | Missing, unrelated, or contradicts the available evidence |
| 1 | Names an outcome difference without a defensible causal link |
| 2 | Links the intervention to evidence and one consequence but incompletely separates later information or later decisions |
| 3 | Distinguishes information known then from information learned later and separates direct, downstream, later-decision, and stochastic effects where relevant |

Apply the scale to these criteria:

1. Evidence available at the original decision
2. Information revealed later
3. Causal attribution and uncertainty
4. Safety, cost, compliance, and evidence-quality trade-offs
5. Revision of the learner's professional decision rule

The rating is separate reflective evidence. It must not replace or raise the
official source-run grade.

## Accessibility and Vietnamese review

`P8-AT` uses the existing human screen-reader protocol and its issue table.
Automated axe, keyboard, reflow, and browser checks are technical evidence only.

`P8-VI` uses the generated bilingual content-review pack. Reviewers should
record the locale key, surface, issue category, severity, proposed wording, and
resolution. A translated string count is not evidence of professional
naturalness.

## Data handling

- Use assignment-scoped pseudonyms unless identified data are necessary and
  approved.
- Keep consent and identity linkage outside TraceChain exports.
- Never commit participant responses or identifiers to this repository.
- Preserve exact configuration, pack, scenario, policy, rubric, bank, variant,
  seed, and source-commit identities.
- Record missing data explicitly; do not fill it with zeros.
- Re-run product-roadmap prioritization only after the approved exit rules have
  linked evidence.

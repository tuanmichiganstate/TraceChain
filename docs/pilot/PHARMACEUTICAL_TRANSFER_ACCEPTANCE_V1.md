# Pharmaceutical transfer case acceptance record V1

**Case:** `SCN_PHARMA_COLD_CHAIN_TRANSFER@1.1.0`

**Pack:** `PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER@1.5.0`

**Status:** Technical candidate; external acceptance incomplete.

## Transfer beyond coffee

The case introduces substantive disciplinary differences rather than changing
coffee labels:

| Required difference | Pharmaceutical implementation |
|---|---|
| Evidence structure | An intact signed custody record is evaluated beside off-chain temperature, calibration, and product-stability evidence. |
| Professional policy | Investigation and disposition policies require evidence-based cold-chain release and proportionate patient-safety action. |
| Risk trade-off | Patient safety and compliance are weighed against delay and business cost. |
| Decision pattern | Learners make an initial hold/release triage decision, receive later calibration and stability evidence, then make a bounded disposition decision. |
| Causal consequence | Early release or investigation changes the evidence position; later quarantine, broad recall, or no action produces different safety, cost, delay, compliance, and evidence-quality effects. |

The generic hosted runtime executes the case. No pharmaceutical-specific
service, reducer, persistence adapter, or UI transaction system was added.
Authored option effects feed the existing generic counterfactual metric
interface and the learner-facing diagnostic professional-consequence
projection.

## Technical acceptance evidence

Implemented and covered by automated tests:

- complete reachable two-decision workflow;
- atomic rationale, evidence citation, policy citation, confidence, and risk
  capture;
- role-visible staged evidence release;
- declarative competency evidence rules and rubric references;
- deterministic replay and idempotent commands;
- two authored counterfactual decision points;
- five scenario-authored comparison dimensions;
- validation that option effects reference declared runtime metrics;
- one versioned calibration-review incident that can be released only at its
  authored transfer-triage boundary;
- append-only instructor attribution and replay of the incident;
- original-run immutability through the existing branch engine; and
- English and Vietnamese locale completeness.

The scenario remains `draft`. Publication would be dishonest before the human
exit gates below are complete.

The complete repository `npm run quality` gate passed on the candidate working
tree on 2026-07-26, including all 650 Vitest tests, 13 hosted site tests, 11,433
scenario-pack checks, 332 curriculum-overlay checks, the content-review gate,
and 213 SCORM checks for the existing coffee presets. The quality gate verifies
the browser-matrix definition but does not by itself constitute
pharmaceutical browser or user acceptance.

## Delivery-path boundary

The case is supported by the hosted generic runtime. It is not an approved
SCORM preset, so pharmaceutical SCORM acceptance is not applicable to this
version. This does not alter Guided, Challenge, or Assessment coffee packages.

## External exit gates

| Gate | Result | Required evidence |
|---|---|---|
| Pharmaceutical subject-expert approval | Pending | Named review and resolved findings |
| Difficulty calibration against coffee | Pending | Approved method and pilot results |
| Demonstrated learner transfer | Pending | Pilot evidence under the approved protocol |
| Counterfactual decision review | Pending human review | Reviewer record |
| Real assistive-technology review | Pending | Manual task record |
| Vietnamese subject review | Pending | Reviewed bilingual content pack |
| Hosted acceptance by representative users | Pending | Task and issue record |

Automated checks may establish technical readiness, but they cannot close these
gates.

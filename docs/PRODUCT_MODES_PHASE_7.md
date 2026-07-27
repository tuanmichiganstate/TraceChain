# Product modes Phase 7: instructor and author tooling

Phase 7 exposes the Operations and Audit product model through the existing
instructor, author, replay, reporting, and package-generation boundaries. It
does not add a second configuration system, scenario editor, report engine, or
SCORM generator.

## Package builder

The graphical SCORM builder now asks four product questions:

1. professional activity;
2. support profile;
3. delivery purpose; and
4. outcome strategy.

The accepted combination resolves to one of the eight authoritative lecturer
presets. The preview is derived from the resolved configuration and shows
feedback timing, hint availability, exact content identity, scoring, and grade
use before generation. Audit Challenge and Audit Assessment remain clearly
labelled calibration candidates. Technical Laboratory is visible as outside
this builder because it is not part of the accepted eight-package catalogue.

The application still builds once. Package-specific configuration and scenario
data remain external runtime files.

## Audit authoring workflow

The existing `/author` JSON, YAML, and ZIP workflow is the Audit blueprint
editor for this phase. Authors can load a complete three-case Audit Challenge
bank, edit ordinary pack metadata and localized workflow content, inspect a
compact Audit contract summary, and send the same data through the
authoritative server validator.

The summary makes these authored contracts visible:

- complete Audit case and source scenario identity;
- support profile;
- true finding and legitimate-decoy counts;
- evidence and policy counts;
- the fixed 100-point scoring blueprint and pass score;
- variant-bank status and complete-case count; and
- equivalence ranges for material findings, decoys, evidence, and policies.

Validation now also rejects duplicate true-finding and decoy identifiers.
Existing validation continues to require a localized explanation for every
decoy, prevents a decoy from overlapping a true finding, requires evidence and
policy support for true findings, validates the complete scoring allocation,
and resolves every bank case against its immutable content hash.

Contract completeness is not empirical equivalence. A `DRAFT` bank remains
blocked by an explicit expert-review and pilot-calibration warning.

## Learner and class reports

The learner Audit report remains the existing source of individual score,
confirmed findings, unsupported findings, missed authored findings, and
conclusion evidence.

The instructor assignment report adds an Audit class section from:

```text
GET /api/v1/assignments/{assignmentId}/audit-report
```

It uses the exact published pack and reconstructs every run through the normal
runtime service. The report includes:

- one row per Audit run and learner;
- exact case and curated variant identity;
- completed score without changing it;
- confirmed, unsupported, and missed-finding counts;
- evidence and policy citation counts;
- a link from each current finding to its append-only source event;
- complete-bank variant distribution, including zero-sample variants; and
- the existing review-only calibration summary.

Selecting a finding source event opens the existing deterministic replay. A
focused Audit panel shows the finding revision, status, severity, materiality,
evidence, and policies at that replay position. Later amendments and
withdrawals do not leak backward into an earlier replay.

Calibration reports never rescale a score or update an official grade. They
show sample size, mean score, pass rate, completion time, false positives, and
missed findings, with a minimum pilot-size reminder. A human expert still
decides whether variants are sufficiently comparable.

## Replay identity

If a run records an Audit variant assignment, the hosted runtime restores and
validates that exact assignment before replay. It does not infer a replacement
from a current bank or store a second acceptance decision. Runs authored as one
explicit bank case can still be classified against that exact immutable case
for distribution and calibration.

## Deliberate limits

- Phase 7 does not claim that the draft Audit bank is calibrated.
- No score is automatically rescaled.
- No official grade is changed.
- No arbitrary policy expression or executable authoring field is introduced.
- No Technical Laboratory, generic policy editor, or second package generator
  is added.
- Moodle and hosted deployments are separate release actions and are not part
  of this implementation phase.

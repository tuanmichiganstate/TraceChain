# Decision and outcome report V1

`GET /api/v1/assignments/:assignmentId/decision-outcomes` gives an instructor,
rater, or administrator a read-only comparison of authored decision evidence
and the scenario outcome that occurred. It is a deterministic projection of
the assignment's exact published pack and each run's append-only event stream.
It does not add a grade or change the SCORM 100-point score.

## Compatibility boundary

The response identifies:

- assignment ID;
- pack ID and version;
- scenario ID and version; and
- report schema version `1.0.0`.

The service loads the assignment's exact published pack and replays each run
with the existing hosted simulation reducer. A missing or incompatible pack is
a contract failure; the service does not interpret the run through a newer
scenario.

## Active-run concealment

An active run returns its run and learner identifiers with:

```json
{
  "status": "active",
  "decisionItems": [],
  "realizedOutcome": null
}
```

This is deliberate even when the learner has already submitted decisions or
the deterministic outcome is internally known. It prevents the class report
from revealing authored correctness or hidden outcome state while a run is in
progress.

## Completed-run evidence

A completed coffee run returns the seven bounded authored decision items in
scenario order:

```text
INT_CERTIFICATE_INITIAL_SUBMITTED
INT_DISCREPANCY_INITIAL_SUBMITTED
INT_TRANSFORMATION_PROVENANCE
INT_TAMPER_DEMONSTRATION
INT_DATA_GOVERNANCE_CLASSIFICATION
INT_RECALL_SCOPE
INT_BLOCKCHAIN_NECESSITY
```

Each item reports whether the stored submission matched the authored response.
The realized outcome is reported separately as its outcome-model ID, forced or
probabilistic strategy, and outcome code. The report does not expose the
scenario seed or random draw.

The interface aggregates completed submissions by decision item and shows the
decision evidence beside the realized outcome for each completed run. A
favorable outcome cannot turn an unsound decision into a correct one, and an
unfavorable outcome cannot reduce the evidence for a defensible decision.

## Evidence and export boundary

The report stores no duplicate analytics record. It is reconstructed on every
read from the same immutable events used for replay. The assignment JSON and
CSV exports continue to carry the complete source events and exact content
versions from which this view can be reproduced.

The counts are diagnostic class evidence, not a second academic score,
competency inference, or technical-failure measure.

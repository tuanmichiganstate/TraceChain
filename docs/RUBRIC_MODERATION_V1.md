# Rubric moderation V1

TraceChain stores instructor score resolution separately from both the learner
simulation score and the append-only manual-rating history.

## Contract

`POST /api/v1/runs/:runId/moderation` requires an authenticated instructor or
administrator and accepts:

- one exact run, rubric version, and criterion;
- one authored rubric level;
- a bounded resolution rationale;
- one or more source rating-revision IDs for the same criterion; and
- the expected current moderation revision.

The repository writes an append-only `RubricModerationResolutionV1`. Repeating
the same command ID and content is idempotent. Reusing a command ID with
different content or resolving from a stale revision is rejected.

Only the latest resolution for a criterion is current, but all earlier
resolutions remain in `rubric_moderation_resolutions` and in assignment evidence
exports.

## Boundaries

A moderation resolution:

- does not alter hosted run events;
- does not alter ledger or asset projections;
- does not change the simulation's academic score or realized outcome;
- retains the exact source rating revisions considered by the moderator; and
- is released to the learner only through the existing one-way assignment
  feedback release.

JSON and CSV assignment exports include the complete append-only moderation
history. The CSV record type is `moderation_resolution`.

/**
 * The positional key for the compact state codec.
 *
 * The codec stores each decision by its INDEX in `DECISION_IDS`, never by name
 * -- that is what keeps a full attempt in a few hundred characters instead of
 * several thousand. Both arrays are therefore append-only. Reordering or
 * removing an entry silently reinterprets every learner's saved progress, so it
 * requires a schema version bump and a migration.
 */

export const DECISION_IDS: readonly string[] = [
  // Stage 1 -- diagnostic only, deliberately unscored.
  "INT_ORIENTATION_TRUTH_CHECK",

  // Stage 2
  "INT_CREATE_BATCH",

  // Stages 3-9 append their decision identifiers below as each is implemented.
];

export const HINT_IDS: readonly string[] = [
  "HINT_CREATE_BATCH_FIELDS",
];

export const CODEC_SCHEMA = {
  decisionIds: DECISION_IDS,
  hintIds: HINT_IDS,
} as const;

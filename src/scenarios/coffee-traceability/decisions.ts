/**
 * The positional key for the compact state codec.
 *
 * The codec stores each decision by its INDEX in `DECISION_IDS`, never by name
 * -- that is what keeps a full attempt in a few hundred characters instead of
 * several thousand. Both arrays are therefore APPEND-ONLY. Reordering or
 * removing an entry silently reinterprets every learner's saved progress, so it
 * requires a schema version bump and a migration.
 *
 * Identifiers for stages not yet built are declared now rather than added
 * later, so that a learner who saves progress against this build can still
 * resume against the next one. The scenario validator warns about any decision
 * id with no knowledge check, which is expected for transaction decisions.
 */

export const DECISION_IDS: readonly string[] = [
  // Stage 1 -- diagnostic only, deliberately unscored.
  "INT_ORIENTATION_TRUTH_CHECK",

  // Stage 2
  "INT_CREATE_BATCH",

  // Stage 3 -- on-chain versus off-chain, and rejecting an unauthorized issuer.
  "INT_CERTIFICATE_STORAGE_CHOICE",
  "INT_CERTIFICATE_ISSUER_CHECK",

  // Stage 4 -- ownership versus custody, and the humidity threshold.
  "INT_CUSTODY_TRANSFER_SCOPE",
  "INT_TRANSPORT_CONDITION",

  // Stage 5 -- correction instead of deletion.
  "INT_RECEIVE_BATCH",
  "INT_CORRECTION_RECORDED",

  // Stage 6 -- transformation and provenance.
  "INT_TRANSFORM_BATCH",
  "INT_TRANSFORMATION_PROVENANCE",

  // Stage 7 -- packaging and the ownership/custody mirror.
  "INT_PACKAGE_BATCH",
  "INT_OWNERSHIP_TRANSFER_SCOPE",
  "INT_DISPATCH_BATCH",

  // Stage 8 -- hash-chain integrity, and the data-governance classification.
  "INT_TAMPER_DEMONSTRATION",
  "INT_DATA_GOVERNANCE_CLASSIFICATION",

  // Stage 9 -- recall scope, and blockchain versus a centralized database.
  "INT_RECALL_SCOPE",
  "INT_RECALL_COMMITTED",
  "INT_BLOCKCHAIN_NECESSITY",
];

export const HINT_IDS: readonly string[] = [
  "HINT_CREATE_BATCH_FIELDS",
  "HINT_CERTIFICATE_STORAGE",
  "HINT_CUSTODY_VERSUS_OWNERSHIP",
  "HINT_CORRECTION_MECHANISM",
  "HINT_TRANSFORMATION_YIELD",
  "HINT_RECALL_PROVENANCE",
];

export const CODEC_SCHEMA = {
  decisionIds: DECISION_IDS,
  hintIds: HINT_IDS,
} as const;

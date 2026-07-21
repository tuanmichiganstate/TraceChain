/**
 * Compact attempt-state encoding for `cmi.suspend_data`.
 *
 * THE CONSTRAINT
 * --------------
 * SCORM 1.2 types `cmi.suspend_data` as CMIString4096 -- 4096 characters, total.
 * The specification's PersistedAttemptState (section 21.10), serialized as
 * plain JSON, lands at roughly 3 500-5 000 characters before any base64
 * inflation: ten stage identifiers at ~22 characters each, ~20 transaction
 * records at ~120 characters each, plus score, hints, choices and checksum.
 * Its own stated target of "below 4 000 characters" is not reachable that way.
 *
 * THE APPROACH
 * ------------
 * Nothing is stored that can be recomputed. No asset snapshots, no transaction
 * bodies, no hashes, no block data -- attempt replay (specification section 22)
 * reconstructs all of it deterministically from the learner's decisions. Score
 * is likewise omitted: it is a pure function of the decisions and hints, and is
 * recomputed on load. What remains is the learner's actual choices, encoded
 * positionally as base36 digits rather than as named JSON fields.
 *
 * A full attempt lands in the low hundreds of characters. The budget is
 * enforced by a test, not by hope -- see state-codec.test.ts.
 *
 * FORMAT
 * ------
 *     TC1.<stage><completed>.<decisions>.<hints>.<flags>.<checksum>
 *
 *     TC1         magic + schema version; identifies foreign or future data
 *     stage       current stage index, 1 base36 char
 *     completed   completed-stage bitmap, 2 base36 chars
 *     decisions   4 base36 chars per decision, positional: 3 value + 1 attempts
 *     hints       hint bitmap, variable-length base36
 *     flags       1 base36 char: bit 0 completed, bit 1 passed
 *     checksum    first 8 hex characters of the SHA-256 of everything before it
 *
 * An attempt count of zero means "not answered", which is why a genuine answer
 * always records at least one attempt. That lets option index 0 remain a valid
 * answer value.
 */

import { sha256Hex } from "../hashing/sha256";
import { SCENARIO_STAGE_ORDER, ScenarioStageId } from "../../domain/types/enums";
import { PersistenceError, UnsupportedStateVersionError } from "../../domain/errors";

export const STATE_SCHEMA_MAGIC = "TC1";

/** Characters per decision: 3 for the value, 1 for the attempt count. */
const DECISION_VALUE_CHARS = 3;
const DECISION_ATTEMPT_CHARS = 1;
const DECISION_RECORD_CHARS = DECISION_VALUE_CHARS + DECISION_ATTEMPT_CHARS;

export const MAX_DECISION_VALUE = 36 ** DECISION_VALUE_CHARS - 1; // 46 655
export const MAX_ATTEMPT_COUNT = 36 ** DECISION_ATTEMPT_CHARS - 1; // 35

const CHECKSUM_CHARS = 8;
const FIELD_SEPARATOR = ".";
const BASE36_PATTERN = /^[0-9a-z]*$/;

/**
 * A single assessed decision. `encodedValue` is a scenario-defined non-negative
 * integer: an option index for single choice, a bitmap for multiple choice or
 * recall selection, a packed base-4 digit string for classification.
 */
export interface DecisionRecord {
  readonly encodedValue: number;
  readonly attemptCount: number;
}

export interface AttemptSnapshot {
  readonly currentStageId: ScenarioStageId;
  readonly completedStageIds: readonly ScenarioStageId[];
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
  readonly hintsUsed: readonly string[];
  readonly isCompleted: boolean;
  readonly isPassed: boolean;
}

/**
 * The positional key. Decision and hint identifiers are never written to the
 * encoded string -- only their index in these arrays -- so both orders are
 * load-bearing and may only be appended to without a schema version bump.
 */
export interface CodecSchema {
  readonly decisionIds: readonly string[];
  readonly hintIds: readonly string[];
}

function toBase36(value: number, width: number): string {
  return value.toString(36).padStart(width, "0");
}

function fromBase36(text: string): number {
  if (!BASE36_PATTERN.test(text) || text.length === 0) {
    throw new PersistenceError(`Malformed base36 field: "${text}"`);
  }
  return Number.parseInt(text, 36);
}

function encodeStageBitmap(
  stageIds: readonly ScenarioStageId[],
  context: string,
): number {
  let bitmap = 0;
  for (const stageId of stageIds) {
    const index = SCENARIO_STAGE_ORDER.indexOf(stageId);
    if (index < 0) {
      throw new PersistenceError(`Unknown stage in ${context}: ${stageId}`);
    }
    bitmap |= 1 << index;
  }
  return bitmap;
}

function decodeStageBitmap(bitmap: number): ScenarioStageId[] {
  const stageIds: ScenarioStageId[] = [];
  for (let index = 0; index < SCENARIO_STAGE_ORDER.length; index += 1) {
    if ((bitmap & (1 << index)) !== 0) {
      stageIds.push(SCENARIO_STAGE_ORDER[index] as ScenarioStageId);
    }
  }
  return stageIds;
}

/** Encode an attempt snapshot into a string suitable for `cmi.suspend_data`. */
export function encodeAttemptState(snapshot: AttemptSnapshot, schema: CodecSchema): string {
  const stageIndex = SCENARIO_STAGE_ORDER.indexOf(snapshot.currentStageId);
  if (stageIndex < 0) {
    throw new PersistenceError(`Unknown current stage: ${snapshot.currentStageId}`);
  }

  const stageField =
    toBase36(stageIndex, 1) +
    toBase36(encodeStageBitmap(snapshot.completedStageIds, "completedStageIds"), 2);

  let decisionField = "";
  for (const decisionId of schema.decisionIds) {
    const record = snapshot.decisions[decisionId];
    if (record === undefined) {
      // Attempt count zero marks an unanswered decision.
      decisionField += toBase36(0, DECISION_VALUE_CHARS) + toBase36(0, DECISION_ATTEMPT_CHARS);
      continue;
    }
    if (
      !Number.isInteger(record.encodedValue) ||
      record.encodedValue < 0 ||
      record.encodedValue > MAX_DECISION_VALUE
    ) {
      throw new PersistenceError(
        `Decision "${decisionId}" value ${record.encodedValue} exceeds the encodable range 0..${MAX_DECISION_VALUE}`,
      );
    }
    // Attempts are capped rather than rejected: a learner may legitimately
    // retry more times than the field can express, and the exact count beyond
    // the cap does not affect scoring, which is already floored.
    const attempts = Math.min(Math.max(record.attemptCount, 1), MAX_ATTEMPT_COUNT);
    decisionField +=
      toBase36(record.encodedValue, DECISION_VALUE_CHARS) +
      toBase36(attempts, DECISION_ATTEMPT_CHARS);
  }

  let hintBitmap = 0n;
  for (const hintId of snapshot.hintsUsed) {
    const index = schema.hintIds.indexOf(hintId);
    if (index < 0) {
      throw new PersistenceError(`Unknown hint identifier: ${hintId}`);
    }
    hintBitmap |= 1n << BigInt(index);
  }

  const flags = (snapshot.isCompleted ? 1 : 0) | (snapshot.isPassed ? 2 : 0);

  const body = [
    STATE_SCHEMA_MAGIC,
    stageField,
    decisionField,
    hintBitmap.toString(36),
    toBase36(flags, 1),
  ].join(FIELD_SEPARATOR);

  return `${body}${FIELD_SEPARATOR}${sha256Hex(body).slice(0, CHECKSUM_CHARS)}`;
}

/**
 * Decode a suspend-data string.
 *
 * SCORM data is untrusted input (specification section 27): it may be truncated
 * by an LMS, carried over from an older build, or simply absent. Every failure
 * path throws a typed error so the caller can offer recovery (section 21.11)
 * rather than crashing or silently discarding the learner's progress.
 */
export function decodeAttemptState(encoded: string, schema: CodecSchema): AttemptSnapshot {
  const trimmed = encoded.trim();
  if (trimmed.length === 0) {
    throw new PersistenceError("Suspend data is empty");
  }

  const parts = trimmed.split(FIELD_SEPARATOR);
  if (parts.length !== 6) {
    throw new PersistenceError(`Expected 6 fields in suspend data, found ${parts.length}`);
  }

  const [magic, stageField, decisionField, hintField, flagField, checksum] = parts as [
    string, string, string, string, string, string,
  ];

  if (magic !== STATE_SCHEMA_MAGIC) {
    throw new UnsupportedStateVersionError(
      `Unsupported state schema: expected ${STATE_SCHEMA_MAGIC}, found "${magic}"`,
      magic,
    );
  }

  const body = parts.slice(0, 5).join(FIELD_SEPARATOR);
  if (sha256Hex(body).slice(0, CHECKSUM_CHARS) !== checksum) {
    throw new PersistenceError("Suspend data failed its checksum; the value may be truncated");
  }

  if (stageField.length !== 3) {
    throw new PersistenceError("Malformed stage field");
  }
  const stageIndex = fromBase36(stageField.slice(0, 1));
  const currentStageId = SCENARIO_STAGE_ORDER[stageIndex];
  if (currentStageId === undefined) {
    throw new PersistenceError(`Stage index ${stageIndex} is out of range`);
  }
  const completedStageIds = decodeStageBitmap(fromBase36(stageField.slice(1)));

  if (decisionField.length !== schema.decisionIds.length * DECISION_RECORD_CHARS) {
    throw new PersistenceError(
      `Decision field length ${decisionField.length} does not match the ` +
        `${schema.decisionIds.length} decisions this build expects`,
    );
  }

  const decisions: Record<string, DecisionRecord> = {};
  for (let i = 0; i < schema.decisionIds.length; i += 1) {
    const offset = i * DECISION_RECORD_CHARS;
    const attemptCount = fromBase36(
      decisionField.slice(offset + DECISION_VALUE_CHARS, offset + DECISION_RECORD_CHARS),
    );
    if (attemptCount === 0) {
      continue; // Not answered.
    }
    decisions[schema.decisionIds[i] as string] = {
      encodedValue: fromBase36(decisionField.slice(offset, offset + DECISION_VALUE_CHARS)),
      attemptCount,
    };
  }

  if (!BASE36_PATTERN.test(hintField) || hintField.length === 0) {
    throw new PersistenceError("Malformed hint field");
  }
  const hintBitmap = hintField.split("").reduce(
    (accumulator, character) => accumulator * 36n + BigInt(Number.parseInt(character, 36)),
    0n,
  );
  const hintsUsed = schema.hintIds.filter(
    (_hintId, index) => (hintBitmap & (1n << BigInt(index))) !== 0n,
  );

  const flags = fromBase36(flagField);

  return {
    currentStageId,
    completedStageIds,
    decisions,
    hintsUsed,
    isCompleted: (flags & 1) !== 0,
    isPassed: (flags & 2) !== 0,
  };
}

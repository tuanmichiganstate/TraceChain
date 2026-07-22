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
 *     TC2.<stage><completed>.<decisions>.<hints>.<flags>.<reason>.<checksum>
 *
 *     TC2         magic + schema version; identifies foreign or future data
 *     stage       current stage index, 1 base36 char
 *     completed   completed-stage bitmap, 2 base36 chars
 *     decisions   4 base36 chars per decision, positional: 3 value + 1 attempts
 *     hints       hint bitmap, variable-length base36
 *     flags       1 base36 char: bit 0 completed, bit 1 passed
 *     reason      `0` or `1` plus UTF-8 bytes as hexadecimal
 *     checksum    first 8 hex characters of the SHA-256 of everything before it
 *
 * An attempt count of zero means "not answered", which is why a genuine answer
 * always records at least one attempt. That lets option index 0 remain a valid
 * answer value.
 */

import { sha256Hex } from "../hashing/sha256";
import { SCENARIO_STAGE_ORDER, ScenarioStageId } from "../../domain/types/enums";
import { PersistenceError, UnsupportedStateVersionError } from "../../domain/errors";

export const STATE_SCHEMA_MAGIC = "TC2";
const LEGACY_STATE_SCHEMA_MAGIC = "TC1";
const MAX_REPLAY_REASON_BYTES = 1024;

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
  readonly replayData?: {
    readonly correctionReason?: string;
  };
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

function encodeReplayReason(reason: string | undefined): string {
  if (reason === undefined) return "0";
  const bytes = new TextEncoder().encode(reason);
  if (bytes.length > MAX_REPLAY_REASON_BYTES) {
    throw new PersistenceError(
      `Correction reason exceeds ${MAX_REPLAY_REASON_BYTES} UTF-8 bytes`,
    );
  }
  return `1${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function decodeReplayReason(field: string): string | undefined {
  if (field === "0") return undefined;
  if (!field.startsWith("1") || !/^[0-9a-f]+$/.test(field)) {
    throw new PersistenceError("Malformed replay-reason field");
  }
  const hex = field.slice(1);
  if (hex.length % 2 !== 0 || hex.length / 2 > MAX_REPLAY_REASON_BYTES) {
    throw new PersistenceError("Malformed replay-reason length");
  }
  const bytes = new Uint8Array(
    Array.from({ length: hex.length / 2 }, (_unused, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PersistenceError("Replay reason is not valid UTF-8");
  }
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
    encodeReplayReason(snapshot.replayData?.correctionReason),
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
  const magic = parts[0];
  const isLegacy = magic === LEGACY_STATE_SCHEMA_MAGIC;
  const expectedFields = isLegacy ? 6 : 7;
  if (parts.length !== expectedFields) {
    throw new PersistenceError(
      `Expected ${expectedFields} fields in suspend data, found ${parts.length}`,
    );
  }
  if (magic !== STATE_SCHEMA_MAGIC && !isLegacy) {
    throw new UnsupportedStateVersionError(
      `Unsupported state schema: expected ${STATE_SCHEMA_MAGIC}, found "${magic ?? ""}"`,
      magic ?? "",
    );
  }

  const stageField = parts[1] as string;
  const decisionField = parts[2] as string;
  const hintField = parts[3] as string;
  const flagField = parts[4] as string;
  const replayReasonField = isLegacy ? "0" : (parts[5] as string);
  const checksum = parts[isLegacy ? 5 : 6] as string;

  const body = parts.slice(0, isLegacy ? 5 : 6).join(FIELD_SEPARATOR);
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

  if (
    decisionField.length % DECISION_RECORD_CHARS !== 0 ||
    decisionField.length > schema.decisionIds.length * DECISION_RECORD_CHARS
  ) {
    throw new PersistenceError(
      `Decision field length ${decisionField.length} is incompatible with the ` +
        `${schema.decisionIds.length} append-only decisions this build expects`,
    );
  }

  const decisions: Record<string, DecisionRecord> = {};
  const encodedDecisionCount = decisionField.length / DECISION_RECORD_CHARS;
  for (let i = 0; i < encodedDecisionCount; i += 1) {
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
  const correctionReason = decodeReplayReason(replayReasonField);

  return {
    currentStageId,
    completedStageIds,
    decisions,
    hintsUsed,
    isCompleted: (flags & 1) !== 0,
    isPassed: (flags & 2) !== 0,
    ...(correctionReason === undefined
      ? {}
      : { replayData: { correctionReason } }),
  };
}

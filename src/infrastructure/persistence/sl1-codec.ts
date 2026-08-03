/**
 * Bounded SL1 command-journal codec.
 *
 * Events and acceptance flags are deliberately absent. Replay submits the
 * compact commands under the recorded scenario-controlled context sequence and
 * regenerates accepted domain events or rejected audit events.
 */

import {
  IncompatibleAttemptError,
  PersistenceError,
  UnsupportedStateVersionError,
} from "../../domain/errors";
import { SCENARIO_STAGE_ORDER, type ScenarioStageId } from "../../domain/types/enums";
import { sha256Hex } from "../hashing/sha256";
import {
  MAX_ATTEMPT_COUNT,
  MAX_DECISION_VALUE,
  type DecisionRecord,
} from "./attempt-state";
import type {
  ScenarioVariantAssignment,
  ScenarioVariantBank,
} from "../../domain/scenario/variant-bank";
import {
  assignmentForVariant,
  selectVariantIndex,
} from "../../domain/scenario/variant-bank";

export const SL1_MAGIC = "SL1";
export const SL1_INTERNAL_CHARACTER_LIMIT = 3_800;
export const SL1_AUTHORED_PAYLOAD_LIMIT = 3_000;

export const SL1_SECTION_BUDGET = {
  metadata: 280,
  progress: 420,
  context: 160,
  baseline: 1_600,
  stage3: 220,
  stage5: 500,
  stage9: 220,
  completionAndFraming: 100,
} as const;

export type JournalSection = "context" | "baseline" | "stage3" | "stage5" | "stage9";
export type CompactJournalValue = number | readonly number[] | string;

export interface CompactCommandJournalEntry {
  /** Sequence suffix of deterministic CMD_<sequence>. */
  readonly commandSequence: number;
  readonly opcode: number;
  /** Positional scenario-controlled trusted context identifier. */
  readonly contextIndex: number;
  readonly values: readonly CompactJournalValue[];
}

export interface JournalOpcodeDefinition {
  readonly opcode: number;
  readonly section: JournalSection;
  readonly maxOccurrences: number;
  /**
   * Only listed value positions may contain strings. The number is a UTF-8
   * byte ceiling; absent positions must use numbers or numeric arrays.
   */
  readonly textValueByteLimits?: Readonly<Record<number, number>>;
}

export interface Sl1CodecSchema {
  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioSeed: string;
  readonly decisionIds: readonly string[];
  readonly hintIds: readonly string[];
  readonly opcodes: readonly JournalOpcodeDefinition[];
  readonly variantBank?: ScenarioVariantBank;
}

export interface Sl1AttemptSnapshot {
  readonly sessionId: string;
  readonly currentStageId: ScenarioStageId;
  readonly completedStageIds: readonly ScenarioStageId[];
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
  readonly hintsUsed: readonly string[];
  readonly journal: readonly CompactCommandJournalEntry[];
  readonly isCompleted: boolean;
  readonly isPassed: boolean;
  readonly variantAssignment?: ScenarioVariantAssignment;
}

export interface Sl1SizeBreakdown {
  readonly metadata: number;
  readonly progress: number;
  readonly context: number;
  readonly baseline: number;
  readonly stage3: number;
  readonly stage5: number;
  readonly stage9: number;
  readonly completionAndFraming: number;
  readonly authoredPayload: number;
  readonly total: number;
}

type WireJournalEntry = readonly [
  commandSequence: number,
  opcode: number,
  contextIndex: number,
  values: readonly CompactJournalValue[],
];

type WireVariantAssignment = readonly [
  variantIndex: number,
  attemptSeed: string,
  assignmentSourceIndex: number,
];

type Sl1Wire = readonly [
  configurationHash: string,
  scenarioId: string,
  scenarioVersion: string,
  scenarioSeed: string,
  sessionId: string,
  currentStageIndex: number,
  completedStageBitmap: number,
  decisions: readonly number[],
  hintBitmapBase36: string,
  journal: readonly WireJournalEntry[],
  flags: number,
  variantAssignment: WireVariantAssignment | null,
];

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]{1,96}$/;

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset] as number;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += BASE64URL_ALPHABET[(value >>> 18) & 63];
    result += BASE64URL_ALPHABET[(value >>> 12) & 63];
    if (second !== undefined) result += BASE64URL_ALPHABET[(value >>> 6) & 63];
    if (third !== undefined) result += BASE64URL_ALPHABET[value & 63];
  }
  return result;
}

function decodeBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded) || encoded.length % 4 === 1) {
    throw new PersistenceError("SL1 payload is not valid base64url");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset < encoded.length; offset += 4) {
    const chars = encoded.slice(offset, offset + 4);
    const values = [...chars].map((character) => BASE64URL_ALPHABET.indexOf(character));
    if (values.some((value) => value < 0)) {
      throw new PersistenceError("SL1 payload contains an invalid base64url character");
    }
    const value =
      ((values[0] ?? 0) << 18) |
      ((values[1] ?? 0) << 12) |
      ((values[2] ?? 0) << 6) |
      (values[3] ?? 0);
    bytes.push((value >>> 16) & 255);
    if (chars.length >= 3) bytes.push((value >>> 8) & 255);
    if (chars.length === 4) bytes.push(value & 255);
  }
  return new Uint8Array(bytes);
}

function encodedJsonCharacters(value: unknown): number {
  return encodeBase64Url(utf8Bytes(JSON.stringify(value))).length;
}

/**
 * Completed stages travel as a 32-bit bitmap, so the ordered stage list has to
 * stay inside a signed 32-bit shift. `SCENARIO_STAGE_ORDER` is append-only,
 * which makes outgrowing this a live risk rather than a theoretical one: the
 * 32nd stage would shift into the sign bit and the 33rd would silently wrap
 * onto the first, reinterpreting every stored attempt instead of failing.
 */
export function assertStageBitmapCapacity(
  stageOrder: readonly string[],
): void {
  if (stageOrder.length > 31) {
    throw new PersistenceError(
      `SL1 stores completed stages in a 31-slot bitmap, but the scenario declares ${String(stageOrder.length)} stages`,
    );
  }
}

function stageBitmap(stageIds: readonly ScenarioStageId[]): number {
  assertStageBitmapCapacity(SCENARIO_STAGE_ORDER);
  let result = 0;
  for (const stageId of stageIds) {
    const index = SCENARIO_STAGE_ORDER.indexOf(stageId);
    if (index < 0) throw new PersistenceError(`Unknown completed stage: ${stageId}`);
    result |= 1 << index;
  }
  return result;
}

function stagesFromBitmap(bitmap: number): ScenarioStageId[] {
  return SCENARIO_STAGE_ORDER.filter((_stage, index) => (bitmap & (1 << index)) !== 0);
}

function hintBitmap(hints: readonly string[], schema: Sl1CodecSchema): string {
  let bitmap = 0n;
  for (const hint of hints) {
    const index = schema.hintIds.indexOf(hint);
    if (index < 0) throw new PersistenceError(`Unknown hint identifier: ${hint}`);
    bitmap |= 1n << BigInt(index);
  }
  return bitmap.toString(36);
}

function hintsFromBitmap(field: string, schema: Sl1CodecSchema): string[] {
  if (!/^[0-9a-z]+$/.test(field)) throw new PersistenceError("Malformed SL1 hint bitmap");
  const bitmap = [...field].reduce(
    (total, character) => total * 36n + BigInt(Number.parseInt(character, 36)),
    0n,
  );
  const maximumBitmap =
    (1n << BigInt(schema.hintIds.length)) - 1n;
  if (bitmap > maximumBitmap) {
    throw new PersistenceError(
      "SL1 hint bitmap contains an unknown hint",
    );
  }
  return schema.hintIds.filter(
    (_hint, index) => (bitmap & (1n << BigInt(index))) !== 0n,
  );
}

function decisionValues(
  decisions: Readonly<Record<string, DecisionRecord>>,
  schema: Sl1CodecSchema,
): number[] {
  return schema.decisionIds.flatMap((id) => {
    const record = decisions[id];
    if (record === undefined) return [0, 0];
    if (
      !Number.isInteger(record.encodedValue) ||
      record.encodedValue < 0 ||
      record.encodedValue > MAX_DECISION_VALUE
    ) {
      throw new PersistenceError(
        `Decision "${id}" value is outside the compact range 0..${MAX_DECISION_VALUE}`,
      );
    }
    if (!Number.isInteger(record.attemptCount) || record.attemptCount < 1) {
      throw new PersistenceError(`Decision "${id}" has an invalid attempt count`);
    }
    // This is the existing compact-attempt contract: counts saturate once the
    // scoring ladder has long since reached its floor.
    return [
      record.encodedValue,
      Math.min(record.attemptCount, MAX_ATTEMPT_COUNT),
    ];
  });
}

function decisionsFromValues(
  values: readonly number[],
  schema: Sl1CodecSchema,
): Record<string, DecisionRecord> {
  if (values.length !== schema.decisionIds.length * 2) {
    throw new PersistenceError("SL1 decision vector does not match the scenario schema");
  }
  const decisions: Record<string, DecisionRecord> = {};
  for (let index = 0; index < schema.decisionIds.length; index += 1) {
    const encodedValue = values[index * 2];
    const attemptCount = values[index * 2 + 1];
    if (
      !Number.isInteger(encodedValue) ||
      !Number.isInteger(attemptCount) ||
      (encodedValue as number) < 0 ||
      (encodedValue as number) > MAX_DECISION_VALUE ||
      (attemptCount as number) < 0 ||
      (attemptCount as number) > MAX_ATTEMPT_COUNT
    ) {
      throw new PersistenceError("SL1 decision vector contains invalid values");
    }
    if ((attemptCount as number) > 0) {
      decisions[schema.decisionIds[index] as string] = {
        encodedValue: encodedValue as number,
        attemptCount: attemptCount as number,
      };
    }
  }
  return decisions;
}

function validateSchema(schema: Sl1CodecSchema): void {
  if (!HASH_PATTERN.test(schema.configurationHash)) {
    throw new PersistenceError("SL1 configuration hash must be 64 lowercase hexadecimal characters");
  }
  for (const [name, value] of [
    ["scenarioId", schema.scenarioId],
    ["scenarioVersion", schema.scenarioVersion],
    ["scenarioSeed", schema.scenarioSeed],
  ] as const) {
    if (!IDENTIFIER_PATTERN.test(value)) {
      throw new PersistenceError(`SL1 ${name} is not a bounded portable identifier`);
    }
  }
  const seen = new Set<number>();
  for (const definition of schema.opcodes) {
    if (!Number.isInteger(definition.opcode) || definition.opcode < 0 || seen.has(definition.opcode)) {
      throw new PersistenceError(`Invalid or duplicate SL1 opcode: ${definition.opcode}`);
    }
    if (!Number.isInteger(definition.maxOccurrences) || definition.maxOccurrences < 0) {
      throw new PersistenceError(`Opcode ${definition.opcode} has an invalid occurrence limit`);
    }
    for (const limit of Object.values(definition.textValueByteLimits ?? {})) {
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new PersistenceError(`Opcode ${definition.opcode} has an unbounded text field`);
      }
    }
    seen.add(definition.opcode);
  }
  if (
    schema.variantBank !== undefined &&
    (schema.variantBank.bankId.length === 0 ||
      schema.variantBank.bankVersion.length === 0 ||
      schema.variantBank.variants.length === 0)
  ) {
    throw new PersistenceError(
      "SL1 variant-bank schema must identify at least one variant",
    );
  }
}

const ASSIGNMENT_SOURCES = [
  "SCORM_ATTEMPT",
  "STANDALONE_ATTEMPT",
  "HOSTED_ASSIGNMENT",
] as const satisfies readonly ScenarioVariantAssignment["assignmentSource"][];

function wireVariantAssignment(
  assignment: ScenarioVariantAssignment | undefined,
  schema: Sl1CodecSchema,
): WireVariantAssignment | null {
  if (schema.variantBank === undefined) {
    if (assignment !== undefined) {
      throw new PersistenceError(
        "Fixed SL1 scenarios cannot store a variant assignment",
      );
    }
    return null;
  }
  if (assignment === undefined) {
    throw new PersistenceError(
      "Variant-bank SL1 state requires an assignment",
    );
  }
  const expected = assignmentForVariant({
    bank: schema.variantBank,
    variantIndex: assignment.variantIndex,
    attemptSeed: assignment.attemptSeed,
    assignmentSource: assignment.assignmentSource,
  });
  const selectedIndex = selectVariantIndex({
    bank: schema.variantBank,
    attemptSeed: assignment.attemptSeed,
    selectionAlgorithmVersion: "1",
  });
  if (
    selectedIndex !== assignment.variantIndex ||
    expected.bankId !== assignment.bankId ||
    expected.bankVersion !== assignment.bankVersion ||
    expected.variantId !== assignment.variantId ||
    expected.variantVersion !== assignment.variantVersion ||
    expected.variantContentHash !== assignment.variantContentHash ||
    expected.caseReference !== assignment.caseReference ||
    assignment.selectionAlgorithmVersion !== "1"
  ) {
    throw new IncompatibleAttemptError(
      "SL1 variant assignment does not match the configured immutable bank",
    );
  }
  const assignmentSourceIndex = ASSIGNMENT_SOURCES.indexOf(
    assignment.assignmentSource,
  );
  if (assignmentSourceIndex < 0) {
    throw new PersistenceError(
      "SL1 variant assignment has an unknown source",
    );
  }
  return [
    assignment.variantIndex,
    assignment.attemptSeed,
    assignmentSourceIndex,
  ];
}

function assignmentFromWire(
  value: WireVariantAssignment | null,
  schema: Sl1CodecSchema,
): ScenarioVariantAssignment | undefined {
  if (schema.variantBank === undefined) {
    if (value !== null) {
      throw new IncompatibleAttemptError(
        "Stored progress belongs to a variant-bank package",
      );
    }
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !Number.isInteger(value[0]) ||
    typeof value[1] !== "string" ||
    !Number.isInteger(value[2])
  ) {
    throw new PersistenceError(
      "SL1 variant assignment is malformed",
    );
  }
  const assignmentSource = ASSIGNMENT_SOURCES[value[2]];
  if (assignmentSource === undefined) {
    throw new PersistenceError(
      "SL1 variant assignment source is out of range",
    );
  }
  const assignment = assignmentForVariant({
    bank: schema.variantBank,
    variantIndex: value[0],
    attemptSeed: value[1],
    assignmentSource,
  });
  if (
    selectVariantIndex({
      bank: schema.variantBank,
      attemptSeed: value[1],
      selectionAlgorithmVersion: "1",
    }) !== value[0]
  ) {
    throw new IncompatibleAttemptError(
      "Stored variant assignment does not match its deterministic seed",
    );
  }
  return assignment;
}

function validateJournal(
  entries: readonly CompactCommandJournalEntry[],
  schema: Sl1CodecSchema,
): void {
  const definitions = new Map(schema.opcodes.map((definition) => [definition.opcode, definition]));
  const occurrences = new Map<number, number>();
  const commandSequences = new Set<number>();
  let previousCommandSequence = 0;

  for (const entry of entries) {
    const definition = definitions.get(entry.opcode);
    if (definition === undefined) throw new PersistenceError(`Unknown SL1 opcode: ${entry.opcode}`);
    if (
      !Number.isInteger(entry.commandSequence) ||
      entry.commandSequence < 0 ||
      commandSequences.has(entry.commandSequence)
    ) {
      throw new PersistenceError(`Duplicate or invalid command sequence: ${entry.commandSequence}`);
    }
    if (entry.commandSequence <= previousCommandSequence) {
      throw new PersistenceError("SL1 command journal must be strictly ordered");
    }
    if (!Number.isInteger(entry.contextIndex) || entry.contextIndex < 0) {
      throw new PersistenceError(`Invalid trusted-context index: ${entry.contextIndex}`);
    }
    commandSequences.add(entry.commandSequence);
    previousCommandSequence = entry.commandSequence;
    const count = (occurrences.get(entry.opcode) ?? 0) + 1;
    if (count > definition.maxOccurrences) {
      throw new PersistenceError(`Opcode ${entry.opcode} exceeds its authored occurrence limit`);
    }
    occurrences.set(entry.opcode, count);

    for (let index = 0; index < entry.values.length; index += 1) {
      const value = entry.values[index];
      if (typeof value === "string") {
        const maximum = definition.textValueByteLimits?.[index];
        if (maximum === undefined) {
          throw new PersistenceError(
            `Opcode ${entry.opcode} value ${index} is an unbounded string`,
          );
        }
        if (utf8Bytes(value).length > maximum) {
          throw new PersistenceError(
            `Opcode ${entry.opcode} value ${index} exceeds ${maximum} UTF-8 bytes`,
          );
        }
      } else if (typeof value === "number") {
        if (!Number.isInteger(value) || value < 0) {
          throw new PersistenceError(`Opcode ${entry.opcode} contains an invalid numeric value`);
        }
      } else if (Array.isArray(value)) {
        if (!value.every((item) => Number.isInteger(item) && item >= 0)) {
          throw new PersistenceError(`Opcode ${entry.opcode} contains an invalid numeric array`);
        }
      } else {
        throw new PersistenceError(`Opcode ${entry.opcode} contains an invalid journal value`);
      }
    }
  }
}

function wireFromSnapshot(snapshot: Sl1AttemptSnapshot, schema: Sl1CodecSchema): Sl1Wire {
  const currentStageIndex = SCENARIO_STAGE_ORDER.indexOf(snapshot.currentStageId);
  if (currentStageIndex < 0) throw new PersistenceError("Unknown SL1 current stage");
  return [
    schema.configurationHash,
    schema.scenarioId,
    schema.scenarioVersion,
    schema.scenarioSeed,
    snapshot.sessionId,
    currentStageIndex,
    stageBitmap(snapshot.completedStageIds),
    decisionValues(snapshot.decisions, schema),
    hintBitmap(snapshot.hintsUsed, schema),
    snapshot.journal.map(
      (entry): WireJournalEntry => [
        entry.commandSequence,
        entry.opcode,
        entry.contextIndex,
        entry.values,
      ],
    ),
    (snapshot.isCompleted ? 1 : 0) | (snapshot.isPassed ? 2 : 0),
    wireVariantAssignment(snapshot.variantAssignment, schema),
  ];
}

export function measureSl1Attempt(
  snapshot: Sl1AttemptSnapshot,
  schema: Sl1CodecSchema,
): Sl1SizeBreakdown {
  validateSchema(schema);
  validateJournal(snapshot.journal, schema);
  const wire = wireFromSnapshot(snapshot, schema);
  const bySection = new Map<JournalSection, WireJournalEntry[]>();
  const definitions = new Map(schema.opcodes.map((definition) => [definition.opcode, definition]));
  for (const entry of wire[9]) {
    const section = definitions.get(entry[1])?.section;
    if (section === undefined) continue;
    bySection.set(section, [...(bySection.get(section) ?? []), entry]);
  }

  const metadata =
    encodedJsonCharacters(wire.slice(0, 5)) +
    encodedJsonCharacters([wire[11]]);
  const progress = encodedJsonCharacters(wire.slice(5, 9));
  const context = encodedJsonCharacters(bySection.get("context") ?? []);
  const baseline = encodedJsonCharacters(bySection.get("baseline") ?? []);
  const stage3 = encodedJsonCharacters(bySection.get("stage3") ?? []);
  const stage5 = encodedJsonCharacters(bySection.get("stage5") ?? []);
  const stage9 = encodedJsonCharacters(bySection.get("stage9") ?? []);
  const completionAndFraming = encodedJsonCharacters([wire[10]]) + SL1_MAGIC.length + 10;
  const authoredPayload =
    metadata +
    progress +
    context +
    baseline +
    stage3 +
    stage5 +
    stage9 +
    completionAndFraming;
  const payload = encodeBase64Url(utf8Bytes(JSON.stringify(wire)));
  const total = `${SL1_MAGIC}.${payload}.${sha256Hex(payload).slice(0, 8)}`.length;

  return {
    metadata,
    progress,
    context,
    baseline,
    stage3,
    stage5,
    stage9,
    completionAndFraming,
    authoredPayload,
    total,
  };
}

function assertBudget(breakdown: Sl1SizeBreakdown): void {
  for (const section of Object.keys(SL1_SECTION_BUDGET) as Array<
    keyof typeof SL1_SECTION_BUDGET
  >) {
    if (breakdown[section] > SL1_SECTION_BUDGET[section]) {
      throw new PersistenceError(
        `SL1 ${section} section is ${breakdown[section]} characters, over its ` +
          `${SL1_SECTION_BUDGET[section]}-character authored budget`,
      );
    }
  }
  if (breakdown.authoredPayload > SL1_AUTHORED_PAYLOAD_LIMIT) {
    throw new PersistenceError("SL1 authored payload exceeds 3000 characters");
  }
  if (breakdown.total > SL1_INTERNAL_CHARACTER_LIMIT) {
    throw new PersistenceError("SL1 suspend data exceeds the 3800-character internal ceiling");
  }
}

export function encodeSl1Attempt(
  snapshot: Sl1AttemptSnapshot,
  schema: Sl1CodecSchema,
): string {
  if (!IDENTIFIER_PATTERN.test(snapshot.sessionId)) {
    throw new PersistenceError("SL1 session identifier is not bounded or portable");
  }
  const breakdown = measureSl1Attempt(snapshot, schema);
  assertBudget(breakdown);
  const payload = encodeBase64Url(utf8Bytes(JSON.stringify(wireFromSnapshot(snapshot, schema))));
  return `${SL1_MAGIC}.${payload}.${sha256Hex(payload).slice(0, 8)}`;
}

function parseWire(encoded: string): Sl1Wire {
  const [magic, payload, checksum, ...extra] = encoded.trim().split(".");
  if (magic !== SL1_MAGIC) {
    throw new UnsupportedStateVersionError(
      `Unsupported state schema: expected ${SL1_MAGIC}, found "${magic ?? ""}"`,
      magic ?? null,
    );
  }
  if (payload === undefined || checksum === undefined || extra.length > 0) {
    throw new PersistenceError("Malformed SL1 state framing");
  }
  if (sha256Hex(payload).slice(0, 8) !== checksum) {
    throw new PersistenceError("SL1 state failed its checksum");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(payload))) as Sl1Wire;
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(
      `SL1 payload is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface CompactVariantAssignment {
  readonly variantIndex: number;
  readonly attemptSeed: string;
  readonly assignmentSource:
    ScenarioVariantAssignment["assignmentSource"];
}

export function peekSl1VariantAssignment(
  encoded: string,
): CompactVariantAssignment | null {
  const wire = parseWire(encoded);
  if (!Array.isArray(wire) || wire.length !== 12) {
    throw new PersistenceError(
      "SL1 payload has an invalid field count",
    );
  }
  const value = wire[11];
  if (value === null) return null;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !Number.isInteger(value[0]) ||
    typeof value[1] !== "string" ||
    !Number.isInteger(value[2])
  ) {
    throw new PersistenceError(
      "SL1 variant assignment is malformed",
    );
  }
  const assignmentSource = ASSIGNMENT_SOURCES[value[2]];
  if (assignmentSource === undefined) {
    throw new PersistenceError(
      "SL1 variant assignment source is out of range",
    );
  }
  return {
    variantIndex: value[0],
    attemptSeed: value[1],
    assignmentSource,
  };
}

/**
 * Check every wire slot before any of them is read.
 *
 * Suspend data is returned by the LMS and can be hand-edited there, so a
 * malformed payload has to surface as a `PersistenceError` the recovery path
 * classifies. Reading a slot first and discovering its type by crashing raises
 * a bare `TypeError` from inside `.map` or a spread, which that path does not
 * recognise as recoverable stored state.
 */
function assertWireShape(
  wire: readonly unknown[],
): asserts wire is [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  readonly number[],
  string,
  readonly WireJournalEntry[],
  number,
  WireVariantAssignment | null,
] {
  const isJournalEntry = (entry: unknown): boolean =>
    Array.isArray(entry) &&
    entry.length === 4 &&
    Number.isInteger(entry[0]) &&
    Number.isInteger(entry[1]) &&
    Number.isInteger(entry[2]) &&
    Array.isArray(entry[3]);
  const completedStageBitmap = wire[6];
  const maximumStageBitmap =
    2 ** SCENARIO_STAGE_ORDER.length - 1;
  const flags = wire[10];
  const sessionId = wire[4];
  if (
    wire.slice(0, 4).some((field) => typeof field !== "string") ||
    typeof sessionId !== "string" ||
    !IDENTIFIER_PATTERN.test(sessionId) ||
    !Number.isInteger(wire[5]) ||
    typeof completedStageBitmap !== "number" ||
    !Number.isInteger(completedStageBitmap) ||
    completedStageBitmap < 0 ||
    completedStageBitmap > maximumStageBitmap ||
    !Array.isArray(wire[7]) ||
    typeof wire[8] !== "string" ||
    !Array.isArray(wire[9]) ||
    !wire[9].every(isJournalEntry) ||
    typeof flags !== "number" ||
    !Number.isInteger(flags) ||
    flags < 0 ||
    (flags & ~3) !== 0
  ) {
    throw new PersistenceError("SL1 payload has a malformed field");
  }
}

export function decodeSl1Attempt(
  encoded: string,
  schema: Sl1CodecSchema,
): Sl1AttemptSnapshot {
  validateSchema(schema);
  const wire = parseWire(encoded);
  if (!Array.isArray(wire) || wire.length !== 12) {
    throw new PersistenceError("SL1 payload has an invalid field count");
  }
  assertWireShape(wire);
  if (
    wire[0] !== schema.configurationHash ||
    wire[1] !== schema.scenarioId ||
    wire[2] !== schema.scenarioVersion ||
    wire[3] !== schema.scenarioSeed
  ) {
    throw new IncompatibleAttemptError(
      "Stored progress belongs to a different configuration or scenario version",
    );
  }
  const stage = SCENARIO_STAGE_ORDER[wire[5]];
  if (stage === undefined) throw new PersistenceError("SL1 current stage is out of range");
  const journal = wire[9].map(
    (entry): CompactCommandJournalEntry => ({
      commandSequence: entry[0],
      opcode: entry[1],
      contextIndex: entry[2],
      values: entry[3],
    }),
  );
  const variantAssignment = assignmentFromWire(wire[11], schema);
  const snapshot: Sl1AttemptSnapshot = {
    sessionId: wire[4],
    currentStageId: stage,
    completedStageIds: stagesFromBitmap(wire[6]),
    decisions: decisionsFromValues(wire[7], schema),
    hintsUsed: hintsFromBitmap(wire[8], schema),
    journal,
    isCompleted: (wire[10] & 1) !== 0,
    isPassed: (wire[10] & 2) !== 0,
    ...(variantAssignment === undefined
      ? {}
      : {
          variantAssignment,
        }),
  };
  assertBudget(measureSl1Attempt(snapshot, schema));
  return snapshot;
}

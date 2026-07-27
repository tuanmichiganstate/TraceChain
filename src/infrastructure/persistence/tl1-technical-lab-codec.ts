import {
  deflateSync,
  inflateSync,
  strFromU8,
  strToU8,
} from "fflate";
import { canonicalize } from "../hashing/canonicalize";
import { sha256Hex } from "../hashing/sha256";
import type { TechnicalLabPackBundle } from "../../technical-lab/contracts";
import {
  TECHNICAL_LAB_MAX_JOURNAL_ENTRIES,
} from "../../technical-lab/validation";
import {
  TECHNICAL_LAB_CODEC_MAGIC,
  TECHNICAL_LAB_SUSPEND_DATA_LIMIT,
} from "../../technical-lab/persistence-size";
import type {
  TechnicalLabActionJournalEntry,
  TechnicalLabCheckpointKind,
  TechnicalLabResponseJournalEntry,
  TechnicalLabSnapshot,
} from "../../technical-lab/engine";

const PREFIX = `${TECHNICAL_LAB_CODEC_MAGIC}.`;
const CHECKPOINT_KINDS: readonly TechnicalLabCheckpointKind[] = [
  "INTERPRETATION",
  "APPLICATION",
];

export interface Tl1TechnicalLabCodecSchema {
  readonly configurationHash: string;
  readonly bundle: TechnicalLabPackBundle;
}

export interface Tl1TechnicalLabStoredHeader {
  readonly configurationHash: string;
  readonly bundleContentHash: string;
  readonly labPackId: string;
  readonly labPackVersion: string;
}

type ActionWire = readonly [
  moduleIndex: number,
  experimentIndex: number,
  stepIndex: number,
  occurrenceIndex: number,
  operandA: number,
  operandB: number,
];

type ResponseWire = readonly [
  moduleIndex: number,
  kindIndex: number,
  optionIndex: number,
  attemptNumber: number,
];

type SnapshotWire = readonly [
  schemaVersion: 1,
  configurationHash: string,
  bundleContentHash: string,
  labPackId: string,
  labPackVersion: string,
  currentModuleIndex: number,
  actions: readonly ActionWire[],
  responses: readonly ResponseWire[],
  hintModuleIndexes: readonly number[],
];

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + 0x8000),
    );
  }
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(
      "TL1 Technical Laboratory progress is not valid base64url.",
    );
  }
  const padded = value
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

function integer(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(
      `${path} must be an integer from ${String(minimum)} to ${String(maximum)}.`,
    );
  }
  return value as number;
}

function string(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength
  ) {
    throw new Error(
      `${path} must be a non-empty bounded string.`,
    );
  }
  return value;
}

export function technicalLabBundleContentHash(
  bundle: TechnicalLabPackBundle,
): string {
  return sha256Hex(canonicalize(bundle));
}

function actionWire(
  entry: TechnicalLabActionJournalEntry,
): ActionWire {
  return [
    entry.moduleIndex,
    entry.experimentIndex,
    entry.stepIndex,
    entry.occurrenceIndex,
    entry.operandA,
    entry.operandB,
  ];
}

function responseWire(
  entry: TechnicalLabResponseJournalEntry,
): ResponseWire {
  return [
    entry.moduleIndex,
    CHECKPOINT_KINDS.indexOf(entry.kind),
    entry.optionIndex,
    entry.attemptNumber,
  ];
}

function wireFor(
  snapshot: TechnicalLabSnapshot,
  schema: Tl1TechnicalLabCodecSchema,
): SnapshotWire {
  return [
    1,
    schema.configurationHash,
    technicalLabBundleContentHash(schema.bundle),
    schema.bundle.pack.labPackId,
    schema.bundle.pack.labPackVersion,
    snapshot.currentModuleIndex,
    snapshot.actionJournal.map(actionWire),
    snapshot.responseJournal.map(responseWire),
    snapshot.hintModuleIndexes,
  ];
}

export function encodeTl1TechnicalLabSnapshot(
  snapshot: TechnicalLabSnapshot,
  schema: Tl1TechnicalLabCodecSchema,
): string {
  const encoded =
    PREFIX +
    base64UrlEncode(
      deflateSync(
        strToU8(JSON.stringify(wireFor(snapshot, schema))),
        { level: 9 },
      ),
    );
  if (encoded.length > TECHNICAL_LAB_SUSPEND_DATA_LIMIT) {
    throw new Error(
      `TL1 Technical Laboratory progress requires ${String(encoded.length)} characters, ` +
        `over the ${String(TECHNICAL_LAB_SUSPEND_DATA_LIMIT)}-character ceiling.`,
    );
  }
  return encoded;
}

function parseWire(encoded: string): readonly unknown[] {
  if (!encoded.startsWith(PREFIX)) {
    throw new Error(
      "Stored progress does not use the active TL1 Technical Laboratory format.",
    );
  }
  if (encoded.length > TECHNICAL_LAB_SUSPEND_DATA_LIMIT) {
    throw new Error(
      "Stored TL1 Technical Laboratory progress exceeds the supported size.",
    );
  }
  try {
    return array(
      JSON.parse(
        strFromU8(
          inflateSync(
            base64UrlDecode(encoded.slice(PREFIX.length)),
          ),
        ),
      ),
      "$",
    );
  } catch (error) {
    throw new Error(
      `Stored TL1 Technical Laboratory progress is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function inspectTl1TechnicalLabStoredHeader(
  encoded: string,
): Tl1TechnicalLabStoredHeader {
  const value = parseWire(encoded);
  if (integer(value[0], "$.schemaVersion", 1, 1) !== 1) {
    throw new Error(
      "Stored TL1 Technical Laboratory progress uses an unsupported schema.",
    );
  }
  return {
    configurationHash: string(
      value[1],
      "$.configurationHash",
      64,
    ),
    bundleContentHash: string(
      value[2],
      "$.bundleContentHash",
      64,
    ),
    labPackId: string(value[3], "$.labPackId", 96),
    labPackVersion: string(value[4], "$.labPackVersion", 32),
  };
}
function decodeAction(
  value: unknown,
  index: number,
  moduleCount: number,
): TechnicalLabActionJournalEntry {
  const wire = array(value, `$.actions[${String(index)}]`);
  if (wire.length !== 6) {
    throw new Error(
      `$.actions[${String(index)}] must contain six values.`,
    );
  }
  return {
    moduleIndex: integer(
      wire[0],
      `$.actions[${String(index)}].moduleIndex`,
      0,
      moduleCount - 1,
    ),
    experimentIndex: integer(
      wire[1],
      `$.actions[${String(index)}].experimentIndex`,
      0,
      3,
    ),
    stepIndex: integer(
      wire[2],
      `$.actions[${String(index)}].stepIndex`,
      0,
      15,
    ),
    occurrenceIndex: integer(
      wire[3],
      `$.actions[${String(index)}].occurrenceIndex`,
      0,
      3,
    ),
    operandA: integer(
      wire[4],
      `$.actions[${String(index)}].operandA`,
      0,
      65_535,
    ),
    operandB: integer(
      wire[5],
      `$.actions[${String(index)}].operandB`,
      0,
      1_114_111,
    ),
  };
}

function decodeResponse(
  value: unknown,
  index: number,
  moduleCount: number,
): TechnicalLabResponseJournalEntry {
  const wire = array(value, `$.responses[${String(index)}]`);
  if (wire.length !== 4) {
    throw new Error(
      `$.responses[${String(index)}] must contain four values.`,
    );
  }
  const kindIndex = integer(
    wire[1],
    `$.responses[${String(index)}].kind`,
    0,
    CHECKPOINT_KINDS.length - 1,
  );
  return {
    moduleIndex: integer(
      wire[0],
      `$.responses[${String(index)}].moduleIndex`,
      0,
      moduleCount - 1,
    ),
    kind: CHECKPOINT_KINDS[kindIndex]!,
    optionIndex: integer(
      wire[2],
      `$.responses[${String(index)}].optionIndex`,
      0,
      3,
    ),
    attemptNumber: integer(
      wire[3],
      `$.responses[${String(index)}].attemptNumber`,
      1,
      3,
    ),
  };
}

export function decodeTl1TechnicalLabSnapshot(
  encoded: string,
  schema: Tl1TechnicalLabCodecSchema,
): TechnicalLabSnapshot {
  const value = parseWire(encoded);
  if (value.length !== 9) {
    throw new Error(
      "Stored TL1 Technical Laboratory progress has an invalid envelope.",
    );
  }
  const header = inspectTl1TechnicalLabStoredHeader(encoded);
  const expectedBundleHash =
    technicalLabBundleContentHash(schema.bundle);
  if (
    header.configurationHash !== schema.configurationHash ||
    header.bundleContentHash !== expectedBundleHash ||
    header.labPackId !== schema.bundle.pack.labPackId ||
    header.labPackVersion !== schema.bundle.pack.labPackVersion
  ) {
    throw new Error(
      "Stored Technical Laboratory progress belongs to another configuration or pack.",
    );
  }
  const moduleCount = schema.bundle.modules.length;
  const actionValues = array(value[6], "$.actions");
  if (actionValues.length > TECHNICAL_LAB_MAX_JOURNAL_ENTRIES) {
    throw new Error(
      "Stored Technical Laboratory progress has too many actions.",
    );
  }
  const responseValues = array(value[7], "$.responses");
  const maximumResponses = moduleCount * 2 * 3;
  if (responseValues.length > maximumResponses) {
    throw new Error(
      "Stored Technical Laboratory progress has too many checkpoint responses.",
    );
  }
  const hintValues = array(value[8], "$.hintModuleIndexes");
  if (
    hintValues.length > moduleCount ||
    new Set(hintValues).size !== hintValues.length
  ) {
    throw new Error(
      "Stored Technical Laboratory progress has invalid hint history.",
    );
  }
  return {
    currentModuleIndex: integer(
      value[5],
      "$.currentModuleIndex",
      0,
      moduleCount - 1,
    ),
    actionJournal: actionValues.map((entry, index) =>
      decodeAction(entry, index, moduleCount),
    ),
    responseJournal: responseValues.map((entry, index) =>
      decodeResponse(entry, index, moduleCount),
    ),
    hintModuleIndexes: hintValues.map((moduleIndex, index) =>
      integer(
        moduleIndex,
        `$.hintModuleIndexes[${String(index)}]`,
        0,
        moduleCount - 1,
      ),
    ),
  };
}

import {
  deflateSync,
  inflateSync,
  strFromU8,
  strToU8,
} from "fflate";
import type {
  AuditCaseDefinitionV1,
  AuditConclusionSubmissionV1,
  AuditVariantAssignmentV1,
  AuditVariantBankDefinitionV1,
} from "../../platform/contracts/audit";
import {
  assignmentForVariant,
  validateAttemptSeed,
} from "../../domain/scenario/variant-bank";
import { canonicalize } from "../hashing/canonicalize";
import type {
  AuditFindingInputV1,
} from "../../platform/audit/audit-run-types";

export const TA2_SUSPEND_DATA_CEILING = 3_800;
const PREFIX = "TA2.";

export type AuditInteractionJournalEntry =
  | { readonly operation: "VIEW_SCOPE" }
  | {
      readonly operation: "INSPECT_EVIDENCE";
      readonly evidenceId: string;
    }
  | {
      readonly operation: "BOOKMARK_EVIDENCE";
      readonly evidenceId: string;
    }
  | {
      readonly operation: "INSPECT_SOURCE_RECORD";
      readonly sourceRecordId: string;
    }
  | {
      readonly operation: "VIEW_HINT";
      readonly hintId: string;
    };

export type AuditCommandJournalEntry =
  | AuditInteractionJournalEntry
  | {
      readonly operation: "SAVE_DRAFT";
      readonly finding: AuditFindingInputV1;
    }
  | {
      readonly operation: "SUBMIT_FINDING";
      readonly finding: AuditFindingInputV1;
    }
  | {
      readonly operation: "AMEND_FINDING";
      readonly finding: AuditFindingInputV1;
    }
  | {
      readonly operation: "WITHDRAW_FINDING";
      readonly findingId: string;
    }
  | {
      readonly operation: "SUBMIT_CONCLUSION";
      readonly conclusion: Omit<
        AuditConclusionSubmissionV1,
        "submittedAt"
      >;
    };

export interface Ta2AuditSnapshot {
  readonly variantAssignment: AuditVariantAssignmentV1 | null;
  readonly commandJournal: readonly AuditCommandJournalEntry[];
}

export interface Ta2AuditCodecSchema {
  readonly configurationHash: string;
  readonly packContentHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly auditCase: AuditCaseDefinitionV1;
  readonly variantBank?: AuditVariantBankDefinitionV1;
}

export interface Ta2AuditStoredHeader {
  readonly configurationHash: string;
  readonly packContentHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly auditCaseId: string;
  readonly auditCaseVersion: string;
  readonly assignment:
    | null
    | {
        readonly variantIndex: number;
        readonly attemptSeed: string;
        readonly assignmentSource:
          AuditVariantAssignmentV1["assignmentSource"];
      };
}

type FindingWire = readonly [
  findingId: string,
  categoryIndex: number,
  entityIndex: number,
  title: string,
  observation: string,
  severityIndex: number,
  materialityIndex: number,
  confidence: number,
  evidenceIndexes: readonly number[],
  policyIndexes: readonly number[],
  rootCauseIndex: number,
  recommendationIndex: number,
  recommendation: string,
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
    throw new Error("TA2 payload is not valid base64url.");
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

function utf8Length(value: string): number {
  return strToU8(value).byteLength;
}

function expectArray(
  value: unknown,
  path: string,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

function expectInteger(
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

function expectString(
  value: unknown,
  path: string,
  maximumUtf8Bytes: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0) ||
    utf8Length(value) > maximumUtf8Bytes
  ) {
    throw new Error(
      `${path} must fit within ${String(maximumUtf8Bytes)} UTF-8 bytes.`,
    );
  }
  return value;
}

function indexOf(
  values: readonly string[],
  value: string,
  path: string,
): number {
  const index = values.indexOf(value);
  if (index === -1) {
    throw new Error(`${path} is not authored for this Audit case.`);
  }
  return index;
}

function atIndex(
  values: readonly string[],
  value: unknown,
  path: string,
): string {
  const index = expectInteger(value, path, 0, values.length - 1);
  const resolved = values[index];
  if (resolved === undefined) {
    throw new Error(`${path} references a missing authored value.`);
  }
  return resolved;
}

function indexesOf(
  authored: readonly string[],
  selected: readonly string[],
  path: string,
  maximum: number,
): readonly number[] {
  if (
    selected.length > maximum ||
    new Set(selected).size !== selected.length
  ) {
    throw new Error(`${path} exceeds its authored citation limit.`);
  }
  return selected.map((value, index) =>
    indexOf(authored, value, `${path}[${String(index)}]`),
  );
}

function valuesAtIndexes(
  authored: readonly string[],
  value: unknown,
  path: string,
  maximum: number,
): readonly string[] {
  const indexes = expectArray(value, path);
  if (
    indexes.length > maximum ||
    new Set(indexes).size !== indexes.length
  ) {
    throw new Error(`${path} exceeds its authored citation limit.`);
  }
  return indexes.map((index, position) =>
    atIndex(
      authored,
      index,
      `${path}[${String(position)}]`,
    ),
  );
}

function caseIndexes(auditCase: AuditCaseDefinitionV1) {
  return {
    categories: auditCase.categories.map((choice) => choice.choiceId),
    entities: auditCase.entities.map((choice) => choice.choiceId),
    evidence: [...auditCase.evidenceItemIds],
    policies: [...auditCase.policyIds],
    roots: auditCase.rootCauses.map((choice) => choice.choiceId),
    recommendations: auditCase.recommendations.map(
      (choice) => choice.choiceId,
    ),
    conclusions: auditCase.conclusionCategories.map(
      (choice) => choice.conclusionCategory,
    ),
    sourceRecords: auditCase.sourceRecords.map(
      (record) => record.sourceRecordId,
    ),
    hints: auditCase.hints.map((hint) => hint.hintId),
  };
}

function encodeFinding(
  finding: AuditFindingInputV1,
  schema: Ta2AuditCodecSchema,
): FindingWire {
  const values = caseIndexes(schema.auditCase);
  const limits = schema.auditCase.inputLimits;
  const findingId = expectString(
    finding.findingId,
    "finding.findingId",
    16,
  );
  if (!/^F[1-9][0-9]?$/u.test(findingId)) {
    throw new Error("TA2 finding IDs must use the compact F1-F99 form.");
  }
  return [
    findingId,
    indexOf(values.categories, finding.categoryId, "finding.categoryId"),
    indexOf(values.entities, finding.entityId, "finding.entityId"),
    expectString(
      finding.title,
      "finding.title",
      limits.findingTitleUtf8Bytes,
      true,
    ),
    expectString(
      finding.observation,
      "finding.observation",
      limits.findingObservationUtf8Bytes,
      true,
    ),
    indexOf(
      ["LOW", "MODERATE", "HIGH", "CRITICAL"],
      finding.severity,
      "finding.severity",
    ),
    indexOf(
      ["NON_MATERIAL", "MATERIAL"],
      finding.materiality,
      "finding.materiality",
    ),
    expectInteger(
      finding.confidence,
      "finding.confidence",
      0,
      100,
    ),
    indexesOf(
      values.evidence,
      finding.evidenceIds,
      "finding.evidenceIds",
      limits.maximumEvidenceCitationsPerFinding,
    ),
    indexesOf(
      values.policies,
      finding.policyIds,
      "finding.policyIds",
      limits.maximumPolicyCitationsPerFinding,
    ),
    indexOf(values.roots, finding.rootCauseCode, "finding.rootCauseCode"),
    indexOf(
      values.recommendations,
      finding.recommendationCode,
      "finding.recommendationCode",
    ),
    expectString(
      finding.recommendation,
      "finding.recommendation",
      limits.findingRecommendationUtf8Bytes,
      true,
    ),
  ];
}

function decodeFinding(
  value: unknown,
  schema: Ta2AuditCodecSchema,
  path: string,
): AuditFindingInputV1 {
  const wire = expectArray(value, path);
  if (wire.length !== 13) {
    throw new Error(`${path} has an unsupported finding shape.`);
  }
  const values = caseIndexes(schema.auditCase);
  const limits = schema.auditCase.inputLimits;
  const findingId = expectString(wire[0], `${path}[0]`, 16);
  if (!/^F[1-9][0-9]?$/u.test(findingId)) {
    throw new Error(`${path}[0] is not a compact finding ID.`);
  }
  return {
    findingId,
    categoryId: atIndex(values.categories, wire[1], `${path}[1]`),
    entityId: atIndex(values.entities, wire[2], `${path}[2]`),
    title: expectString(
      wire[3],
      `${path}[3]`,
      limits.findingTitleUtf8Bytes,
      true,
    ),
    observation: expectString(
      wire[4],
      `${path}[4]`,
      limits.findingObservationUtf8Bytes,
      true,
    ),
    severity: atIndex(
      ["LOW", "MODERATE", "HIGH", "CRITICAL"],
      wire[5],
      `${path}[5]`,
    ) as AuditFindingInputV1["severity"],
    materiality: atIndex(
      ["NON_MATERIAL", "MATERIAL"],
      wire[6],
      `${path}[6]`,
    ) as AuditFindingInputV1["materiality"],
    confidence: expectInteger(wire[7], `${path}[7]`, 0, 100),
    evidenceIds: valuesAtIndexes(
      values.evidence,
      wire[8],
      `${path}[8]`,
      limits.maximumEvidenceCitationsPerFinding,
    ),
    policyIds: valuesAtIndexes(
      values.policies,
      wire[9],
      `${path}[9]`,
      limits.maximumPolicyCitationsPerFinding,
    ),
    rootCauseCode: atIndex(values.roots, wire[10], `${path}[10]`),
    recommendationCode: atIndex(
      values.recommendations,
      wire[11],
      `${path}[11]`,
    ),
    recommendation: expectString(
      wire[12],
      `${path}[12]`,
      limits.findingRecommendationUtf8Bytes,
      true,
    ),
  };
}

export function emptyTa2AuditSnapshot(
  variantAssignment: AuditVariantAssignmentV1 | null = null,
): Ta2AuditSnapshot {
  return {
    variantAssignment,
    commandJournal: [],
  };
}

const ASSIGNMENT_SOURCES = [
  "SCORM_ATTEMPT",
  "STANDALONE_ATTEMPT",
  "HOSTED_ASSIGNMENT",
] as const;

function assignmentWire(
  snapshot: Ta2AuditSnapshot,
  schema: Ta2AuditCodecSchema,
): readonly [number, string, number] | null {
  const assignment = snapshot.variantAssignment;
  if (schema.variantBank === undefined) {
    if (assignment !== null) {
      throw new Error(
        "A fixed Audit package cannot persist a variant assignment.",
      );
    }
    return null;
  }
  if (assignment === null) {
    throw new Error(
      "An Audit variant-bank package requires an assignment before reveal.",
    );
  }
  validateAttemptSeed(assignment.attemptSeed);
  const expected = assignmentForVariant({
    bank: {
      bankId: schema.variantBank.bankId,
      bankVersion: schema.variantBank.bankVersion,
      variants: schema.variantBank.variants.map((variant) => ({
        metadata: {
          variantId: variant.variantId,
          variantVersion: variant.variantVersion,
          contentHash: variant.contentHash,
          caseReference: variant.caseReference,
        },
      })),
    },
    variantIndex: assignment.variantIndex,
    attemptSeed: assignment.attemptSeed,
    assignmentSource: assignment.assignmentSource,
  });
  const variant = schema.variantBank.variants[assignment.variantIndex];
  if (
    canonicalize(expected) !== canonicalize(assignment) ||
    variant?.scenarioId !== schema.scenarioId ||
    variant.scenarioVersion !== schema.scenarioVersion ||
    variant.auditCaseId !== schema.auditCase.auditCaseId ||
    variant.auditCaseVersion !== schema.auditCase.version
  ) {
    throw new Error(
      "Audit variant assignment does not match the selected complete case.",
    );
  }
  return [
    assignment.variantIndex,
    assignment.attemptSeed,
    ASSIGNMENT_SOURCES.indexOf(assignment.assignmentSource),
  ];
}

function maximumCommandRecords(
  auditCase: AuditCaseDefinitionV1,
): number {
  return (
    1 +
    auditCase.evidenceItemIds.length * 2 +
    auditCase.sourceRecords.length +
    auditCase.hints.length +
    auditCase.inputLimits.maximumDraftRecords +
    auditCase.inputLimits.maximumFindingRecords +
    1
  );
}

function encodeConclusion(
  conclusion: Omit<AuditConclusionSubmissionV1, "submittedAt">,
  schema: Ta2AuditCodecSchema,
): readonly unknown[] {
  const values = caseIndexes(schema.auditCase);
  return [
    indexOf(
      values.conclusions,
      conclusion.conclusionCategory,
      "conclusion.conclusionCategory",
    ),
    ...[
      conclusion.scopeSummary,
      conclusion.materialFindingsSummary,
      conclusion.nonMaterialFindingsSummary,
      conclusion.limitations,
      conclusion.uncertainty,
      conclusion.recommendations,
    ].map((value, index) =>
      expectString(
        value,
        `conclusion[${String(index)}]`,
        schema.auditCase.inputLimits.conclusionFieldUtf8Bytes,
      ),
    ),
    expectInteger(
      conclusion.confidence,
      "conclusion.confidence",
      0,
      100,
    ),
  ];
}

function decodeConclusion(
  value: unknown,
  schema: Ta2AuditCodecSchema,
  path: string,
): Omit<AuditConclusionSubmissionV1, "submittedAt"> {
  const wire = expectArray(value, path);
  if (wire.length !== 8) {
    throw new Error(`${path} has an invalid conclusion shape.`);
  }
  const values = caseIndexes(schema.auditCase);
  const maximum =
    schema.auditCase.inputLimits.conclusionFieldUtf8Bytes;
  return {
    conclusionCategory: atIndex(
      values.conclusions,
      wire[0],
      `${path}[0]`,
    ) as AuditConclusionSubmissionV1["conclusionCategory"],
    scopeSummary: expectString(wire[1], `${path}[1]`, maximum),
    materialFindingsSummary: expectString(
      wire[2],
      `${path}[2]`,
      maximum,
    ),
    nonMaterialFindingsSummary: expectString(
      wire[3],
      `${path}[3]`,
      maximum,
    ),
    limitations: expectString(wire[4], `${path}[4]`, maximum),
    uncertainty: expectString(wire[5], `${path}[5]`, maximum),
    recommendations: expectString(wire[6], `${path}[6]`, maximum),
    confidence: expectInteger(wire[7], `${path}[7]`, 0, 100),
  };
}

export function encodeTa2AuditSnapshot(
  snapshot: Ta2AuditSnapshot,
  schema: Ta2AuditCodecSchema,
): string {
  const values = caseIndexes(schema.auditCase);
  if (
    snapshot.commandJournal.length >
    maximumCommandRecords(schema.auditCase)
  ) {
    throw new Error("TA2 command journal exceeds the authored limit.");
  }
  const seenInteractions = new Set<string>();
  let draftRecords = 0;
  let findingRecords = 0;
  let conclusionRecords = 0;
  const commandJournal = snapshot.commandJournal.map(
    (entry, index) => {
      let wire: readonly unknown[];
      if (entry.operation === "VIEW_SCOPE") {
        wire = [0];
      } else if (
        entry.operation === "INSPECT_EVIDENCE" ||
        entry.operation === "BOOKMARK_EVIDENCE"
      ) {
        wire = [
          entry.operation === "INSPECT_EVIDENCE" ? 1 : 2,
          indexOf(
            values.evidence,
            entry.evidenceId,
            `interactionJournal[${String(index)}].evidenceId`,
          ),
        ];
      } else if (entry.operation === "INSPECT_SOURCE_RECORD") {
        wire = [
          3,
          indexOf(
            values.sourceRecords,
            entry.sourceRecordId,
            `interactionJournal[${String(index)}].sourceRecordId`,
          ),
        ];
      } else if (entry.operation === "VIEW_HINT") {
        wire = [
          4,
          indexOf(
            values.hints,
            entry.hintId,
            `interactionJournal[${String(index)}].hintId`,
          ),
        ];
      } else if (entry.operation === "SAVE_DRAFT") {
        draftRecords += 1;
        wire = [5, encodeFinding(entry.finding, schema)];
      } else if (
        entry.operation === "SUBMIT_FINDING" ||
        entry.operation === "AMEND_FINDING"
      ) {
        findingRecords += 1;
        wire = [
          entry.operation === "SUBMIT_FINDING" ? 6 : 7,
          encodeFinding(entry.finding, schema),
        ];
      } else if (entry.operation === "WITHDRAW_FINDING") {
        findingRecords += 1;
        wire = [
          8,
          expectString(entry.findingId, "findingId", 16),
        ];
      } else {
        conclusionRecords += 1;
        wire = [9, encodeConclusion(entry.conclusion, schema)];
      }
      if (
        entry.operation === "VIEW_SCOPE" ||
        entry.operation === "INSPECT_EVIDENCE" ||
        entry.operation === "BOOKMARK_EVIDENCE" ||
        entry.operation === "INSPECT_SOURCE_RECORD" ||
        entry.operation === "VIEW_HINT"
      ) {
        const identity = JSON.stringify(wire);
        if (seenInteractions.has(identity)) {
          throw new Error(
            "TA2 command journal must not contain duplicate interactions.",
          );
        }
        seenInteractions.add(identity);
      }
      return wire;
    },
  );
  if (
    draftRecords >
      schema.auditCase.inputLimits.maximumDraftRecords ||
    findingRecords >
    schema.auditCase.inputLimits.maximumFindingRecords
  ) {
    throw new Error(
      "TA2 workpaper journal exceeds the authored record limits.",
    );
  }
  if (conclusionRecords > 1) {
    throw new Error("TA2 permits exactly one submitted conclusion.");
  }
  const wire = [
    "TA2",
    schema.configurationHash,
    schema.packContentHash,
    schema.scenarioId,
    schema.scenarioVersion,
    schema.auditCase.auditCaseId,
    schema.auditCase.version,
    assignmentWire(snapshot, schema),
    commandJournal,
  ];
  const encoded =
    PREFIX +
    base64UrlEncode(
      deflateSync(strToU8(JSON.stringify(wire)), { level: 9 }),
    );
  if (encoded.length > TA2_SUSPEND_DATA_CEILING) {
    throw new Error(
      `TA2 snapshot is ${String(encoded.length)} characters, above the ${String(TA2_SUSPEND_DATA_CEILING)}-character ceiling.`,
    );
  }
  return encoded;
}

export function decodeTa2AuditSnapshot(
  encoded: string,
  schema: Ta2AuditCodecSchema,
): Ta2AuditSnapshot {
  if (
    !encoded.startsWith(PREFIX) ||
    encoded.length > TA2_SUSPEND_DATA_CEILING
  ) {
    throw new Error("Stored progress is not a bounded TA2 payload.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      strFromU8(
        inflateSync(
          base64UrlDecode(encoded.slice(PREFIX.length)),
        ),
      ),
    );
  } catch (error) {
    throw new Error(
      `Stored TA2 progress could not be decoded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const wire = expectArray(parsed, "TA2");
  if (
    wire.length !== 9 ||
    wire[0] !== "TA2" ||
    wire[1] !== schema.configurationHash ||
    wire[2] !== schema.packContentHash ||
    wire[3] !== schema.scenarioId ||
    wire[4] !== schema.scenarioVersion ||
    wire[5] !== schema.auditCase.auditCaseId ||
    wire[6] !== schema.auditCase.version
  ) {
    throw new Error(
      "Stored TA2 progress is incompatible with this exact configuration and Audit case.",
    );
  }
  const storedHeader = decodeStoredAssignment(wire[7]);
  const assignment =
    storedHeader === null
      ? null
      : assignmentFromStoredHeader(storedHeader, schema);
  if (
    (schema.variantBank === undefined) !==
    (assignment === null)
  ) {
    throw new Error(
      "Stored TA2 variant assignment does not match this package.",
    );
  }
  const values = caseIndexes(schema.auditCase);
  const commandWire = expectArray(
    wire[8],
    "TA2.commandJournal",
  );
  if (
    commandWire.length >
    maximumCommandRecords(schema.auditCase)
  ) {
    throw new Error("Stored TA2 command journal exceeds its limit.");
  }
  const seenInteractions = new Set<string>();
  let draftRecords = 0;
  let findingRecords = 0;
  let conclusionRecords = 0;
  const commandJournal = commandWire.map(
    (value, index): AuditCommandJournalEntry => {
      const entry = expectArray(
        value,
        `TA2.commandJournal[${String(index)}]`,
      );
      const operation = expectInteger(
        entry[0],
        `TA2.commandJournal[${String(index)}][0]`,
        0,
        9,
      );
      if (
        (operation === 0 && entry.length !== 1) ||
        (operation !== 0 && entry.length !== 2)
      ) {
        throw new Error(
          "TA2 command journal entry has an invalid shape.",
        );
      }
      if (operation <= 4) {
        const identity = JSON.stringify(entry);
        if (seenInteractions.has(identity)) {
          throw new Error(
            "Stored TA2 command journal contains duplicate interactions.",
          );
        }
        seenInteractions.add(identity);
      }
      if (operation === 0) return { operation: "VIEW_SCOPE" };
      if (operation === 1 || operation === 2) {
        return {
          operation:
            operation === 1
              ? "INSPECT_EVIDENCE"
              : "BOOKMARK_EVIDENCE",
          evidenceId: atIndex(
            values.evidence,
            entry[1],
            `TA2.commandJournal[${String(index)}][1]`,
          ),
        };
      }
      if (operation === 3) {
        return {
          operation: "INSPECT_SOURCE_RECORD",
          sourceRecordId: atIndex(
            values.sourceRecords,
            entry[1],
            `TA2.commandJournal[${String(index)}][1]`,
          ),
        };
      }
      if (operation === 4) {
        return {
          operation: "VIEW_HINT",
          hintId: atIndex(
            values.hints,
            entry[1],
            `TA2.commandJournal[${String(index)}][1]`,
          ),
        };
      }
      if (operation === 5) {
        draftRecords += 1;
        return {
          operation: "SAVE_DRAFT",
          finding: decodeFinding(
            entry[1],
            schema,
            `TA2.commandJournal[${String(index)}][1]`,
          ),
        };
      }
      if (operation === 6 || operation === 7) {
        findingRecords += 1;
        return {
          operation:
            operation === 6
              ? "SUBMIT_FINDING"
              : "AMEND_FINDING",
          finding: decodeFinding(
            entry[1],
            schema,
            `TA2.commandJournal[${String(index)}][1]`,
          ),
        };
      }
      if (operation === 8) {
        findingRecords += 1;
        return {
          operation: "WITHDRAW_FINDING",
          findingId: expectString(
            entry[1],
            `TA2.commandJournal[${String(index)}][1]`,
            16,
          ),
        };
      }
      conclusionRecords += 1;
      return {
        operation: "SUBMIT_CONCLUSION",
        conclusion: decodeConclusion(
          entry[1],
          schema,
          `TA2.commandJournal[${String(index)}][1]`,
        ),
      };
    },
  );
  if (
    draftRecords >
      schema.auditCase.inputLimits.maximumDraftRecords ||
    findingRecords >
      schema.auditCase.inputLimits.maximumFindingRecords ||
    conclusionRecords > 1
  ) {
    throw new Error(
      "Stored TA2 workpaper journal exceeds its authored record limits.",
    );
  }
  return {
    variantAssignment: assignment,
    commandJournal,
  };
}

function parsedWire(encoded: string): readonly unknown[] {
  if (
    !encoded.startsWith(PREFIX) ||
    encoded.length > TA2_SUSPEND_DATA_CEILING
  ) {
    throw new Error("Stored progress is not a bounded TA2 payload.");
  }
  try {
    return expectArray(
      JSON.parse(
        strFromU8(
          inflateSync(
            base64UrlDecode(encoded.slice(PREFIX.length)),
          ),
        ),
      ),
      "TA2",
    );
  } catch (error) {
    throw new Error(
      `Stored TA2 progress could not be decoded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function decodeStoredAssignment(
  value: unknown,
): Ta2AuditStoredHeader["assignment"] {
  if (value === null) return null;
  const wire = expectArray(value, "TA2.variantAssignment");
  if (wire.length !== 3) {
    throw new Error("TA2 variant assignment has an invalid shape.");
  }
  const variantIndex = expectInteger(
    wire[0],
    "TA2.variantAssignment[0]",
    0,
    100,
  );
  const attemptSeed = expectString(
    wire[1],
    "TA2.variantAssignment[1]",
    64,
  );
  validateAttemptSeed(attemptSeed);
  const sourceIndex = expectInteger(
    wire[2],
    "TA2.variantAssignment[2]",
    0,
    ASSIGNMENT_SOURCES.length - 1,
  );
  return {
    variantIndex,
    attemptSeed,
    assignmentSource: ASSIGNMENT_SOURCES[sourceIndex]!,
  };
}

function assignmentFromStoredHeader(
  stored: NonNullable<Ta2AuditStoredHeader["assignment"]>,
  schema: Ta2AuditCodecSchema,
): AuditVariantAssignmentV1 {
  if (schema.variantBank === undefined) {
    throw new Error(
      "Stored TA2 progress contains an unexpected variant assignment.",
    );
  }
  return assignmentForVariant({
    bank: {
      bankId: schema.variantBank.bankId,
      bankVersion: schema.variantBank.bankVersion,
      variants: schema.variantBank.variants.map((variant) => ({
        metadata: {
          variantId: variant.variantId,
          variantVersion: variant.variantVersion,
          contentHash: variant.contentHash,
          caseReference: variant.caseReference,
        },
      })),
    },
    variantIndex: stored.variantIndex,
    attemptSeed: stored.attemptSeed,
    assignmentSource: stored.assignmentSource,
  });
}

export function inspectTa2AuditStoredHeader(
  encoded: string,
): Ta2AuditStoredHeader {
  const wire = parsedWire(encoded);
  if (wire.length !== 9 || wire[0] !== "TA2") {
    throw new Error("Stored progress is not an active TA2 payload.");
  }
  return {
    configurationHash: expectString(
      wire[1],
      "TA2.configurationHash",
      128,
    ),
    packContentHash: expectString(
      wire[2],
      "TA2.packContentHash",
      128,
    ),
    scenarioId: expectString(wire[3], "TA2.scenarioId", 96),
    scenarioVersion: expectString(
      wire[4],
      "TA2.scenarioVersion",
      96,
    ),
    auditCaseId: expectString(wire[5], "TA2.auditCaseId", 96),
    auditCaseVersion: expectString(
      wire[6],
      "TA2.auditCaseVersion",
      96,
    ),
    assignment: decodeStoredAssignment(wire[7]),
  };
}

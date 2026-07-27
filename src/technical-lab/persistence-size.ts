import type {
  TechnicalExperimentStep,
  TechnicalLabPackBundle,
} from "./contracts";

export const TECHNICAL_LAB_SUSPEND_DATA_LIMIT = 3_800;
export const TECHNICAL_LAB_CODEC_MAGIC = "TL1";

export const TECHNICAL_LAB_SECTION_BUDGET = {
  metadata: 360,
  progress: 80,
  actions: 2_450,
  responses: 650,
  hints: 80,
  framingAndIntegrity: 180,
} as const;

export interface TechnicalLabPersistenceSizeBreakdown {
  readonly metadata: number;
  readonly progress: number;
  readonly actions: number;
  readonly responses: number;
  readonly hints: number;
  readonly framingAndIntegrity: number;
  readonly total: number;
}

type WorstCaseActionWire = readonly [
  moduleIndex: number,
  experimentIndex: number,
  stepIndex: number,
  occurrenceIndex: number,
  operandA: number,
  operandB: number,
];

function utf8Length(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function base64UrlLength(byteLength: number): number {
  return Math.floor((byteLength * 8 + 5) / 6);
}

function encodedSectionLength(value: unknown): number {
  return base64UrlLength(utf8Length(value));
}

function worstCaseOperands(
  step: TechnicalExperimentStep,
): readonly [number, number] {
  return step.actionType === "EDIT_INPUT"
    ? [
        Math.max(
          0,
          (step.editConstraint?.maximumInputUtf8Bytes ?? 1) - 1,
        ),
        1_114_111,
      ]
    : [65_535, 65_535];
}

/**
 * The future TL1 codec stores only bounded indexes and numeric edit deltas.
 * This estimator intentionally reserves both operands for every action, even
 * where the real action needs none, so the authored maximum is conservative.
 */
export function technicalLabWorstCaseSize(
  bundle: TechnicalLabPackBundle,
): TechnicalLabPersistenceSizeBreakdown {
  const actions: WorstCaseActionWire[] = [];
  bundle.modules.forEach((module, moduleIndex) => {
    module.experimentDefinitions.forEach(
      (experiment, experimentIndex) => {
        experiment.steps.forEach((step, stepIndex) => {
          const [operandA, operandB] = worstCaseOperands(step);
          for (
            let occurrenceIndex = 0;
            occurrenceIndex < step.maximumOccurrences;
            occurrenceIndex += 1
          ) {
            actions.push([
              moduleIndex,
              experimentIndex,
              stepIndex,
              occurrenceIndex,
              operandA,
              operandB,
            ]);
          }
        });
      },
    );
  });
  const scorableItems = bundle.modules.flatMap(
    (module) => module.scorableItemIds,
  );
  const responses = scorableItems.map(
    (_itemId, itemIndex) =>
      [itemIndex, 31, 3] as const,
  );
  const hintCount = bundle.modules.reduce(
    (total, module) => total + module.hintIds.length,
    0,
  );
  const metadata = encodedSectionLength([
    "f".repeat(64),
    bundle.pack.labPackId,
    bundle.pack.labPackVersion,
    bundle.pack.presetId,
    "SES_".padEnd(96, "X"),
  ]);
  const progress = encodedSectionLength([
    bundle.modules.length - 1,
    (1 << bundle.modules.length) - 1,
    1,
    1,
  ]);
  const actionCharacters = encodedSectionLength(actions);
  const responseCharacters = encodedSectionLength(responses);
  const hints = encodedSectionLength([
    hintCount.toString(36).padStart(
      Math.ceil(hintCount / 5),
      "z",
    ),
  ]);
  // Magic, separators, a full SHA-256 integrity value, and JSON-array framing.
  const framingAndIntegrity =
    TECHNICAL_LAB_CODEC_MAGIC.length + 3 + 64 + 24;
  return {
    metadata,
    progress,
    actions: actionCharacters,
    responses: responseCharacters,
    hints,
    framingAndIntegrity,
    total:
      metadata +
      progress +
      actionCharacters +
      responseCharacters +
      hints +
      framingAndIntegrity,
  };
}

export function assertTechnicalLabWorstCaseFits(
  bundle: TechnicalLabPackBundle,
): TechnicalLabPersistenceSizeBreakdown {
  const breakdown = technicalLabWorstCaseSize(bundle);
  for (const section of Object.keys(
    TECHNICAL_LAB_SECTION_BUDGET,
  ) as Array<keyof typeof TECHNICAL_LAB_SECTION_BUDGET>) {
    if (breakdown[section] > TECHNICAL_LAB_SECTION_BUDGET[section]) {
      throw new Error(
        `Technical Laboratory ${section} requires ${breakdown[section]} ` +
          `characters, over its ${TECHNICAL_LAB_SECTION_BUDGET[section]}-character budget`,
      );
    }
  }
  if (breakdown.total > TECHNICAL_LAB_SUSPEND_DATA_LIMIT) {
    throw new Error(
      `Technical Laboratory worst case requires ${breakdown.total} characters, ` +
        `over the ${TECHNICAL_LAB_SUSPEND_DATA_LIMIT}-character ceiling`,
    );
  }
  return breakdown;
}

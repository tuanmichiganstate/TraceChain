import type { BusinessSimulationConfiguration } from "../../config/types";
import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { ScenarioDefinition } from "../types/scenario";
import type { ScoreComponent } from "../types/scoring";
import { validateScenario } from "./validate-scenario";

export type VariantBankStatus =
  | "DRAFT"
  | "EXPERT_REVIEWED"
  | "PILOT_CALIBRATED"
  | "RETIRED";

export interface VariantBlueprintItem {
  readonly blueprintItemId: string;
  readonly class: "OPERATIONAL" | "KNOWLEDGE";
  readonly maximumPoints: number;
  readonly scoreComponent: ScoreComponent;
}

export interface VariantAssessmentBlueprint {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly maximumScore: number;
  readonly passingScore: number;
  readonly operationalPoints: number;
  readonly knowledgePoints: number;
  readonly itemBlueprints: readonly VariantBlueprintItem[];
  readonly targetCompetencyIndicatorIds: readonly string[];
  readonly evidenceRoles: readonly string[];
  readonly consequentialDecisionRoles: readonly string[];
  readonly feedbackPolicy: "IMMEDIATE" | "STAGE_END" | "FINAL";
  readonly hintPolicy: "ENABLED" | "LIMITED" | "DISABLED";
  readonly estimatedMinutes: {
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly complexityBand: "INTRODUCTORY" | "INTERMEDIATE";
}

export interface ScenarioVariantProfile {
  readonly certificateCondition: string;
  readonly discrepancyPattern: string;
  readonly provenancePattern: string;
  readonly recallPattern: string;
  readonly evidencePattern: string;
}

export interface ScenarioVariantMetadata {
  readonly variantId: string;
  readonly variantVersion: string;
  readonly caseReference: string;
  readonly contentHash: string;
  readonly answerPatternHash: string;
  readonly difficultyBand: "INTERMEDIATE";
  readonly estimatedMinutes: number;
  readonly variationProfile: ScenarioVariantProfile;
}

export interface ScenarioVariant {
  readonly metadata: ScenarioVariantMetadata;
  readonly scenario: ScenarioDefinition;
}

export interface ScenarioVariantBank {
  readonly bankId: string;
  readonly bankVersion: string;
  readonly status: VariantBankStatus;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly supportedModes: readonly (
    | "PRACTICE"
    | "CHALLENGE"
  )[];
  readonly blueprint: VariantAssessmentBlueprint;
  /** Immutable order used by selection algorithm version 1. */
  readonly variants: readonly ScenarioVariant[];
}

export interface ScenarioVariantAssignment {
  readonly bankId: string;
  readonly bankVersion: string;
  readonly variantIndex: number;
  readonly variantId: string;
  readonly variantVersion: string;
  readonly variantContentHash: string;
  readonly attemptSeed: string;
  readonly selectionAlgorithmVersion: "1";
  readonly caseReference: string;
  readonly assignmentSource:
    | "SCORM_ATTEMPT"
    | "STANDALONE_ATTEMPT"
    | "HOSTED_ASSIGNMENT";
}

export interface CuratedVariantSelectionBank {
  readonly bankId: string;
  readonly bankVersion: string;
  readonly variants: readonly {
    readonly metadata: {
      readonly variantId: string;
      readonly variantVersion: string;
      readonly contentHash: string;
      readonly caseReference: string;
    };
  }[];
}

export interface VariantBankValidationIssue {
  readonly severity: "ERROR" | "WARNING";
  readonly path: string;
  readonly message: string;
}

export interface VariantBankValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly VariantBankValidationIssue[];
}

const ATTEMPT_SEED_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const PORTABLE_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/;

export function hashScenarioVariant(
  scenario: ScenarioDefinition,
): string {
  return sha256Hex(
    canonicalize({
      domain: "SIMULEDGER_SCENARIO_VARIANT_V1",
      scenario,
    }),
  );
}

export function hashAnswerPattern(value: unknown): string {
  return sha256Hex(
    canonicalize({
      domain: "SIMULEDGER_VARIANT_ANSWER_PATTERN_V1",
      value,
    }),
  );
}

function blueprintItems(
  scenario: ScenarioDefinition,
): readonly VariantBlueprintItem[] {
  const operational = scenario.stages.flatMap((stage) =>
    stage.scoredActions.map((action) => ({
      blueprintItemId: action.decisionId,
      class: "OPERATIONAL" as const,
      maximumPoints: action.points,
      scoreComponent: action.scoreComponent,
    })),
  );
  const knowledge = scenario.stages.flatMap((stage) =>
    stage.knowledgeChecks
      .filter((check) => check.isScored)
      .map((check) => ({
        blueprintItemId: check.knowledgeCheckId,
        class: "KNOWLEDGE" as const,
        maximumPoints: check.points,
        scoreComponent: check.scoreComponent,
      })),
  );
  return [...operational, ...knowledge].sort((left, right) =>
    left.blueprintItemId.localeCompare(right.blueprintItemId),
  );
}

export function assessmentBlueprintFromScenario(options: {
  readonly blueprintId: string;
  readonly blueprintVersion: string;
  readonly scenario: ScenarioDefinition;
  readonly equivalence: Pick<
    VariantAssessmentBlueprint,
    | "targetCompetencyIndicatorIds"
    | "evidenceRoles"
    | "consequentialDecisionRoles"
    | "feedbackPolicy"
    | "hintPolicy"
    | "estimatedMinutes"
    | "complexityBand"
  >;
}): VariantAssessmentBlueprint {
  const itemBlueprints = blueprintItems(options.scenario);
  const total = (kind: VariantBlueprintItem["class"]): number =>
    itemBlueprints
      .filter((item) => item.class === kind)
      .reduce((sum, item) => sum + item.maximumPoints, 0);
  return {
    blueprintId: options.blueprintId,
    blueprintVersion: options.blueprintVersion,
    maximumScore: options.scenario.scoringConfiguration.maxScore,
    passingScore: options.scenario.scoringConfiguration.passingScore,
    operationalPoints: total("OPERATIONAL"),
    knowledgePoints: total("KNOWLEDGE"),
    itemBlueprints,
    ...options.equivalence,
  };
}

function structuralSignature(
  scenario: ScenarioDefinition,
): string {
  const completionSignature = (
    condition: ScenarioDefinition["stages"][number]["completionConditions"][number],
  ): Readonly<Record<string, unknown>> => {
    const value = condition as unknown as Readonly<
      Record<string, unknown>
    >;
    return {
      conditionType: value["conditionType"],
      transactionType: value["transactionType"],
      decisionId: value["decisionId"],
      knowledgeCheckId: value["knowledgeCheckId"],
      assetScoped: "assetId" in value,
    };
  };
  return canonicalize({
    organizations: scenario.organizations,
    actors: scenario.actors,
    locations: scenario.locations,
    portraitAssets: scenario.portraitAssets,
    staffProfiles: scenario.staffProfiles,
    evidenceStaffAttributions:
      scenario.evidenceStaffAttributions.map((attribution) => ({
        staffProfileId: attribution.staffProfileId,
        relationship: attribution.relationship,
        occurredAt: attribution.occurredAt,
      })),
    decisionIds: scenario.decisionIds,
    hintIds: scenario.hintIds,
    stages: scenario.stages.map((stage) => ({
      stageId: stage.stageId,
      completionConditions: stage.completionConditions.map(
        completionSignature,
      ),
      hintTargets: stage.availableHints.map((hint) => ({
        hintId: hint.hintId,
        targetScorableItemIds: hint.targetScorableItemIds,
      })),
      scoredActions: stage.scoredActions.map((action) => ({
        decisionId: action.decisionId,
        points: action.points,
        scoreComponent: action.scoreComponent,
        transactionType: action.transactionType,
      })),
      knowledgeChecks: stage.knowledgeChecks.map((check) => ({
        knowledgeCheckId: check.knowledgeCheckId,
        checkType: check.checkType,
        optionCount: check.options.length,
        categoryCount: check.categories?.length ?? 0,
        points: check.points,
        isScored: check.isScored,
        scoreComponent: check.scoreComponent,
      })),
    })),
    scoringConfiguration: scenario.scoringConfiguration,
    ledgerConfiguration: scenario.ledgerConfiguration,
    trustedContexts: scenario.runtime.trustedContexts,
    initialContextByStage:
      scenario.runtime.initialContextByStage,
    roleHandoffs: scenario.runtime.roleHandoffs,
    journalLimits: scenario.runtime.journalLimits,
  });
}

export function validateVariantBank(options: {
  readonly bank: ScenarioVariantBank;
  readonly configuration?: BusinessSimulationConfiguration;
}): VariantBankValidationResult {
  const issues: VariantBankValidationIssue[] = [];
  const add = (
    severity: VariantBankValidationIssue["severity"],
    path: string,
    message: string,
  ): void => {
    issues.push({ severity, path, message });
  };
  const { bank } = options;

  if (!PORTABLE_IDENTIFIER.test(bank.bankId)) {
    add("ERROR", "bankId", "must be a bounded portable identifier");
  }
  if (!PORTABLE_IDENTIFIER.test(bank.bankVersion)) {
    add("ERROR", "bankVersion", "must be a bounded portable identifier");
  }
  const supportsChallenge =
    bank.supportedModes.includes("CHALLENGE");
  const minimumVariants = supportsChallenge ? 3 : 1;
  if (bank.variants.length < minimumVariants) {
    add(
      "ERROR",
      "variants",
      supportsChallenge
        ? "the Challenge bank must contain at least three curated variants"
        : "the Practice bank must contain at least one curated case",
    );
  }
  if (
    bank.supportedModes.length === 0 ||
    bank.supportedModes.length !==
      new Set(bank.supportedModes).size ||
    bank.supportedModes.some(
      (mode) => mode !== "PRACTICE" && mode !== "CHALLENGE",
    )
  ) {
    add(
      "ERROR",
      "supportedModes",
      "must contain unique Practice or Challenge support profiles",
    );
  }
  const variantIds = new Set<string>();
  const caseReferences = new Set<string>();
  const base = bank.variants[0]?.scenario;
  const expectedStructure =
    base === undefined ? null : structuralSignature(base);
  const expectedBlueprint =
    base === undefined
      ? null
      : assessmentBlueprintFromScenario({
          blueprintId: bank.blueprint.blueprintId,
          blueprintVersion: bank.blueprint.blueprintVersion,
          scenario: base,
          equivalence: {
            targetCompetencyIndicatorIds:
              bank.blueprint.targetCompetencyIndicatorIds,
            evidenceRoles: bank.blueprint.evidenceRoles,
            consequentialDecisionRoles:
              bank.blueprint.consequentialDecisionRoles,
            feedbackPolicy: bank.blueprint.feedbackPolicy,
            hintPolicy: bank.blueprint.hintPolicy,
            estimatedMinutes: bank.blueprint.estimatedMinutes,
            complexityBand: bank.blueprint.complexityBand,
          },
        });

  bank.variants.forEach((variant, index) => {
    const path = `variants[${String(index)}]`;
    if (variantIds.has(variant.metadata.variantId)) {
      add("ERROR", `${path}.variantId`, "must be unique within the bank");
    }
    variantIds.add(variant.metadata.variantId);
    if (caseReferences.has(variant.metadata.caseReference)) {
      add(
        "ERROR",
        `${path}.caseReference`,
        "must be unique within the bank",
      );
    }
    caseReferences.add(variant.metadata.caseReference);
    const scenarioResult = validateScenario(variant.scenario);
    for (const issue of scenarioResult.issues.filter(
      (candidate) => candidate.severity === "ERROR",
    )) {
      add(
        "ERROR",
        `${path}.scenario.${issue.path}`,
        issue.message,
      );
    }
    const actualHash = hashScenarioVariant(variant.scenario);
    if (actualHash !== variant.metadata.contentHash) {
      add(
        "ERROR",
        `${path}.contentHash`,
        "does not match the canonical scenario content",
      );
    }
    if (
      variant.scenario.scenarioId !==
        options.configuration?.scenarioId ||
      variant.scenario.scenarioVersion !==
        options.configuration?.scenarioVersion
    ) {
      if (options.configuration !== undefined) {
        add(
          "ERROR",
          `${path}.scenario`,
          "does not match the configured scenario family and version",
        );
      }
    }
    if (
      expectedStructure !== null &&
      structuralSignature(variant.scenario) !== expectedStructure
    ) {
      add(
        "ERROR",
        `${path}.structure`,
        "does not share the bank's organization, media, decision, scoring, and replay contract",
      );
    }
    const meaningfulDimensions = new Set(
      Object.values(variant.metadata.variationProfile),
    );
    if (meaningfulDimensions.size < 3) {
      add(
        "ERROR",
        `${path}.variationProfile`,
        "must describe at least three meaningful variation dimensions",
      );
    }
  });

  if (
    expectedBlueprint !== null &&
    canonicalize(bank.blueprint) !== canonicalize(expectedBlueprint)
  ) {
    add(
      "ERROR",
      "blueprint",
      "does not match the concrete score items in the variants",
    );
  }
  if (
    bank.blueprint.targetCompetencyIndicatorIds.length === 0 ||
    bank.blueprint.evidenceRoles.length === 0 ||
    bank.blueprint.consequentialDecisionRoles.length === 0 ||
    bank.blueprint.estimatedMinutes.minimum < 1 ||
    bank.blueprint.estimatedMinutes.maximum <
      bank.blueprint.estimatedMinutes.minimum ||
    bank.variants.some(
      (variant) =>
        variant.metadata.estimatedMinutes <
          bank.blueprint.estimatedMinutes.minimum ||
        variant.metadata.estimatedMinutes >
          bank.blueprint.estimatedMinutes.maximum ||
        variant.metadata.difficultyBand !==
          bank.blueprint.complexityBand,
    )
  ) {
    add(
      "ERROR",
      "blueprint.equivalence",
      "must define non-empty targets and contain every variant duration and complexity band",
    );
  }
  if (
    bank.variants.length > 1 &&
    new Set(
      bank.variants.map((variant) => variant.metadata.answerPatternHash),
    ).size < 2
  ) {
    add(
      "WARNING",
      "variants",
      "all variants have the same consequential answer pattern",
    );
  }
  if (bank.status !== "DRAFT") {
    add(
      "WARNING",
      "status",
      "the repository has no recorded Vietnamese subject-expert review",
    );
  }

  const configuredVariation = options.configuration?.scenarioVariation;
  if (
    options.configuration !== undefined &&
    !bank.supportedModes.includes(
      options.configuration.supportProfile as
        | "PRACTICE"
        | "CHALLENGE",
    )
  ) {
    add(
      "ERROR",
      "configuration.supportProfile",
      "is not supported by this variant bank",
    );
  }
  if (
    configuredVariation?.strategy === "SEEDED_VARIANT_BANK" &&
    (configuredVariation.bankId !== bank.bankId ||
      configuredVariation.bankVersion !== bank.bankVersion)
  ) {
    add(
      "ERROR",
      "configuration.scenarioVariation",
      "does not reference this exact bank",
    );
  }

  return {
    isValid: !issues.some((issue) => issue.severity === "ERROR"),
    issues,
  };
}

export function validateAttemptSeed(seed: string): void {
  if (!ATTEMPT_SEED_PATTERN.test(seed)) {
    throw new Error(
      "Attempt seed must be 16 to 64 unpadded base64url characters",
    );
  }
}

export function selectVariantIndex(options: {
  readonly bank: CuratedVariantSelectionBank;
  readonly attemptSeed: string;
  readonly selectionAlgorithmVersion: "1";
}): number {
  validateAttemptSeed(options.attemptSeed);
  if (options.bank.variants.length === 0) {
    throw new Error("Cannot select from an empty variant bank");
  }
  const digest = sha256Hex(
    canonicalize({
      domain: "SIMULEDGER_VARIANT_SELECTION_V1",
      bankId: options.bank.bankId,
      bankVersion: options.bank.bankVersion,
      attemptSeed: options.attemptSeed,
    }),
  );
  return Number(
    BigInt(`0x${digest}`) %
      BigInt(options.bank.variants.length),
  );
}

export function assignmentForVariant(options: {
  readonly bank: CuratedVariantSelectionBank;
  readonly variantIndex: number;
  readonly attemptSeed: string;
  readonly assignmentSource:
    ScenarioVariantAssignment["assignmentSource"];
}): ScenarioVariantAssignment {
  validateAttemptSeed(options.attemptSeed);
  const variant = options.bank.variants[options.variantIndex];
  if (variant === undefined) {
    throw new Error("Selected variant index is outside the bank");
  }
  return {
    bankId: options.bank.bankId,
    bankVersion: options.bank.bankVersion,
    variantIndex: options.variantIndex,
    variantId: variant.metadata.variantId,
    variantVersion: variant.metadata.variantVersion,
    variantContentHash: variant.metadata.contentHash,
    attemptSeed: options.attemptSeed,
    selectionAlgorithmVersion: "1",
    caseReference: variant.metadata.caseReference,
    assignmentSource: options.assignmentSource,
  };
}

export function selectVariantAssignment(options: {
  readonly bank: CuratedVariantSelectionBank;
  readonly attemptSeed: string;
  readonly assignmentSource:
    ScenarioVariantAssignment["assignmentSource"];
}): ScenarioVariantAssignment {
  return assignmentForVariant({
    bank: options.bank,
    variantIndex: selectVariantIndex({
      bank: options.bank,
      attemptSeed: options.attemptSeed,
      selectionAlgorithmVersion: "1",
    }),
    attemptSeed: options.attemptSeed,
    assignmentSource: options.assignmentSource,
  });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export interface AttemptSeedGenerator {
  nextSeed(): string;
}

export class BrowserAttemptSeedGenerator
  implements AttemptSeedGenerator
{
  nextSeed(): string {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }
}

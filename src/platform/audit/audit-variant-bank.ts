import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  assignmentForVariant,
  selectVariantIndex,
  validateAttemptSeed,
  type CuratedVariantSelectionBank,
} from "../../domain/scenario/variant-bank";
import {
  allocateHostedVariant,
  type HostedVariantAllocationAuditV1,
  type HostedVariantAllocationRequest,
} from "../../domain/scenario/hosted-variant-allocation";
import type {
  AuditCaseDefinitionV1,
  AuditVariantAssignmentV1,
  AuditVariantBankDefinitionV1,
} from "../contracts/audit";
import type {
  ScenarioDefinitionV1,
  ScenarioPackV2,
} from "../contracts/scenario-pack";

export interface AuditVariantBankValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface AuditVariantBankValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly AuditVariantBankValidationIssue[];
}

const PORTABLE_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/u;

export function hashAuditVariantScenario(
  scenario: ScenarioDefinitionV1,
): string {
  return sha256Hex(
    canonicalize({
      domain: "SIMULEDGER_AUDIT_VARIANT_V1",
      scenario,
    }),
  );
}

export function hashAuditAnswerPattern(value: unknown): string {
  return sha256Hex(
    canonicalize({
      domain: "SIMULEDGER_AUDIT_ANSWER_PATTERN_V1",
      value,
    }),
  );
}

function selectionBank(
  bank: AuditVariantBankDefinitionV1,
): CuratedVariantSelectionBank {
  return {
    bankId: bank.bankId,
    bankVersion: bank.bankVersion,
    variants: bank.variants.map((variant) => ({
      metadata: {
        variantId: variant.variantId,
        variantVersion: variant.variantVersion,
        contentHash: variant.contentHash,
        caseReference: variant.caseReference,
      },
    })),
  };
}

function auditCaseFor(
  pack: ScenarioPackV2,
  scenarioId: string,
  scenarioVersion: string,
): AuditCaseDefinitionV1 | undefined {
  return pack.scenarios.find(
    (scenario) =>
      scenario.scenarioId === scenarioId &&
      scenario.version === scenarioVersion,
  )?.auditCase;
}

export function validateAuditVariantBank(options: {
  readonly pack: ScenarioPackV2;
  readonly bank: AuditVariantBankDefinitionV1;
}): AuditVariantBankValidationResult {
  const issues: AuditVariantBankValidationIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const { bank, pack } = options;
  if (!PORTABLE_IDENTIFIER.test(bank.bankId)) {
    add("bankId", "must be a bounded portable identifier");
  }
  if (!PORTABLE_IDENTIFIER.test(bank.bankVersion)) {
    add("bankVersion", "must be a bounded portable identifier");
  }
  if (
    bank.supportedPurposes.length === 0 ||
    new Set(bank.supportedPurposes).size !==
      bank.supportedPurposes.length
  ) {
    add(
      "supportedPurposes",
      "must contain unique authored purposes",
    );
  }
  if (bank.variants.length < 3) {
    add(
      "variants",
      "an Audit Challenge or Assessment bank must contain at least three complete cases",
    );
  }
  const variantIds = new Set<string>();
  const caseReferences = new Set<string>();
  const answerPatterns = new Set<string>();
  bank.variants.forEach((variant, index) => {
    const path = `variants[${String(index)}]`;
    if (variantIds.has(variant.variantId)) {
      add(`${path}.variantId`, "must be unique within the bank");
    }
    variantIds.add(variant.variantId);
    if (caseReferences.has(variant.caseReference)) {
      add(
        `${path}.caseReference`,
        "must be unique within the bank",
      );
    }
    caseReferences.add(variant.caseReference);
    answerPatterns.add(variant.answerPatternHash);
    const scenario = pack.scenarios.find(
      (candidate) =>
        candidate.scenarioId === variant.scenarioId &&
        candidate.version === variant.scenarioVersion,
    );
    if (
      scenario === undefined ||
      scenario.auditCase === undefined ||
      scenario.auditCase.auditCaseId !== variant.auditCaseId ||
      scenario.auditCase.version !== variant.auditCaseVersion
    ) {
      add(
        `${path}.scenarioId`,
        "must reference one exact complete Audit scenario and case",
      );
      return;
    }
    if (hashAuditVariantScenario(scenario) !== variant.contentHash) {
      add(
        `${path}.contentHash`,
        "does not match the canonical complete Audit scenario",
      );
    }
    const auditCase = scenario.auditCase;
    if (!auditCase.supportProfiles.includes("CHALLENGE")) {
      add(
        `${path}.auditCaseId`,
        "must use the Challenge support profile",
      );
    }
    const materialFindings = auditCase.findingDefinitions.filter(
      (finding) => finding.expectedMateriality === "MATERIAL",
    ).length;
    const within = (
      value: number,
      range: { readonly minimum: number; readonly maximum: number },
    ): boolean => value >= range.minimum && value <= range.maximum;
    if (
      !within(
        materialFindings,
        bank.blueprint.materialFindingCount,
      ) ||
      !within(
        auditCase.decoyDefinitions.length,
        bank.blueprint.decoyCount,
      ) ||
      !within(
        auditCase.evidenceItemIds.length,
        bank.blueprint.evidenceItemCount,
      ) ||
      !within(auditCase.policyIds.length, bank.blueprint.policyCount) ||
      !within(
        variant.estimatedMinutes,
        bank.blueprint.estimatedMinutes,
      )
    ) {
      add(
        `${path}.equivalence`,
        "falls outside the authored finding, decoy, evidence, policy, or duration range",
      );
    }
    if (
      canonicalize(
        auditCase.scoringBlueprint.items.map((item) => ({
          scorableItemId: item.scorableItemId,
          maximumScore: item.maximumScore,
        })),
      ) !== canonicalize(bank.blueprint.scorableItemRoles) ||
      auditCase.scoringBlueprint.maximumScore !==
        bank.blueprint.maximumScore ||
      auditCase.scoringBlueprint.passScore !==
        bank.blueprint.passScore
    ) {
      add(
        `${path}.scoringBlueprint`,
        "does not match the bank equivalence blueprint",
      );
    }
  });
  if (answerPatterns.size < 2) {
    add(
      "variants",
      "must contain at least two distinct authored answer patterns",
    );
  }
  for (const indicatorId of bank.blueprint.targetCompetencyIndicatorIds) {
    if (
      !pack.competencyFrameworks.some((framework) =>
        framework.competencies.some((competency) =>
          competency.indicators.some(
            (indicator) =>
              indicator.indicatorId === indicatorId,
          ),
        ),
      )
    ) {
      add(
        "blueprint.targetCompetencyIndicatorIds",
        `references unknown indicator ${indicatorId}`,
      );
    }
  }
  return {
    isValid: issues.length === 0,
    issues,
  };
}

export function selectAuditVariantAssignment(options: {
  readonly bank: AuditVariantBankDefinitionV1;
  readonly attemptSeed: string;
  readonly assignmentSource:
    AuditVariantAssignmentV1["assignmentSource"];
}): AuditVariantAssignmentV1 {
  validateAttemptSeed(options.attemptSeed);
  const bank = selectionBank(options.bank);
  const variantIndex = selectVariantIndex({
    bank,
    attemptSeed: options.attemptSeed,
    selectionAlgorithmVersion: "1",
  });
  return assignmentForVariant({
    bank,
    variantIndex,
    attemptSeed: options.attemptSeed,
    assignmentSource: options.assignmentSource,
  });
}

export function allocateHostedAuditVariant(options: {
  readonly bank: AuditVariantBankDefinitionV1;
  readonly request: HostedVariantAllocationRequest;
}): {
  readonly assignment: AuditVariantAssignmentV1;
  readonly audit: HostedVariantAllocationAuditV1;
} {
  return allocateHostedVariant(
    selectionBank(options.bank),
    options.request,
  );
}

export function auditVariantAssignmentForIndex(options: {
  readonly bank: AuditVariantBankDefinitionV1;
  readonly variantIndex: number;
  readonly attemptSeed: string;
  readonly assignmentSource:
    AuditVariantAssignmentV1["assignmentSource"];
}): AuditVariantAssignmentV1 {
  return assignmentForVariant({
    bank: selectionBank(options.bank),
    variantIndex: options.variantIndex,
    attemptSeed: options.attemptSeed,
    assignmentSource: options.assignmentSource,
  });
}

export function resolveAuditVariant(options: {
  readonly pack: ScenarioPackV2;
  readonly bank: AuditVariantBankDefinitionV1;
  readonly assignment: AuditVariantAssignmentV1;
}): {
  readonly scenario: ScenarioDefinitionV1;
  readonly auditCase: AuditCaseDefinitionV1;
} {
  const { assignment, bank, pack } = options;
  validateAttemptSeed(assignment.attemptSeed);
  const expected = assignmentForVariant({
    bank: selectionBank(bank),
    variantIndex: assignment.variantIndex,
    attemptSeed: assignment.attemptSeed,
    assignmentSource: assignment.assignmentSource,
  });
  if (canonicalize(expected) !== canonicalize(assignment)) {
    throw new Error(
      "Audit variant assignment does not match the immutable bank.",
    );
  }
  const variant = bank.variants[assignment.variantIndex];
  const scenario = pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === variant?.scenarioId &&
      candidate.version === variant.scenarioVersion,
  );
  const auditCase =
    scenario === undefined
      ? undefined
      : auditCaseFor(
          pack,
          scenario.scenarioId,
          scenario.version,
        );
  if (
    variant === undefined ||
    scenario === undefined ||
    auditCase === undefined ||
    auditCase.auditCaseId !== variant.auditCaseId ||
    auditCase.version !== variant.auditCaseVersion ||
    hashAuditVariantScenario(scenario) !== variant.contentHash
  ) {
    throw new Error(
      "Audit variant assignment cannot resolve its exact authored case.",
    );
  }
  return { scenario, auditCase };
}

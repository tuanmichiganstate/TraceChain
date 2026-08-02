import type {
  HostedAssignmentScenarioSummaryV1,
} from "../contracts/assessment";
import type {
  DecisionNodeV1,
  ScenarioDefinitionV1,
  ScenarioPackV2,
} from "../contracts/scenario-pack";
import { allScorableItems } from "../../domain/types/scenario";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { hostedRuntimeKindFor } from "../hosted/runtime-registry";

export interface InstructorScenarioSummaryOptions {
  readonly technicalLabModuleCount?: number;
  readonly technicalLabMaximumScore?: number;
}

function decisionNodes(
  scenario: ScenarioDefinitionV1,
): readonly DecisionNodeV1[] {
  return scenario.nodes.filter(
    (node): node is DecisionNodeV1 => node.nodeType === "DECISION",
  );
}

function referencedImageCount(
  scenario: ScenarioDefinitionV1,
): number {
  return new Set([
    ...scenario.staffProfiles.map(
      (profile) => profile.portraitAssetId,
    ),
    ...scenario.nodes.flatMap((node) =>
      node.image === undefined ? [] : [node.image.assetId],
    ),
    ...scenario.evidenceItems.flatMap((evidence) =>
      evidence.image === undefined ? [] : [evidence.image.assetId],
    ),
  ]).size;
}

/**
 * Produce a bounded instructor preview from the exact immutable scenario.
 *
 * The projection intentionally contains structural counts and public labels,
 * never initial actual state, expected answers, hidden evidence assessments,
 * or realized outcomes. Those answer-sensitive fields remain behind the
 * scenario and run authorization boundaries.
 */
export function projectInstructorScenarioSummary(
  pack: ScenarioPackV2,
  scenario: ScenarioDefinitionV1,
  options: InstructorScenarioSummaryOptions = {},
): HostedAssignmentScenarioSummaryV1 {
  const runtimeKind = hostedRuntimeKindFor(scenario);
  if (runtimeKind === null) {
    throw new Error(
      `Scenario ${scenario.scenarioId} has no registered hosted runtime.`,
    );
  }
  const decisions = decisionNodes(scenario);
  const scoredDecisions = decisions.filter(
    (node) => node.assessment !== undefined,
  );
  const workflowMaximumScore = scoredDecisions.reduce(
    (total, node) => total + node.assessment!.maximumPoints,
    0,
  );
  const audit = scenario.auditCase;
  const technicalLab = runtimeKind === "technical-lab-v1";
  const nativeCoffee = runtimeKind === "native-coffee-v2";
  if (
    technicalLab &&
    (!Number.isInteger(options.technicalLabModuleCount) ||
      (options.technicalLabModuleCount ?? 0) < 1)
  ) {
    throw new Error(
      "A hosted Technical Laboratory summary requires its module count.",
    );
  }

  const activity: HostedAssignmentScenarioSummaryV1["activity"] =
    audit !== undefined
      ? {
          kind: "AUDIT",
          sourceRecordCount: audit.sourceRecords.length,
          maximumFindingCount:
            audit.completionDefinition.maximumSubmittedFindings,
          conclusionRequired:
            audit.completionDefinition.conclusionRequired,
        }
      : technicalLab
        ? {
            kind: "TECHNICAL_LAB",
            moduleCount: options.technicalLabModuleCount!,
          }
        : {
            kind: "WORKFLOW",
            decisionCount: decisions.length,
            reflectionCount: scenario.nodes.filter(
              (node) => node.nodeType === "REFLECTION",
            ).length,
            ...(nativeCoffee
              ? { learningStageCount: coffeeScenario.stages.length }
              : {}),
          };

  const assessment =
    audit !== undefined
      ? {
          scoredElementCount:
            audit.scoringBlueprint.items.length,
          maximumScore: audit.scoringBlueprint.maximumScore,
        }
      : technicalLab
        ? {
            scoredElementCount: options.technicalLabModuleCount!,
            ...(options.technicalLabMaximumScore === undefined
              ? {}
              : {
                  maximumScore:
                    options.technicalLabMaximumScore,
                }),
          }
        : nativeCoffee
          ? {
              scoredElementCount:
                allScorableItems(coffeeScenario).length,
              maximumScore:
                coffeeScenario.scoringConfiguration.maxScore,
            }
        : {
            scoredElementCount: scoredDecisions.length,
            ...(workflowMaximumScore === 0
              ? {}
              : { maximumScore: workflowMaximumScore }),
          };

  const auditVariantCalibrationStatus =
    pack.auditVariantBanks.find((bank) =>
      bank.variants.some(
        (variant) =>
          variant.scenarioId === scenario.scenarioId &&
          variant.scenarioVersion === scenario.version,
      ),
    )?.status;

  return {
    schemaVersion: "1.0.0",
    domain: pack.manifest.domain,
    scenarioStatus: scenario.status,
    runtimeKind:
      runtimeKind === "native-coffee-v2"
        ? "OPERATIONS"
        : runtimeKind === "audit-v1"
          ? "AUDIT"
          : runtimeKind === "technical-lab-v1"
            ? "TECHNICAL_LAB"
            : "GENERIC",
    authoredNodeCount: scenario.nodes.length,
    organizationIds: scenario.organizations.map(
      (organization) => organization.organizationId,
    ),
    roleIds: scenario.roles.map((role) => role.roleId),
    evidenceItems: scenario.evidenceItems.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      evidenceType: evidence.evidenceType,
    })),
    policyIds: scenario.policies.map((policy) => policy.policyId),
    learnerVisibleStaffCount: scenario.staffProfiles.filter(
      (profile) => profile.visibility === "LEARNER_VISIBLE",
    ).length,
    referencedImageCount: referencedImageCount(scenario),
    competencyTargetCount: scenario.competencyTargets.length,
    rubricCount: scenario.rubricIds.length,
    requiredResponses: {
      writtenJustification:
        technicalLab ||
        audit !== undefined ||
        decisions.some(
          (node) => node.justification?.required === true,
        ),
      evidenceCitations:
        (audit?.inputLimits.maximumEvidenceCitationsPerFinding ??
          0) > 0 ||
        decisions.some(
          (node) =>
            node.structuredResponse?.evidenceCitations?.required ===
            true,
        ),
      policyCitations:
        (audit?.inputLimits.maximumPolicyCitationsPerFinding ?? 0) >
          0 ||
        decisions.some(
          (node) =>
            node.structuredResponse?.policyCitations?.required ===
            true,
        ),
      confidenceRating:
        audit !== undefined ||
        decisions.some(
          (node) =>
            node.structuredResponse?.confidenceRating?.required ===
            true,
        ),
      adverseEventProbability: decisions.some(
        (node) =>
          node.structuredResponse?.adverseEventProbabilityPercent
            ?.required === true,
      ),
    },
    assessment,
    activity,
    instructorOnly: {
      stochasticOutcomeModelCount: scenario.outcomeModels.length,
      instructorIncidentCount: scenario.instructorIncidents.length,
      counterfactualDecisionCount: decisions.filter(
        (node) => node.counterfactual?.enabled === true,
      ).length,
      counterfactualConditionCount:
        scenario.counterfactualConditions.filter(
          (condition) => condition.enabled,
        ).length,
      ...(auditVariantCalibrationStatus === undefined
        ? {}
        : { auditVariantCalibrationStatus }),
    },
  };
}

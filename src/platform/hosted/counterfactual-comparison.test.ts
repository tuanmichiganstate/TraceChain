import { describe, expect, it } from "vitest";
import type {
  CounterfactualDecisionPointV1,
  CounterfactualRunMetadataV1,
} from "../contracts/counterfactual";
import type {
  LearnerRunProjectionV1,
  RunEventV1,
} from "../contracts/run-events";
import type { CounterfactualComparisonDimensionV1 } from "../contracts/scenario-pack";
import { createCounterfactualComparison } from "./counterfactual-comparison";

function event(
  runId: string,
  sequenceNumber: number,
  causationId: string,
  eventType: "RUN_CREATED" | "DECISION_SUBMITTED",
): RunEventV1 {
  return {
    schemaVersion: "1.0.0",
    sequenceNumber,
    eventId: `EVENT_${runId}_${String(sequenceNumber)}`,
    runId,
    idempotencyKey: `IDEMPOTENCY_${runId}_${String(sequenceNumber)}`,
    serverTimestampUtc: "2026-07-25T08:00:00.000Z",
    authenticatedUserId: "USER_LEARNER",
    simulationActorId: "ACTOR_CERTIFIER",
    organizationId: "ORG_CERTIFIER",
    roleId: "CERTIFIER",
    eventType,
    packId: "PACK_COFFEE",
    packVersion: "1.0.0",
    scenarioId: "SCENARIO_COFFEE",
    scenarioVersion: "1.0.0",
    payload:
      eventType === "RUN_CREATED"
        ? {}
        : {
            decision: {
              commandType: "SUBMIT_CERTIFICATE_DECISION",
              outcome: "CONTINUE",
            },
          },
    causationId,
    correlationId: runId,
    previousStateHash: "before",
    resultingStateHash: "after",
  };
}

function projection(
  runId: string,
  quantityKg: number,
): LearnerRunProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    runId,
    version: 2,
    roleId: "CERTIFIER",
    businessState: [
      {
        recordId: "LOT",
        value: { quantityKg },
      },
    ],
    ledgerState: { quantityKg },
    informationState: [
      {
        recordId: "CERTIFICATE",
        value: { status: "available" },
      },
    ],
    policyState: [],
    workflowState: {
      currentNodeId: "complete",
      completedNodeIds: ["certificate-decision"],
      permittedActionIds: [],
    },
  };
}

const point: CounterfactualDecisionPointV1 = {
  schemaVersion: "1.0.0",
  sourceRunId: "RUN_SOURCE",
  forkSequenceNumber: 1,
  forkNodeId: "NODE_CERTIFICATE",
  decisionId: "DECISION_CERTIFICATE",
  originalDecisionEventId: "EVENT_RUN_SOURCE_2",
  originalOptionIds: ["CONTINUE"],
  actorId: "ACTOR_CERTIFIER",
  organizationId: "ORG_CERTIFIER",
  roleId: "CERTIFIER",
  title: { localizationKey: "counterfactual.certificate" },
  fields: [],
  configuration: {
    enabled: true,
    availability: "AFTER_RUN_COMPLETION",
    permittedCreators: ["INSTRUCTOR"],
    allowedAlternativeOptionIds: ["CONTINUE", "HOLD"],
    comparisonDimensionIds: ["DIM_ACADEMIC_SCORE"],
    downstreamPolicy: "INTERACTIVE_AFTER_FORK",
    localizationKey: "counterfactual.certificate",
  },
};

const metadata: CounterfactualRunMetadataV1 = {
  schemaVersion: "1.0.0",
  branchRunId: "RUN_BRANCH",
  sourceRunId: "RUN_SOURCE",
  forkSequenceNumber: 1,
  forkNodeId: point.forkNodeId,
  forkActorId: point.actorId,
  forkOrganizationId: point.organizationId,
  forkRoleId: point.roleId,
  sourcePackId: "PACK_COFFEE",
  sourcePackVersion: "1.0.0",
  sourceScenarioId: "SCENARIO_COFFEE",
  sourceScenarioVersion: "1.0.0",
  sourceConfigurationHash: "a".repeat(64),
  sourceSeed: "SEED",
  sourceStateHash: "b".repeat(64),
  sourceInformationStateHash: "c".repeat(64),
  counterfactualType: "CONDITION",
  conditionIntervention: {
    conditionId: "CONDITION_CERTIFICATE_SIGNER",
    runtimeConditionKey: "COFFEE_CASE_VARIANT",
    originalValueId: "AUTHORIZED_CERTIFIER",
    alternativeValueId: "UNAUTHORIZED_TRANSPORTER",
    runtimeValue: "unauthorized-transporter",
    affectsInformationBeforeFork: true,
  },
  interventionId: "COMMAND_INTERVENTION",
  comparisonMode: "SINGLE_INTERVENTION",
  createdByUserId: "USER_INSTRUCTOR",
  createdAt: "2026-07-25T08:00:00.000Z",
};

const dimension: CounterfactualComparisonDimensionV1 = {
  dimensionId: "DIM_ACADEMIC_SCORE",
  title: { localizationKey: "dimension.academic.title" },
  description: {
    localizationKey: "dimension.academic.description",
  },
  valueType: "NUMBER",
  direction: "HIGHER_IS_BETTER",
  unit: "points",
  evaluation: {
    kind: "RUNTIME_METRIC",
    metricId: "ACADEMIC_SCORE",
    changedValueAttribution: "DIRECT_INTERVENTION_EFFECT",
  },
};

describe("counterfactual comparison", () => {
  it("does not attribute a compound condition branch only to its condition override", () => {
    const result = createCounterfactualComparison({
      metadata,
      point,
      comparisonDimensionIds: [dimension.dimensionId],
      dimensions: [dimension],
      sourceEvents: [
        event("RUN_SOURCE", 1, "COMMAND_CREATE", "RUN_CREATED"),
        event(
          "RUN_SOURCE",
          2,
          "COMMAND_SOURCE_DECISION",
          "DECISION_SUBMITTED",
        ),
      ],
      branchEvents: [
        event(
          "RUN_BRANCH",
          1,
          metadata.interventionId,
          "DECISION_SUBMITTED",
        ),
      ],
      forkProjection: projection("RUN_SOURCE", 1_000),
      originalProjection: projection("RUN_SOURCE", 1_000),
      alternativeProjection: projection("RUN_BRANCH", 100),
      originalMetrics: { ACADEMIC_SCORE: 70 },
      alternativeMetrics: { ACADEMIC_SCORE: 80 },
      classification: "EXPLORATORY_BRANCH",
    });

    expect(result.differences.attribution).toBe(
      "NOT_ATTRIBUTABLE",
    );
    expect(result.dimensions[0]).toMatchObject({
      originalValue: 70,
      alternativeValue: 80,
      difference: 10,
      attribution: "LATER_DECISION_EFFECT",
    });
  });
});

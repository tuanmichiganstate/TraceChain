import { describe, expect, it } from "vitest";
import type {
  AssignmentCounterfactualReportEntryV1,
  CounterfactualComparisonV1,
  CounterfactualRunMetadataV1,
} from "../contracts/counterfactual";
import type { LearnerRunProjectionV1 } from "../contracts/run-events";
import { createAssignmentCounterfactualReportSummary } from "./counterfactual-report";

function projection(runId: string): LearnerRunProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    runId,
    version: 1,
    roleId: "CERTIFIER",
    businessState: [],
    ledgerState: {},
    informationState: [],
    policyState: [],
    workflowState: {
      currentNodeId: "complete",
      completedNodeIds: [],
      permittedActionIds: [],
    },
  };
}

function metadata(
  branchRunId: string,
  forkNodeId: string,
  counterfactualType: "DECISION" | "CONDITION",
): CounterfactualRunMetadataV1 {
  return {
    schemaVersion: "1.0.0",
    branchRunId,
    sourceRunId: "RUN_SOURCE",
    forkSequenceNumber: 4,
    forkNodeId,
    forkActorId: "ACTOR_CERTIFIER",
    forkOrganizationId: "ORG_CERTIFIER",
    forkRoleId: "CERTIFIER",
    sourcePackId: "PACK_COFFEE",
    sourcePackVersion: "1.0.0",
    sourceScenarioId: "SCENARIO_COFFEE",
    sourceScenarioVersion: "1.0.0",
    sourceConfigurationHash: "a".repeat(64),
    sourceSeed: "SEED",
    sourceStateHash: "b".repeat(64),
    sourceInformationStateHash: "c".repeat(64),
    counterfactualType,
    interventionId: `COMMAND_${branchRunId}`,
    comparisonMode: "SINGLE_INTERVENTION",
    createdByUserId: "USER_INSTRUCTOR",
    createdAt: "2026-07-25T08:00:00.000Z",
  };
}

function comparison(
  branchMetadata: CounterfactualRunMetadataV1,
  classification:
    | "SINGLE_INTERVENTION"
    | "EXPLORATORY_BRANCH",
  academicDifference: number,
  processDifference: number,
): CounterfactualComparisonV1 {
  return {
    schemaVersion: "1.0.0",
    interpretation:
      "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY",
    counterfactualId: branchMetadata.branchRunId,
    sourceRunId: branchMetadata.sourceRunId,
    counterfactualType: branchMetadata.counterfactualType,
    forkNodeId: branchMetadata.forkNodeId,
    decisionId: "DECISION_CERTIFICATE",
    classification,
    hindsightLimitation:
      "REFLECTIVE_EXPLORATION_AFTER_COMPLETED_ATTEMPT",
    originalAssessedResult: {
      decision: {},
      officialGradePreserved: true,
      projection: projection(branchMetadata.sourceRunId),
    },
    alternativeExploratoryResult: {
      decision: {},
      officialGradeChanged: false,
      projection: projection(branchMetadata.branchRunId),
    },
    informationAvailableWhenDecisionWasMade: [],
    informationRevealedLaterRecordIds: [],
    timelines: {
      original: [],
      alternative: [],
    },
    differences: {
      changedBusinessRecordIds: [],
      ledgerChanged: false,
      workflowNodeChanged: false,
      attribution: "UNCHANGED",
    },
    dimensions: [
      {
        dimensionId: "DIM_ACADEMIC_SCORE",
        title: {
          localizationKey: "dimension.academic.title",
        },
        description: {
          localizationKey: "dimension.academic.description",
        },
        originalValue: 70,
        alternativeValue: 70 + academicDifference,
        difference: academicDifference,
        evaluationStatus: "EVALUATED",
        attribution: "DIRECT_INTERVENTION_EFFECT",
      },
      {
        dimensionId: "DIM_PROCESS_SCORE",
        title: {
          localizationKey: "dimension.process.title",
        },
        description: {
          localizationKey: "dimension.process.description",
        },
        originalValue: 60,
        alternativeValue: 60 + processDifference,
        difference: processDifference,
        evaluationStatus: "EVALUATED",
        attribution: "DIRECT_INTERVENTION_EFFECT",
      },
    ],
  };
}

function reportEntry(options: {
  readonly branchRunId: string;
  readonly forkNodeId: string;
  readonly counterfactualType: "DECISION" | "CONDITION";
  readonly status: "CREATED" | "IN_PROGRESS" | "COMPLETED";
  readonly classification?:
    | "SINGLE_INTERVENTION"
    | "EXPLORATORY_BRANCH";
  readonly academicDifference?: number;
  readonly processDifference?: number;
  readonly reflected?: boolean;
}): AssignmentCounterfactualReportEntryV1 {
  const branchMetadata = metadata(
    options.branchRunId,
    options.forkNodeId,
    options.counterfactualType,
  );
  return {
    learnerUserId: "USER_LEARNER",
    metadata: branchMetadata,
    branchStatus: options.status,
    comparison:
      options.classification === undefined
        ? null
        : comparison(
            branchMetadata,
            options.classification,
            options.academicDifference ?? 0,
            options.processDifference ?? 0,
          ),
    reflection:
      options.reflected === true
        ? {
            schemaVersion: "1.0.0",
            reflectionId: `REFLECTION_${options.branchRunId}`,
            branchRunId: options.branchRunId,
            response: {
              evidenceThatMattered: "Evidence",
              reasonForDifference: "Reason",
              foreseeableConsequences: "Consequences",
              laterInformation: "Later information",
              revisedDecisionRule: "Revised rule",
            },
            submittedByUserId: "USER_LEARNER",
            submittedAt: "2026-07-25T09:00:00.000Z",
          }
        : null,
    originalOfficialGradeChanged: false,
  };
}

describe("assignment counterfactual report summary", () => {
  it("summarizes exploration without inferring competency", () => {
    const summary = createAssignmentCounterfactualReportSummary([
      reportEntry({
        branchRunId: "BRANCH_A",
        forkNodeId: "NODE_CERTIFICATE",
        counterfactualType: "DECISION",
        status: "COMPLETED",
        classification: "SINGLE_INTERVENTION",
        academicDifference: 10,
        processDifference: 12.5,
        reflected: true,
      }),
      reportEntry({
        branchRunId: "BRANCH_B",
        forkNodeId: "NODE_CERTIFICATE",
        counterfactualType: "CONDITION",
        status: "COMPLETED",
        classification: "EXPLORATORY_BRANCH",
        academicDifference: -5,
        processDifference: -2.5,
      }),
      reportEntry({
        branchRunId: "BRANCH_C",
        forkNodeId: "NODE_RECALL",
        counterfactualType: "DECISION",
        status: "CREATED",
      }),
      reportEntry({
        branchRunId: "BRANCH_IN_PROGRESS",
        forkNodeId: "NODE_RECALL",
        counterfactualType: "DECISION",
        status: "IN_PROGRESS",
        classification: "EXPLORATORY_BRANCH",
        academicDifference: 100,
        processDifference: 100,
      }),
    ]);

    expect(summary).toEqual({
      totalBranches: 4,
      completedBranches: 2,
      reflectedBranches: 1,
      decisionBranches: 3,
      conditionBranches: 1,
      isolatedComparisons: 1,
      compoundComparisons: 2,
      branchesByForkNode: [
        {
          forkNodeId: "NODE_CERTIFICATE",
          branchCount: 2,
        },
        {
          forkNodeId: "NODE_RECALL",
          branchCount: 2,
        },
      ],
      averageAcademicScoreDifference: 2.5,
      averageProcessScoreDifference: 5,
    });
  });

  it("returns null averages when no comparison exists", () => {
    const summary = createAssignmentCounterfactualReportSummary([
      reportEntry({
        branchRunId: "BRANCH_PENDING",
        forkNodeId: "NODE_RECALL",
        counterfactualType: "DECISION",
        status: "CREATED",
      }),
    ]);

    expect(summary.averageAcademicScoreDifference).toBeNull();
    expect(summary.averageProcessScoreDifference).toBeNull();
  });
});

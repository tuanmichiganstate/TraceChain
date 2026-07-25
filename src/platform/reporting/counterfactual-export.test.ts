import { describe, expect, it } from "vitest";
import type {
  CounterfactualComparisonV1,
  CounterfactualReflectionV1,
  CounterfactualRunMetadataV1,
} from "../contracts/counterfactual";
import type { LearnerRunProjectionV1 } from "../contracts/run-events";
import {
  CounterfactualExportError,
  counterfactualComparisonFilename,
  createCounterfactualComparisonExport,
  serializeCounterfactualComparisonCsv,
  serializeCounterfactualComparisonJson,
} from "./counterfactual-export";

function projection(runId: string): LearnerRunProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    runId,
    version: 12,
    roleId: "PROCESSOR_OPERATOR",
    businessState: [
      {
        recordId: "LOT_QUANTITY",
        value: { quantityKg: 100 },
      },
    ],
    ledgerState: { recordedQuantityKg: 1_000 },
    informationState: [
      {
        recordId: "EVID_QUANTITY_RECORD",
        value: { physicalQuantityKg: 100 },
      },
    ],
    policyState: [],
    workflowState: {
      currentNodeId: "complete",
      completedNodeIds: ["discrepancy-decision"],
      permittedActionIds: [],
    },
  };
}

const metadata: CounterfactualRunMetadataV1 = {
  schemaVersion: "1.0.0",
  branchRunId: "RUN_COUNTERFACTUAL_001",
  sourceRunId: "RUN_SOURCE_001",
  forkSequenceNumber: 20,
  forkNodeId: "NODE_DISCREPANCY_DECISION",
  forkActorId: "ACT_PROCESSOR",
  forkOrganizationId: "ORG_PROCESSOR",
  forkRoleId: "PROCESSOR_OPERATOR",
  sourcePackId: "PACK_STANDARD_COFFEE_STAGE3",
  sourcePackVersion: "1.8.0",
  sourceScenarioId: "SCN_COFFEE_STAGE3_FOUNDATION",
  sourceScenarioVersion: "1.8.0",
  sourceConfigurationHash: "a".repeat(64),
  sourceSeed: "COUNTERFACTUAL_SEED",
  sourceStateHash: "b".repeat(64),
  sourceInformationStateHash: "c".repeat(64),
  counterfactualType: "DECISION",
  interventionId: "COMMAND_COUNTERFACTUAL_001",
  comparisonMode: "SINGLE_INTERVENTION",
  createdByUserId: "USER_INSTRUCTOR_001",
  createdAt: "2026-07-25T08:00:00.000Z",
};

const comparison: CounterfactualComparisonV1 = {
  schemaVersion: "1.0.0",
  interpretation:
    "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY",
  counterfactualId: metadata.branchRunId,
  sourceRunId: metadata.sourceRunId,
  forkNodeId: metadata.forkNodeId,
  decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
  classification: "SINGLE_INTERVENTION",
  hindsightLimitation:
    "REFLECTIVE_EXPLORATION_AFTER_COMPLETED_ATTEMPT",
  originalAssessedResult: {
    decision: { action: "IGNORE" },
    officialGradePreserved: true,
    projection: projection(metadata.sourceRunId),
  },
  alternativeExploratoryResult: {
    decision: { action: "APPEND_CORRECTION" },
    officialGradeChanged: false,
    projection: projection(metadata.branchRunId),
  },
  informationAvailableWhenDecisionWasMade: [
    {
      recordId: "EVID_QUANTITY_RECORD",
      value: { physicalQuantityKg: 100 },
    },
  ],
  informationRevealedLaterRecordIds: [
    "EVID_CORRECTION_AUDIT",
  ],
  timelines: {
    original: [
      {
        sequenceNumber: 21,
        eventId: "EVENT_ORIGINAL_001",
        eventType: "DECISION_SUBMITTED",
        occurredAt: "2026-07-25T08:01:00.000Z",
        causationId: "COMMAND_ORIGINAL_001",
      },
    ],
    alternative: [
      {
        sequenceNumber: 1,
        eventId: "EVENT_ALTERNATIVE_001",
        eventType: "DECISION_SUBMITTED",
        occurredAt: "2026-07-25T08:02:00.000Z",
        causationId: metadata.interventionId,
      },
    ],
  },
  differences: {
    changedBusinessRecordIds: ["LOT_QUANTITY"],
    ledgerChanged: true,
    workflowNodeChanged: false,
    attribution: "DOWNSTREAM_STATE_EFFECT",
  },
  dimensions: [
    {
      dimensionId: "DIM_ACADEMIC_SCORE",
      title: { localizationKey: "dimension.score.title" },
      description: {
        localizationKey: "dimension.score.description",
      },
      originalValue: null,
      alternativeValue: null,
      difference: null,
      evaluationStatus:
        "AWAITING_AUTHORED_EVALUATION_RULE",
    },
  ],
};

const reflection: CounterfactualReflectionV1 = {
  schemaVersion: "1.0.0",
  reflectionId: "REFLECTION_COUNTERFACTUAL_001",
  branchRunId: metadata.branchRunId,
  response: {
    evidenceThatMattered: "The physical count.",
    reasonForDifference: "The append-only correction.",
    foreseeableConsequences: "More audit work.",
    laterInformation: "The recall scope.",
    revisedDecisionRule: "Investigate before correction.",
  },
  submittedByUserId: "USER_INSTRUCTOR_001",
  submittedAt: "2026-07-25T08:03:00.000Z",
};

describe("counterfactual comparison export", () => {
  it("serializes one exact branch as stable JSON and flat CSV", () => {
    const exported = createCounterfactualComparisonExport({
      metadata,
      comparison,
      reflection,
      generatedAt: "2026-07-25T09:00:00.000Z",
    });

    expect(
      JSON.parse(serializeCounterfactualComparisonJson(exported)),
    ).toEqual(exported);
    const csv = serializeCounterfactualComparisonCsv(exported);
    expect(csv).toMatch(
      /^export_schema_version,record_type,counterfactual_id,/u,
    );
    expect(csv).toContain(
      "counterfactual,RUN_COUNTERFACTUAL_001,RUN_SOURCE_001",
    );
    expect(csv).toContain("original_timeline_event");
    expect(csv).toContain("alternative_timeline_event");
    expect(csv).toContain("comparison_dimension");
    expect(csv).toContain("reflection");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(
      counterfactualComparisonFilename(
        "RUN/COUNTERFACTUAL:001",
        "json",
      ),
    ).toBe(
      "TraceChain_RUN_COUNTERFACTUAL_001_counterfactual_v1.json",
    );
  });

  it("rejects records from different branches", () => {
    expect(() =>
      createCounterfactualComparisonExport({
        metadata,
        comparison: {
          ...comparison,
          counterfactualId: "RUN_OTHER",
        },
        reflection,
        generatedAt: "2026-07-25T09:00:00.000Z",
      }),
    ).toThrow(CounterfactualExportError);
    expect(() =>
      createCounterfactualComparisonExport({
        metadata,
        comparison,
        reflection: {
          ...reflection,
          branchRunId: "RUN_OTHER",
        },
        generatedAt: "2026-07-25T09:00:00.000Z",
      }),
    ).toThrow(CounterfactualExportError);
  });
});

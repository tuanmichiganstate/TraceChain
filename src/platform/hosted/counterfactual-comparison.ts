import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  CounterfactualComparisonV1,
  CounterfactualDecisionPointV1,
  CounterfactualRunMetadataV1,
} from "../contracts/counterfactual";
import type { JsonValue } from "../contracts/json";
import type {
  LearnerRunProjectionV1,
  RunEventV1,
} from "../contracts/run-events";
import type {
  CounterfactualComparisonDimensionV1,
} from "../contracts/scenario-pack";
import type {
  CounterfactualRuntimeMetrics,
  CounterfactualRuntimeMetricValue,
} from "./counterfactual-metrics";

interface VisibleRecord {
  readonly recordId: string;
  readonly value: JsonValue;
}

function changedRecordIds(
  original: readonly VisibleRecord[],
  alternative: readonly VisibleRecord[],
): readonly string[] {
  const left = new Map(
    original.map((record) => [
      record.recordId,
      canonicalize(record.value),
    ]),
  );
  const right = new Map(
    alternative.map((record) => [
      record.recordId,
      canonicalize(record.value),
    ]),
  );
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((recordId) => left.get(recordId) !== right.get(recordId))
    .sort();
}

function decisionPayload(
  event: RunEventV1 | undefined,
): JsonValue | null {
  if (event === undefined) return null;
  if (event.payload.decision !== undefined) {
    return structuredClone(event.payload.decision);
  }
  if (
    event.payload.decisionId !== undefined &&
    event.payload.responses !== undefined
  ) {
    return {
      decisionId: event.payload.decisionId,
      responses: event.payload.responses,
      justification: event.payload.justification ?? "",
    };
  }
  return null;
}

function timeline(
  events: readonly RunEventV1[],
): readonly {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly causationId: string;
}[] {
  return events.map((event) => ({
    sequenceNumber: event.sequenceNumber,
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.serverTimestampUtc,
    causationId: event.causationId,
  }));
}

function metricValue(
  metrics: CounterfactualRuntimeMetrics,
  metricId: string,
): CounterfactualRuntimeMetricValue {
  const value = metrics[metricId];
  if (value === undefined) {
    throw new Error(
      `Runtime did not provide authored counterfactual metric ${metricId}.`,
    );
  }
  return value;
}

function metricDifference(
  definition: CounterfactualComparisonDimensionV1,
  original: CounterfactualRuntimeMetricValue,
  alternative: CounterfactualRuntimeMetricValue,
): JsonValue {
  if (
    definition.valueType === "NUMBER" ||
    definition.valueType === "ORDINAL"
  ) {
    if (
      typeof original !== "number" ||
      typeof alternative !== "number"
    ) {
      throw new Error(
        `Counterfactual metric ${definition.evaluation.metricId} must be numeric.`,
      );
    }
    return Math.round((alternative - original) * 10) / 10;
  }
  return {
    changed: original !== alternative,
    original,
    alternative,
  };
}

export function createCounterfactualComparison(options: {
  readonly metadata: CounterfactualRunMetadataV1;
  readonly point: CounterfactualDecisionPointV1;
  readonly comparisonDimensionIds: readonly string[];
  readonly dimensions:
    readonly CounterfactualComparisonDimensionV1[];
  readonly sourceEvents: readonly RunEventV1[];
  readonly branchEvents: readonly RunEventV1[];
  readonly forkProjection: LearnerRunProjectionV1;
  readonly originalProjection: LearnerRunProjectionV1;
  readonly alternativeProjection: LearnerRunProjectionV1;
  readonly originalMetrics: CounterfactualRuntimeMetrics;
  readonly alternativeMetrics: CounterfactualRuntimeMetrics;
  readonly classification:
    | "SINGLE_INTERVENTION"
    | "EXPLORATORY_BRANCH";
}): CounterfactualComparisonV1 {
  const originalDecision =
    options.sourceEvents[options.metadata.forkSequenceNumber];
  const alternativeDecision = options.branchEvents.find(
    (event) =>
      event.causationId === options.metadata.interventionId &&
      (event.eventType === "DECISION_SUBMITTED" ||
        event.eventType === "DECISION_REJECTED"),
  );
  const forkInformationIds = new Set(
    options.forkProjection.informationState.map(
      (record) => record.recordId,
    ),
  );
  const revealedLater = options.originalProjection.informationState
    .filter((record) => !forkInformationIds.has(record.recordId))
    .map((record) => record.recordId)
    .sort();
  const changedBusinessRecordIds = changedRecordIds(
    options.originalProjection.businessState,
    options.alternativeProjection.businessState,
  );
  const ledgerChanged =
    canonicalize(options.originalProjection.ledgerState) !==
    canonicalize(options.alternativeProjection.ledgerState);
  const attribution =
    options.classification === "EXPLORATORY_BRANCH"
      ? ("NOT_ATTRIBUTABLE" as const)
      : options.metadata.counterfactualType === "CONDITION"
      ? ("CONDITION_OVERRIDE_EFFECT" as const)
      : ("DOWNSTREAM_STATE_EFFECT" as const);
  return {
    schemaVersion: "1.0.0" as const,
    interpretation:
      "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY" as const,
    counterfactualId: options.metadata.branchRunId,
    sourceRunId: options.metadata.sourceRunId,
    counterfactualType: options.metadata.counterfactualType,
    forkNodeId: options.metadata.forkNodeId,
    decisionId: options.point.decisionId,
    ...(options.metadata.conditionIntervention === undefined
      ? {}
      : {
          conditionChange: {
            conditionId:
              options.metadata.conditionIntervention.conditionId,
            originalValueId:
              options.metadata.conditionIntervention.originalValueId,
            alternativeValueId:
              options.metadata.conditionIntervention.alternativeValueId,
            affectsInformationBeforeFork:
              options.metadata.conditionIntervention
                .affectsInformationBeforeFork,
          },
        }),
    classification: options.classification,
    hindsightLimitation:
      "REFLECTIVE_EXPLORATION_AFTER_COMPLETED_ATTEMPT" as const,
    originalAssessedResult: {
      decision: decisionPayload(originalDecision),
      officialGradePreserved: true,
      projection: options.originalProjection,
    },
    alternativeExploratoryResult: {
      decision: decisionPayload(alternativeDecision),
      officialGradeChanged: false,
      projection: options.alternativeProjection,
    },
    informationAvailableWhenDecisionWasMade:
      options.forkProjection.informationState,
    informationRevealedLaterRecordIds: revealedLater,
    timelines: {
      original: timeline(
        options.sourceEvents.slice(
          options.metadata.forkSequenceNumber,
        ),
      ),
      alternative: timeline(options.branchEvents),
    },
    differences: {
      changedBusinessRecordIds,
      ledgerChanged,
      workflowNodeChanged:
        options.originalProjection.workflowState.currentNodeId !==
        options.alternativeProjection.workflowState.currentNodeId,
      attribution:
        changedBusinessRecordIds.length > 0 || ledgerChanged
          ? attribution
          : ("UNCHANGED" as const),
    },
    dimensions: options.dimensions
      .filter((dimension) =>
        options.comparisonDimensionIds.includes(
          dimension.dimensionId,
        ),
      )
      .map((dimension) => {
        const originalValue = metricValue(
          options.originalMetrics,
          dimension.evaluation.metricId,
        );
        const alternativeValue = metricValue(
          options.alternativeMetrics,
          dimension.evaluation.metricId,
        );
        const difference = metricDifference(
          dimension,
          originalValue,
          alternativeValue,
        );
        const unchanged =
          canonicalize(originalValue) ===
          canonicalize(alternativeValue);
        return {
          ...dimension,
          originalValue,
          alternativeValue,
          difference,
          evaluationStatus: "EVALUATED" as const,
          attribution: unchanged
            ? ("UNCHANGED" as const)
            : options.classification === "EXPLORATORY_BRANCH"
              ? ("LATER_DECISION_EFFECT" as const)
              : options.metadata.counterfactualType ===
                  "CONDITION"
                ? ("CONDITION_OVERRIDE_EFFECT" as const)
              : dimension.evaluation.changedValueAttribution,
        };
      }),
  };
}

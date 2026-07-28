import type {
  HostedAssignmentReportV1,
} from "../contracts/assessment";
import type {
  AssignmentProcessAnalyticsV1,
  ProcessAnalyticsDecisionV1,
  ProcessAnalyticsEvidenceRequestV1,
  ProcessAnalyticsRunV1,
  ProcessAnalyticsSourceObservationV1,
} from "../contracts/process-analytics";
import type { RunEventV1 } from "../contracts/run-events";
import type {
  CounterfactualRuntimeMetrics,
} from "../hosted/counterfactual-metrics";

export class ProcessAnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessAnalyticsError";
  }
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string")
    ? value
    : [];
}

function increment(
  record: Record<string, number>,
  key: string,
): void {
  record[key] = (record[key] ?? 0) + 1;
}

function elapsedSeconds(
  earlier: string | undefined,
  later: string,
): number | null {
  if (earlier === undefined) return null;
  const difference = Date.parse(later) - Date.parse(earlier);
  return Number.isFinite(difference)
    ? Math.max(0, Math.floor(difference / 1000))
    : null;
}

function observation(
  event: RunEventV1,
  payloadKey: "evidenceId" | "policyId",
): ProcessAnalyticsSourceObservationV1 | null {
  const itemId = event.payload[payloadKey];
  return typeof itemId !== "string"
    ? null
    : {
        eventId: event.eventId,
        sequenceNumber: event.sequenceNumber,
        recordedAt: event.serverTimestampUtc,
        itemId,
      };
}

function evidenceRequest(
  event: RunEventV1,
): ProcessAnalyticsEvidenceRequestV1 {
  const evidenceId = event.payload.evidenceId;
  const simulatedAvailableAt =
    event.payload.simulatedAvailableAt;
  const delayMinutes = event.payload.delayMinutes;
  const costUnits = event.payload.costUnits;
  const permissionPolicyId = event.payload.permissionPolicyId;
  if (
    typeof evidenceId !== "string" ||
    typeof simulatedAvailableAt !== "string" ||
    !Number.isInteger(delayMinutes) ||
    (delayMinutes as number) < 0 ||
    typeof costUnits !== "number" ||
    !Number.isFinite(costUnits) ||
    costUnits < 0 ||
    (permissionPolicyId !== undefined &&
      typeof permissionPolicyId !== "string")
  ) {
    throw new ProcessAnalyticsError(
      `Evidence-request event ${event.eventId} has invalid authored acquisition metadata.`,
    );
  }
  return {
    eventId: event.eventId,
    sequenceNumber: event.sequenceNumber,
    recordedAt: event.serverTimestampUtc,
    itemId: evidenceId,
    simulatedAvailableAt,
    delayMinutes: delayMinutes as number,
    costUnits,
    ...(permissionPolicyId === undefined
      ? {}
      : { permissionPolicyId }),
  };
}

function decision(
  event: RunEventV1,
  previousSubmittedAt: string | undefined,
): ProcessAnalyticsDecisionV1 | null {
  const nestedDecision =
    typeof event.payload.decision === "object" &&
    event.payload.decision !== null &&
    !Array.isArray(event.payload.decision)
      ? (event.payload.decision as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const decisionId =
    typeof event.payload.decisionId === "string"
      ? event.payload.decisionId
      : typeof nestedDecision?.decisionId === "string"
        ? nestedDecision.decisionId
        : nestedDecision?.commandType;
  if (typeof decisionId !== "string") return null;
  return {
    eventId: event.eventId,
    sequenceNumber: event.sequenceNumber,
    recordedAt: event.serverTimestampUtc,
    decisionId,
    citedEvidenceIds: stringArray(
      event.payload.citedEvidenceIds,
    ),
    citedPolicyIds: stringArray(event.payload.citedPolicyIds),
    confidenceRating:
      typeof event.payload.confidenceRating === "number"
        ? event.payload.confidenceRating
        : null,
    adverseEventProbabilityPercent:
      typeof event.payload.adverseEventProbabilityPercent ===
      "number"
        ? event.payload.adverseEventProbabilityPercent
        : null,
    elapsedSincePreviousSubmissionSeconds: elapsedSeconds(
      previousSubmittedAt,
      event.serverTimestampUtc,
    ),
  };
}

export function createAssignmentProcessAnalytics(input: {
  readonly report: HostedAssignmentReportV1;
  readonly events: readonly RunEventV1[];
  readonly professionalConsequencesByRun?: Readonly<
    Record<string, CounterfactualRuntimeMetrics>
  >;
  readonly generatedAt: string;
}): AssignmentProcessAnalyticsV1 {
  const { assignment } = input.report;
  const runOwners = new Map(
    input.report.learners.flatMap((learner) =>
      learner.runs.map((run) => [
        run.runId,
        learner.learnerUserId,
      ] as const),
    ),
  );
  const expectedEventCounts = new Map(
    input.report.learners.flatMap((learner) =>
      learner.runs.map((run) => [run.runId, run.eventCount] as const),
    ),
  );
  const eventsByRun = new Map<string, RunEventV1[]>();
  for (const event of input.events) {
    if (
      !runOwners.has(event.runId) ||
      event.packId !== assignment.packId ||
      event.packVersion !== assignment.packVersion ||
      event.scenarioId !== assignment.scenarioId ||
      event.scenarioVersion !== assignment.scenarioVersion
    ) {
      throw new ProcessAnalyticsError(
        `Event ${event.eventId} is outside the exact assignment source.`,
      );
    }
    const collected = eventsByRun.get(event.runId) ?? [];
    collected.push(event);
    eventsByRun.set(event.runId, collected);
  }
  for (const [runId, expectedEventCount] of expectedEventCounts) {
    if ((eventsByRun.get(runId) ?? []).length !== expectedEventCount) {
      throw new ProcessAnalyticsError(
        `Run ${runId} event count does not match the authoritative assignment report.`,
      );
    }
  }

  const evidenceRequestCounts: Record<string, number> = {};
  const evidenceInspectionCounts: Record<string, number> = {};
  const evidenceCitationCounts: Record<string, number> = {};
  const policyConsultationCounts: Record<string, number> = {};
  const policyCitationCounts: Record<string, number> = {};
  const decisionSubmissionCounts: Record<string, number> = {};
  let rejectedAttemptCount = 0;
  let mitigationCount = 0;
  let authoredRequestDelayMinutesTotal = 0;
  let authoredRequestCostUnitsTotal = 0;
  const runs: ProcessAnalyticsRunV1[] = [];

  for (const [runId, learnerUserId] of [...runOwners].sort()) {
    const events = [...(eventsByRun.get(runId) ?? [])].sort(
      (left, right) => left.sequenceNumber - right.sequenceNumber,
    );
    let previousSubmittedAt: string | undefined;
    const decisions: ProcessAnalyticsDecisionV1[] = [];
    for (const event of events) {
      if (event.eventType !== "DECISION_SUBMITTED") continue;
      const derived = decision(event, previousSubmittedAt);
      if (derived === null) continue;
      decisions.push(derived);
      previousSubmittedAt = event.serverTimestampUtc;
      increment(decisionSubmissionCounts, derived.decisionId);
      derived.citedEvidenceIds.forEach((evidenceId) =>
        increment(evidenceCitationCounts, evidenceId),
      );
      derived.citedPolicyIds.forEach((policyId) =>
        increment(policyCitationCounts, policyId),
      );
    }
    const evidenceRequestOrder = events.flatMap((event) => {
      if (event.eventType !== "EVIDENCE_REQUESTED") return [];
      const derived = evidenceRequest(event);
      increment(evidenceRequestCounts, derived.itemId);
      authoredRequestDelayMinutesTotal += derived.delayMinutes;
      authoredRequestCostUnitsTotal += derived.costUnits;
      return [derived];
    });
    const evidenceInspectionOrder = events.flatMap((event) => {
      if (event.eventType !== "EVIDENCE_INSPECTED") return [];
      const derived = observation(event, "evidenceId");
      if (derived !== null) {
        increment(evidenceInspectionCounts, derived.itemId);
      }
      return derived === null ? [] : [derived];
    });
    const policyConsultationOrder = events.flatMap((event) => {
      if (event.eventType !== "POLICY_CONSULTED") return [];
      const derived = observation(event, "policyId");
      if (derived !== null) {
        increment(policyConsultationCounts, derived.itemId);
      }
      return derived === null ? [] : [derived];
    });
    const rejectedAttemptEventIds = events
      .filter(
        (event) =>
          event.eventType === "DECISION_REJECTED" ||
          event.eventType === "TRANSACTION_REJECTED" ||
          event.eventType === "ENDORSEMENT_PROPOSAL_REJECTED" ||
          event.eventType === "ENDORSEMENT_REJECTED" ||
          event.eventType === "ENDORSED_TRANSACTION_REJECTED",
      )
      .map((event) => event.eventId);
    const mitigationEventIds = events
      .filter((event) => event.eventType === "MITIGATION_RECORDED")
      .map((event) => event.eventId);
    rejectedAttemptCount += rejectedAttemptEventIds.length;
    mitigationCount += mitigationEventIds.length;
    runs.push({
      runId,
      learnerUserId,
      evidenceRequestOrder,
      evidenceInspectionOrder,
      policyConsultationOrder,
      decisions,
      rejectedAttemptEventIds,
      mitigationEventIds,
      reflectionEventIds: events
        .filter(
          (event) => event.eventType === "REFLECTION_SUBMITTED",
        )
        .map((event) => event.eventId),
      professionalConsequences:
        input.professionalConsequencesByRun?.[runId] ?? {},
    });
  }

  return {
    schemaVersion: "1.2.0",
    reportType: "TRACECHAIN_ASSIGNMENT_PROCESS_ANALYTICS",
    interpretation:
      "DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE",
    ruleVersion: "TRACECHAIN_PROCESS_ANALYTICS_V1@1.2.0",
    assignmentId: assignment.assignmentId,
    packId: assignment.packId,
    packVersion: assignment.packVersion,
    scenarioId: assignment.scenarioId,
    scenarioVersion: assignment.scenarioVersion,
    generatedAt: input.generatedAt,
    runs,
    summary: {
      runCount: runs.length,
      evidenceRequestCounts,
      evidenceInspectionCounts,
      evidenceCitationCounts,
      policyConsultationCounts,
      policyCitationCounts,
      decisionSubmissionCounts,
      rejectedAttemptCount,
      mitigationCount,
      authoredRequestDelayMinutesTotal,
      authoredRequestCostUnitsTotal,
    },
    limitations: [
      "ELAPSED_INTERVAL_IS_NOT_ATTENTION",
      "NO_MOTIVATION_OR_ABILITY_INFERENCE",
      "NO_AUTOMATED_HIGH_STAKES_DECISION",
    ],
  };
}

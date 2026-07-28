export interface ProcessAnalyticsSourceObservationV1 {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly recordedAt: string;
  readonly itemId: string;
}

export interface ProcessAnalyticsEvidenceRequestV1
  extends ProcessAnalyticsSourceObservationV1 {
  readonly simulatedAvailableAt: string;
  readonly delayMinutes: number;
  readonly costUnits: number;
  readonly permissionPolicyId?: string;
}

export interface ProcessAnalyticsDecisionV1 {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly recordedAt: string;
  readonly decisionId: string;
  readonly citedEvidenceIds: readonly string[];
  readonly citedPolicyIds: readonly string[];
  readonly confidenceRating: number | null;
  readonly adverseEventProbabilityPercent: number | null;
  readonly elapsedSincePreviousSubmissionSeconds: number | null;
}

export interface ProcessAnalyticsRunV1 {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly evidenceRequestOrder:
    readonly ProcessAnalyticsEvidenceRequestV1[];
  readonly evidenceInspectionOrder:
    readonly ProcessAnalyticsSourceObservationV1[];
  readonly policyConsultationOrder:
    readonly ProcessAnalyticsSourceObservationV1[];
  readonly decisions: readonly ProcessAnalyticsDecisionV1[];
  readonly rejectedAttemptEventIds: readonly string[];
  readonly mitigationEventIds: readonly string[];
  readonly reflectionEventIds: readonly string[];
  readonly professionalConsequences:
    Readonly<Record<string, number | string | boolean>>;
}

export interface AssignmentProcessAnalyticsV1 {
  readonly schemaVersion: "1.1.0";
  readonly reportType:
    "TRACECHAIN_ASSIGNMENT_PROCESS_ANALYTICS";
  readonly interpretation:
    "DESCRIPTIVE_EVENT_LINKED_NO_LEARNER_TRAIT_INFERENCE";
  readonly ruleVersion:
    "TRACECHAIN_PROCESS_ANALYTICS_V1@1.1.0";
  readonly assignmentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly generatedAt: string;
  readonly runs: readonly ProcessAnalyticsRunV1[];
  readonly summary: {
    readonly runCount: number;
    readonly evidenceInspectionCounts:
      Readonly<Record<string, number>>;
    readonly evidenceRequestCounts:
      Readonly<Record<string, number>>;
    readonly evidenceCitationCounts:
      Readonly<Record<string, number>>;
    readonly policyConsultationCounts:
      Readonly<Record<string, number>>;
    readonly decisionSubmissionCounts:
      Readonly<Record<string, number>>;
    readonly rejectedAttemptCount: number;
    readonly mitigationCount: number;
    readonly authoredRequestDelayMinutesTotal: number;
    readonly authoredRequestCostUnitsTotal: number;
  };
  readonly limitations: readonly [
    "ELAPSED_INTERVAL_IS_NOT_ATTENTION",
    "NO_MOTIVATION_OR_ABILITY_INFERENCE",
    "NO_AUTOMATED_HIGH_STAKES_DECISION",
  ];
}

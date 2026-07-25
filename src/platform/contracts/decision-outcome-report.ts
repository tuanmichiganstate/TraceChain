export interface HostedDecisionItemEvidenceV1 {
  readonly decisionItemId: string;
  readonly isAuthoredCorrect: boolean;
}

export interface HostedRealizedOutcomeEvidenceV1 {
  readonly outcomeModelId: string;
  readonly strategy: "forced" | "probabilistic";
  readonly outcomeCode: string;
}

export interface HostedActiveRunDecisionOutcomeEvidenceV1 {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "active";
  readonly decisionItems: readonly [];
  readonly realizedOutcome: null;
}

export interface HostedCompletedRunDecisionOutcomeEvidenceV1 {
  readonly runId: string;
  readonly learnerUserId: string;
  readonly status: "completed";
  readonly decisionItems: readonly HostedDecisionItemEvidenceV1[];
  readonly realizedOutcome: HostedRealizedOutcomeEvidenceV1;
}

export type HostedRunDecisionOutcomeEvidenceV1 =
  | HostedActiveRunDecisionOutcomeEvidenceV1
  | HostedCompletedRunDecisionOutcomeEvidenceV1;

export interface HostedAssignmentDecisionOutcomeReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly interpretation:
    "DECISION_PROCESS_SEPARATE_FROM_REALIZED_OUTCOME";
  readonly assignmentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly runs: readonly HostedRunDecisionOutcomeEvidenceV1[];
}

import {
  calculateScore,
  type ScoreInputs,
} from "../../domain/scoring/score-engine";
import {
  evaluateCertificateDecision,
} from "../../domain/simulation/consequential-decisions";
import type {
  TransferCustodyCommand,
} from "../../domain/commands/commands";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type { DecisionRecord } from "../../infrastructure/persistence/attempt-state";
import type { HostedStage3RunState } from "./stage3-types";

export type CounterfactualRuntimeMetricValue =
  | number
  | string
  | boolean;

export type CounterfactualRuntimeMetrics =
  Readonly<Record<string, CounterfactualRuntimeMetricValue>>;

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function custodyScopeCorrect(
  state: HostedStage3RunState,
): boolean | null {
  const proposal = Object.values(
    state.simulation.pendingProposalsById,
  ).find((candidate) => candidate.actionId === "TRANSFER_CUSTODY");
  if (proposal === undefined) return null;
  return !(
    proposal.command.payload as TransferCustodyCommand
  ).alsoTransfersOwnership;
}

function rejectedRecallAttemptCount(
  state: HostedStage3RunState,
): number {
  return state.simulation.attemptAuditEvents.filter(
    (event) =>
      (event.submittedCommand.payload as { commandType?: unknown })
        .commandType === "RECALL_BATCH",
  ).length;
}

function decisionRecord(
  answered: boolean,
  correct: boolean,
  attemptCount = 1,
): DecisionRecord | null {
  return answered
    ? {
        encodedValue: correct ? 1 : 0,
        attemptCount,
      }
    : null;
}

function hostedCoffeeScoreInputs(
  state: HostedStage3RunState,
): ScoreInputs {
  const decisions: Record<string, DecisionRecord> = {};
  const correctness: Record<string, boolean> = {};
  const record = (
    decisionId: string,
    answered: boolean,
    correct: boolean,
    attemptCount = 1,
  ): void => {
    const decision = decisionRecord(
      answered,
      correct,
      attemptCount,
    );
    if (decision === null) return;
    decisions[decisionId] = decision;
    correctness[decisionId] = correct;
  };

  // The hosted case begins after creation of the source batch. That authored
  // prerequisite is fixed across the source and every branch.
  record("INT_CREATE_BATCH", true, true);

  const certificate = state.decision;
  if (certificate !== null) {
    const evaluation = evaluateCertificateDecision(
      certificate.decision,
      coffeeScenario,
    );
    record(
      "INT_CERTIFICATE_STORAGE_CHOICE",
      true,
      evaluation.storageChoiceCorrect,
    );
    record(
      "INT_CERTIFICATE_ISSUER_CHECK",
      true,
      evaluation.issuerScorableCorrect,
    );
  }

  const custodyCorrect = custodyScopeCorrect(state);
  record(
    "INT_CUSTODY_TRANSFER_SCOPE",
    custodyCorrect !== null,
    custodyCorrect === true,
  );
  record(
    "INT_TRANSPORT_CONDITION",
    state.transportStatus !== "not-started",
    state.transportStatus === "committed",
  );
  record(
    "INT_RECEIVE_BATCH",
    state.receiptStatus !== "not-started",
    state.receiptStatus === "committed",
  );

  const discrepancy = state.discrepancyDecision;
  record(
    "INT_CORRECTION_RECORDED",
    discrepancy !== null,
    state.correctionStatus === "committed",
    discrepancy?.requiresMitigation === true ? 2 : 1,
  );
  record(
    "INT_TRANSFORM_BATCH",
    state.transformationStatus !== "not-started",
    state.transformationStatus === "committed",
  );
  const transformation =
    state.knowledgeDecisions["INT_TRANSFORMATION_PROVENANCE"];
  record(
    "INT_TRANSFORMATION_PROVENANCE",
    transformation !== undefined,
    transformation?.isAuthoredCorrect === true,
  );
  record(
    "INT_PACKAGE_BATCH",
    state.packagingStatus !== "not-started",
    state.packagingStatus === "committed",
  );
  record(
    "INT_OWNERSHIP_TRANSFER_SCOPE",
    state.distributionOwnershipStatus !== "not-started",
    state.distributionOwnershipStatus === "committed",
  );
  record(
    "INT_DISPATCH_BATCH",
    state.dispatchStatus !== "not-started",
    state.dispatchStatus === "committed",
  );
  const tamper =
    state.knowledgeDecisions["INT_TAMPER_DEMONSTRATION"];
  record(
    "INT_TAMPER_DEMONSTRATION",
    tamper !== undefined,
    tamper?.isAuthoredCorrect === true,
  );
  record(
    "INT_DATA_GOVERNANCE_CLASSIFICATION",
    state.dataGovernanceDecision !== null,
    state.dataGovernanceDecision?.isAuthoredCorrect === true,
  );
  record(
    "INT_RECALL_SCOPE",
    state.recallScopeDecision !== null,
    state.recallScopeDecision?.isAuthoredCorrect === true,
  );
  const rejectedRecallAttempts =
    rejectedRecallAttemptCount(state);
  record(
    "INT_RECALL_COMMITTED",
    state.recallStatus !== "not-started",
    state.recallStatus === "committed",
    Math.max(
      1,
      rejectedRecallAttempts +
        (state.recallStatus === "committed" ? 1 : 0),
    ),
  );
  const blockchain =
    state.knowledgeDecisions["INT_BLOCKCHAIN_NECESSITY"];
  record(
    "INT_BLOCKCHAIN_NECESSITY",
    blockchain !== undefined,
    blockchain?.isAuthoredCorrect === true,
  );
  return {
    decisions,
    correctness,
    hintsUsed: [],
  };
}

function processQualityPercent(
  state: HostedStage3RunState,
): number {
  const certificate = state.decision;
  const custodyCorrect = custodyScopeCorrect(state);
  const checks = [
    state.inspectedEvidenceIds.length > 0,
    (certificate?.citedEvidenceIds.length ?? 0) > 0,
    (certificate?.citedPolicyIds.length ?? 0) > 0,
    certificate?.isAuthoredCorrect === true,
    custodyCorrect === true,
    state.transportStatus === "committed",
    state.discrepancyDecision?.isScorableCorrect === true,
    state.discrepancyMitigationStatus === "not-required" ||
      state.discrepancyMitigationStatus === "completed",
    state.correctionStatus === "committed",
    state.knowledgeDecisions["INT_TRANSFORMATION_PROVENANCE"]
      ?.isAuthoredCorrect === true,
    state.dataGovernanceDecision?.isAuthoredCorrect === true,
    state.recallScopeDecision?.isAuthoredCorrect === true,
    state.recallStatus === "committed",
    state.knowledgeDecisions["INT_BLOCKCHAIN_NECESSITY"]
      ?.isAuthoredCorrect === true,
  ];
  return rounded(
    (checks.filter(Boolean).length / checks.length) * 100,
  );
}

function consumerSafetyLevel(
  state: HostedStage3RunState,
): number {
  const certificate = state.decision;
  const certificateSafe =
    certificate === null
      ? false
      : evaluateCertificateDecision(
          certificate.decision,
          coffeeScenario,
        ).lotDispositionCorrect;
  return (
    Number(certificateSafe) +
    Number(
      state.discrepancyDecision?.isScorableCorrect === true,
    ) +
    Number(state.recallScopeDecision?.isAuthoredCorrect === true) +
    Number(
      state.recallScopeDecision?.isAuthoredCorrect === true &&
        state.recallStatus === "committed",
    )
  );
}

function businessCostIndex(
  state: HostedStage3RunState,
): number {
  let cost = 0;
  const certificate = state.decision;
  if (certificate !== null) {
    const evaluation = evaluateCertificateDecision(
      certificate.decision,
      coffeeScenario,
    );
    if (certificate.decision.lotDisposition === "HOLD") cost += 1;
    if (
      certificate.decision.lotDisposition === "CONTINUE" &&
      !evaluation.lotDispositionCorrect
    ) {
      cost += 3;
    }
    if (
      certificate.decision.storageChoice ===
      "FULL_DOCUMENT_ON_CHAIN"
    ) {
      cost += 2;
    }
  }
  const discrepancyAction =
    state.discrepancyDecision?.decision.action;
  cost +=
    discrepancyAction === "APPEND_CORRECTION"
      ? 1
      : discrepancyAction === "INVESTIGATE_THEN_CORRECT"
        ? 2
        : discrepancyAction === "IGNORE"
          ? 4
          : discrepancyAction === "OVERWRITE" ||
              discrepancyAction === "DELETE"
            ? 5
            : 0;

  const selected =
    state.recallScopeDecision?.selectedAssetIds ?? [];
  if (selected.length > 0) {
    const affected = new Set([
      "BAT_PACKAGED_COFFEE_001",
      "BAT_ROASTED_COFFEE_001",
    ]);
    cost += selected.length;
    cost +=
      selected.filter((assetId) => !affected.has(assetId)).length *
      2;
  }
  return cost;
}

function complianceLevel(
  state: HostedStage3RunState,
): number {
  const certificate = state.decision;
  const evaluation =
    certificate === null
      ? null
      : evaluateCertificateDecision(
          certificate.decision,
          coffeeScenario,
        );
  return (
    Number(evaluation?.issuerScorableCorrect === true) +
    Number(evaluation?.storageChoiceCorrect === true) +
    Number(state.correctionStatus === "committed") +
    Number(state.recallStatus === "committed")
  );
}

function evidenceQualityLevel(
  state: HostedStage3RunState,
): number {
  const certificate = state.decision;
  const evaluation =
    certificate === null
      ? null
      : evaluateCertificateDecision(
          certificate.decision,
          coffeeScenario,
        );
  return (
    Number(
      state.inspectedEvidenceIds.length > 0 &&
        (certificate?.citedEvidenceIds.length ?? 0) > 0,
    ) +
    Number(evaluation?.certificateAssessmentCorrect === true) +
    Number(state.correctionStatus === "committed") +
    Number(state.recallScopeDecision?.isAuthoredCorrect === true)
  );
}

export function hostedCoffeeCounterfactualMetrics(
  state: HostedStage3RunState,
): CounterfactualRuntimeMetrics {
  const academicScore = calculateScore(
    hostedCoffeeScoreInputs(state),
    coffeeScenario,
  ).score.totalScore;
  return {
    ACADEMIC_SCORE: academicScore,
    PROCESS_QUALITY_PERCENT: processQualityPercent(state),
    CONSUMER_SAFETY_LEVEL: consumerSafetyLevel(state),
    BUSINESS_COST_INDEX: businessCostIndex(state),
    COMPLIANCE_LEVEL: complianceLevel(state),
    EVIDENCE_QUALITY_LEVEL: evidenceQualityLevel(state),
  };
}

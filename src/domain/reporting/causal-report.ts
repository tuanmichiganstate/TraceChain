import type { CompactCommandJournalEntry } from "../../infrastructure/persistence/tc3-codec";
import {
  assessRecallSelection,
  calculateRecallScope,
} from "../provenance/recall-scope";
import type { ScenarioDefinition } from "../types/scenario";
import {
  evaluateCertificateDecision,
  evaluateDiscrepancyDecision,
  expandCertificateDecision,
  expandDiscrepancyDecision,
} from "../simulation/consequential-decisions";
import { JournalOpcode } from "../simulation/command-journal";
import type { SimulationRuntimeState } from "../simulation/types";

export interface DiagnosticDimensions {
  readonly traceability: number;
  readonly dataIntegrity: number;
  readonly compliance: number;
  readonly consumerSafety: number;
  readonly operationalEfficiency: number;
  readonly governanceQuality: number;
}

export interface CausalExplanation {
  readonly messageKey: string;
  readonly values?: Readonly<Record<string, string | number>>;
}

export interface CausalReport {
  readonly dimensions: DiagnosticDimensions;
  readonly explanations: readonly CausalExplanation[];
  readonly manualReviewRecords: number;
  readonly missedAffectedLots: number;
  readonly unnecessaryRecallLots: number;
  readonly evidenceStrength: "STRONG" | "MODERATE" | "WEAK";
  readonly hintsUsed: number;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly configurationIdentifier: string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasOpcode(
  journal: readonly CompactCommandJournalEntry[],
  opcode: number,
): boolean {
  return journal.some((entry) => entry.opcode === opcode);
}

function recallSelection(
  scenario: ScenarioDefinition,
  journal: readonly CompactCommandJournalEntry[],
): readonly string[] {
  const entry = journal.find(
    (candidate) => candidate.opcode === JournalOpcode.RECALL_BATCH,
  );
  const indexes = entry?.values[0];
  if (!Array.isArray(indexes)) return [];
  const check = scenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find((candidate) => candidate.knowledgeCheckId === "INT_RECALL_SCOPE");
  if (check === undefined) return [];
  return indexes.flatMap((value) => {
    const option = check.options[value];
    return option === undefined ? [] : [option.optionId];
  });
}

/**
 * Deterministic diagnostic projection from replayable learner inputs.
 *
 * These dimensions explain outcomes; they are deliberately not a second grade.
 * Mitigation restores the business path but retains the operational and
 * governance cost of the original decision.
 */
export function buildCausalReport(options: {
  readonly scenario: ScenarioDefinition;
  readonly journal: readonly CompactCommandJournalEntry[];
  readonly runtime: SimulationRuntimeState;
  readonly hintsUsed: readonly string[];
  readonly configurationIdentifier: string;
}): CausalReport {
  let traceability = 100;
  let dataIntegrity = 100;
  let compliance = 100;
  let consumerSafety = 100;
  let operationalEfficiency = 100;
  let governanceQuality = 100;
  let manualReviewRecords = 0;
  const explanations: CausalExplanation[] = [];

  const certificateEntry = options.journal.find(
    (entry) => entry.opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
  );
  if (certificateEntry !== undefined) {
    const decision = expandCertificateDecision(certificateEntry.values);
    const evaluation = evaluateCertificateDecision(
      decision,
      options.scenario,
    );
    if (
      evaluation.certificateAssessmentCorrect &&
      evaluation.issuerAssessmentCorrect &&
      evaluation.storageChoiceCorrect &&
      evaluation.lotDispositionCorrect
    ) {
      explanations.push({
        messageKey: "report.causal.certificateStrong",
      });
    } else {
      manualReviewRecords +=
        evaluation.certificateAssessmentCorrect &&
        evaluation.issuerAssessmentCorrect
          ? 1
          : 2;
      operationalEfficiency -= 10;
      governanceQuality -= 8;
      if (
        !evaluation.certificateAssessmentCorrect ||
        !evaluation.issuerAssessmentCorrect
      ) {
        compliance -= 12;
        traceability -= 8;
        explanations.push({
          messageKey: hasOpcode(
            options.journal,
            JournalOpcode.REVIEW_ISSUER,
          )
            ? "report.causal.certificateReviewed"
            : "report.causal.certificateWeak",
          values: { count: manualReviewRecords },
        });
      }
      if (!evaluation.storageChoiceCorrect) {
        governanceQuality -= 15;
        operationalEfficiency -= 5;
        explanations.push({
          messageKey: hasOpcode(
            options.journal,
            JournalOpcode.REMEDIATE_STORAGE,
          )
            ? "report.causal.storageRemediated"
            : "report.causal.storageExposure",
        });
      }
      if (!evaluation.lotDispositionCorrect) {
        compliance -= 8;
      }
    }
  }

  const discrepancyEntry = options.journal.find(
    (entry) => entry.opcode === JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
  );
  if (discrepancyEntry !== undefined) {
    const decision = expandDiscrepancyDecision(discrepancyEntry.values);
    const evaluation = evaluateDiscrepancyDecision(
      decision,
      options.scenario,
    );
    if (evaluation.isScorableCorrect) {
      explanations.push({
        messageKey: "report.causal.correctionStrong",
      });
    } else {
      dataIntegrity -= 15;
      governanceQuality -= 10;
      operationalEfficiency -= 10;
      manualReviewRecords += 1;
      explanations.push({
        messageKey: evaluation.isRejectedAttempt
          ? "report.causal.correctionRejectedThenResolved"
          : "report.causal.correctionInvestigated",
      });
    }
  }

  const scopeCheck = options.scenario.stages
    .flatMap((stage) => stage.knowledgeChecks)
    .find((candidate) => candidate.knowledgeCheckId === "INT_RECALL_SCOPE");
  const selected = recallSelection(options.scenario, options.journal);
  const completeScope = calculateRecallScope(
    options.scenario.runtime.assetRoles.recallSourceAssetId,
    options.runtime.domain,
  );
  const offered = new Set(
    scopeCheck?.options.map((option) => option.optionId) ?? [],
  );
  const accuracy = assessRecallSelection(selected, {
    ...completeScope,
    affectedAssetIds: completeScope.affectedAssetIds.filter((assetId) =>
      offered.has(assetId),
    ),
  });
  if (accuracy.isExact) {
    explanations.push({ messageKey: "report.causal.recallExact" });
  } else {
    if (accuracy.missed.length > 0) {
      consumerSafety -= Math.min(60, accuracy.missed.length * 30);
      traceability -= Math.min(40, accuracy.missed.length * 20);
      compliance -= Math.min(30, accuracy.missed.length * 15);
    }
    if (accuracy.overSelected.length > 0) {
      operationalEfficiency -= Math.min(
        40,
        accuracy.overSelected.length * 15,
      );
    }
    explanations.push({
      messageKey:
        accuracy.missed.length > 0 && accuracy.overSelected.length > 0
          ? "report.causal.recallMixed"
          : accuracy.missed.length > 0
            ? "report.causal.recallNarrow"
            : "report.causal.recallBroad",
      values: {
        missed: accuracy.missed.length,
        extra: accuracy.overSelected.length,
      },
    });
  }

  const unauthorizedRecallAttempts =
    options.runtime.attemptAuditEvents.filter(
      (event) =>
        event.submittedCommand.payload.commandType === "RECALL_BATCH",
    ).length;
  if (unauthorizedRecallAttempts > 0) {
    operationalEfficiency -= 10;
    governanceQuality -= 5;
    explanations.push({
      messageKey: "report.causal.recallAuthorizedAfterHandoff",
    });
  } else if (selected.length > 0) {
    explanations.push({ messageKey: "report.causal.recallAuthorizedDirectly" });
  }

  const dimensions = {
    traceability: clamp(traceability),
    dataIntegrity: clamp(dataIntegrity),
    compliance: clamp(compliance),
    consumerSafety: clamp(consumerSafety),
    operationalEfficiency: clamp(operationalEfficiency),
    governanceQuality: clamp(governanceQuality),
  };
  const average =
    Object.values(dimensions).reduce((sum, value) => sum + value, 0) /
    Object.values(dimensions).length;

  return {
    dimensions,
    explanations,
    manualReviewRecords,
    missedAffectedLots: accuracy.missed.length,
    unnecessaryRecallLots: accuracy.overSelected.length,
    evidenceStrength:
      average >= 90 ? "STRONG" : average >= 70 ? "MODERATE" : "WEAK",
    hintsUsed: options.hintsUsed.length,
    scenarioId: options.scenario.scenarioId,
    scenarioVersion: options.scenario.scenarioVersion,
    configurationIdentifier: options.configurationIdentifier,
  };
}

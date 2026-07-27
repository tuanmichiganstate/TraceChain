import { ScenarioStageId } from "../domain/types/enums";
import type { GuidancePolicy } from "./types";

export type OperationsGuidancePhase =
  | "EARLY"
  | "MIDDLE"
  | "LATE";

export interface OperationsStageSupportContent {
  readonly phase: OperationsGuidancePhase;
  readonly evidenceSuggestionKey: string;
  readonly policySuggestionKey: string;
}

export interface ResolvedOperationsStageSupport {
  readonly content: OperationsStageSupportContent;
  readonly evidenceGuidance:
    GuidancePolicy["evidenceGuidance"];
  readonly policyGuidance:
    GuidancePolicy["policyGuidance"];
}

/**
 * Authored support content shared by every Operations scenario family.
 *
 * The case still owns the facts and evidence. These prompts only identify the
 * professional evidence category and policy boundary to inspect, so they do
 * not disclose a case answer.
 */
export const OPERATIONS_STAGE_SUPPORT = {
  [ScenarioStageId.ORIENTATION]: {
    phase: "EARLY",
    evidenceSuggestionKey:
      "operationsSupport.orientation.evidence",
    policySuggestionKey:
      "operationsSupport.orientation.policy",
  },
  [ScenarioStageId.CREATE_BATCH]: {
    phase: "EARLY",
    evidenceSuggestionKey:
      "operationsSupport.createBatch.evidence",
    policySuggestionKey:
      "operationsSupport.createBatch.policy",
  },
  [ScenarioStageId.ANCHOR_CERTIFICATE]: {
    phase: "EARLY",
    evidenceSuggestionKey:
      "operationsSupport.anchorCertificate.evidence",
    policySuggestionKey:
      "operationsSupport.anchorCertificate.policy",
  },
  [ScenarioStageId.SHIP_AND_MONITOR]: {
    phase: "MIDDLE",
    evidenceSuggestionKey:
      "operationsSupport.shipAndMonitor.evidence",
    policySuggestionKey:
      "operationsSupport.shipAndMonitor.policy",
  },
  [ScenarioStageId.RECEIVE_AND_CORRECT]: {
    phase: "MIDDLE",
    evidenceSuggestionKey:
      "operationsSupport.receiveAndCorrect.evidence",
    policySuggestionKey:
      "operationsSupport.receiveAndCorrect.policy",
  },
  [ScenarioStageId.TRANSFORM_BATCH]: {
    phase: "MIDDLE",
    evidenceSuggestionKey:
      "operationsSupport.transformBatch.evidence",
    policySuggestionKey:
      "operationsSupport.transformBatch.policy",
  },
  [ScenarioStageId.PACKAGE_AND_DISTRIBUTE]: {
    phase: "LATE",
    evidenceSuggestionKey:
      "operationsSupport.packageAndDistribute.evidence",
    policySuggestionKey:
      "operationsSupport.packageAndDistribute.policy",
  },
  [ScenarioStageId.VERIFY_AND_TAMPER]: {
    phase: "LATE",
    evidenceSuggestionKey:
      "operationsSupport.verifyAndTamper.evidence",
    policySuggestionKey:
      "operationsSupport.verifyAndTamper.policy",
  },
  [ScenarioStageId.RECALL_AND_DEBRIEF]: {
    phase: "LATE",
    evidenceSuggestionKey:
      "operationsSupport.recallAndDebrief.evidence",
    policySuggestionKey:
      "operationsSupport.recallAndDebrief.policy",
  },
} as const satisfies Readonly<
  Record<ScenarioStageId, OperationsStageSupportContent>
>;

function fadedGuidance<
  Level extends "DIRECT" | "SUGGESTED" | "NONE",
>(
  level: Level,
  phase: OperationsGuidancePhase,
): Level | "SUGGESTED" | "NONE" {
  if (phase === "EARLY" || level === "NONE") return level;
  if (phase === "MIDDLE") {
    return level === "DIRECT" ? "SUGGESTED" : level;
  }
  return "NONE";
}

export function resolveOperationsStageSupport(
  guidance: GuidancePolicy,
  stageId: ScenarioStageId,
): ResolvedOperationsStageSupport {
  const content = OPERATIONS_STAGE_SUPPORT[stageId];
  return {
    content,
    evidenceGuidance: guidance.fadeByProgress
      ? fadedGuidance(
          guidance.evidenceGuidance,
          content.phase,
        )
      : guidance.evidenceGuidance,
    policyGuidance: guidance.fadeByProgress
      ? fadedGuidance(
          guidance.policyGuidance,
          content.phase,
        )
      : guidance.policyGuidance,
  };
}

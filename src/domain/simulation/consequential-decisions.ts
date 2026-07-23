import type { ScenarioDefinition } from "../types/scenario";
import type {
  CertificateAssessment,
  CertificateStorageChoice,
  DiscrepancyAction,
  IssuerAssessment,
  LotDisposition,
  SubmitCertificateDecisionCommand,
  SubmitDiscrepancyDecisionCommand,
} from "./types";

export const CERTIFICATE_ASSESSMENTS = [
  "VALID",
  "EXPIRED",
  "CONTENT_INVALID",
] as const satisfies readonly CertificateAssessment[];
export const ISSUER_ASSESSMENTS = [
  "RECOGNIZED_AUTHORIZED",
  "RECOGNIZED_UNAUTHORIZED",
  "UNRECOGNIZED",
] as const satisfies readonly IssuerAssessment[];
export const STORAGE_CHOICES = [
  "FULL_DOCUMENT_ON_CHAIN",
  "HASH_OFF_CHAIN",
] as const satisfies readonly CertificateStorageChoice[];
export const LOT_DISPOSITIONS = [
  "CONTINUE",
  "HOLD",
] as const satisfies readonly LotDisposition[];
export const DISCREPANCY_ACTIONS = [
  "IGNORE",
  "OVERWRITE",
  "DELETE",
  "APPEND_CORRECTION",
  "INVESTIGATE_THEN_CORRECT",
] as const satisfies readonly DiscrepancyAction[];
export const DISCREPANCY_CAUSES = [
  "TYPING_ERROR",
  "UNIT_MISMATCH",
  "PHYSICAL_LOSS",
  "FRAUD",
  "UNKNOWN",
] as const;

export interface CertificateDecisionEvaluation {
  readonly certificateAssessmentCorrect: boolean;
  readonly issuerAssessmentCorrect: boolean;
  readonly storageChoiceCorrect: boolean;
  readonly lotDispositionCorrect: boolean;
  readonly issuerScorableCorrect: boolean;
  readonly mayCommitCertificate: boolean;
  readonly mitigationActions: readonly (
    | "REVIEW_ISSUER"
    | "REMEDIATE_STORAGE"
    | "SUSPEND_LOT"
  )[];
}

export function evaluateCertificateDecision(
  command: SubmitCertificateDecisionCommand,
  scenario: ScenarioDefinition,
): CertificateDecisionEvaluation {
  const authored = scenario.runtime.consequentialCases.certificate;
  const certificateAssessmentCorrect =
    command.certificateAssessment === authored.certificateAssessment;
  const issuerAssessmentCorrect =
    command.issuerAssessment === authored.issuerAssessment;
  const storageChoiceCorrect =
    command.storageChoice === authored.requiredStorageChoice;
  const usable =
    authored.certificateAssessment === "VALID" &&
    authored.issuerAssessment === "RECOGNIZED_AUTHORIZED";
  const lotDispositionCorrect =
    command.lotDisposition === (usable ? "CONTINUE" : "HOLD");
  const mitigationActions: Array<
    "REVIEW_ISSUER" | "REMEDIATE_STORAGE" | "SUSPEND_LOT"
  > = [];
  if (
    !usable ||
    !issuerAssessmentCorrect ||
    !certificateAssessmentCorrect
  ) {
    mitigationActions.push("REVIEW_ISSUER");
  }
  if (!storageChoiceCorrect) mitigationActions.push("REMEDIATE_STORAGE");
  if (!lotDispositionCorrect) mitigationActions.push("SUSPEND_LOT");

  return {
    certificateAssessmentCorrect,
    issuerAssessmentCorrect,
    storageChoiceCorrect,
    lotDispositionCorrect,
    issuerScorableCorrect:
      certificateAssessmentCorrect &&
      issuerAssessmentCorrect &&
      lotDispositionCorrect,
    mayCommitCertificate: usable && mitigationActions.length === 0,
    mitigationActions,
  };
}

export interface DiscrepancyDecisionEvaluation {
  readonly isRejectedAttempt: boolean;
  readonly isScorableCorrect: boolean;
  readonly requiresMitigation: boolean;
}

export function evaluateDiscrepancyDecision(
  command: SubmitDiscrepancyDecisionCommand,
  scenario: ScenarioDefinition,
): DiscrepancyDecisionEvaluation {
  const isRejectedAttempt =
    command.action === "OVERWRITE" || command.action === "DELETE";
  const actionIsSound =
    command.action === "APPEND_CORRECTION" ||
    command.action === "INVESTIGATE_THEN_CORRECT";
  const causeIsCorrect =
    command.causeCode ===
    scenario.runtime.consequentialCases.discrepancy.authoredCauseCode;
  return {
    isRejectedAttempt,
    isScorableCorrect: actionIsSound && causeIsCorrect,
    requiresMitigation: !(actionIsSound && causeIsCorrect),
  };
}

function indexOf<T extends string>(values: readonly T[], value: T): number {
  const index = values.indexOf(value);
  if (index < 0) throw new Error(`Cannot compact unknown authored value "${value}"`);
  return index;
}

export function compactCertificateDecision(
  command: SubmitCertificateDecisionCommand,
): readonly number[] {
  return [
    indexOf(CERTIFICATE_ASSESSMENTS, command.certificateAssessment),
    indexOf(ISSUER_ASSESSMENTS, command.issuerAssessment),
    indexOf(STORAGE_CHOICES, command.storageChoice),
    indexOf(LOT_DISPOSITIONS, command.lotDisposition),
  ];
}

export function expandCertificateDecision(
  values: readonly (number | readonly number[] | string)[],
): SubmitCertificateDecisionCommand {
  const certificateAssessment = CERTIFICATE_ASSESSMENTS[values[0] as number];
  const issuerAssessment = ISSUER_ASSESSMENTS[values[1] as number];
  const storageChoice = STORAGE_CHOICES[values[2] as number];
  const lotDisposition = LOT_DISPOSITIONS[values[3] as number];
  if (
    certificateAssessment === undefined ||
    issuerAssessment === undefined ||
    storageChoice === undefined ||
    lotDisposition === undefined
  ) {
    throw new Error("Certificate decision journal value is out of range");
  }
  return {
    commandType: "SUBMIT_CERTIFICATE_DECISION",
    certificateAssessment,
    issuerAssessment,
    storageChoice,
    lotDisposition,
  };
}

export function compactDiscrepancyDecision(
  command: SubmitDiscrepancyDecisionCommand,
): readonly number[] {
  return [
    indexOf(DISCREPANCY_ACTIONS, command.action),
    indexOf(DISCREPANCY_CAUSES, command.causeCode),
  ];
}

export function expandDiscrepancyDecision(
  values: readonly (number | readonly number[] | string)[],
): SubmitDiscrepancyDecisionCommand {
  const action = DISCREPANCY_ACTIONS[values[0] as number];
  const causeCode = DISCREPANCY_CAUSES[values[1] as number];
  if (action === undefined || causeCode === undefined) {
    throw new Error("Discrepancy decision journal value is out of range");
  }
  return {
    commandType: "SUBMIT_DISCREPANCY_DECISION",
    action,
    causeCode,
  };
}

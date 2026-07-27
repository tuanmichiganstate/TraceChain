import type { LocalizedText } from "./content";
import type { JsonObject } from "./json";
import type { LearnerRunLocalizedTextV1 } from "./run-events";

export type AuditFindingSeverityV1 =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export type AuditMaterialityV1 =
  | "NON_MATERIAL"
  | "MATERIAL";

export type AuditConclusionCategoryV1 =
  | "EFFECTIVE"
  | "QUALIFIED"
  | "ADVERSE"
  | "INSUFFICIENT_EVIDENCE";

export type AuditSourceRecordKindV1 =
  | "LEDGER_TRANSACTION"
  | "SOURCE_DOCUMENT"
  | "ATTEMPT_AUDIT"
  | "PROCESS_EVENT";

export interface AuditChoiceDefinitionV1 {
  readonly choiceId: string;
  readonly label: LocalizedText;
}

export interface AuditSourceRecordDefinitionV1 {
  readonly sourceRecordId: string;
  readonly recordKind: AuditSourceRecordKindV1;
  readonly title: LocalizedText;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly entityIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly details: JsonObject;
}

export interface AuditFindingDefinitionV1 {
  readonly findingDefinitionId: string;
  readonly categoryId: string;
  readonly entityId: string;
  readonly title: LocalizedText;
  readonly explanation: LocalizedText;
  readonly requiredEvidenceIds: readonly string[];
  readonly applicablePolicyIds: readonly string[];
  readonly expectedSeverity: AuditFindingSeverityV1;
  readonly expectedMateriality: AuditMaterialityV1;
  readonly acceptableRootCauseCodes: readonly string[];
  readonly acceptableRecommendationCodes: readonly string[];
  readonly competencyIndicatorIds: readonly string[];
}

export interface AuditDecoyDefinitionV1 {
  readonly decoyDefinitionId: string;
  readonly categoryId: string;
  readonly entityId: string;
  readonly explanation: LocalizedText;
}

export interface AuditScoringBlueprintV1 {
  readonly scoringBlueprintId: string;
  readonly version: string;
  readonly maximumScore: 100;
  readonly passScore: number;
  readonly items: readonly {
    readonly scorableItemId:
      | "AUD_DETECTION"
      | "AUD_FALSE_POSITIVE_AVOIDANCE"
      | "AUD_EVIDENCE"
      | "AUD_POLICY"
      | "AUD_CLASSIFICATION"
      | "AUD_RECOMMENDATION"
      | "AUD_CONCLUSION";
    readonly maximumScore: number;
  }[];
}

export interface AuditCaseDefinitionV1 {
  readonly schemaVersion: "2.0.0";
  readonly auditCaseId: string;
  readonly version: string;
  readonly sourceProcessId: string;
  readonly sourceProcessVersion: string;
  readonly auditObjective: LocalizedText;
  readonly scope: {
    readonly title: LocalizedText;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly organizationIds: readonly string[];
    readonly entityIds: readonly string[];
  };
  readonly categories: readonly AuditChoiceDefinitionV1[];
  readonly entities: readonly AuditChoiceDefinitionV1[];
  readonly rootCauses: readonly AuditChoiceDefinitionV1[];
  readonly recommendations: readonly AuditChoiceDefinitionV1[];
  readonly hints: readonly {
    readonly hintId: string;
    readonly text: LocalizedText;
  }[];
  readonly conclusionCategories: readonly {
    readonly conclusionCategory:
      AuditConclusionCategoryV1;
    readonly label: LocalizedText;
  }[];
  readonly expectedConclusionCategory:
    AuditConclusionCategoryV1;
  readonly sourceRecords: readonly AuditSourceRecordDefinitionV1[];
  readonly evidenceItemIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly findingDefinitions: readonly AuditFindingDefinitionV1[];
  readonly decoyDefinitions: readonly AuditDecoyDefinitionV1[];
  readonly scoringBlueprint: AuditScoringBlueprintV1;
  readonly supportProfiles: readonly ("GUIDED" | "PRACTICE")[];
  readonly inputLimits: {
    readonly maximumDrafts: 1;
    readonly maximumDraftRecords: 1;
    readonly maximumFindingRecords: number;
    readonly findingTitleUtf8Bytes: number;
    readonly findingObservationUtf8Bytes: number;
    readonly findingRecommendationUtf8Bytes: number;
    readonly conclusionFieldUtf8Bytes: number;
    readonly maximumEvidenceCitationsPerFinding: number;
    readonly maximumPolicyCitationsPerFinding: number;
  };
  readonly completionDefinition: {
    readonly maximumSubmittedFindings: number;
    readonly conclusionRequired: true;
  };
}

export interface AuditFindingSubmissionV1 {
  readonly findingId: string;
  readonly revision: number;
  readonly status: "SUBMITTED" | "WITHDRAWN";
  readonly categoryId: string;
  readonly entityId: string;
  readonly title: string;
  readonly observation: string;
  readonly severity: AuditFindingSeverityV1;
  readonly materiality: AuditMaterialityV1;
  readonly confidence: number;
  readonly evidenceIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly rootCauseCode: string;
  readonly recommendationCode: string;
  readonly recommendation: string;
  readonly submittedAt: string;
  readonly supersedesFindingId?: string;
}

export interface AuditConclusionSubmissionV1 {
  readonly conclusionCategory:
    AuditConclusionCategoryV1;
  readonly scopeSummary: string;
  readonly materialFindingsSummary: string;
  readonly nonMaterialFindingsSummary: string;
  readonly limitations: string;
  readonly uncertainty: string;
  readonly recommendations: string;
  readonly confidence: number;
  readonly submittedAt: string;
}

export interface AuditScoreLineV1 {
  readonly scorableItemId:
    AuditScoringBlueprintV1["items"][number]["scorableItemId"];
  readonly score: number;
  readonly maximumScore: number;
  readonly sourceFindingIds: readonly string[];
  readonly sourceEvidenceIds: readonly string[];
  readonly sourcePolicyIds: readonly string[];
}

export interface AuditReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly auditCaseId: string;
  readonly auditCaseVersion: string;
  readonly sourceProcessId: string;
  readonly sourceProcessVersion: string;
  readonly sourceStateHash: string;
  readonly score: number;
  readonly maximumScore: 100;
  readonly passScore: number;
  readonly passed: boolean;
  readonly scoreLines: readonly AuditScoreLineV1[];
  readonly confirmedFindingIds: readonly string[];
  readonly unsupportedFindingIds: readonly string[];
  readonly missedFindingDefinitionIds: readonly string[];
  readonly conclusionCategory:
    AuditConclusionCategoryV1;
  readonly generatedAt: string;
}

export interface AuditLearnerProjectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly auditCaseId: string;
  readonly auditCaseVersion: string;
  readonly sourceProcessId: string;
  readonly sourceProcessVersion: string;
  readonly sourceStateHash: string;
  readonly supportProfile: "GUIDED" | "PRACTICE";
  readonly scopeViewed: boolean;
  readonly objective: LearnerRunLocalizedTextV1;
  readonly scope: {
    readonly title: LearnerRunLocalizedTextV1;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly organizationIds: readonly string[];
    readonly entityIds: readonly string[];
  };
  readonly categories: readonly {
    readonly choiceId: string;
    readonly label: LearnerRunLocalizedTextV1;
  }[];
  readonly entities: readonly {
    readonly choiceId: string;
    readonly label: LearnerRunLocalizedTextV1;
  }[];
  readonly rootCauses: readonly {
    readonly choiceId: string;
    readonly label: LearnerRunLocalizedTextV1;
  }[];
  readonly recommendations: readonly {
    readonly choiceId: string;
    readonly label: LearnerRunLocalizedTextV1;
  }[];
  readonly hints: readonly {
    readonly hintId: string;
    readonly text: LearnerRunLocalizedTextV1;
    readonly viewed: boolean;
  }[];
  readonly conclusionCategories: readonly {
    readonly conclusionCategory:
      AuditConclusionCategoryV1;
    readonly label: LearnerRunLocalizedTextV1;
  }[];
  readonly sourceRecords: readonly {
    readonly sourceRecordId: string;
    readonly recordKind: AuditSourceRecordKindV1;
    readonly title: LearnerRunLocalizedTextV1;
    readonly occurredAt: string;
    readonly organizationId: string;
    readonly entityIds: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly policyIds: readonly string[];
    readonly details: JsonObject;
    readonly inspected: boolean;
  }[];
  readonly evidence: readonly {
    readonly evidenceId: string;
    readonly title: LearnerRunLocalizedTextV1;
    readonly evidenceType: string;
    readonly sourceOrganizationId: string;
    readonly content: JsonObject;
    readonly inspected: boolean;
    readonly bookmarked: boolean;
  }[];
  readonly policies: readonly {
    readonly policyId: string;
    readonly title: LearnerRunLocalizedTextV1;
    readonly configuration: JsonObject;
  }[];
  readonly drafts: readonly (Omit<
    AuditFindingSubmissionV1,
    "revision" | "status" | "submittedAt"
  > & {
    readonly savedAt: string;
  })[];
  readonly findings: readonly (AuditFindingSubmissionV1 & {
    readonly feedback?: {
      readonly classification:
        | "CONFIRMED"
        | "LEGITIMATE_EXCEPTION"
        | "UNSUPPORTED";
      readonly explanation: LearnerRunLocalizedTextV1;
    };
  })[];
  readonly conclusion?: AuditConclusionSubmissionV1;
  readonly maximumSubmittedFindings: number;
  readonly inputLimits: AuditCaseDefinitionV1["inputLimits"];
  readonly report?: AuditReportV1;
}

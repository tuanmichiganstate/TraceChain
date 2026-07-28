import type { LearnerRunLocalizedTextV1 } from "./run-events";
import type {
  ScenarioEvidenceAssessmentMetadataV1,
  ScenarioEvidenceLearnerMetadataV1,
} from "./scenario-pack";

export interface ScenarioEvidenceAssessmentDefinitionV1 {
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly title: LearnerRunLocalizedTextV1;
  readonly sourceOrganizationId: string;
  readonly staffProfileId?: string;
  readonly visibleToRoleIds: readonly string[];
  readonly learnerMetadata: ScenarioEvidenceLearnerMetadataV1;
  readonly assessmentMetadata:
    ScenarioEvidenceAssessmentMetadataV1;
}

export interface ScenarioEvidenceAssessmentCatalogV1 {
  readonly schemaVersion: "1.0.0";
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly evidenceDefinitions:
    readonly ScenarioEvidenceAssessmentDefinitionV1[];
}

export interface AssignmentEvidenceAssessmentCatalogV1
  extends ScenarioEvidenceAssessmentCatalogV1 {
  readonly assignmentId: string;
}

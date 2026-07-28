import type {
  HostedRunMode,
  ScenarioNodeV1,
} from "./scenario-pack";
import type {
  ScenarioEvidenceAssessmentDefinitionV1,
} from "./evidence-assessment";

export interface ScenarioPackListItemV1 {
  readonly schemaVersion: "1.0.0";
  readonly packId: string;
  readonly version: string;
  readonly status: "draft" | "validated" | "published" | "retired";
  readonly domain: string;
  readonly titleKey: string;
  readonly supportedLocales: readonly string[];
  readonly scenarioCount: number;
  readonly contentHash?: string;
  readonly updatedAt: string;
  readonly updatedByUserId: string;
  readonly retiredAt?: string;
  readonly retiredByUserId?: string;
}

export interface ScenarioPackValidationIssueV1 {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ScenarioPackValidationReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly valid: boolean;
  readonly checkedCount: number;
  readonly issues: readonly ScenarioPackValidationIssueV1[];
  readonly packId?: string;
  readonly version?: string;
}

export interface ScenarioPreviewNodeV1 {
  readonly nodeId: string;
  readonly nodeType: ScenarioNodeV1["nodeType"];
  readonly title: string;
  readonly visibleEvidenceIds: readonly string[];
  readonly transitionNodeIds: readonly string[];
}

export interface ScenarioRolePreviewV1 {
  readonly schemaVersion: "2.0.0";
  readonly packId: string;
  readonly packVersion: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly locale: string;
  readonly mode: HostedRunMode;
  readonly roleId: string;
  readonly scenarioTitle: string;
  readonly modeConfiguration: {
    readonly allowHints: boolean;
    readonly allowRetry: boolean;
    readonly allowBacktracking: boolean;
    readonly feedbackTiming: string;
    readonly showScores: boolean;
    readonly outcomeStrategy: string;
    readonly seedPolicy: string;
    readonly timeLimitMinutes?: number;
    readonly allowCommunication: boolean;
    readonly allowEvidenceRequests: boolean;
  };
  readonly nodes: readonly ScenarioPreviewNodeV1[];
  readonly evidenceDefinitions:
    readonly ScenarioEvidenceAssessmentDefinitionV1[];
}

export interface ScenarioPackComparisonV1 {
  readonly schemaVersion: "1.0.0";
  readonly packId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly addedPaths: readonly string[];
  readonly removedPaths: readonly string[];
  readonly changedPaths: readonly string[];
}

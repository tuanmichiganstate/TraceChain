import type { TraceChainExperienceConfigurationV2 } from "../../config/types";
import type { TrustedExecutionContext } from "../../domain/simulation/types";
import type {
  AuditConclusionSubmissionV1,
  AuditFindingSubmissionV1,
} from "../contracts/audit";
import type { JsonObject } from "../contracts/json";
import type { HostedRunModeConfigurationV1 } from "../contracts/scenario-pack";
import type { HostedCompetencyEvidence } from "../hosted/stage3-types";

export interface AuditFindingDraftV1
  extends Omit<
    AuditFindingSubmissionV1,
    "revision" | "status" | "submittedAt"
  > {
  readonly savedAt: string;
}

export interface AuditHostedRunStateV1 {
  readonly schemaVersion: "1.0.0";
  readonly runtimeKind: "audit-v1";
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly packContentHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly auditCaseId: string;
  readonly auditCaseVersion: string;
  readonly sourceStateHash: string;
  readonly modeConfiguration: HostedRunModeConfigurationV1;
  readonly experienceConfiguration:
    TraceChainExperienceConfigurationV2;
  readonly experienceConfigurationHash: string;
  readonly activeTrustedContext: TrustedExecutionContext;
  readonly version: number;
  readonly status: "active" | "completed";
  readonly scopeViewed: boolean;
  readonly inspectedEvidenceIds: readonly string[];
  readonly bookmarkedEvidenceIds: readonly string[];
  readonly inspectedSourceRecordIds: readonly string[];
  readonly drafts: Readonly<Record<string, AuditFindingDraftV1>>;
  readonly findings: readonly AuditFindingSubmissionV1[];
  readonly competencyEvidence: readonly HostedCompetencyEvidence[];
  readonly conclusion?: AuditConclusionSubmissionV1;
  readonly workflowState: {
    readonly currentNodeId: "AUDIT_WORKPAPER" | "AUDIT_COMPLETE";
    readonly permittedActionIdsByRole: Readonly<
      Record<string, readonly string[]>
    >;
  };
  readonly immutableSourceState: JsonObject;
}

interface AuditHostedCommandBase {
  readonly commandId: string;
  readonly runId: string;
  readonly expectedRunVersion: number;
}

export interface ViewAuditScopeCommand
  extends AuditHostedCommandBase {
  readonly commandType: "VIEW_AUDIT_SCOPE";
}

export interface InspectAuditEvidenceCommand
  extends AuditHostedCommandBase {
  readonly commandType: "INSPECT_AUDIT_EVIDENCE";
  readonly evidenceId: string;
}

export interface BookmarkAuditEvidenceCommand
  extends AuditHostedCommandBase {
  readonly commandType: "BOOKMARK_AUDIT_EVIDENCE";
  readonly evidenceId: string;
}

export interface InspectAuditSourceRecordCommand
  extends AuditHostedCommandBase {
  readonly commandType: "INSPECT_AUDIT_SOURCE_RECORD";
  readonly sourceRecordId: string;
}

export interface AuditFindingInputV1 {
  readonly findingId: string;
  readonly categoryId: string;
  readonly entityId: string;
  readonly title: string;
  readonly observation: string;
  readonly severity:
    | "LOW"
    | "MODERATE"
    | "HIGH"
    | "CRITICAL";
  readonly materiality: "NON_MATERIAL" | "MATERIAL";
  readonly confidence: number;
  readonly evidenceIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly rootCauseCode: string;
  readonly recommendationCode: string;
  readonly recommendation: string;
}

export interface SaveAuditFindingDraftCommand
  extends AuditHostedCommandBase {
  readonly commandType: "SAVE_AUDIT_FINDING_DRAFT";
  readonly finding: AuditFindingInputV1;
}

export interface SubmitAuditFindingCommand
  extends AuditHostedCommandBase {
  readonly commandType: "SUBMIT_AUDIT_FINDING";
  readonly finding: AuditFindingInputV1;
}

export interface AmendAuditFindingCommand
  extends AuditHostedCommandBase {
  readonly commandType: "AMEND_AUDIT_FINDING";
  readonly finding: AuditFindingInputV1;
}

export interface WithdrawAuditFindingCommand
  extends AuditHostedCommandBase {
  readonly commandType: "WITHDRAW_AUDIT_FINDING";
  readonly findingId: string;
}

export interface SubmitAuditConclusionCommand
  extends AuditHostedCommandBase {
  readonly commandType: "SUBMIT_AUDIT_CONCLUSION";
  readonly conclusion: Omit<
    AuditConclusionSubmissionV1,
    "submittedAt"
  >;
}

export type AuditHostedCommand =
  | ViewAuditScopeCommand
  | InspectAuditEvidenceCommand
  | BookmarkAuditEvidenceCommand
  | InspectAuditSourceRecordCommand
  | SaveAuditFindingDraftCommand
  | SubmitAuditFindingCommand
  | AmendAuditFindingCommand
  | WithdrawAuditFindingCommand
  | SubmitAuditConclusionCommand;

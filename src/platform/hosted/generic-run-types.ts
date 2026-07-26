import type { TrustedExecutionContext } from "../../domain/simulation/types";
import type { JsonObject } from "../contracts/json";
import type {
  HostedRunMode,
  HostedRunModeConfigurationV1,
} from "../contracts/scenario-pack";
import type { StochasticOutcomeResolutionV1 } from "../runs/stochastic-outcomes";
import type { HostedCompetencyEvidence } from "./stage3-types";

export interface GenericDecisionSubmission {
  readonly decisionId: string;
  readonly responses: Readonly<
    Record<string, readonly string[]>
  >;
  readonly justification: string;
  readonly citedEvidenceIds: readonly string[];
  readonly citedPolicyIds: readonly string[];
  readonly confidenceRating: number | null;
  readonly adverseEventProbabilityPercent: number | null;
  readonly submittedAt: string;
}

export interface GenericHostedRunState {
  readonly schemaVersion: "1.0.0";
  readonly runtimeKind: "generic-v1";
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly packContentHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly mode: HostedRunMode;
  readonly modeConfiguration: HostedRunModeConfigurationV1;
  readonly scenarioSeed: string;
  readonly outcomeResolution: StochasticOutcomeResolutionV1 | null;
  readonly activeTrustedContext: TrustedExecutionContext;
  readonly version: number;
  readonly status: "active" | "completed";
  readonly actualState: JsonObject;
  readonly businessState: JsonObject;
  readonly ledgerState: JsonObject;
  readonly releasedEvidenceIds: readonly string[];
  readonly inspectedEvidenceIds: readonly string[];
  readonly releasedInstructorIncidents: readonly {
    readonly incidentId: string;
    readonly releasedAt: string;
    readonly releasedByUserId: string;
  }[];
  readonly decisions: Readonly<
    Record<string, GenericDecisionSubmission>
  >;
  readonly competencyEvidence: readonly HostedCompetencyEvidence[];
  readonly workflowState: {
    readonly currentNodeId: string;
    readonly completedNodeIds: readonly string[];
    readonly permittedActionIdsByRole: Readonly<
      Record<string, readonly string[]>
    >;
  };
  readonly rngState: {
    readonly seed: string;
    readonly streamPosition: number;
    readonly recordedDraws: readonly number[];
  };
}

export interface CreateGenericHostedRunRequest {
  readonly commandId: string;
  readonly runId: string;
  readonly assignmentId: string;
  readonly learnerUserId: string;
  readonly mode: HostedRunMode;
  readonly modeConfiguration?: HostedRunModeConfigurationV1;
  readonly scenarioSeed?: string;
}

interface GenericHostedCommandBase {
  readonly commandId: string;
  readonly runId: string;
  readonly expectedRunVersion: number;
}

export interface AdvanceGenericWorkflowCommand
  extends GenericHostedCommandBase {
  readonly commandType: "ADVANCE_WORKFLOW";
}

export interface InspectGenericEvidenceCommand
  extends GenericHostedCommandBase {
  readonly commandType: "INSPECT_EVIDENCE";
  readonly evidenceId: string;
}

export interface SubmitGenericDecisionCommand
  extends GenericHostedCommandBase {
  readonly commandType: "SUBMIT_STRUCTURED_DECISION";
  readonly decisionId: string;
  readonly responses: Readonly<
    Record<string, readonly string[]>
  >;
  readonly justification?: string;
  readonly citedEvidenceIds?: readonly string[];
  readonly citedPolicyIds?: readonly string[];
  readonly confidenceRating?: number;
  readonly adverseEventProbabilityPercent?: number;
}

export type GenericHostedCommand =
  | AdvanceGenericWorkflowCommand
  | InspectGenericEvidenceCommand
  | SubmitGenericDecisionCommand;

export interface GenericHostedRunResult {
  readonly state: GenericHostedRunState;
  readonly appendedEventIds: readonly string[];
  readonly wasIdempotentReplay: boolean;
}

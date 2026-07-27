import {
  FixedClock,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type { AuditRuntimePackage } from "../../config/audit-runtime-loader";
import type {
  AuditCommandJournalEntry,
  Ta2AuditSnapshot,
} from "../../infrastructure/persistence/ta2-audit-codec";
import type {
  LearnerRunProjectionV1,
} from "../contracts/run-events";
import type { ApplicationPrincipal } from "../hosted/access";
import { MemoryRunEventStore } from "../runs/event-store";
import { AuditHostedRunService } from "./audit-run-service";
import type {
  AuditHostedCommand,
  AuditHostedRunStateV1,
} from "./audit-run-types";

export const SCORM_AUDIT_RUN_ID = "RUN_SCORM_AUDIT";
const SCORM_AUDIT_ASSIGNMENT_ID = "ASSIGNMENT_SCORM_AUDIT";
const SCORM_AUDIT_LEARNER_ID = "LEARNER_SCORM_AUDIT";

const learner: ApplicationPrincipal = {
  userId: SCORM_AUDIT_LEARNER_ID,
  roles: ["learner"],
};

export interface ReplayedAuditAttempt {
  readonly state: AuditHostedRunStateV1;
  readonly projection: LearnerRunProjectionV1;
}

function submittedCommand(
  entry: AuditCommandJournalEntry,
  commandId: string,
  state: AuditHostedRunStateV1,
): AuditHostedCommand {
  const base = {
    commandId,
    runId: state.runId,
    expectedRunVersion: state.version,
  };
  switch (entry.operation) {
    case "VIEW_SCOPE":
      return { ...base, commandType: "VIEW_AUDIT_SCOPE" };
    case "INSPECT_EVIDENCE":
      return {
        ...base,
        commandType: "INSPECT_AUDIT_EVIDENCE",
        evidenceId: entry.evidenceId,
      };
    case "BOOKMARK_EVIDENCE":
      return {
        ...base,
        commandType: "BOOKMARK_AUDIT_EVIDENCE",
        evidenceId: entry.evidenceId,
      };
    case "INSPECT_SOURCE_RECORD":
      return {
        ...base,
        commandType: "INSPECT_AUDIT_SOURCE_RECORD",
        sourceRecordId: entry.sourceRecordId,
      };
    case "VIEW_HINT":
      return {
        ...base,
        commandType: "VIEW_AUDIT_HINT",
        hintId: entry.hintId,
      };
    case "SAVE_DRAFT":
      return {
        ...base,
        commandType: "SAVE_AUDIT_FINDING_DRAFT",
        finding: entry.finding,
      };
    case "SUBMIT_FINDING":
      return {
        ...base,
        commandType: "SUBMIT_AUDIT_FINDING",
        finding: entry.finding,
      };
    case "AMEND_FINDING":
      return {
        ...base,
        commandType: "AMEND_AUDIT_FINDING",
        finding: entry.finding,
      };
    case "WITHDRAW_FINDING":
      return {
        ...base,
        commandType: "WITHDRAW_AUDIT_FINDING",
        findingId: entry.findingId,
      };
    case "SUBMIT_CONCLUSION":
      return {
        ...base,
        commandType: "SUBMIT_AUDIT_CONCLUSION",
        conclusion: entry.conclusion,
      };
  }
}

export async function replayTa2AuditAttempt(
  runtime: AuditRuntimePackage,
  snapshot: Ta2AuditSnapshot,
): Promise<ReplayedAuditAttempt> {
  const store = new MemoryRunEventStore();
  const service = new AuditHostedRunService(
    runtime.pack,
    runtime.scenario.scenarioId,
    runtime.scenario.version,
    store,
    new FixedClock(runtime.auditCase.scope.periodEnd),
    new SequenceIdGenerator(1),
    snapshot.variantAssignment,
  );
  let result = await service.createRun(learner, {
    commandId: "TA2_COMMAND_000",
    runId: SCORM_AUDIT_RUN_ID,
    assignmentId: SCORM_AUDIT_ASSIGNMENT_ID,
    learnerUserId: SCORM_AUDIT_LEARNER_ID,
    mode:
      runtime.auditCase.supportProfiles[0] === "GUIDED"
        ? "tutorial"
        : runtime.auditCase.supportProfiles[0] === "PRACTICE" ||
            runtime.configuration.deliveryPurpose === "ASSESSMENT"
          ? "standard"
          : "configured",
  });
  for (const [index, entry] of snapshot.commandJournal.entries()) {
    result = await service.submit(
      learner,
      submittedCommand(
        entry,
        `TA2_COMMAND_${String(index + 1).padStart(3, "0")}`,
        result.state,
      ),
    );
  }
  return {
    state: result.state,
    projection: await service.learnerProjection(
      learner,
      SCORM_AUDIT_RUN_ID,
    ),
  };
}

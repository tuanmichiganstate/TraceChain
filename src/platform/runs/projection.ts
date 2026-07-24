import type {
  HostedRunStateV1,
  LearnerRunProjectionV1,
  VisibleStateRecordV1,
} from "../contracts/run-events";

function projectVisibleRecords(
  records: readonly VisibleStateRecordV1[],
  roleId: string,
): readonly {
  readonly recordId: string;
  readonly value: VisibleStateRecordV1["value"];
}[] {
  return records
    .filter((record) => record.visibleToRoleIds.includes(roleId))
    .map((record) => ({
      recordId: record.recordId,
      value: structuredClone(record.value),
    }));
}

export function projectRunStateForRole(
  state: HostedRunStateV1,
  roleId: string,
): LearnerRunProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    runId: state.runId,
    version: state.version,
    roleId,
    businessState: projectVisibleRecords(state.businessState, roleId),
    ledgerState: structuredClone(state.ledgerState),
    informationState: projectVisibleRecords(
      state.informationState,
      roleId,
    ),
    policyState: projectVisibleRecords(state.policyState, roleId),
    workflowState: {
      currentNodeId: state.workflowState.currentNodeId,
      completedNodeIds: [...state.workflowState.completedNodeIds],
      permittedActionIds: [
        ...(state.workflowState.permittedActionIdsByRole[roleId] ?? []),
      ],
    },
  };
}

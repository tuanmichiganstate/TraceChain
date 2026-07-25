import { isJsonObject } from "../contracts/json";
import type { RunEventV1 } from "../contracts/run-events";
import type { HostedRuntimeCommand } from "./hosted-runtime-service";

export interface ReplayableSourceCommandBatch {
  readonly commandId: string;
  readonly commandType: string | null;
  readonly submittedCommand: Readonly<
    Record<string, unknown>
  > | null;
  readonly sourceEventIds: readonly string[];
}

export function sourceDecisionCommandAtFork(
  events: readonly RunEventV1[],
  forkSequenceNumber: number,
): ReplayableSourceCommandBatch | null {
  const first = events[forkSequenceNumber];
  if (first === undefined) return null;
  const batchEvents = events.slice(forkSequenceNumber).filter(
    (event) => event.causationId === first.causationId,
  );
  const submitted = first.payload.submittedCommand;
  const submittedCommand = isJsonObject(submitted)
    ? structuredClone(submitted)
    : null;
  return {
    commandId: first.causationId,
    commandType:
      submittedCommand !== null &&
      typeof submittedCommand.commandType === "string"
        ? submittedCommand.commandType
        : null,
    submittedCommand,
    sourceEventIds: batchEvents.map((event) => event.eventId),
  };
}

export function sourceCommandBatchesAfterFork(
  events: readonly RunEventV1[],
  forkSequenceNumber: number,
): readonly ReplayableSourceCommandBatch[] {
  const originalDecision = events[forkSequenceNumber];
  if (originalDecision === undefined) return [];
  let index = forkSequenceNumber;
  while (
    events[index]?.causationId ===
    originalDecision.causationId
  ) {
    index += 1;
  }
  const batches: ReplayableSourceCommandBatch[] = [];
  while (index < events.length) {
    const first = events[index];
    if (first === undefined) break;
    const batchEvents: RunEventV1[] = [];
    while (
      events[index]?.causationId === first.causationId
    ) {
      const event = events[index];
      if (event !== undefined) batchEvents.push(event);
      index += 1;
    }
    const submitted = first.payload.submittedCommand;
    const submittedCommand = isJsonObject(submitted)
      ? structuredClone(submitted)
      : null;
    batches.push({
      commandId: first.causationId,
      commandType:
        submittedCommand !== null &&
        typeof submittedCommand.commandType === "string"
          ? submittedCommand.commandType
          : null,
      submittedCommand,
      sourceEventIds: batchEvents.map((event) => event.eventId),
    });
  }
  return batches;
}

export function commandForCounterfactualReplay(
  batch: ReplayableSourceCommandBatch,
  branchRunId: string,
  expectedRunVersion: number,
): HostedRuntimeCommand | null {
  if (batch.submittedCommand === null) return null;
  return {
    ...structuredClone(batch.submittedCommand),
    commandId: batch.commandId,
    runId: branchRunId,
    expectedRunVersion,
  } as HostedRuntimeCommand;
}

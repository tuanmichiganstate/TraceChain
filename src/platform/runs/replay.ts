import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { RunEventV1 } from "../contracts/run-events";

export type RunEventReducer<State> = (
  state: Readonly<State>,
  event: RunEventV1,
) => State;

export type AsyncRunEventReducer<State> = (
  state: Readonly<State>,
  event: RunEventV1,
) => Promise<State>;

export class RunReplayError extends Error {
  constructor(
    readonly code:
      | "SEQUENCE_GAP"
      | "PREVIOUS_STATE_HASH_MISMATCH"
      | "RESULTING_STATE_HASH_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "RunReplayError";
  }
}

export function hashReplayState(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

export function replayRunEvents<State>(
  initialState: State,
  events: readonly RunEventV1[],
  reducer: RunEventReducer<State>,
): State {
  let state = structuredClone(initialState);
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    if (event.sequenceNumber !== expectedSequence) {
      throw new RunReplayError(
        "SEQUENCE_GAP",
        `Expected event sequence ${String(expectedSequence)}, received ${String(event.sequenceNumber)}.`,
      );
    }
    const previousStateHash = hashReplayState(state);
    if (event.previousStateHash !== previousStateHash) {
      throw new RunReplayError(
        "PREVIOUS_STATE_HASH_MISMATCH",
        `Event ${event.eventId} does not follow the reconstructed state.`,
      );
    }
    const nextState = reducer(state, event);
    const resultingStateHash = hashReplayState(nextState);
    if (event.resultingStateHash !== resultingStateHash) {
      throw new RunReplayError(
        "RESULTING_STATE_HASH_MISMATCH",
        `Event ${event.eventId} does not reproduce its recorded state hash.`,
      );
    }
    state = nextState;
  }
  return state;
}

export async function replayRunEventsAsync<State>(
  initialState: State,
  events: readonly RunEventV1[],
  reducer: AsyncRunEventReducer<State>,
): Promise<State> {
  let state = structuredClone(initialState);
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    if (event.sequenceNumber !== expectedSequence) {
      throw new RunReplayError(
        "SEQUENCE_GAP",
        `Expected event sequence ${String(expectedSequence)}, received ${String(event.sequenceNumber)}.`,
      );
    }
    const previousStateHash = hashReplayState(state);
    if (event.previousStateHash !== previousStateHash) {
      throw new RunReplayError(
        "PREVIOUS_STATE_HASH_MISMATCH",
        `Event ${event.eventId} does not follow the reconstructed state.`,
      );
    }
    const nextState = await reducer(state, event);
    const resultingStateHash = hashReplayState(nextState);
    if (event.resultingStateHash !== resultingStateHash) {
      throw new RunReplayError(
        "RESULTING_STATE_HASH_MISMATCH",
        `Event ${event.eventId} does not reproduce its recorded state hash.`,
      );
    }
    state = nextState;
  }
  return state;
}

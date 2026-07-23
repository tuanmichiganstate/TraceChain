/**
 * Session state and its reducer.
 *
 * Pure and synchronous, like the domain reducer, so the transitions can be
 * tested without React or a platform adapter. The provider owns everything
 * asynchronous -- adapter initialization, saving, and the clock.
 *
 * Decisions are the source of truth for scoring, not the interaction log. The
 * log is richer and is kept for the final report, but only decisions survive a
 * save, and the score must be identical either way.
 */

import { SCENARIO_STAGE_ORDER, ScenarioStageId } from "../../domain/types/enums";
import type { DomainState } from "../../domain/ledger/domain-state";
import { createEmptyDomainState } from "../../domain/ledger/domain-state";
import { PlatformMode } from "../../infrastructure/scorm/learning-platform-adapter";
import type {
  DecisionRecord,
} from "../../infrastructure/persistence/state-codec";
import type { LearnerInteraction } from "../../domain/types/scoring";
import type {
  CompactCommandJournalEntry,
  Tc3AttemptSnapshot,
} from "../../infrastructure/persistence/tc3-codec";
import {
  createSimulationRuntimeState,
} from "../../domain/simulation/command-handler";
import type { SimulationRuntimeState } from "../../domain/simulation/types";

export type SessionPhase = "LOADING" | "START" | "RUNNING" | "RECOVERY";

export type SaveStatus = "IDLE" | "SAVING" | "SAVED" | "FAILED";

export interface SessionState {
  readonly phase: SessionPhase;
  /**
   * The furthest stage the learner has unlocked, derived from completion
   * conditions.
   */
  readonly currentStageId: ScenarioStageId;
  /**
   * The stage actually on screen.
   *
   * Deliberately separate from `currentStageId`. Progression is derived, so the
   * moment a learner answers the last outstanding condition the derived stage
   * jumps forward -- and if the router followed it directly, the screen would
   * change out from under them before they had read the feedback explaining
   * their answer. Advancing is therefore a learner action, bounded by what they
   * have unlocked.
   */
  readonly viewedStageId: ScenarioStageId;
  readonly completedStageIds: readonly ScenarioStageId[];
  readonly domain: DomainState;
  readonly simulation: SimulationRuntimeState;
  readonly sessionId: string;
  readonly commandJournal: readonly CompactCommandJournalEntry[];
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
  readonly hintsUsed: readonly string[];
  /** Full record for the final report. Not persisted; not used for scoring. */
  readonly interactions: readonly LearnerInteraction[];
  readonly saveStatus: SaveStatus;
  readonly platformMode: PlatformMode;
  /**
   * The LMS opened this attempt for review or without credit.
   *
   * Everything stays visible and nothing is writable, so a learner revisiting a
   * finished attempt cannot overwrite the grade they already earned -- and is
   * told that is what is happening rather than working for an hour into a void.
   */
  readonly isReadOnly: boolean;
  readonly hasSavedAttempt: boolean;
  /** Set when stored progress could not be restored (section 21.11). */
  readonly recoveryMessageKey: string | null;
  readonly recoveryRequiresNewLmsAttempt: boolean;
  /** Most recent transaction, so the pipeline knows what to display. */
  readonly lastTransactionId: string | null;
  /** Free-text command input needed to deterministically replay Stage 5. */
  readonly correctionReason: string | null;
}

export function createInitialSessionState(): SessionState {
  const domain = createEmptyDomainState();
  return {
    phase: "LOADING",
    currentStageId: ScenarioStageId.ORIENTATION,
    viewedStageId: ScenarioStageId.ORIENTATION,
    completedStageIds: [],
    domain,
    simulation: createSimulationRuntimeState(domain),
    sessionId: "SES_000001",
    commandJournal: [],
    decisions: {},
    hintsUsed: [],
    interactions: [],
    saveStatus: "IDLE",
    platformMode: PlatformMode.STANDALONE,
    isReadOnly: false,
    hasSavedAttempt: false,
    recoveryMessageKey: null,
    recoveryRequiresNewLmsAttempt: false,
    lastTransactionId: null,
    correctionReason: null,
  };
}

export type SessionAction =
  | { type: "PUBLISH_STATE"; state: SessionState }
  | {
      type: "INITIALIZED";
      platformMode: PlatformMode;
      isReadOnly: boolean;
      hasSavedAttempt: boolean;
    }
  | {
      type: "RECOVERY_FAILED";
      messageKey: string;
      requiresNewLmsAttempt: boolean;
    }
  | {
      type: "START_NEW";
      simulation: SimulationRuntimeState;
      sessionId: string;
    }
  | {
      type: "RESUME";
      snapshot: Tc3AttemptSnapshot;
      simulation: SimulationRuntimeState;
      lastTransactionId: string | null;
    }
  | {
      type: "RECORD_DECISION";
      decisionId: string;
      encodedValue: number;
      interaction: LearnerInteraction | null;
    }
  | { type: "USE_HINT"; hintId: string }
  | {
      type: "SIMULATION_UPDATED";
      simulation: SimulationRuntimeState;
      commandJournal: readonly CompactCommandJournalEntry[];
      transactionId: string | null;
    }
  | { type: "CORRECTION_REASON_RECORDED"; reason: string }
  | {
      type: "STAGE_PROGRESS";
      completedStageIds: readonly ScenarioStageId[];
      currentStageId: ScenarioStageId;
    }
  | { type: "VIEW_STAGE"; stageId: ScenarioStageId }
  | { type: "SAVE_STATUS"; status: SaveStatus };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "PUBLISH_STATE":
      return action.state;

    case "INITIALIZED":
      return {
        ...state,
        // A read-only launch has nothing to start: it goes straight to the
        // attempt so the learner can look at it.
        phase: action.isReadOnly ? "RUNNING" : "START",
        platformMode: action.platformMode,
        isReadOnly: action.isReadOnly,
        hasSavedAttempt: action.hasSavedAttempt,
      };

    case "RECOVERY_FAILED":
      // Stored state is never silently discarded; the learner chooses.
      return {
        ...state,
        phase: "RECOVERY",
        recoveryMessageKey: action.messageKey,
        recoveryRequiresNewLmsAttempt: action.requiresNewLmsAttempt,
      };

    case "START_NEW":
      return {
        ...createInitialSessionState(),
        phase: "RUNNING",
        platformMode: state.platformMode,
        isReadOnly: state.isReadOnly,
        domain: action.simulation.domain,
        simulation: action.simulation,
        sessionId: action.sessionId,
      };

    case "RESUME":
      return {
        ...state,
        phase: "RUNNING",
        currentStageId: action.snapshot.currentStageId,
        viewedStageId: action.snapshot.currentStageId,
        completedStageIds: action.snapshot.completedStageIds,
        decisions: action.snapshot.decisions,
        hintsUsed: action.snapshot.hintsUsed,
        domain: action.simulation.domain,
        simulation: action.simulation,
        sessionId: action.snapshot.sessionId,
        commandJournal: action.snapshot.journal,
        correctionReason:
          (action.snapshot.journal.find((entry) => entry.opcode === 9)
            ?.values[0] as string | undefined) ?? null,
        recoveryMessageKey: null,
        recoveryRequiresNewLmsAttempt: false,
        lastTransactionId: action.lastTransactionId,
      };

    case "RECORD_DECISION": {
      const previous = state.decisions[action.decisionId];
      return {
        ...state,
        decisions: {
          ...state.decisions,
          [action.decisionId]: {
            encodedValue: action.encodedValue,
            // Attempts accumulate across retries, which is what the scoring
            // model reads to apply its deduction ladder.
            attemptCount: (previous?.attemptCount ?? 0) + 1,
          },
        },
        interactions:
          action.interaction === null
            ? state.interactions
            : [...state.interactions, action.interaction],
      };
    }

    case "USE_HINT":
      return state.hintsUsed.includes(action.hintId)
        ? state
        : { ...state, hintsUsed: [...state.hintsUsed, action.hintId] };

    case "SIMULATION_UPDATED":
      return {
        ...state,
        domain: action.simulation.domain,
        simulation: action.simulation,
        commandJournal: action.commandJournal,
        lastTransactionId: action.transactionId,
      };

    case "CORRECTION_REASON_RECORDED":
      return { ...state, correctionReason: action.reason };

    case "STAGE_PROGRESS":
      return {
        ...state,
        completedStageIds: action.completedStageIds,
        currentStageId: action.currentStageId,
      };

    case "VIEW_STAGE": {
      // A learner may look back at a finished stage, but never skip ahead of
      // what they have unlocked.
      const furthest = SCENARIO_STAGE_ORDER.indexOf(state.currentStageId);
      const target = SCENARIO_STAGE_ORDER.indexOf(action.stageId);
      return target < 0 || target > furthest
        ? state
        : { ...state, viewedStageId: action.stageId };
    }

    case "SAVE_STATUS":
      return { ...state, saveStatus: action.status };

    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

export function nextStageAfter(stageId: ScenarioStageId): ScenarioStageId | null {
  const index = SCENARIO_STAGE_ORDER.indexOf(stageId);
  return index >= 0 ? SCENARIO_STAGE_ORDER[index + 1] ?? null : null;
}

export function stageNumber(stageId: ScenarioStageId): number {
  return SCENARIO_STAGE_ORDER.indexOf(stageId) + 1;
}

export function toTc3AttemptSnapshot(
  state: SessionState,
  isPassed: boolean,
): Tc3AttemptSnapshot {
  return {
    sessionId: state.sessionId,
    currentStageId: state.currentStageId,
    completedStageIds: state.completedStageIds,
    decisions: state.decisions,
    hintsUsed: state.hintsUsed,
    journal: state.commandJournal,
    isCompleted: state.completedStageIds.length === SCENARIO_STAGE_ORDER.length,
    isPassed,
  };
}

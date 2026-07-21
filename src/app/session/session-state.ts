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
  AttemptSnapshot,
  DecisionRecord,
} from "../../infrastructure/persistence/state-codec";
import type { LearnerInteraction } from "../../domain/types/scoring";

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
  readonly decisions: Readonly<Record<string, DecisionRecord>>;
  readonly hintsUsed: readonly string[];
  /** Full record for the final report. Not persisted; not used for scoring. */
  readonly interactions: readonly LearnerInteraction[];
  readonly saveStatus: SaveStatus;
  readonly platformMode: PlatformMode;
  readonly hasSavedAttempt: boolean;
  /** Set when stored progress could not be restored (section 21.11). */
  readonly recoveryMessageKey: string | null;
  /** Most recent transaction, so the pipeline knows what to display. */
  readonly lastTransactionId: string | null;
}

export function createInitialSessionState(): SessionState {
  return {
    phase: "LOADING",
    currentStageId: ScenarioStageId.ORIENTATION,
    viewedStageId: ScenarioStageId.ORIENTATION,
    completedStageIds: [],
    domain: createEmptyDomainState(),
    decisions: {},
    hintsUsed: [],
    interactions: [],
    saveStatus: "IDLE",
    platformMode: PlatformMode.STANDALONE,
    hasSavedAttempt: false,
    recoveryMessageKey: null,
    lastTransactionId: null,
  };
}

export type SessionAction =
  | { type: "INITIALIZED"; platformMode: PlatformMode; hasSavedAttempt: boolean }
  | { type: "RECOVERY_FAILED"; messageKey: string }
  | { type: "START_NEW"; domain: DomainState }
  | { type: "RESUME"; snapshot: AttemptSnapshot; domain: DomainState }
  | {
      type: "RECORD_DECISION";
      decisionId: string;
      encodedValue: number;
      interaction: LearnerInteraction | null;
    }
  | { type: "USE_HINT"; hintId: string }
  | { type: "LEDGER_UPDATED"; domain: DomainState; transactionId: string | null }
  | {
      type: "STAGE_PROGRESS";
      completedStageIds: readonly ScenarioStageId[];
      currentStageId: ScenarioStageId;
    }
  | { type: "VIEW_STAGE"; stageId: ScenarioStageId }
  | { type: "SAVE_STATUS"; status: SaveStatus };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "INITIALIZED":
      return {
        ...state,
        phase: "START",
        platformMode: action.platformMode,
        hasSavedAttempt: action.hasSavedAttempt,
      };

    case "RECOVERY_FAILED":
      // Stored state is never silently discarded; the learner chooses.
      return { ...state, phase: "RECOVERY", recoveryMessageKey: action.messageKey };

    case "START_NEW":
      return {
        ...createInitialSessionState(),
        phase: "RUNNING",
        platformMode: state.platformMode,
        domain: action.domain,
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
        domain: action.domain,
        recoveryMessageKey: null,
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

    case "LEDGER_UPDATED":
      return { ...state, domain: action.domain, lastTransactionId: action.transactionId };

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

export function toAttemptSnapshot(state: SessionState, isPassed: boolean): AttemptSnapshot {
  return {
    currentStageId: state.currentStageId,
    completedStageIds: state.completedStageIds,
    decisions: state.decisions,
    hintsUsed: state.hintsUsed,
    isCompleted: state.completedStageIds.length === SCENARIO_STAGE_ORDER.length,
    isPassed,
  };
}

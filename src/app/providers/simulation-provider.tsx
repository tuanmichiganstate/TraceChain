/**
 * Wires the session reducer to a learning platform adapter.
 *
 * This is the only place that knows whether the application is running inside
 * Moodle or standalone. Everything below it -- stages, components, the domain --
 * sees one interface.
 *
 * It also owns the three derivations that must never disagree with each other:
 * stage progression, the score, and what gets reported to the LMS. All three
 * are computed from the same decisions, so a resumed attempt cannot drift from
 * the one that was saved.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SCENARIO_STAGE_ORDER, type ScenarioStageId } from "../../domain/types/enums";
import { SimulatedLedger } from "../../domain/ledger/ledger-engine";
import type { DomainState } from "../../domain/ledger/domain-state";
import type { CommandContext, SupplyChainCommand } from "../../domain/commands/commands";
import type { TransactionResult } from "../../domain/ledger/ledger-engine";
import { KnowledgeCheckType, type KnowledgeCheckDefinition } from "../../domain/types/scenario";
import { LearnerInteractionType } from "../../domain/types/scoring";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  decodeAttemptState,
  encodeAttemptState,
} from "../../infrastructure/persistence/state-codec";
import { StandalonePersistenceAdapter } from "../../infrastructure/persistence/standalone-adapter";
import { Scorm12Adapter } from "../../infrastructure/scorm/scorm12-adapter";
import {
  CompletionStatus,
  PlatformMode,
  type LearningPlatformAdapter,
  type PlatformInteraction,
} from "../../infrastructure/scorm/learning-platform-adapter";
import { applyScenarioSeed } from "../../domain/scenario/seed-replay";
import {
  ACTION_ACCEPTED,
  ACTION_REJECTED,
  deriveCorrectnessFromDecisions,
  encodeAnswer,
  isAnswerCorrect,
  type Answer,
} from "../../domain/scenario/answer-codec";
import { completedStages, currentStage } from "../../domain/scenario/stage-completion";
import {
  calculateScore,
  isPassing,
  type ScoreBreakdown,
} from "../../domain/scoring/score-engine";
import { useScenario } from "./scenario-provider";
import { APP_VERSION, defaultAppConfiguration } from "../configuration";
import {
  createInitialSessionState,
  sessionReducer,
  toAttemptSnapshot,
  type SessionState,
} from "../session/session-state";

interface SimulationContextValue {
  readonly state: SessionState;
  readonly diagnostics: readonly string[];
  readonly scoreBreakdown: ScoreBreakdown;
  readonly isPassed: boolean;
  readonly isCompleted: boolean;
  startNew(): void;
  resume(): void;
  restart(): void;
  /** Record a knowledge check answer. Correctness is derived, not passed in. */
  answerCheck(check: KnowledgeCheckDefinition, answer: Answer): boolean;
  /** Named `revealHint` rather than `useHint`: a `use` prefix would read
   *  as a React hook to both the linter and the next person. */
  revealHint(hintId: string): void;
  submitCommand(command: SupplyChainCommand, context: CommandContext): TransactionResult;
  /** Record the outcome of a scored procedural action. */
  recordActionOutcome(decisionId: string, wasAccepted: boolean): void;
  sealPendingBlock(createdAt: string): void;
  viewStage(stageId: ScenarioStageId): void;
  save(): Promise<void>;
  finish(): Promise<void>;
}

/**
 * The SCORM 1.2 interaction type for a check.
 *
 * `matching` is the closest fit for the classification exercise: the learner
 * pairs each item with a category, which is what matching means in the data
 * model even though the interface is a set of labelled selects.
 */
function scormInteractionType(
  checkType: KnowledgeCheckType,
): PlatformInteraction["type"] {
  return checkType === KnowledgeCheckType.CLASSIFICATION ? "matching" : "choice";
}

/**
 * The learner's answer in SCORM's response vocabulary.
 *
 * Identifiers, never translated labels: a report read in either language has to
 * mean the same thing, and CMIString255 has no room for prose.
 */
function describeResponse(check: KnowledgeCheckDefinition, answer: Answer): string {
  const response =
    check.checkType === KnowledgeCheckType.CLASSIFICATION
      ? Object.entries(answer.categoryByItem)
          .map(([item, category]) => `${item}.${category}`)
          .join(",")
      : answer.selectedOptionIds.join(",");
  return response.slice(0, 255);
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }): ReactNode {
  const { scenario } = useScenario();
  const [state, dispatch] = useReducer(sessionReducer, undefined, createInitialSessionState);

  const ledger = useMemo(
    () => new SimulatedLedger(sha256Hex, scenario.ledgerConfiguration),
    [scenario],
  );
  const codecSchema = useMemo(
    () => ({ decisionIds: scenario.decisionIds, hintIds: scenario.hintIds }),
    [scenario],
  );
  const registries = useMemo(
    () => ({
      organizationsById: Object.fromEntries(
        scenario.organizations.map((organization) => [organization.organizationId, organization]),
      ),
      actorsById: Object.fromEntries(scenario.actors.map((actor) => [actor.actorId, actor])),
    }),
    [scenario],
  );

  /** The starting world: seeded background lots and their provenance. */
  const seededState = useMemo(
    () => applyScenarioSeed(scenario, sha256Hex, registries).state,
    [scenario, registries],
  );

  const adapterRef = useRef<LearningPlatformAdapter | null>(null);
  const diagnosticsRef = useRef<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const addDiagnostic = useCallback((entry: string): void => {
    diagnosticsRef.current = [...diagnosticsRef.current, entry];
    setDiagnostics(diagnosticsRef.current);
  }, []);

  // ---- Derivations, all from the same decisions ------------------------

  const scoreBreakdown = useMemo(
    () =>
      calculateScore(
        {
          decisions: state.decisions,
          hintsUsed: state.hintsUsed,
          correctness: deriveCorrectnessFromDecisions(state.decisions, scenario),
        },
        scenario,
      ),
    [state.decisions, state.hintsUsed, scenario],
  );

  const isPassed = isPassing(scoreBreakdown.score, scenario.scoringConfiguration);
  const isCompleted = state.completedStageIds.length === SCENARIO_STAGE_ORDER.length;

  /**
   * Stage progression is recomputed whenever the ledger or the decisions move,
   * rather than being advanced by a component. That is what lets a resumed
   * attempt rebuild its own progress from replayed state.
   */
  useEffect(() => {
    if (state.phase !== "RUNNING") return;
    const context = { state: state.domain, decisions: state.decisions };
    const completed = completedStages(scenario, context);
    const current = currentStage(scenario, context);

    const sameCompleted =
      completed.length === state.completedStageIds.length &&
      completed.every((stageId, index) => stageId === state.completedStageIds[index]);

    if (!sameCompleted || current !== state.currentStageId) {
      dispatch({ type: "STAGE_PROGRESS", completedStageIds: completed, currentStageId: current });
    }
  }, [
    state.phase,
    state.domain,
    state.decisions,
    state.completedStageIds,
    state.currentStageId,
    scenario,
  ]);

  // ---- Platform ---------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const scormAdapter = new Scorm12Adapter();
      const scormResult = await scormAdapter.initialize();

      let adapter: LearningPlatformAdapter = scormAdapter;
      let mode = PlatformMode.SCORM_1_2;
      let isReadOnly = scormResult.isReadOnly;
      const collected = [...scormResult.diagnostics];

      if (!scormResult.isConnected) {
        const standalone = new StandalonePersistenceAdapter({
          appVersion: APP_VERSION,
          scenarioId: scenario.scenarioId,
        });
        const standaloneResult = await standalone.initialize();
        adapter = standalone;
        mode = PlatformMode.STANDALONE;
        isReadOnly = standaloneResult.isReadOnly;
        collected.push(...standaloneResult.diagnostics);
      }

      if (cancelled) return;

      adapterRef.current = adapter;
      diagnosticsRef.current = collected;
      setDiagnostics(collected);

      const stored = await adapter.loadAttemptState();
      if (stored === null) {
        dispatch({ type: "INITIALIZED", platformMode: mode, isReadOnly, hasSavedAttempt: false });
        return;
      }

      try {
        decodeAttemptState(stored, codecSchema);
        dispatch({ type: "INITIALIZED", platformMode: mode, isReadOnly, hasSavedAttempt: true });
      } catch (error) {
        addDiagnostic(
          `Stored attempt could not be decoded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        dispatch({ type: "RECOVERY_FAILED", messageKey: "errors.persistence" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addDiagnostic, codecSchema, scenario.scenarioId]);

  const save = useCallback(async (): Promise<void> => {
    const adapter = adapterRef.current;
    if (adapter === null) return;

    // A read-only launch has nothing to save. Running the cycle anyway would
    // report "saved" on every tick for writes the adapter is suppressing.
    if (stateRef.current.isReadOnly) return;

    dispatch({ type: "SAVE_STATUS", status: "SAVING" });
    try {
      const current = stateRef.current;
      const correctness = deriveCorrectnessFromDecisions(current.decisions, scenario);
      const breakdown = calculateScore(
        { decisions: current.decisions, hintsUsed: current.hintsUsed, correctness },
        scenario,
      );
      const passed = isPassing(breakdown.score, scenario.scoringConfiguration);

      await adapter.saveAttemptState(
        encodeAttemptState(toAttemptSnapshot(current, passed), codecSchema),
      );
      await adapter.setLocation(current.currentStageId);
      await adapter.setScore(breakdown.score.totalScore);

      // A learner may complete without passing; the LMS status distinguishes
      // them, and neither is written before the activity is actually finished.
      if (current.completedStageIds.length === SCENARIO_STAGE_ORDER.length) {
        await adapter.setCompletion(
          passed ? CompletionStatus.PASSED : CompletionStatus.COMPLETED,
        );
      }

      await adapter.commit();
      dispatch({ type: "SAVE_STATUS", status: "SAVED" });
    } catch (error) {
      addDiagnostic(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
      dispatch({ type: "SAVE_STATUS", status: "FAILED" });
    }
  }, [addDiagnostic, codecSchema, scenario]);

  useEffect(() => {
    if (state.phase !== "RUNNING") return undefined;

    const interval = window.setInterval(
      () => void save(),
      defaultAppConfiguration.autoSaveIntervalMs,
    );
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") void save();
    };
    const handlePageHide = (): void => void save();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [state.phase, save]);

  const value = useMemo<SimulationContextValue>(
    () => ({
      state,
      diagnostics,
      scoreBreakdown,
      isPassed,
      isCompleted,

      startNew: () => dispatch({ type: "START_NEW", domain: seededState }),

      resume: () => {
        void (async () => {
          const adapter = adapterRef.current;
          if (adapter === null) return;
          const stored = await adapter.loadAttemptState();
          if (stored === null) {
            dispatch({ type: "START_NEW", domain: seededState });
            return;
          }
          try {
            const snapshot = decodeAttemptState(stored, codecSchema);
            /*
             * Milestone 4 restores position, decisions and the seeded world.
             * Full ledger replay from the decision record lands with the report
             * milestone; until then a resumed learner keeps their answers and
             * their score but re-does the current stage's transactions.
             */
            dispatch({ type: "RESUME", snapshot, domain: seededState });
          } catch {
            dispatch({ type: "RECOVERY_FAILED", messageKey: "errors.persistence" });
          }
        })();
      },

      restart: () => {
        const adapter = adapterRef.current;
        if (adapter instanceof StandalonePersistenceAdapter) {
          adapter.clear();
        }
        dispatch({ type: "START_NEW", domain: seededState });
        void save();
      },

      answerCheck: (check, answer) => {
        const encodedValue = encodeAnswer(check, answer);
        const isCorrect = isAnswerCorrect(check, answer);
        dispatch({
          type: "RECORD_DECISION",
          decisionId: check.knowledgeCheckId,
          encodedValue,
          interaction: {
            interactionId: `INT_${String(stateRef.current.interactions.length + 1).padStart(4, "0")}`,
            stageId: stateRef.current.currentStageId,
            interactionType: LearnerInteractionType.KNOWLEDGE_CHECK_ANSWERED,
            targetId: check.knowledgeCheckId,
            selectedValue: String(encodedValue),
            isCorrect,
            attemptNumber:
              (stateRef.current.decisions[check.knowledgeCheckId]?.attemptCount ?? 0) + 1,
            scenarioTimestamp: scenario.timeline["batchCreated"] as string,
          },
        });
        // Section 21.7. Reported to the LMS for the instructor's benefit only:
        // SCORM 1.2 interactions are write-only, so nothing here can ever be
        // read back, and the attempt is rebuilt from suspend_data alone.
        void adapterRef.current?.recordInteraction({
          interactionId: check.knowledgeCheckId,
          type: scormInteractionType(check.checkType),
          learnerResponse: describeResponse(check, answer),
          isCorrect,
          scenarioTimestamp: scenario.timeline["batchCreated"] as string,
        });

        void save();
        return isCorrect;
      },

      recordActionOutcome: (decisionId, wasAccepted) => {
        dispatch({
          type: "RECORD_DECISION",
          decisionId,
          encodedValue: wasAccepted ? ACTION_ACCEPTED : ACTION_REJECTED,
          interaction: {
            interactionId: `INT_${String(stateRef.current.interactions.length + 1).padStart(4, "0")}`,
            stageId: stateRef.current.currentStageId,
            interactionType: wasAccepted
              ? LearnerInteractionType.TRANSACTION_SUBMITTED
              : LearnerInteractionType.TRANSACTION_REJECTED,
            targetId: decisionId,
            isCorrect: wasAccepted,
            attemptNumber: (stateRef.current.decisions[decisionId]?.attemptCount ?? 0) + 1,
            scenarioTimestamp: scenario.timeline["batchCreated"] as string,
          },
        });
        void save();
      },

      revealHint: (hintId) => {
        dispatch({ type: "USE_HINT", hintId });
        void save();
      },

      submitCommand: (command, context) => {
        const result = ledger.submitCommand(
          stateRef.current.domain,
          command,
          context,
          registries,
        );
        dispatch({
          type: "LEDGER_UPDATED",
          domain: result.state,
          transactionId: result.transaction.transactionId,
        });
        void save();
        return result;
      },

      sealPendingBlock: (createdAt) => {
        const sealed = ledger.sealPendingTransactions(stateRef.current.domain, createdAt);
        dispatch({
          type: "LEDGER_UPDATED",
          domain: sealed,
          transactionId: stateRef.current.lastTransactionId,
        });
      },

      viewStage: (stageId) => dispatch({ type: "VIEW_STAGE", stageId }),

      save,

      finish: async () => {
        await save();
        await adapterRef.current?.finish();
      },
    }),
    [
      state,
      save,
      diagnostics,
      scoreBreakdown,
      isPassed,
      isCompleted,
      ledger,
      codecSchema,
      registries,
      seededState,
      scenario,
    ],
  );

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation(): SimulationContextValue {
  const value = useContext(SimulationContext);
  if (value === null) {
    throw new Error("useSimulation must be used inside a SimulationProvider");
  }
  return value;
}

export { SCENARIO_STAGE_ORDER };
export type { DomainState, ScenarioStageId };

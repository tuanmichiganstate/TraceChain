/**
 * Wires the session reducer to a learning platform adapter.
 *
 * This is the only place that knows whether the application is running inside
 * Moodle or standalone. Everything below it -- stages, components, the domain --
 * sees one interface.
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
import { createEmptyDomainState } from "../../domain/ledger/domain-state";
import type { CommandContext, SupplyChainCommand } from "../../domain/commands/commands";
import type { TransactionResult } from "../../domain/ledger/ledger-engine";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  decodeAttemptState,
  encodeAttemptState,
} from "../../infrastructure/persistence/state-codec";
import { StandalonePersistenceAdapter } from "../../infrastructure/persistence/standalone-adapter";
import { Scorm12Adapter } from "../../infrastructure/scorm/scorm12-adapter";
import {
  PlatformMode,
  type LearningPlatformAdapter,
} from "../../infrastructure/scorm/learning-platform-adapter";
import { actorsById, organizationsById } from "../../scenarios/coffee-traceability/organizations";
import { CODEC_SCHEMA } from "../../scenarios/coffee-traceability/decisions";
import { APP_VERSION, SCENARIO_ID } from "../configuration";
import {
  createInitialSessionState,
  sessionReducer,
  toAttemptSnapshot,
  type SessionState,
} from "../session/session-state";

const AUTO_SAVE_INTERVAL_MS = 30_000;

interface SimulationContextValue {
  readonly state: SessionState;
  readonly diagnostics: readonly string[];
  startNew(): void;
  resume(): void;
  restart(): void;
  recordDecision(decisionId: string, encodedValue: number): void;
  useHint(hintId: string): void;
  submitCommand(command: SupplyChainCommand, context: CommandContext): TransactionResult;
  sealPendingBlock(createdAt: string): void;
  completeStage(stageId: ScenarioStageId): void;
  save(): Promise<void>;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

const ledger = new SimulatedLedger(sha256Hex, {
  maxTransactionsPerBlock: 2,
  // Stage 2's whole purpose is watching a block form, so it seals immediately.
  // Later stages switch to STAGE_BOUNDARY, which is why this is configuration
  // rather than a constant.
  blockCommitMode: "IMMEDIATE",
  orderingServiceId: "ORDERER_SIMULATED_001",
});

export function SimulationProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, dispatch] = useReducer(sessionReducer, undefined, createInitialSessionState);
  const adapterRef = useRef<LearningPlatformAdapter | null>(null);
  const diagnosticsRef = useRef<string[]>([]);
  // Diagnostics are rendered by the developer panel, so they are state rather
  // than a bare ref; the ref is only the accumulation buffer for async writers.
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);

  // Read by the save routine, which must never capture a stale render. Written
  // in an effect rather than during render, so nothing reads a ref mid-render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const addDiagnostic = useCallback((entry: string): void => {
    diagnosticsRef.current = [...diagnosticsRef.current, entry];
    setDiagnostics(diagnosticsRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Try SCORM first; fall back to local storage when no API is reachable.
      const scormAdapter = new Scorm12Adapter();
      const scormResult = await scormAdapter.initialize();

      let adapter: LearningPlatformAdapter = scormAdapter;
      let mode = PlatformMode.SCORM_1_2;
      const diagnostics = [...scormResult.diagnostics];

      if (!scormResult.isConnected) {
        const standalone = new StandalonePersistenceAdapter({
          appVersion: APP_VERSION,
          scenarioId: SCENARIO_ID,
        });
        const standaloneResult = await standalone.initialize();
        adapter = standalone;
        mode = PlatformMode.STANDALONE;
        diagnostics.push(...standaloneResult.diagnostics);
      }

      if (cancelled) return;

      adapterRef.current = adapter;
      diagnosticsRef.current = diagnostics;
      setDiagnostics(diagnostics);

      const stored = await adapter.loadAttemptState();
      if (stored === null) {
        dispatch({ type: "INITIALIZED", platformMode: mode, hasSavedAttempt: false });
        return;
      }

      // Verify stored state before trusting it (sections 21.11 and 27).
      try {
        decodeAttemptState(stored, CODEC_SCHEMA);
        dispatch({ type: "INITIALIZED", platformMode: mode, hasSavedAttempt: true });
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
  }, [addDiagnostic]);

  const save = useCallback(async (): Promise<void> => {
    const adapter = adapterRef.current;
    if (adapter === null) return;

    dispatch({ type: "SAVE_STATUS", status: "SAVING" });
    try {
      const current = stateRef.current;
      const encoded = encodeAttemptState(toAttemptSnapshot(current), CODEC_SCHEMA);
      await adapter.saveAttemptState(encoded);
      await adapter.setLocation(current.currentStageId);
      await adapter.commit();
      dispatch({ type: "SAVE_STATUS", status: "SAVED" });
    } catch (error) {
      addDiagnostic(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
      dispatch({ type: "SAVE_STATUS", status: "FAILED" });
    }
  }, [addDiagnostic]);

  // Periodic save, plus a save when the page is hidden. `visibilitychange` and
  // `pagehide` are used rather than `beforeunload`, which is unreliable on
  // mobile Safari and is not fired at all in some backgrounding paths.
  useEffect(() => {
    if (state.phase !== "RUNNING") return undefined;

    const interval = window.setInterval(() => void save(), AUTO_SAVE_INTERVAL_MS);
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

      startNew: () => dispatch({ type: "START_NEW" }),

      resume: () => {
        void (async () => {
          const adapter = adapterRef.current;
          if (adapter === null) return;
          const stored = await adapter.loadAttemptState();
          if (stored === null) {
            dispatch({ type: "START_NEW" });
            return;
          }
          try {
            const snapshot = decodeAttemptState(stored, CODEC_SCHEMA);
            // Milestone 0 restores position and decisions. Milestone 2 adds
            // full ledger replay from the decision record, which is why nothing
            // about the ledger is persisted.
            dispatch({ type: "RESUME", snapshot, domain: createEmptyDomainState() });
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
        dispatch({ type: "START_NEW" });
        void save();
      },

      recordDecision: (decisionId, encodedValue) => {
        dispatch({ type: "RECORD_DECISION", decisionId, encodedValue });
        void save();
      },

      useHint: (hintId) => dispatch({ type: "USE_HINT", hintId }),

      submitCommand: (command, context) => {
        const result = ledger.submitCommand(stateRef.current.domain, command, context, {
          organizationsById,
          actorsById,
          actorId: context.actorId,
          organizationId: context.organizationId,
        });
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

      completeStage: (stageId) => {
        dispatch({ type: "COMPLETE_STAGE", stageId });
        void save();
      },

      save,
    }),
    [state, save, diagnostics],
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
export type { DomainState };

/**
 * Application orchestrator.
 *
 * The simulation core is platform-independent. This provider supplies trusted
 * scenario context, turns learner submissions into metadata-bearing commands,
 * journals the bounded replay inputs, and persists a prospective SL1 snapshot
 * before publishing the resulting UI state.
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
import {
  SCENARIO_STAGE_ORDER,
  ScenarioStageId,
  TransactionType,
  type TransactionStatus,
} from "../../domain/types/enums";
import { SimulatedLedger, type TransactionResult } from "../../domain/ledger/ledger-engine";
import type { DomainState } from "../../domain/ledger/domain-state";
import type { SupplyChainCommand } from "../../domain/commands/commands";
import { KnowledgeCheckType, type KnowledgeCheckDefinition } from "../../domain/types/scenario";
import { LearnerInteractionType } from "../../domain/types/scoring";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  decodeSl1Attempt,
  encodeSl1Attempt,
  type CompactCommandJournalEntry,
} from "../../infrastructure/persistence/sl1-codec";
import {
  LearningPlatformPersistenceBridge,
  type SimulationPersistence,
} from "../../infrastructure/persistence/simulation-persistence";
import { StandalonePersistenceAdapter } from "../../infrastructure/persistence/standalone-adapter";
import { Scorm12Adapter } from "../../infrastructure/scorm/scorm12-adapter";
import {
  CompletionStatus,
  PlatformMode,
  type LearningPlatformAdapter,
  type PlatformInteraction,
} from "../../infrastructure/scorm/learning-platform-adapter";
import { applyScenarioSeed } from "../../domain/scenario/seed-replay";
import { applyEligibleScriptedTransactions } from "../../domain/scenario/scripted-transactions";
import {
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
import {
  activeContextIdForStage,
  commandJournalEntry,
  endorsedProposalJournalEntry,
  endorsementWorkflowJournalEntry,
  contextAt,
  contextIndex,
  JournalOpcode,
  sl1CodecSchema,
  validateAndApplyHandoff,
} from "../../domain/simulation/command-journal";
import {
  expectedStateVersionsFor,
  handleSimulationCommand,
  createSimulationRuntimeState,
} from "../../domain/simulation/command-handler";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type {
  ConsequentialDecisionCommand,
  MitigationDecisionCommand,
  DomainSimulationCommand,
  SimulationCommandOutcome,
  SimulationRuntimeState,
  TrustedExecutionContext,
  SubmitCertificateDecisionCommand,
  SubmitDiscrepancyDecisionCommand,
  EndorsementWorkflowOutcome,
} from "../../domain/simulation/types";
import { handleSimulationDecision } from "../../domain/simulation/decision-handler";
import {
  compactCertificateDecision,
  compactDiscrepancyDecision,
  expandCertificateDecision,
  evaluateCertificateDecision,
  evaluateDiscrepancyDecision,
  type CertificateDecisionEvaluation,
  type DiscrepancyDecisionEvaluation,
} from "../../domain/simulation/consequential-decisions";
import { replayCommandJournal } from "../../domain/simulation/replay-journal";
import { SimuLedgerError } from "../../domain/errors";
import { useScenario } from "./scenario-provider";
import { useOptionalConfiguration } from "./configuration-provider";
import { GUIDED_PRESET } from "../../config/presets";
import { hashConfiguration } from "../../config/hash";
import { APP_VERSION, defaultAppConfiguration } from "../configuration";
import {
  createInitialSessionState,
  sessionReducer,
  toSl1AttemptSnapshot,
  type SessionState,
  type SessionAction,
} from "../session/session-state";
import { NobleEd25519Provider } from "../../crypto/signatures/noble-ed25519-provider";
import {
  demonstrateSignatureTamper,
  signAndVerifyCommand,
  signatureAttemptFailures,
} from "../../crypto/signatures/signing-service";
import type { SignatureTamperDemonstration } from "../../crypto/signatures/types";
import {
  commitPendingProposal as commitPendingProposalCore,
  createEndorsedProposal as createEndorsedProposalCore,
  declinePendingProposal as declinePendingProposalCore,
  endorsePendingProposal as endorsePendingProposalCore,
} from "../../domain/simulation/endorsement-workflow";
import { useTranslator } from "./locale-provider";
import { useOptionalNotifications } from "./notification-provider";
import {
  notificationForPersistedAction,
  type PersistedActionNotification,
} from "../notifications/action-notifications";
import type { RuntimePlatformBootstrap } from "../../config/runtime-bootstrap";

const DEVELOPMENT_FALLBACK_CONFIGURATION = {
  ...GUIDED_PRESET,
  technicalFeatures: {
    ...GUIDED_PRESET.technicalFeatures,
    digitalSignatures: false,
    endorsementPolicies: false,
  },
} as const;

function recoveryDetails(
  error: unknown,
  platformMode: PlatformMode,
): {
  readonly messageKey: string;
  readonly requiresNewLmsAttempt: boolean;
} {
  const messageKey =
    error instanceof SimuLedgerError
      ? error.messageKey
      : "errors.persistence";

  return {
    messageKey,
    requiresNewLmsAttempt: platformMode === PlatformMode.SCORM_1_2,
  };
}

interface SimulationContextValue {
  readonly state: SessionState;
  readonly diagnostics: readonly string[];
  readonly scoreBreakdown: ScoreBreakdown;
  readonly isPassed: boolean;
  readonly isCompleted: boolean;
  readonly activeTrustedContext: TrustedExecutionContext;
  startNew(): void;
  resume(): void;
  restart(): void;
  answerCheck(check: KnowledgeCheckDefinition, answer: Answer): boolean;
  answerProfessionalCheck(
    check: KnowledgeCheckDefinition,
    answer: Answer,
  ): Promise<boolean>;
  revealHint(hintId: string): void;
  submitCommand(
    actionId: string,
    decisionId: string,
    command: SupplyChainCommand,
    options?: { readonly recordDecision?: boolean },
  ): Promise<SimulationCommandOutcome>;
  createEndorsedProposal(
    actionId: string,
    decisionId: string,
    command: SupplyChainCommand,
    options?: { readonly recordDecision?: boolean },
  ): Promise<EndorsementWorkflowOutcome>;
  endorsePendingProposal(
    proposalId: string,
  ): Promise<EndorsementWorkflowOutcome>;
  declinePendingProposal(
    proposalId: string,
  ): Promise<EndorsementWorkflowOutcome>;
  commitEndorsedProposal(
    proposalId: string,
    decisionId: string,
    options?: { readonly recordDecision?: boolean },
  ): Promise<{
    readonly workflow: EndorsementWorkflowOutcome;
    readonly transactionOutcome: SimulationCommandOutcome | null;
  }>;
  sealPendingBlock(): Promise<void>;
  requestRoleHandoff(handoffId: string): Promise<void>;
  submitCertificateDecision(
    command: SubmitCertificateDecisionCommand,
  ): Promise<CertificateDecisionEvaluation>;
  submitDiscrepancyDecision(
    command: SubmitDiscrepancyDecisionCommand,
  ): Promise<DiscrepancyDecisionEvaluation>;
  recordMitigation(command: MitigationDecisionCommand): Promise<void>;
  demonstrateSignatureTamper(
    transactionId: string,
  ): Promise<SignatureTamperDemonstration>;
  viewStage(stageId: ScenarioStageId): void;
  save(): Promise<void>;
  finish(): Promise<void>;
}

function scormInteractionType(
  checkType: KnowledgeCheckType,
): PlatformInteraction["type"] {
  return checkType === KnowledgeCheckType.CLASSIFICATION ? "matching" : "choice";
}

function describeResponse(check: KnowledgeCheckDefinition, answer: Answer): string {
  const response =
    check.checkType === KnowledgeCheckType.CLASSIFICATION
      ? Object.entries(answer.categoryByItem)
          .map(([item, category]) => `${item}.${category}`)
          .join(",")
      : answer.selectedOptionIds.join(",");
  return response.slice(0, 255);
}

function commandSequence(journal: readonly CompactCommandJournalEntry[]): number {
  return (journal[journal.length - 1]?.commandSequence ?? 0) + 1;
}

function commandId(sequence: number): string {
  return `CMD_${String(sequence).padStart(6, "0")}`;
}

function commandSequenceFromId(value: string): number {
  const match = /^CMD_(\d{6})$/u.exec(value);
  if (match?.[1] === undefined) {
    throw new Error(`Invalid deterministic command identifier "${value}"`);
  }
  return Number.parseInt(match[1], 10);
}

function rejectionMessageKey(
  outcome: SimulationCommandOutcome | EndorsementWorkflowOutcome,
): string | undefined {
  if (outcome.isAccepted) return undefined;
  return outcome.auditEvent.validationFailures[0]?.messageKey;
}

function trustedPayload(
  command: SupplyChainCommand,
  context: TrustedExecutionContext,
): SupplyChainCommand {
  // The domain payload retains the initiating actor for ledger attribution.
  // It is always overwritten at the trust boundary and cannot be asserted by
  // a learner-controlled form.
  return { ...command, initiatedByActorId: context.actorId };
}

function deriveProgress(state: SessionState, scenario: ReturnType<typeof useScenario>["scenario"]): SessionState {
  const context = { state: state.domain, decisions: state.decisions };
  return sessionReducer(state, {
    type: "STAGE_PROGRESS",
    completedStageIds: completedStages(scenario, context),
    currentStageId: currentStage(scenario, context),
  });
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({
  children,
  platformBootstrap,
}: {
  readonly children: ReactNode;
  readonly platformBootstrap?: RuntimePlatformBootstrap;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const configuredPackage = useOptionalConfiguration();
  const notificationChannel = useOptionalNotifications();
  if (configuredPackage === null && import.meta.env.PROD) {
    throw new Error("SimulationProvider requires an embedded package configuration");
  }
  const configuration =
    configuredPackage?.configuration ?? DEVELOPMENT_FALLBACK_CONFIGURATION;
  const configurationHash =
    configuredPackage?.configurationHash ??
    hashConfiguration(DEVELOPMENT_FALLBACK_CONFIGURATION);
  const variantBank =
    configuredPackage?.variantBank ?? null;
  const [state, reactDispatch] = useReducer(
    sessionReducer,
    undefined,
    createInitialSessionState,
  );
  const stateRef = useRef(state);
  const dispatch = useCallback((action: SessionAction): void => {
    stateRef.current = sessionReducer(stateRef.current, action);
    reactDispatch(action);
  }, []);

  const ledger = useMemo(
    () => new SimulatedLedger(sha256Hex, scenario.ledgerConfiguration),
    [scenario],
  );
  const signatureProvider = useMemo(
    () => new NobleEd25519Provider(),
    [],
  );
  const codecSchema = useMemo(
    () =>
      sl1CodecSchema({
        configuration,
        configurationHash,
        scenario,
        ...(variantBank === null ? {} : { variantBank }),
      }),
    [
      configuration,
      configurationHash,
      scenario,
      variantBank,
    ],
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
  const seededDomain = useMemo(
    () => applyScenarioSeed(scenario, sha256Hex, registries).state,
    [scenario, registries],
  );

  const adapterRef = useRef<LearningPlatformAdapter | null>(null);
  const persistenceRef = useRef<SimulationPersistence | null>(null);
  const persistenceQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const diagnosticsRef = useRef<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);

  useEffect(() => {
    stateRef.current = state;
  });

  const addDiagnostic = useCallback((entry: string): void => {
    diagnosticsRef.current = [...diagnosticsRef.current, entry];
    setDiagnostics(diagnosticsRef.current);
  }, []);

  const publishNotification = useCallback(
    (result: PersistedActionNotification): void => {
      const notification = notificationForPersistedAction(result);
      if (notification !== null) {
        notificationChannel?.notify(notification);
      }
    },
    [notificationChannel],
  );

  const organizationName = useCallback(
    (organizationId: string | undefined): string | undefined => {
      if (organizationId === undefined) return undefined;
      const organization = scenario.organizations.find(
        (candidate) =>
          candidate.organizationId === organizationId,
      );
      return organization === undefined
        ? organizationId
        : t(organization.displayNameKey);
    },
    [scenario.organizations, t],
  );

  const scoreFor = useCallback(
    (candidate: SessionState): ScoreBreakdown =>
      calculateScore(
        {
          decisions: candidate.decisions,
          hintsUsed: candidate.hintsUsed,
          correctness: deriveCorrectnessFromDecisions(
            candidate.decisions,
            scenario,
            candidate.domain,
          ),
        },
        scenario,
      ),
    [scenario],
  );

  const scoreBreakdown = useMemo(() => scoreFor(state), [scoreFor, state]);
  const activeScoringConfiguration = useMemo(
    () => ({
      ...scenario.scoringConfiguration,
      passingScore: configuration.scoring.passScore,
    }),
    [configuration.scoring.passScore, scenario.scoringConfiguration],
  );
  const isPassed = isPassing(
    scoreBreakdown.score,
    activeScoringConfiguration,
  );
  const isCompleted = state.completedStageIds.length === SCENARIO_STAGE_ORDER.length;

  useEffect(() => {
    if (state.phase !== "RUNNING") return;
    const progressed = deriveProgress(state, scenario);
    const sameCompleted =
      progressed.completedStageIds.length === state.completedStageIds.length &&
      progressed.completedStageIds.every(
        (stageId, index) => stageId === state.completedStageIds[index],
      );
    if (!sameCompleted || progressed.currentStageId !== state.currentStageId) {
      dispatch({
        type: "STAGE_PROGRESS",
        completedStageIds: progressed.completedStageIds,
        currentStageId: progressed.currentStageId,
      });
      void saveRef.current();
    }
  }, [
    dispatch,
    scenario,
    state,
  ]);

  const activeTrustedContext = useMemo(() => {
    const contextId = activeContextIdForStage(
      scenario,
      state.viewedStageId,
      state.commandJournal,
    );
    const index = contextIndex(scenario, contextId);
    return contextAt(scenario, index);
  }, [scenario, state.viewedStageId, state.commandJournal]);

  const encodeState = useCallback(
    (candidate: SessionState): string => {
      const breakdown = scoreFor(candidate);
      return encodeSl1Attempt(
        toSl1AttemptSnapshot(
          candidate,
          isPassing(breakdown.score, activeScoringConfiguration),
        ),
        codecSchema,
      );
    },
    [activeScoringConfiguration, codecSchema, scoreFor],
  );

  const writeProspectiveState = useCallback(
    async (candidate: SessionState): Promise<void> => {
      const adapter = adapterRef.current;
      const persistence = persistenceRef.current;
      if (adapter === null || persistence === null) {
        throw new Error("Persistence adapter is not initialized");
      }
      const breakdown = scoreFor(candidate);
      const encoded = encodeState(candidate);
      await adapter.setLocation(candidate.currentStageId);
      await adapter.setScore(breakdown.score.totalScore);
      await persistence.persistAndCommit(encoded);
    },
    [encodeState, scoreFor],
  );

  const commitMutation = useCallback(
    <T,>(
      mutate: (
        base: SessionState,
      ) =>
        | { readonly state: SessionState; readonly result: T }
        | Promise<{ readonly state: SessionState; readonly result: T }>,
    ): Promise<T> => {
      const run = async (): Promise<T> => {
        const base = stateRef.current;
        dispatch({ type: "SAVE_STATUS", status: "SAVING" });
        try {
          const mutation = await mutate(base);
          const prospective = { ...mutation.state, saveStatus: "SAVED" as const };
          await writeProspectiveState(prospective);
          dispatch({ type: "PUBLISH_STATE", state: prospective });
          return mutation.result;
        } catch (error) {
          addDiagnostic(
            `Persisted mutation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          const recovery = recoveryDetails(
            error,
            base.platformMode,
          );
          dispatch({
            type: "RECOVERY_FAILED",
            ...recovery,
          });
          throw error;
        }
      };
      const scheduled = persistenceQueueRef.current.then(run, run);
      persistenceQueueRef.current = scheduled.then(
        () => undefined,
        () => undefined,
      );
      return scheduled;
    },
    [addDiagnostic, dispatch, writeProspectiveState],
  );

  // ---- Platform initialization ----------------------------------------

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let adapter: LearningPlatformAdapter;
      let persistence: SimulationPersistence;
      let mode: PlatformMode;
      let isReadOnly: boolean;
      let collected: string[];
      let stored: string | null;
      let isAssignmentOnly = false;

      if (platformBootstrap !== undefined) {
        adapter = platformBootstrap.adapter;
        persistence = platformBootstrap.persistence;
        mode = platformBootstrap.mode;
        isReadOnly = platformBootstrap.isReadOnly;
        collected = [...platformBootstrap.diagnostics];
        stored = platformBootstrap.storedAttempt;
        isAssignmentOnly = platformBootstrap.assignmentOnly;
      } else {
        const scormAdapter = new Scorm12Adapter();
        const scormResult = await scormAdapter.initialize();

        adapter = scormAdapter;
        mode = PlatformMode.SCORM_1_2;
        isReadOnly = scormResult.isReadOnly;
        collected = [...scormResult.diagnostics];

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
        persistence = new LearningPlatformPersistenceBridge(adapter);
        stored = await persistence.load();
      }

      if (cancelled) return;
      adapterRef.current = adapter;
      persistenceRef.current = persistence;
      diagnosticsRef.current = collected;
      setDiagnostics(collected);

      if (stored === null || stored.trim().length === 0) {
        dispatch({
          type: "INITIALIZED",
          platformMode: mode,
          isReadOnly,
          hasSavedAttempt: false,
        });
        return;
      }

      try {
        const snapshot = decodeSl1Attempt(stored, codecSchema);
        if (snapshot.variantAssignment !== undefined) {
          dispatch({
            type: "VARIANT_ASSIGNED",
            assignment: snapshot.variantAssignment,
          });
        }
        if (isAssignmentOnly && !isReadOnly) {
          dispatch({
            type: "INITIALIZED",
            platformMode: mode,
            isReadOnly,
            hasSavedAttempt: false,
          });
          return;
        }
        const replay = await replayCommandJournal({
          snapshot,
          initialDomain: seededDomain,
          scenario,
          configuration,
          configurationHash,
          cryptographicRuntime:
            configuredPackage?.cryptographicRuntime ?? null,
          signatureProvider,
          registries,
        });
        dispatch({
          type: "INITIALIZED",
          platformMode: mode,
          isReadOnly,
          hasSavedAttempt: true,
        });
        if (isReadOnly) {
          dispatch({
            type: "RESUME",
            snapshot,
            simulation: replay.runtime,
            lastTransactionId: replay.lastTransactionId,
          });
        }
      } catch (error) {
        addDiagnostic(
          `Stored attempt could not be decoded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        const recovery = recoveryDetails(error, mode);
        dispatch({
          type: "RECOVERY_FAILED",
          ...recovery,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    addDiagnostic,
    codecSchema,
    configuration,
    configurationHash,
    configuredPackage,
    dispatch,
    registries,
    scenario,
    seededDomain,
    signatureProvider,
    platformBootstrap,
  ]);

  // ---- Save lifecycle --------------------------------------------------

  const save = useCallback(async (): Promise<void> => {
    const run = async (): Promise<void> => {
      const current = stateRef.current;
      if (current.isReadOnly || adapterRef.current === null) return;
      dispatch({ type: "SAVE_STATUS", status: "SAVING" });
      try {
        await writeProspectiveState(current);
        dispatch({ type: "SAVE_STATUS", status: "SAVED" });
      } catch (error) {
        addDiagnostic(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
        dispatch({ type: "SAVE_STATUS", status: "FAILED" });
      }
    };
    const scheduled = persistenceQueueRef.current.then(run, run);
    persistenceQueueRef.current = scheduled;
    await scheduled;
  }, [addDiagnostic, dispatch, writeProspectiveState]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

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

  const answerProfessionalCheck = useCallback(
    async (
      check: KnowledgeCheckDefinition,
      answer: Answer,
    ): Promise<boolean> => {
      const correct = isAnswerCorrect(check, answer);
      const persisted = await commitMutation((base) => {
        const encodedValue = encodeAnswer(check, answer);
        const attemptNumber =
          (base.decisions[check.knowledgeCheckId]?.attemptCount ??
            0) + 1;
        const scenarioTimestamp = scenario.timeline[
          "batchCreated"
        ] as string;
        const prospective = sessionReducer(base, {
          type: "RECORD_DECISION",
          decisionId: check.knowledgeCheckId,
          encodedValue,
          interaction: {
            interactionId: `INT_${String(base.interactions.length + 1).padStart(4, "0")}`,
            stageId: base.viewedStageId,
            interactionType:
              LearnerInteractionType.KNOWLEDGE_CHECK_ANSWERED,
            targetId: check.knowledgeCheckId,
            selectedValue: String(encodedValue),
            isCorrect: correct,
            attemptNumber,
            scenarioTimestamp,
          },
        });
        return {
          state: deriveProgress(prospective, scenario),
          result: {
            operationId: `${base.sessionId}:${check.knowledgeCheckId}:${attemptNumber}`,
            encodedValue,
            scenarioTimestamp,
          },
        };
      });
      await adapterRef.current?.recordInteraction({
        interactionId: check.knowledgeCheckId,
        type: scormInteractionType(check.checkType),
        learnerResponse: describeResponse(check, answer),
        isCorrect: correct,
        scenarioTimestamp: persisted.scenarioTimestamp,
      });
      publishNotification({
        kind: "DECISION_RECORDED",
        operationId: persisted.operationId,
        outcome: "RECORDED",
      });
      return correct;
    },
    [commitMutation, publishNotification, scenario],
  );

  const submitCommand = useCallback(
    async (
      actionId: string,
      decisionId: string,
      authoredCommand: SupplyChainCommand,
      submissionOptions?: { readonly recordDecision?: boolean },
    ): Promise<SimulationCommandOutcome> => {
      const outcome = await commitMutation(async (base) => {
        if (
          configuration.technicalFeatures.endorsementPolicies &&
          (actionId === "TRANSFER_CUSTODY" ||
            actionId === "RECORD_CORRECTION")
        ) {
          throw new Error(
            `Action "${actionId}" must use the endorsement workflow`,
          );
        }
        const sequence = commandSequence(base.commandJournal);
        const contextId =
          actionId === "RECALL_BATCH"
            ? activeContextIdForStage(
                scenario,
                ScenarioStageId.RECALL_AND_DEBRIEF,
                base.commandJournal,
              )
            : scenario.runtime.commandContextByAction[actionId];
        if (contextId === undefined) {
          throw new Error(`Scenario has no trusted context for action "${actionId}"`);
        }
        const trusted = contextAt(scenario, contextIndex(scenario, contextId));
        const payload = trustedPayload(authoredCommand, trusted);
        const entry = commandJournalEntry({
          commandSequence: sequence,
          actionId,
          command: payload,
          contextId,
          scenario,
        });

        const scriptedBefore = applyEligibleScriptedTransactions(
          base.simulation.domain,
          scenario.scriptedTransactions,
          ledger,
          registries,
        ).state;
        const runtimeBefore: SimulationRuntimeState = {
          ...base.simulation,
          domain: scriptedBefore,
        };
        const command: DomainSimulationCommand = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt: payload.scenarioTimestamp,
            expectedStateVersions: expectedStateVersionsFor(payload, scriptedBefore),
          },
          payload,
        };
        const signed =
          configuration.technicalFeatures.digitalSignatures
            ? await signAndVerifyCommand({
                command,
                trustedContext: trusted,
                configurationHash,
                scenarioId: scenario.scenarioId,
                scenarioVersion: scenario.scenarioVersion,
                runtime:
                  configuredPackage?.cryptographicRuntime ??
                  (() => {
                    throw new Error(
                      "Digital signatures require a cryptographic runtime",
                    );
                  })(),
                provider: signatureProvider,
              })
            : null;
        const outcome = handleSimulationCommand({
          runtime: runtimeBefore,
          command,
          trustedContext: trusted,
          ledger,
          registries,
          environment: {
            clock: new FixedClock(payload.scenarioTimestamp),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
          ...(signed === null
            ? {}
            : {
                signatureEvidence: signed.evidence,
                signatureFailures: signatureAttemptFailures(
                  signed.failureRuleIds,
                ),
          }),
        });

        let prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: outcome.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId:
            outcome.isAccepted && outcome.transaction !== null
              ? outcome.transaction.transactionId
              : base.lastTransactionId,
        });
        if (submissionOptions?.recordDecision !== false) {
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId,
            encodedValue: outcome.isAccepted ? 1 : 0,
            interaction: {
              interactionId: `INT_${String(base.interactions.length + 1).padStart(4, "0")}`,
              stageId: base.viewedStageId,
              interactionType: outcome.isAccepted
                ? LearnerInteractionType.TRANSACTION_SUBMITTED
                : LearnerInteractionType.TRANSACTION_REJECTED,
              targetId: decisionId,
              isCorrect: outcome.isAccepted,
              attemptNumber: (base.decisions[decisionId]?.attemptCount ?? 0) + 1,
              scenarioTimestamp: payload.scenarioTimestamp,
            },
          });
        }
        if (actionId === "RECALL_BATCH") {
          if (
            prospective.decisions["INT_RECALL_INITIAL_SUBMITTED"] ===
            undefined
          ) {
            prospective = sessionReducer(prospective, {
              type: "RECORD_DECISION",
              decisionId: "INT_RECALL_INITIAL_SUBMITTED",
              encodedValue: 1,
              interaction: null,
            });
          }
          if (
            outcome.isAccepted &&
            prospective.decisions["INT_RECALL_AUTHORIZATION_RESOLVED"] ===
              undefined
          ) {
            prospective = sessionReducer(prospective, {
              type: "RECORD_DECISION",
              decisionId: "INT_RECALL_AUTHORIZATION_RESOLVED",
              encodedValue: 1,
              interaction: null,
            });
          }
        }
        if (actionId === "RECORD_CORRECTION" && outcome.isAccepted) {
          prospective = sessionReducer(prospective, {
            type: "CORRECTION_REASON_RECORDED",
            reason: (payload as { readonly reason: string }).reason,
          });
        }
        return {
          state: deriveProgress(prospective, scenario),
          result: outcome,
        };
      });
      publishNotification({
        kind: "TRANSACTION_RESULT",
        operationId: outcome.commandId,
        accepted: outcome.isAccepted,
        ...(rejectionMessageKey(outcome) === undefined
          ? {}
          : { reasonKey: rejectionMessageKey(outcome) as string }),
      });
      return outcome;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      configuration.technicalFeatures.digitalSignatures,
      configuration.technicalFeatures.endorsementPolicies,
      configurationHash,
      configuredPackage,
      ledger,
      publishNotification,
      registries,
      scenario,
      signatureProvider,
    ],
  );

  const createEndorsedProposal = useCallback(
    async (
      actionId: string,
      decisionId: string,
      authoredCommand: SupplyChainCommand,
      submissionOptions?: { readonly recordDecision?: boolean },
    ): Promise<EndorsementWorkflowOutcome> => {
      const outcome = await commitMutation(async (base) => {
        const cryptographicRuntime =
          configuredPackage?.cryptographicRuntime;
        if (cryptographicRuntime === null || cryptographicRuntime === undefined) {
          throw new Error(
            "Endorsement policies require a cryptographic runtime",
          );
        }
        const sequence = commandSequence(base.commandJournal);
        const contextId =
          scenario.runtime.commandContextByAction[actionId];
        if (contextId === undefined) {
          throw new Error(
            `Scenario has no trusted context for action "${actionId}"`,
          );
        }
        const trusted = contextAt(
          scenario,
          contextIndex(scenario, contextId),
        );
        const payload = trustedPayload(authoredCommand, trusted);
        const entry = endorsedProposalJournalEntry({
          commandSequence: sequence,
          actionId,
          command: payload,
          contextId,
          scenario,
        });
        const scriptedBefore = applyEligibleScriptedTransactions(
          base.simulation.domain,
          scenario.scriptedTransactions,
          ledger,
          registries,
        ).state;
        const runtimeBefore: SimulationRuntimeState = {
          ...base.simulation,
          domain: scriptedBefore,
        };
        const command: DomainSimulationCommand = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt: payload.scenarioTimestamp,
            expectedStateVersions: expectedStateVersionsFor(
              payload,
              scriptedBefore,
            ),
          },
          payload,
        };
        const signed = await signAndVerifyCommand({
          command,
          trustedContext: trusted,
          configurationHash,
          scenarioId: scenario.scenarioId,
          scenarioVersion: scenario.scenarioVersion,
          runtime: cryptographicRuntime,
          provider: signatureProvider,
        });
        const workflow = createEndorsedProposalCore({
          runtime: runtimeBefore,
          actionId,
          command,
          trustedContext: trusted,
          signatureEvidence: signed.evidence,
          signatureFailures: signatureAttemptFailures(
            signed.failureRuleIds,
          ),
          policies: cryptographicRuntime.endorsementPolicies.policies,
          registries,
          environment: {
            clock: new FixedClock(payload.scenarioTimestamp),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        let prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: workflow.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });
        if (
          !workflow.isAccepted &&
          submissionOptions?.recordDecision !== false
        ) {
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId,
            encodedValue: 0,
            interaction: {
              interactionId: `INT_${String(base.interactions.length + 1).padStart(4, "0")}`,
              stageId: base.viewedStageId,
              interactionType:
                LearnerInteractionType.TRANSACTION_REJECTED,
              targetId: decisionId,
              isCorrect: false,
              attemptNumber:
                (base.decisions[decisionId]?.attemptCount ?? 0) + 1,
              scenarioTimestamp: payload.scenarioTimestamp,
            },
          });
        }
        return {
          state: deriveProgress(prospective, scenario),
          result: workflow,
        };
      });
      publishNotification({
        kind: "PROPOSAL_CREATED",
        operationId: outcome.commandId,
        accepted: outcome.isAccepted,
        ...(organizationName(
          outcome.pendingProposal?.evaluation
            .missingOrganizationIds[0],
        ) === undefined
          ? {}
          : {
              missingOrganization: organizationName(
                outcome.pendingProposal?.evaluation
                  .missingOrganizationIds[0],
              ) as string,
            }),
        ...(rejectionMessageKey(outcome) === undefined
          ? {}
          : { reasonKey: rejectionMessageKey(outcome) as string }),
      });
      return outcome;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      configurationHash,
      configuredPackage,
      ledger,
      organizationName,
      publishNotification,
      registries,
      scenario,
      signatureProvider,
    ],
  );

  const endorsePendingProposal = useCallback(
    async (proposalId: string): Promise<EndorsementWorkflowOutcome> => {
      const outcome = await commitMutation(async (base) => {
        const cryptographicRuntime =
          configuredPackage?.cryptographicRuntime;
        if (cryptographicRuntime === null || cryptographicRuntime === undefined) {
          throw new Error(
            "Endorsement policies require a cryptographic runtime",
          );
        }
        const pending =
          base.simulation.pendingProposalsById[proposalId];
        if (pending === undefined) {
          throw new Error(`Unknown pending proposal "${proposalId}"`);
        }
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          base.viewedStageId,
          base.commandJournal,
        );
        const trusted = contextAt(
          scenario,
          contextIndex(scenario, contextId),
        );
        const entry = endorsementWorkflowJournalEntry({
          commandSequence: sequence,
          opcode: JournalOpcode.ENDORSE_TRANSACTION_PROPOSAL,
          contextId,
          proposalCommandSequence:
            commandSequenceFromId(proposalId),
          scenario,
        });
        const command = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt: pending.command.metadata.submittedAt,
            expectedStateVersions: {},
          },
          payload: {
            commandType: "ENDORSE_TRANSACTION_PROPOSAL" as const,
            proposalId,
          },
        };
        const workflow = await endorsePendingProposalCore({
          runtime: base.simulation,
          command,
          trustedContext: trusted,
          cryptographicRuntime,
          provider: signatureProvider,
          environment: {
            clock: new FixedClock(
              pending.command.metadata.submittedAt,
            ),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        const prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: workflow.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });
        return {
          state: deriveProgress(prospective, scenario),
          result: workflow,
        };
      });
      publishNotification({
        kind: "ENDORSEMENT_RECORDED",
        operationId: outcome.commandId,
        accepted: outcome.isAccepted,
        satisfied:
          outcome.pendingProposal?.evaluation.satisfied === true,
        ...(organizationName(
          outcome.pendingProposal?.evaluation
            .missingOrganizationIds[0],
        ) === undefined
          ? {}
          : {
              missingOrganization: organizationName(
                outcome.pendingProposal?.evaluation
                  .missingOrganizationIds[0],
              ) as string,
            }),
        ...(rejectionMessageKey(outcome) === undefined
          ? {}
          : { reasonKey: rejectionMessageKey(outcome) as string }),
      });
      return outcome;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      configuredPackage,
      organizationName,
      publishNotification,
      scenario,
      signatureProvider,
    ],
  );

  const declinePendingProposal = useCallback(
    async (proposalId: string): Promise<EndorsementWorkflowOutcome> => {
      const outcome = await commitMutation((base) => {
        const pending =
          base.simulation.pendingProposalsById[proposalId];
        if (pending === undefined) {
          throw new Error(`Unknown pending proposal "${proposalId}"`);
        }
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          base.viewedStageId,
          base.commandJournal,
        );
        const trusted = contextAt(
          scenario,
          contextIndex(scenario, contextId),
        );
        const entry = endorsementWorkflowJournalEntry({
          commandSequence: sequence,
          opcode: JournalOpcode.DECLINE_TRANSACTION_PROPOSAL,
          contextId,
          proposalCommandSequence:
            commandSequenceFromId(proposalId),
          scenario,
        });
        const command = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt: pending.command.metadata.submittedAt,
            expectedStateVersions: {},
          },
          payload: {
            commandType: "DECLINE_TRANSACTION_PROPOSAL" as const,
            proposalId,
          },
        };
        const workflow = declinePendingProposalCore({
          runtime: base.simulation,
          command,
          trustedContext: trusted,
          environment: {
            clock: new FixedClock(
              pending.command.metadata.submittedAt,
            ),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        const prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: workflow.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });
        return {
          state: deriveProgress(prospective, scenario),
          result: workflow,
        };
      });
      publishNotification({
        kind: "ENDORSEMENT_DECLINED",
        operationId: outcome.commandId,
      });
      return outcome;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      publishNotification,
      scenario,
    ],
  );

  const commitEndorsedProposal = useCallback(
    async (
      proposalId: string,
      decisionId: string,
      submissionOptions?: { readonly recordDecision?: boolean },
    ): Promise<{
      readonly workflow: EndorsementWorkflowOutcome;
      readonly transactionOutcome: SimulationCommandOutcome | null;
    }> => {
      const outcome = await commitMutation((base) => {
        const pending =
          base.simulation.pendingProposalsById[proposalId];
        if (pending === undefined) {
          throw new Error(`Unknown pending proposal "${proposalId}"`);
        }
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          base.viewedStageId,
          base.commandJournal,
        );
        const trusted = contextAt(
          scenario,
          contextIndex(scenario, contextId),
        );
        const entry = endorsementWorkflowJournalEntry({
          commandSequence: sequence,
          opcode: JournalOpcode.COMMIT_ENDORSED_TRANSACTION,
          contextId,
          proposalCommandSequence:
            commandSequenceFromId(proposalId),
          scenario,
        });
        const command = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt: pending.command.metadata.submittedAt,
            expectedStateVersions: {},
          },
          payload: {
            commandType: "COMMIT_ENDORSED_TRANSACTION" as const,
            proposalId,
          },
        };
        const result = commitPendingProposalCore({
          runtime: base.simulation,
          command,
          trustedContext: trusted,
          ledger,
          registries,
          environment: {
            clock: new FixedClock(
              pending.command.metadata.submittedAt,
            ),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        const accepted =
          result.transactionOutcome?.isAccepted === true;
        let prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: result.workflow.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId:
            accepted &&
            result.transactionOutcome?.transaction !== null
              ? result.transactionOutcome.transaction.transactionId
              : base.lastTransactionId,
        });
        if (submissionOptions?.recordDecision !== false) {
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId,
            encodedValue: accepted ? 1 : 0,
            interaction: {
              interactionId: `INT_${String(base.interactions.length + 1).padStart(4, "0")}`,
              stageId: base.viewedStageId,
              interactionType: accepted
                ? LearnerInteractionType.TRANSACTION_SUBMITTED
                : LearnerInteractionType.TRANSACTION_REJECTED,
              targetId: decisionId,
              isCorrect: accepted,
              attemptNumber:
                (base.decisions[decisionId]?.attemptCount ?? 0) + 1,
              scenarioTimestamp:
                pending.command.metadata.submittedAt,
            },
          });
        }
        if (
          pending.actionId === "RECORD_CORRECTION" &&
          accepted
        ) {
          prospective = sessionReducer(prospective, {
            type: "CORRECTION_REASON_RECORDED",
            reason: (
              pending.command.payload as {
                readonly reason: string;
              }
            ).reason,
          });
        }
        return {
          state: deriveProgress(prospective, scenario),
          result,
        };
      });
      const transactionOutcome = outcome.transactionOutcome;
      publishNotification({
        kind: "TRANSACTION_RESULT",
        operationId: outcome.workflow.commandId,
        accepted: transactionOutcome?.isAccepted === true,
        ...(transactionOutcome === null
          ? {
              reasonKey:
                "notification.transactionRejected.message",
            }
          : rejectionMessageKey(transactionOutcome) ===
              undefined
            ? {}
            : {
                reasonKey: rejectionMessageKey(
                  transactionOutcome,
                ) as string,
              }),
      });
      return outcome;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      ledger,
      publishNotification,
      registries,
      scenario,
    ],
  );

  const sealPendingBlock = useCallback(
    async (): Promise<void> => {
      const committed = await commitMutation((base) => {
        const pendingId = base.domain.pendingTransactionIds[0];
        if (pendingId === undefined) {
          throw new Error("No ordered transaction is pending");
        }
        const timestamp =
          base.domain.transactionsById[pendingId]?.createdAt;
        if (timestamp === undefined) throw new Error("No ordered transaction is pending");
        const sealed = ledger.sealPendingTransactions(base.domain, timestamp);
        const scripted = applyEligibleScriptedTransactions(
          sealed,
          scenario.scriptedTransactions,
          ledger,
          registries,
        ).state;
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          base.viewedStageId,
          base.commandJournal,
        );
        const entry: CompactCommandJournalEntry = {
          commandSequence: sequence,
          opcode: JournalOpcode.SEAL_PENDING_BLOCK,
          contextIndex: contextIndex(scenario, contextId),
          values: [],
        };
        const simulation = { ...base.simulation, domain: scripted };
        const committedTransaction =
          simulation.domain.transactionsById[pendingId];
        if (
          committedTransaction?.blockId === undefined
        ) {
          throw new Error(
            "Sealed transaction has no committed block identifier",
          );
        }
        const prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });
        return {
          state: deriveProgress(prospective, scenario),
          result: {
            operationId: commandId(sequence),
            blockNumber: committedTransaction.blockId,
            transactionKind:
              committedTransaction.transactionType ===
              TransactionType.RECORD_CORRECTION
                ? ("CORRECTION" as const)
                : committedTransaction.transactionType ===
                    TransactionType.RECALL_BATCH
                  ? ("RECALL" as const)
                  : ("TRANSACTION" as const),
          },
        };
      });
      publishNotification({
        kind: "BLOCK_COMMITTED",
        ...committed,
      });
    },
    [
      commitMutation,
      ledger,
      publishNotification,
      registries,
      scenario,
    ],
  );

  const requestRoleHandoff = useCallback(
    async (handoffId: string): Promise<void> => {
      const handoff = await commitMutation((base) => {
        const applied = validateAndApplyHandoff({
          scenario,
          stageId: base.viewedStageId,
          handoffId,
          journal: base.commandJournal,
        });
        const sequence = commandSequence(base.commandJournal);
        const entry: CompactCommandJournalEntry = {
          commandSequence: sequence,
          opcode: JournalOpcode.ROLE_HANDOFF,
          contextIndex: contextIndex(scenario, applied.toContextId),
          values: [applied.handoffIndex],
        };
        const target = contextAt(
          scenario,
          contextIndex(scenario, applied.toContextId),
        );
        const actor = scenario.actors.find(
          (candidate) =>
            candidate.actorId === target.actorId,
        );
        return {
          state: {
            ...base,
            commandJournal: [...base.commandJournal, entry],
          },
          result: {
            operationId: commandId(sequence),
            role:
              actor === undefined
                ? target.roleId
                : t(actor.displayNameKey),
          },
        };
      });
      publishNotification({
        kind: "ROLE_HANDOFF",
        ...handoff,
      });
    },
    [commitMutation, publishNotification, scenario, t],
  );

  const submitCertificateDecision = useCallback(
    async (
      payload: SubmitCertificateDecisionCommand,
    ): Promise<CertificateDecisionEvaluation> => {
      const persisted = await commitMutation((base) => {
        if (
          base.commandJournal.some(
            (entry) => entry.opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
          )
        ) {
          throw new Error("The initial certificate decision is already recorded");
        }
        const evaluation = evaluateCertificateDecision(payload, scenario);
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          ScenarioStageId.ANCHOR_CERTIFICATE,
          base.commandJournal,
        );
        const trusted = contextAt(scenario, contextIndex(scenario, contextId));
        const submittedAt =
          scenario.runtime.learnerCommandTemplates["ANCHOR_CERTIFICATE"]
            ?.scenarioTimestamp ?? (scenario.timeline["certificateIssued"] as string);
        const command: ConsequentialDecisionCommand = payload;
        const wrapped = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt,
            expectedStateVersions: {},
          },
          payload: command,
        };
        const outcome = handleSimulationDecision({
          runtime: base.simulation,
          command: wrapped,
          trustedContext: trusted,
          isAccepted: true,
          decisionType: payload.commandType,
          decisionPayload: payload,
          environment: {
            clock: new FixedClock(submittedAt),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        const entry: CompactCommandJournalEntry = {
          commandSequence: sequence,
          opcode: JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
          contextIndex: contextIndex(scenario, contextId),
          values: compactCertificateDecision(payload),
        };
        let prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: outcome.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });

        const checks = scenario.stages
          .flatMap((stage) => stage.knowledgeChecks);
        const storageCheck = checks.find(
          (check) => check.knowledgeCheckId === "INT_CERTIFICATE_STORAGE_CHOICE",
        );
        const issuerCheck = checks.find(
          (check) => check.knowledgeCheckId === "INT_CERTIFICATE_ISSUER_CHECK",
        );
        if (storageCheck === undefined || issuerCheck === undefined) {
          throw new Error("Certificate scoring checks are missing from the scenario");
        }
        const storageOption =
          payload.storageChoice === "HASH_OFF_CHAIN"
            ? "OPT_OFF_CHAIN_WITH_HASH"
            : "OPT_WHOLE_FILE_ON_CHAIN";
        const issuerOption = evaluation.issuerScorableCorrect
          ? issuerCheck.correctOptionIds[0]
          : issuerCheck.options.find(
              (option) =>
                !issuerCheck.correctOptionIds.includes(option.optionId),
            )?.optionId;
        if (issuerOption === undefined) {
          throw new Error("Certificate issuer check has no scoreable options");
        }
        prospective = sessionReducer(prospective, {
          type: "RECORD_DECISION",
          decisionId: storageCheck.knowledgeCheckId,
          encodedValue: encodeAnswer(storageCheck, {
            selectedOptionIds: [storageOption],
            categoryByItem: {},
          }),
          interaction: null,
        });
        prospective = sessionReducer(prospective, {
          type: "RECORD_DECISION",
          decisionId: issuerCheck.knowledgeCheckId,
          encodedValue: encodeAnswer(issuerCheck, {
            selectedOptionIds: [issuerOption],
            categoryByItem: {},
          }),
          interaction: null,
        });
        prospective = sessionReducer(prospective, {
          type: "RECORD_DECISION",
          decisionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
          encodedValue: 1,
          interaction: null,
        });
        if (evaluation.mitigationActions.length === 0) {
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId: "INT_CERTIFICATE_MITIGATION_COMPLETE",
            encodedValue: 1,
            interaction: null,
          });
        }
        return {
          state: deriveProgress(prospective, scenario),
          result: {
            evaluation,
            operationId: commandId(sequence),
          },
        };
      });
      publishNotification({
        kind: "DECISION_RECORDED",
        operationId: persisted.operationId,
        outcome:
          persisted.evaluation.mitigationActions.length === 0
            ? "RECORDED"
            : "RISK_REMAINS",
      });
      return persisted.evaluation;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      publishNotification,
      scenario,
    ],
  );

  const submitDiscrepancyDecision = useCallback(
    async (
      payload: SubmitDiscrepancyDecisionCommand,
    ): Promise<DiscrepancyDecisionEvaluation> => {
      const persisted = await commitMutation((base) => {
        if (
          base.commandJournal.some(
            (entry) => entry.opcode === JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
          )
        ) {
          throw new Error("The initial discrepancy decision is already recorded");
        }
        const evaluation = evaluateDiscrepancyDecision(payload, scenario);
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          ScenarioStageId.RECEIVE_AND_CORRECT,
          base.commandJournal,
        );
        const trusted = contextAt(scenario, contextIndex(scenario, contextId));
        const submittedAt =
          scenario.runtime.learnerCommandTemplates["RECORD_CORRECTION"]
            ?.scenarioTimestamp ?? (scenario.timeline["correctionRecorded"] as string);
        const wrapped = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt,
            expectedStateVersions: {},
          },
          payload,
        };
        const outcome = handleSimulationDecision({
          runtime: base.simulation,
          command: wrapped,
          trustedContext: trusted,
          isAccepted: !evaluation.isRejectedAttempt,
          decisionType: payload.commandType,
          decisionPayload: payload,
          rejectionFailures: [
            {
              code: "DOMAIN_RULE_FAILED",
              messageKey: "validation.appendOnlyRequired",
            },
          ],
          environment: {
            clock: new FixedClock(submittedAt),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        const entry: CompactCommandJournalEntry = {
          commandSequence: sequence,
          opcode: JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
          contextIndex: contextIndex(scenario, contextId),
          values: compactDiscrepancyDecision(payload),
        };
        let prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: outcome.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });
        prospective = sessionReducer(prospective, {
          type: "RECORD_DECISION",
          decisionId: "INT_CORRECTION_RECORDED",
          encodedValue: evaluation.isScorableCorrect ? 1 : 0,
          interaction: {
            interactionId: `INT_${String(base.interactions.length + 1).padStart(4, "0")}`,
            stageId: ScenarioStageId.RECEIVE_AND_CORRECT,
            interactionType: evaluation.isRejectedAttempt
              ? LearnerInteractionType.TRANSACTION_REJECTED
              : LearnerInteractionType.TRANSACTION_SUBMITTED,
            targetId: "INT_CORRECTION_RECORDED",
            isCorrect: evaluation.isScorableCorrect,
            attemptNumber: 1,
            scenarioTimestamp: submittedAt,
          },
        });
        prospective = sessionReducer(prospective, {
          type: "RECORD_DECISION",
          decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
          encodedValue: 1,
          interaction: null,
        });
        if (!evaluation.requiresMitigation) {
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId: "INT_DISCREPANCY_MITIGATION_COMPLETE",
            encodedValue: 1,
            interaction: null,
          });
        }
        return {
          state: deriveProgress(prospective, scenario),
          result: {
            evaluation,
            operationId: commandId(sequence),
          },
        };
      });
      publishNotification({
        kind: "DECISION_RECORDED",
        operationId: persisted.operationId,
        outcome: persisted.evaluation.isRejectedAttempt
          ? "REJECTED"
          : persisted.evaluation.requiresMitigation
            ? "RISK_REMAINS"
            : "RECORDED",
      });
      return persisted.evaluation;
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      publishNotification,
      scenario,
    ],
  );

  const recordMitigation = useCallback(
    async (payload: MitigationDecisionCommand): Promise<void> => {
      const operationId = await commitMutation((base) => {
        const opcode = {
          REVIEW_ISSUER: JournalOpcode.REVIEW_ISSUER,
          REMEDIATE_STORAGE: JournalOpcode.REMEDIATE_STORAGE,
          SUSPEND_LOT: JournalOpcode.SUSPEND_LOT,
          INVESTIGATE_DISCREPANCY: JournalOpcode.INVESTIGATE_DISCREPANCY,
        }[payload.commandType];
        if (base.commandJournal.some((entry) => entry.opcode === opcode)) {
          throw new Error(`Mitigation ${payload.commandType} is already recorded`);
        }
        const stageId =
          payload.commandType === "INVESTIGATE_DISCREPANCY"
            ? ScenarioStageId.RECEIVE_AND_CORRECT
            : ScenarioStageId.ANCHOR_CERTIFICATE;
        const sequence = commandSequence(base.commandJournal);
        const contextId = activeContextIdForStage(
          scenario,
          stageId,
          base.commandJournal,
        );
        const trusted = contextAt(scenario, contextIndex(scenario, contextId));
        const submittedAt =
          stageId === ScenarioStageId.ANCHOR_CERTIFICATE
            ? scenario.runtime.learnerCommandTemplates["ANCHOR_CERTIFICATE"]
                ?.scenarioTimestamp
            : scenario.runtime.learnerCommandTemplates["RECORD_CORRECTION"]
                ?.scenarioTimestamp;
        if (submittedAt === undefined) {
          throw new Error("Scenario mitigation timestamp is missing");
        }
        const wrapped = {
          metadata: {
            commandId: commandId(sequence),
            sessionId: base.sessionId,
            actorId: trusted.actorId,
            organizationId: trusted.organizationId,
            roleId: trusted.roleId,
            submittedAt,
            expectedStateVersions: {},
          },
          payload,
        };
        const outcome = handleSimulationDecision({
          runtime: base.simulation,
          command: wrapped,
          trustedContext: trusted,
          isAccepted: true,
          decisionType: payload.commandType,
          decisionPayload: payload,
          environment: {
            clock: new FixedClock(submittedAt),
            random: new SeededRandomSource(
              `${configuration.scenarioSeed}:${sequence}`,
            ),
            ids: new SequenceIdGenerator(sequence),
          },
        });
        const entry: CompactCommandJournalEntry = {
          commandSequence: sequence,
          opcode,
          contextIndex: contextIndex(scenario, contextId),
          values: [],
        };
        let prospective = sessionReducer(base, {
          type: "SIMULATION_UPDATED",
          simulation: outcome.state,
          commandJournal: [...base.commandJournal, entry],
          transactionId: base.lastTransactionId,
        });

        const checks = scenario.stages.flatMap((stage) => stage.knowledgeChecks);
        const initialCertificateEntry = prospective.commandJournal.find(
          (entry) =>
            entry.opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
        );
        if (initialCertificateEntry !== undefined) {
          const initial = expandCertificateDecision(
            initialCertificateEntry.values,
          );
          const evaluation = evaluateCertificateDecision(initial, scenario);
          const has = (candidate: number): boolean =>
            prospective.commandJournal.some(
              (entry) => entry.opcode === candidate,
            );
          const storageResolved =
            evaluation.storageChoiceCorrect ||
            has(JournalOpcode.REMEDIATE_STORAGE);
          const issuerResolved =
            ((evaluation.certificateAssessmentCorrect &&
              evaluation.issuerAssessmentCorrect) ||
              has(JournalOpcode.REVIEW_ISSUER)) &&
            (evaluation.lotDispositionCorrect ||
              has(JournalOpcode.SUSPEND_LOT));
          const storageCheck = checks.find(
            (candidate) =>
              candidate.knowledgeCheckId ===
              "INT_CERTIFICATE_STORAGE_CHOICE",
          );
          const issuerCheck = checks.find(
            (candidate) =>
              candidate.knowledgeCheckId === "INT_CERTIFICATE_ISSUER_CHECK",
          );
          if (storageCheck !== undefined && storageResolved) {
            const correctOption = storageCheck.correctOptionIds[0];
            if (correctOption !== undefined) {
              const encoded = encodeAnswer(storageCheck, {
                selectedOptionIds: [correctOption],
                categoryByItem: {},
              });
              if (
                prospective.decisions[storageCheck.knowledgeCheckId]
                  ?.encodedValue !== encoded
              ) {
                prospective = sessionReducer(prospective, {
                  type: "RECORD_DECISION",
                  decisionId: storageCheck.knowledgeCheckId,
                  encodedValue: encoded,
                  interaction: null,
                });
              }
            }
          }
          if (issuerCheck !== undefined && issuerResolved) {
            const correctOption = issuerCheck.correctOptionIds[0];
            if (correctOption !== undefined) {
              const encoded = encodeAnswer(issuerCheck, {
                selectedOptionIds: [correctOption],
                categoryByItem: {},
              });
              if (
                prospective.decisions[issuerCheck.knowledgeCheckId]
                  ?.encodedValue !== encoded
              ) {
                prospective = sessionReducer(prospective, {
                  type: "RECORD_DECISION",
                  decisionId: issuerCheck.knowledgeCheckId,
                  encodedValue: encoded,
                  interaction: null,
                });
              }
            }
          }
          if (
            storageResolved &&
            issuerResolved &&
            prospective.decisions[
              "INT_CERTIFICATE_MITIGATION_COMPLETE"
            ] === undefined
          ) {
            prospective = sessionReducer(prospective, {
              type: "RECORD_DECISION",
              decisionId: "INT_CERTIFICATE_MITIGATION_COMPLETE",
              encodedValue: 1,
              interaction: null,
            });
          }
        }
        if (payload.commandType === "INVESTIGATE_DISCREPANCY") {
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId: "INT_CORRECTION_RECORDED",
            encodedValue: 1,
            interaction: null,
          });
          prospective = sessionReducer(prospective, {
            type: "RECORD_DECISION",
            decisionId: "INT_DISCREPANCY_MITIGATION_COMPLETE",
            encodedValue: 1,
            interaction: null,
          });
        }
        return {
          state: deriveProgress(prospective, scenario),
          result: commandId(sequence),
        };
      });
      publishNotification({
        kind: "MITIGATION_RECORDED",
        operationId,
      });
    },
    [
      commitMutation,
      configuration.scenarioSeed,
      publishNotification,
      scenario,
    ],
  );

  const runSignatureTamperDemonstration = useCallback(
    async (transactionId: string): Promise<SignatureTamperDemonstration> => {
      if (!configuration.technicalFeatures.digitalSignatures) {
        throw new Error("Digital signatures are disabled");
      }
      const evidence =
        stateRef.current.domain.transactionsById[transactionId]
          ?.signatureEvidence;
      if (evidence === undefined) {
        throw new Error(
          `Transaction "${transactionId}" has no genuine signature evidence`,
        );
      }
      return demonstrateSignatureTamper({
        evidence,
        provider: signatureProvider,
      });
    },
    [configuration.technicalFeatures.digitalSignatures, signatureProvider],
  );

  const value = useMemo<SimulationContextValue>(
    () => ({
      state,
      diagnostics,
      scoreBreakdown,
      isPassed,
      isCompleted,
      activeTrustedContext,

      startNew: () =>
        dispatch({
          type: "START_NEW",
          simulation: createSimulationRuntimeState(seededDomain),
          sessionId: "SES_000001",
        }),

      resume: () => {
        void (async () => {
          const adapter = adapterRef.current;
          const persistence = persistenceRef.current;
          if (adapter === null || persistence === null) return;
          const stored = await persistence.load();
          if (stored === null) {
            dispatch({
              type: "START_NEW",
              simulation: createSimulationRuntimeState(seededDomain),
              sessionId: "SES_000001",
            });
            return;
          }
          try {
            const snapshot = decodeSl1Attempt(stored, codecSchema);
            const replay = await replayCommandJournal({
              snapshot,
              initialDomain: seededDomain,
              scenario,
              configuration,
              configurationHash,
              cryptographicRuntime:
                configuredPackage?.cryptographicRuntime ?? null,
              signatureProvider,
              registries,
            });
            dispatch({
              type: "RESUME",
              snapshot,
              simulation: replay.runtime,
              lastTransactionId: replay.lastTransactionId,
            });
          } catch (error) {
            addDiagnostic(
              `Attempt replay failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            const recovery = recoveryDetails(
              error,
              stateRef.current.platformMode,
            );
            dispatch({
              type: "RECOVERY_FAILED",
              ...recovery,
            });
          }
        })();
      },

      restart: () => {
        const adapter = adapterRef.current;
        if (adapter instanceof StandalonePersistenceAdapter) adapter.clear();
        dispatch({
          type: "START_NEW",
          simulation: createSimulationRuntimeState(seededDomain),
          sessionId: "SES_000001",
        });
        void saveRef.current();
      },

      answerCheck: (check, answer) => {
        const encodedValue = encodeAnswer(check, answer);
        const correct = isAnswerCorrect(check, answer);
        dispatch({
          type: "RECORD_DECISION",
          decisionId: check.knowledgeCheckId,
          encodedValue,
          interaction: {
            interactionId: `INT_${String(stateRef.current.interactions.length + 1).padStart(4, "0")}`,
            stageId: stateRef.current.viewedStageId,
            interactionType: LearnerInteractionType.KNOWLEDGE_CHECK_ANSWERED,
            targetId: check.knowledgeCheckId,
            selectedValue: String(encodedValue),
            isCorrect: correct,
            attemptNumber:
              (stateRef.current.decisions[check.knowledgeCheckId]?.attemptCount ?? 0) + 1,
            scenarioTimestamp: scenario.timeline["batchCreated"] as string,
          },
        });
        void adapterRef.current?.recordInteraction({
          interactionId: check.knowledgeCheckId,
          type: scormInteractionType(check.checkType),
          learnerResponse: describeResponse(check, answer),
          isCorrect: correct,
          scenarioTimestamp: scenario.timeline["batchCreated"] as string,
        });
        void saveRef.current();
        return correct;
      },

      answerProfessionalCheck,

      revealHint: (hintId) => {
        dispatch({ type: "USE_HINT", hintId });
        void saveRef.current();
      },

      submitCommand,
      createEndorsedProposal,
      endorsePendingProposal,
      declinePendingProposal,
      commitEndorsedProposal,
      sealPendingBlock,
      requestRoleHandoff,
      submitCertificateDecision,
      submitDiscrepancyDecision,
      recordMitigation,
      demonstrateSignatureTamper: runSignatureTamperDemonstration,
      viewStage: (stageId) => dispatch({ type: "VIEW_STAGE", stageId }),
      save,

      finish: async () => {
        await save();
        const adapter = adapterRef.current;
        if (adapter === null) return;
        const current = stateRef.current;
        if (current.completedStageIds.length === SCENARIO_STAGE_ORDER.length) {
          const breakdown = scoreFor(current);
          await adapter.setCompletion(
            isPassing(breakdown.score, activeScoringConfiguration)
              ? CompletionStatus.PASSED
              : CompletionStatus.COMPLETED,
          );
          await adapter.commit();
        }
        await adapter.finish();
      },
    }),
    [
      activeTrustedContext,
      activeScoringConfiguration,
      addDiagnostic,
      answerProfessionalCheck,
      codecSchema,
      configuration,
      configurationHash,
      configuredPackage,
      diagnostics,
      dispatch,
      isCompleted,
      isPassed,
      registries,
      save,
      scenario,
      scoreBreakdown,
      scoreFor,
      sealPendingBlock,
      seededDomain,
      signatureProvider,
      state,
      submitCommand,
      createEndorsedProposal,
      endorsePendingProposal,
      declinePendingProposal,
      commitEndorsedProposal,
      requestRoleHandoff,
      submitCertificateDecision,
      submitDiscrepancyDecision,
      recordMitigation,
      runSignatureTamperDemonstration,
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
export type { DomainState, ScenarioStageId, TransactionResult, TransactionStatus };

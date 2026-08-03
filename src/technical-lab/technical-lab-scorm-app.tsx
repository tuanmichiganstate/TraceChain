import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslator } from "../app/providers/locale-provider";
import type {
  TechnicalLabRuntimePackage,
} from "../config/technical-lab-runtime-loader";
import { StandalonePersistenceAdapter } from "../infrastructure/persistence/standalone-adapter";
import {
  decodeTl1TechnicalLabSnapshot,
  encodeTl1TechnicalLabSnapshot,
  inspectTl1TechnicalLabStoredHeader,
  technicalLabBundleContentHash,
  type Tl1TechnicalLabCodecSchema,
} from "../infrastructure/persistence/tl1-technical-lab-codec";
import {
  CompletionStatus,
  type LearningPlatformAdapter,
  type PlatformInteraction,
} from "../infrastructure/scorm/learning-platform-adapter";
import { Scorm12Adapter } from "../infrastructure/scorm/scorm12-adapter";
import type { TechnicalExperimentActionType } from "./contracts";
import {
  advanceTechnicalLabModule,
  appendTechnicalLabAction,
  appendTechnicalLabResponse,
  emptyTechnicalLabSnapshot,
  openTechnicalLabHint,
  replayTechnicalLab,
  type TechnicalLabCheckpointKind,
  type TechnicalLabReplay,
  type TechnicalLabSnapshot,
} from "./engine";
import { TechnicalLabShell } from "./technical-lab-shell";

interface ReadyTechnicalLabAttempt {
  readonly snapshot: TechnicalLabSnapshot;
  readonly replay: TechnicalLabReplay;
  readonly codecSchema: Tl1TechnicalLabCodecSchema;
  readonly isReadOnly: boolean;
}

async function initializeAdapter(
  runtime: TechnicalLabRuntimePackage,
): Promise<{
  readonly adapter: LearningPlatformAdapter;
  readonly isReadOnly: boolean;
  readonly isStandalone: boolean;
}> {
  const scorm = new Scorm12Adapter();
  const initialized = await scorm.initialize();
  if (initialized.isConnected) {
    return {
      adapter: scorm,
      isReadOnly: initialized.isReadOnly,
      isStandalone: false,
    };
  }
  const bundleContentHash = technicalLabBundleContentHash(
    runtime.bundle,
  );
  const standalone = new StandalonePersistenceAdapter({
    appVersion: `${runtime.configurationHash}.${bundleContentHash}`,
    scenarioId: runtime.bundle.pack.labPackId,
  });
  const fallback = await standalone.initialize();
  return {
    adapter: standalone,
    isReadOnly: fallback.isReadOnly,
    isStandalone: true,
  };
}

function locationFor(replay: TechnicalLabReplay): string {
  return replay.complete
    ? "TECHNICAL_LAB_COMPLETE"
    : replay.modules[replay.snapshot.currentModuleIndex]?.module
        .moduleId ?? "TL1";
}

export function TechnicalLabScormApp({
  runtime,
}: {
  readonly runtime: TechnicalLabRuntimePackage;
}): ReactNode {
  const t = useTranslator();
  const adapterRef = useRef<LearningPlatformAdapter | null>(null);
  const attemptRef = useRef<ReadyTechnicalLabAttempt | null>(
    null,
  );
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [attempt, setAttempt] =
    useState<ReadyTechnicalLabAttempt | null>(null);
  const [initializationFailed, setInitializationFailed] =
    useState(false);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [initializationGeneration, setInitializationGeneration] =
    useState(0);
  const [persistenceFailed, setPersistenceFailed] =
    useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let activeAdapter: LearningPlatformAdapter | null = null;
    void (async () => {
      try {
        const initialized = await initializeAdapter(runtime);
        activeAdapter = initialized.adapter;
        adapterRef.current = initialized.adapter;
        setStandaloneMode(initialized.isStandalone);
        const codecSchema = {
          configurationHash: runtime.configurationHash,
          bundle: runtime.bundle,
        };
        const stored =
          await initialized.adapter.loadAttemptState();
        let snapshot: TechnicalLabSnapshot;
        if (stored === null || stored.trim().length === 0) {
          snapshot = emptyTechnicalLabSnapshot();
          if (!initialized.isReadOnly) {
            const encoded = encodeTl1TechnicalLabSnapshot(
              snapshot,
              codecSchema,
            );
            await initialized.adapter.saveAttemptState(encoded);
            await initialized.adapter.setLocation("TL1");
            await initialized.adapter.setCompletion(
              CompletionStatus.INCOMPLETE,
            );
            await initialized.adapter.commit();
          }
        } else {
          const header =
            inspectTl1TechnicalLabStoredHeader(stored);
          if (
            header.configurationHash !==
              runtime.configurationHash ||
            header.bundleContentHash !==
              technicalLabBundleContentHash(runtime.bundle) ||
            header.labPackId !== runtime.bundle.pack.labPackId ||
            header.labPackVersion !==
              runtime.bundle.pack.labPackVersion
          ) {
            throw new Error(
              "Stored Technical Laboratory progress belongs to another package.",
            );
          }
          snapshot = decodeTl1TechnicalLabSnapshot(
            stored,
            codecSchema,
          );
        }
        const replay = await replayTechnicalLab(
          runtime,
          snapshot,
        );
        if (cancelled) return;
        const ready = {
          snapshot,
          replay,
          codecSchema,
          isReadOnly: initialized.isReadOnly,
        };
        attemptRef.current = ready;
        setAttempt(ready);
      } catch (error) {
        console.error(error);
        if (!cancelled) setInitializationFailed(true);
      }
    })();
    const finish = (): void => {
      void activeAdapter?.finish().catch((error: unknown) => {
        console.error(error);
      });
    };
    window.addEventListener("pagehide", finish);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", finish);
    };
  }, [initializationGeneration, runtime]);

  const resetStandaloneProgress = (): void => {
    const adapter = adapterRef.current;
    if (!(adapter instanceof StandalonePersistenceAdapter)) return;
    adapter.clear();
    adapterRef.current = null;
    attemptRef.current = null;
    setAttempt(null);
    setInitializationFailed(false);
    setStandaloneMode(false);
    setInitializationGeneration((current) => current + 1);
  };

  const applySnapshot = useCallback(
    async (
      createProspective: (
        current: ReadyTechnicalLabAttempt,
      ) => TechnicalLabSnapshot,
      interaction?: (
        replay: TechnicalLabReplay,
      ) => PlatformInteraction,
    ): Promise<void> => {
      const run = async (): Promise<void> => {
        const current = attemptRef.current;
        if (
          current === null ||
          current.isReadOnly ||
          persistenceFailed
        ) {
          return;
        }
        setBusy(true);
        setActionFailed(false);
        let persistenceStarted = false;
        try {
          const prospective = createProspective(current);
          const replay = await replayTechnicalLab(
            runtime,
            prospective,
          );
          const encoded = encodeTl1TechnicalLabSnapshot(
            prospective,
            current.codecSchema,
          );
          const adapter = adapterRef.current;
          if (adapter === null) {
            throw new Error(
              "Technical Laboratory persistence is not initialized.",
            );
          }
          persistenceStarted = true;
          await adapter.saveAttemptState(encoded);
          await adapter.setLocation(locationFor(replay));
          await adapter.setScore(replay.score.totalScore);
          await adapter.setCompletion(
            replay.complete
              ? replay.score.passed
                ? CompletionStatus.PASSED
                : CompletionStatus.FAILED
              : CompletionStatus.INCOMPLETE,
          );
          if (interaction !== undefined) {
            await adapter.recordInteraction(interaction(replay));
          }
          await adapter.commit();
          const ready = {
            snapshot: prospective,
            replay,
            codecSchema: current.codecSchema,
            isReadOnly: false,
          };
          attemptRef.current = ready;
          setAttempt(ready);
        } catch (error) {
          console.error(error);
          if (persistenceStarted) {
            setPersistenceFailed(true);
          } else {
            setActionFailed(true);
          }
        } finally {
          setBusy(false);
        }
      };
      const scheduled = queueRef.current.then(run, run);
      queueRef.current = scheduled.then(
        () => undefined,
        () => undefined,
      );
      return scheduled;
    },
    [persistenceFailed, runtime],
  );

  const runAction = useCallback(
    (
      actionType: TechnicalExperimentActionType,
      operands?: {
        readonly operandA: number;
        readonly operandB: number;
      },
    ) =>
      applySnapshot((current) =>
        appendTechnicalLabAction({
          snapshot: current.snapshot,
          bundle: runtime.bundle,
          actionType,
          ...operands,
        }),
      ),
    [applySnapshot, runtime.bundle],
  );

  const submitResponse = useCallback(
    (kind: TechnicalLabCheckpointKind, optionId: string) =>
      applySnapshot(
        (current) =>
          appendTechnicalLabResponse({
            snapshot: current.snapshot,
            bundle: runtime.bundle,
            kind,
            optionId,
          }),
        (replay) => {
          const module =
            replay.modules[replay.snapshot.currentModuleIndex]!;
          const item =
            kind === "INTERPRETATION"
              ? module.interpretation
              : module.application;
          return {
            interactionId: item.definition.itemId,
            type: "choice",
            learnerResponse: optionId,
            isCorrect: item.correct,
            scenarioTimestamp: "2026-01-15T04:00:00.000Z",
          };
        },
      ),
    [applySnapshot, runtime.bundle],
  );

  const openHint = useCallback(
    () =>
      applySnapshot((current) =>
        openTechnicalLabHint({
          snapshot: current.snapshot,
          bundle: runtime.bundle,
        }),
      ),
    [applySnapshot, runtime.bundle],
  );

  const advance = useCallback(
    () =>
      applySnapshot((current) =>
        advanceTechnicalLabModule({
          replay: current.replay,
        }),
      ),
    [applySnapshot],
  );

  if (initializationFailed) {
    if (standaloneMode) {
      return (
        <main className="start" id="main-content">
          <div className="start__inner">
            <section className="card">
              <h1>
                {t("technicalLab.shell.standaloneRecoveryHeading")}
              </h1>
              <p>
                {t("technicalLab.shell.standaloneRecoveryBody")}
              </p>
              <button
                type="button"
                className="button button--primary"
                onClick={resetStandaloneProgress}
              >
                {t("technicalLab.shell.resetStandaloneProgress")}
              </button>
            </section>
          </div>
        </main>
      );
    }
    return (
      <main className="start" id="main-content">
        <div className="start__inner">
          <section className="card">
            <h1>{t("errors.recoveryHeading")}</h1>
            <p>{t("errors.incompatibleAttempt")}</p>
            <p>{t("errors.newLmsAttempt")}</p>
          </section>
        </div>
      </main>
    );
  }
  if (attempt === null) {
    return (
      <main className="loading" id="main-content">
        <p aria-live="polite">{t("status.saving")}</p>
      </main>
    );
  }
  return (
    <>
      {persistenceFailed ? (
        <div className="notice notice--standalone" role="alert">
          <p>{t("technicalLab.shell.persistenceFailure")}</p>
        </div>
      ) : actionFailed ? (
        <div className="notice notice--standalone" role="alert">
          <p>{t("technicalLab.shell.actionFailure")}</p>
        </div>
      ) : null}
      <TechnicalLabShell
        runtime={runtime}
        replay={attempt.replay}
        busy={busy || persistenceFailed}
        readOnly={attempt.isReadOnly}
        onAction={runAction}
        onResponse={submitResponse}
        onHint={openHint}
        onAdvance={advance}
      />
    </>
  );
}

import type { ReactNode } from "react";
import { ScenarioStageId } from "../domain/types/enums";
import { useTranslator } from "./providers/locale-provider";
import { useSimulation } from "./providers/simulation-provider";
import { isDeveloperMode } from "./configuration";
import { TopBar } from "../components/top-bar";
import { StartScreen } from "../features/start/start-screen";
import { OrientationStage } from "../features/orientation/orientation-stage";
import { CreateBatchStage } from "../features/transactions/create-batch-stage";
import { IMPLEMENTED_STAGES } from "../scenarios/coffee-traceability/stages";
import { PlatformMode } from "../infrastructure/scorm/learning-platform-adapter";

export function App(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();

  if (state.phase === "LOADING") {
    return (
      <main className="loading" id="main-content">
        <p aria-live="polite">{t("status.saving")}</p>
      </main>
    );
  }

  if (state.phase === "RECOVERY") {
    return <RecoveryScreen />;
  }

  if (state.phase === "START") {
    return <StartScreen />;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("navigation.skip")}
      </a>
      <TopBar />

      {state.platformMode === PlatformMode.STANDALONE ? (
        <div className="workspace__notice">
          <div className="notice notice--standalone" role="note">
            <p>{t("status.standalone")}</p>
          </div>
        </div>
      ) : null}

      <main className="workspace" id="main-content">
        <StageRouter stageId={state.currentStageId} />
      </main>

      {isDeveloperMode() ? <DeveloperPanel /> : null}
    </>
  );
}

function StageRouter({ stageId }: { stageId: ScenarioStageId }): ReactNode {
  if (!IMPLEMENTED_STAGES.has(stageId)) {
    return <NotYetAvailable />;
  }

  switch (stageId) {
    case ScenarioStageId.ORIENTATION:
      return <OrientationStage />;
    case ScenarioStageId.CREATE_BATCH:
      return <CreateBatchStage />;
    default:
      return <NotYetAvailable />;
  }
}

function NotYetAvailable(): ReactNode {
  const t = useTranslator();
  return (
    <section className="card">
      <h2>{t("stage.notYetAvailable.heading")}</h2>
      <p>{t("stage.notYetAvailable.body")}</p>
    </section>
  );
}

/**
 * Diagnostics, shown only with `?debug=true`. Never affects scoring or domain
 * behaviour, and is never exposed to an ordinary learner (specification
 * sections 27 and 28).
 */
function DeveloperPanel(): ReactNode {
  const { state, diagnostics } = useSimulation();
  return (
    <aside className="developer-panel">
      <h2>Developer diagnostics</h2>
      <p>
        Platform: <code>{state.platformMode}</code> · Stage:{" "}
        <code>{state.currentStageId}</code> · Blocks:{" "}
        <code>{state.domain.blockOrder.length}</code> · Pending:{" "}
        <code>{state.domain.pendingTransactionIds.length}</code>
      </p>
      <ul>
        {diagnostics.map((entry, index) => (
          <li key={index}>{entry}</li>
        ))}
      </ul>
    </aside>
  );
}

function RecoveryScreen(): ReactNode {
  const t = useTranslator();
  const { state, startNew } = useSimulation();
  return (
    <main className="start" id="main-content">
      <div className="start__inner">
        <section className="card">
          <h1>{t("errors.recoveryHeading")}</h1>
          <p>{t(state.recoveryMessageKey ?? "errors.persistence")}</p>
          <button type="button" className="button button--primary" onClick={startNew}>
            {t("errors.recoveryRestart")}
          </button>
        </section>
      </div>
    </main>
  );
}

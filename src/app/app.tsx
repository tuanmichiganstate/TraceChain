import { createElement, type ReactNode } from "react";
import type { ScenarioStageId } from "../domain/types/enums";
import { useTranslator } from "./providers/locale-provider";
import { useScenario } from "./providers/scenario-provider";
import { useSimulation } from "./providers/simulation-provider";
import { isDeveloperMode } from "./configuration";
import { TopBar } from "../components/top-bar";
import { StartScreen } from "../features/start/start-screen";
import { STAGE_COMPONENTS } from "../features/stage-registry";
import { WorkspaceTabs } from "../components/workspace-tabs";
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
        <StageRouter stageId={state.viewedStageId} />
        <WorkspaceTabs />
      </main>

      {isDeveloperMode() ? <DeveloperPanel /> : null}
    </>
  );
}

/**
 * Routing is driven by the scenario definition, not by a switch statement
 * (specification section 41 step 4). The scenario decides which stages exist
 * and in what order; the registry only says which component draws each one.
 */
function StageRouter({ stageId }: { stageId: ScenarioStageId }): ReactNode {
  const { stage } = useScenario();
  const definition = stage(stageId);

  if (definition === undefined || !definition.isImplemented) {
    return <NotYetAvailable />;
  }

  const component = STAGE_COMPONENTS[stageId];
  if (component === undefined) {
    // The scenario claims this stage is built but nothing is registered to draw
    // it. A test catches this, so reaching it in production means the registry
    // and the scenario drifted apart.
    return <NotYetAvailable />;
  }

  return createElement(component);
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
  const { scenario } = useScenario();

  return (
    <aside className="developer-panel">
      <h2>Developer diagnostics</h2>
      <p>
        Scenario: <code>{scenario.scenarioId}</code> v<code>{scenario.scenarioVersion}</code> ·
        Platform: <code>{state.platformMode}</code> · Stage:{" "}
        <code>{state.currentStageId}</code> · Blocks:{" "}
        <code>{state.domain.blockOrder.length}</code> · Pending:{" "}
        <code>{state.domain.pendingTransactionIds.length}</code> · Seeded assets:{" "}
        <code>{scenario.seedAssets.length}</code>
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

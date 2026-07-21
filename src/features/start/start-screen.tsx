import { useRef, useState, type ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { PlatformMode } from "../../infrastructure/scorm/learning-platform-adapter";

const OBJECTIVE_KEYS = [
  "start.objective1",
  "start.objective2",
  "start.objective3",
  "start.objective4",
  "start.objective5",
  "start.objective6",
];

export function StartScreen(): ReactNode {
  const t = useTranslator();
  const { state, startNew, resume, restart } = useSimulation();
  const { scenario } = useScenario();
  const [isConfirmingRestart, setConfirmingRestart] = useState(false);
  const restartButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <main className="start" id="main-content">
      <div className="start__inner">
        <header className="start__header">
          <h1>{t("app.title")}</h1>
          <p className="start__subtitle">{t("app.subtitle")}</p>
        </header>

        <div className="notice" role="note">
          <p>{t("app.simulationNotice")}</p>
          <p>{t("app.permissionedNotice")}</p>
        </div>

        {state.platformMode === PlatformMode.STANDALONE ? (
          <div className="notice notice--standalone" role="note">
            <p>{t("status.standalone")}</p>
          </div>
        ) : null}

        <section className="card">
          <h2>{t("start.heading")}</h2>
          <p className="muted">
            {t("start.estimatedTime", { minutes: scenario.estimatedMinutes })}
          </p>

          <h3>{t("start.objectivesHeading")}</h3>
          <ul>
            {OBJECTIVE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>

          <div className="start__actions">
            {state.hasSavedAttempt ? (
              <>
                <button type="button" className="button button--primary" onClick={resume}>
                  {t("start.resume")}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  ref={restartButtonRef}
                  onClick={() => setConfirmingRestart(true)}
                >
                  {t("start.restart")}
                </button>
              </>
            ) : (
              <button type="button" className="button button--primary" onClick={startNew}>
                {t("start.begin")}
              </button>
            )}
          </div>
        </section>

        {isConfirmingRestart ? (
          <RestartConfirmation
            onCancel={() => {
              setConfirmingRestart(false);
              restartButtonRef.current?.focus();
            }}
            onConfirm={() => {
              setConfirmingRestart(false);
              restart();
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

/**
 * Restarting destroys the learner's previous work, so it is confirmed rather
 * than immediate. Focus moves into the dialog and returns to the trigger on
 * cancel (specification section 26).
 */
function RestartConfirmation({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}): ReactNode {
  const t = useTranslator();
  const dialogRef = useRef<HTMLDivElement>(null);

  return (
    <div className="dialog-backdrop" onKeyDown={(event) => event.key === "Escape" && onCancel()}>
      <div
        className="card dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="restart-title"
        aria-describedby="restart-body"
        ref={dialogRef}
      >
        <h2 id="restart-title">{t("start.restartConfirmTitle")}</h2>
        <p id="restart-body">{t("start.restartConfirmBody")}</p>
        <div className="start__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            autoFocus
          >
            {t("start.restartConfirmCancel")}
          </button>
          <button type="button" className="button button--primary" onClick={onConfirm}>
            {t("start.restartConfirmAccept")}
          </button>
        </div>
      </div>
    </div>
  );
}

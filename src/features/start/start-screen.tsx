import { useRef, useState, type ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { PlatformMode } from "../../infrastructure/scorm/learning-platform-adapter";
import coffeeJourneyImage from "../../assets/illustrations/coffee-journey.webp";

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
        <section className="start__hero">
          <div className="start__hero-copy">
            <p className="eyebrow">{t("start.storyEyebrow")}</p>
            <header className="start__header">
              <h1>{t("app.title")}</h1>
              <p className="start__subtitle">{t("app.subtitle")}</p>
            </header>
            <p className="start__story">{t("start.storyIntro")}</p>
          </div>

          <figure className="start__visual">
            <img
              src={coffeeJourneyImage}
              width={1672}
              height={941}
              loading="eager"
              decoding="async"
              alt={t("start.heroAlt")}
            />
            <figcaption>{t("start.heroCaption")}</figcaption>
          </figure>
        </section>

        <div className="start__notices">
          <div className="notice" role="note">
            <p>{t("app.simulationNotice")}</p>
            <p>{t("app.permissionedNotice")}</p>
          </div>

          {state.platformMode === PlatformMode.STANDALONE ? (
            <div className="notice notice--standalone" role="note">
              <p>{t("status.standalone")}</p>
            </div>
          ) : null}
        </div>

        <section className="card start__brief">
          <div className="start__brief-heading">
            <h2>{t("start.heading")}</h2>
            <p className="start__duration">
              {t("start.estimatedTime", { minutes: scenario.estimatedMinutes })}
            </p>
          </div>

          <div className="start__actions start__actions--primary">
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

          <h3>{t("start.objectivesHeading")}</h3>
          <ul className="start__objectives">
            {OBJECTIVE_KEYS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
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

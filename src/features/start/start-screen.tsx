import { useRef, useState, type ReactNode } from "react";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { allScorableItems } from "../../domain/types/scenario";
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
            <p>
              <strong>{t("app.simulationNoticeLabel")}</strong>{" "}
              {t("app.simulationNotice")}
            </p>
            <p>
              <EmphasisedTerm
                sentence={t("app.permissionedNotice")}
                term={t("app.permissionedTerm")}
              />
            </p>
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

          <ScoringSummary />
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
 * Emphasises a term of art where it sits inside a sentence.
 *
 * `t()` returns a string, so emphasis in the middle of a sentence cannot come
 * from the catalogue without splitting that sentence into fragments a
 * translator can neither read as a sentence nor reorder. Keeping the sentence
 * whole and locating the term inside it costs one extra key, and a translation
 * that phrases the term differently renders unemphasised rather than broken.
 */
function EmphasisedTerm({ sentence, term }: { sentence: string; term: string }): ReactNode {
  const start = sentence.indexOf(term);
  if (start < 0) return sentence;
  return (
    <>
      {sentence.slice(0, start)}
      <strong>{sentence.slice(start, start + term.length)}</strong>
      {sentence.slice(start + term.length)}
    </>
  );
}

/**
 * What the marks are for, before any of them are at stake.
 *
 * A learner who does not know that hints are priced, that retries are floored,
 * or that most of the credit sits in the questions rather than the transactions
 * cannot make an informed choice about any of the three. Every figure is derived
 * from the scoring configuration, so a scenario that reallocates its points says
 * so here without anyone remembering to update a sentence.
 */
function ScoringSummary(): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const configuration = scenario.scoringConfiguration;
  const items = allScorableItems(scenario);

  const sum = (procedural: boolean): number =>
    items
      .filter((item) => item.isProcedural === procedural)
      .reduce((total, item) => total + item.points, 0);
  const count = (procedural: boolean): number =>
    items.filter((item) => item.isProcedural === procedural).length;

  return (
    <section className="start__scoring">
      <h3>{t("start.scoringHeading")}</h3>
      {/* Label and figure are separate keys so no markup lives in the
          catalogues, and every number still comes from the scenario. */}
      <ul className="start__scoring-list">
        <li>
          <strong>{t("start.scoringActionsLabel")}</strong>{" "}
          {t("start.scoringActions", { points: sum(true), count: count(true) })}
        </li>
        <li>
          <strong>{t("start.scoringQuestionsLabel")}</strong>{" "}
          {t("start.scoringQuestions", { points: sum(false), count: count(false) })}
        </li>
        <li>
          <strong>{t("start.scoringPassLabel")}</strong>{" "}
          {t("start.scoringPass", { points: configuration.passingScore })}
        </li>
      </ul>
      <p className="muted">
        {t("start.scoringHint")}
      </p>
      <p className="muted">
        {t("start.scoringRetry", {
          percent: Math.round(configuration.minimumProceduralCredit * 100),
        })}
      </p>
    </section>
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

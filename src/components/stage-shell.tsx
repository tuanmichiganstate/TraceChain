import type { ReactNode } from "react";
import type { ScenarioStageId } from "../domain/types/enums";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import {
  evaluateRequiredActions,
  evaluateStageCompletion,
} from "../domain/scenario/stage-completion";
import { StatusPill } from "./status-pill";

/**
 * The frame every stage sits in: title, instruction, what still needs doing,
 * hints, and the stage's own content.
 *
 * All of it comes from the scenario definition, so a stage component only has
 * to supply the transactions and checks specific to it. The outstanding-work
 * list is derived from the same completion conditions that actually govern
 * progression, rather than being a separately-maintained checklist that could
 * disagree with them.
 */
export function StageShell({
  stageId,
  briefing,
  children,
}: {
  stageId: ScenarioStageId;
  briefing?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const t = useTranslator();
  const { stage } = useScenario();
  const { state } = useSimulation();
  const definition = stage(stageId);

  if (definition === undefined) return null;

  const completionContext = { state: state.domain, decisions: state.decisions };
  const completion = evaluateStageCompletion(definition, completionContext);
  const actionOutcomes = evaluateRequiredActions(definition, completionContext);

  return (
    <div className="stage stack">
      <header>
        <h2 data-stage-heading tabIndex={-1}>
          {t(definition.titleKey)}
        </h2>
        <p>{t(definition.instructionKey)}</p>
      </header>

      {briefing}

      {definition.requiredActions.length > 0 ? (
        <section className="card required-actions">
          <h3>{t("stage.requiredActions")}</h3>
          <ul className="required-actions__list">
            {actionOutcomes.map(({ action, isSatisfied }) => (
              <li key={action.actionId}>
                <StatusPill tone={isSatisfied ? "pass" : "neutral"}>
                  {isSatisfied ? t("stage.actionDone") : t("stage.actionTodo")}
                </StatusPill>{" "}
                {t(action.descriptionKey)}
              </li>
            ))}
          </ul>
          <p>
            <StatusPill tone={completion.isComplete ? "pass" : "neutral"}>
              {completion.isComplete ? t("stage.complete") : t("stage.incomplete")}
            </StatusPill>
          </p>
        </section>
      ) : null}

      {definition.availableHints.map((hint) => (
        <HintPanel key={hint.hintId} hintId={hint.hintId} textKey={hint.textKey} />
      ))}

      {children}

      <StageAdvance stageId={stageId} />
    </div>
  );
}

/**
 * Moving on is the learner's decision.
 *
 * The next stage unlocks automatically once its conditions hold, but the screen
 * only changes when the learner says so -- otherwise the feedback explaining
 * their last answer would be replaced before they could read it.
 */
function StageAdvance({ stageId }: { stageId: ScenarioStageId }): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state, viewStage } = useSimulation();

  const index = scenario.stages.findIndex((candidate) => candidate.stageId === stageId);
  const next = scenario.stages[index + 1];
  const isUnlocked = state.completedStageIds.includes(stageId);

  if (!isUnlocked || next === undefined) return null;

  return (
    <div className="stage__advance">
      <button
        type="button"
        className="button button--primary"
        onClick={() => viewStage(next.stageId)}
      >
        {t("navigation.continue")}
      </button>
    </div>
  );
}

/**
 * A hint the learner opts into.
 *
 * Deliberately a two-step reveal. Using a hint costs credit, so taking one must
 * be a choice rather than something a learner stumbles into by scrolling.
 */
function HintPanel({ hintId, textKey }: { hintId: string; textKey: string }): ReactNode {
  const t = useTranslator();
  const { state, revealHint } = useSimulation();
  const isRevealed = state.hintsUsed.includes(hintId);

  return (
    <section className="hint">
      {isRevealed ? (
        <>
          <h3>{t("hint.heading")}</h3>
          <p>{t(textKey)}</p>
        </>
      ) : (
        <>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => revealHint(hintId)}
            disabled={state.isReadOnly}
          >
            {t("hint.reveal")}
          </button>
          <p className="muted">{t("hint.penaltyNotice")}</p>
        </>
      )}
    </section>
  );
}

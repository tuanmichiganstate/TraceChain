import { useState, type ReactNode } from "react";
import {
  KnowledgeCheckType,
  type KnowledgeCheckDefinition,
} from "../domain/types/scenario";
import { EMPTY_ANSWER, type Answer } from "../domain/scenario/answer-codec";
import { useTranslator } from "../app/providers/locale-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { StatusPill } from "./status-pill";

/**
 * Renders any knowledge check from its definition (specification section 20).
 *
 * One component for all three question shapes, driven entirely by data, so
 * adding a check to a scenario needs no new interface code.
 *
 * Feedback is never just right or wrong. Section 20.3 requires an explanation
 * and a connection back to what the learner just did, and a learner who got it
 * wrong keeps their answer visible while they read why -- taking the question
 * away with the mistake would remove the thing the explanation refers to.
 */
export function KnowledgeCheckPanel({
  check,
  onAnswered,
}: {
  check: KnowledgeCheckDefinition;
  onAnswered?: (isCorrect: boolean) => void;
}): ReactNode {
  const t = useTranslator();
  const { state, answerCheck } = useSimulation();
  const [answer, setAnswer] = useState<Answer>(EMPTY_ANSWER);
  const [outcome, setOutcome] = useState<boolean | null>(null);

  const previousAttempts = state.decisions[check.knowledgeCheckId]?.attemptCount ?? 0;
  const hasAnswered = outcome !== null;
  const canSubmit = isAnswerComplete(check, answer);

  const submit = (): void => {
    if (!canSubmit) return;
    const isCorrect = answerCheck(check, answer);
    setOutcome(isCorrect);
    onAnswered?.(isCorrect);
  };

  const retry = (): void => {
    setOutcome(null);
    setAnswer(EMPTY_ANSWER);
  };

  return (
    <section className="card knowledge-check">
      <fieldset className="fieldset" disabled={hasAnswered || state.isReadOnly}>
        <legend>
          <h3>{t(check.questionKey)}</h3>
        </legend>

        {!check.isScored ? (
          <p className="muted">{t("stage.orientation.noPenaltyNotice")}</p>
        ) : null}

        {check.checkType === KnowledgeCheckType.CLASSIFICATION ? (
          <ClassificationInput check={check} answer={answer} onChange={setAnswer} />
        ) : (
          <ChoiceInput check={check} answer={answer} onChange={setAnswer} />
        )}
      </fieldset>

      {!hasAnswered ? (
        <button
          type="button"
          className="button button--primary"
          onClick={submit}
          disabled={!canSubmit || state.isReadOnly}
        >
          {t("check.submit")}
        </button>
      ) : (
        <div className={`feedback${outcome ? "" : " feedback--incorrect"}`} role="status">
          <p>
            <StatusPill tone={outcome ? "pass" : "fail"}>
              {t(outcome ? "check.correct" : "check.incorrect")}
            </StatusPill>
          </p>
          <p>
            <strong>{t(check.feedbackKey)}</strong>
          </p>
          <p>{t(check.scenarioConnectionKey)}</p>

          {check.glossaryTermKey !== undefined ? (
            <p className="muted">
              {t("check.glossaryPrompt")} <strong>{t(check.glossaryTermKey)}</strong>
            </p>
          ) : null}

          {!outcome ? (
            <button type="button" className="button button--secondary" onClick={retry}>
              {t("check.retry")}
            </button>
          ) : null}
        </div>
      )}

      {previousAttempts > 0 && !hasAnswered ? (
        <p className="muted">{t("check.attemptCount", { count: previousAttempts })}</p>
      ) : null}
    </section>
  );
}

function isAnswerComplete(check: KnowledgeCheckDefinition, answer: Answer): boolean {
  if (check.checkType === KnowledgeCheckType.CLASSIFICATION) {
    // Every item must be placed before the answer means anything.
    return check.options.every((option) => answer.categoryByItem[option.optionId] !== undefined);
  }
  return answer.selectedOptionIds.length > 0;
}

function ChoiceInput({
  check,
  answer,
  onChange,
}: {
  check: KnowledgeCheckDefinition;
  answer: Answer;
  onChange: (answer: Answer) => void;
}): ReactNode {
  const t = useTranslator();
  const isMultiple = check.checkType === KnowledgeCheckType.MULTIPLE_CHOICE;

  const toggle = (optionId: string): void => {
    if (!isMultiple) {
      onChange({ selectedOptionIds: [optionId], categoryByItem: {} });
      return;
    }
    const selected = new Set(answer.selectedOptionIds);
    if (selected.has(optionId)) selected.delete(optionId);
    else selected.add(optionId);
    onChange({ selectedOptionIds: [...selected], categoryByItem: {} });
  };

  return (
    <>
      {isMultiple ? <p className="muted">{t("check.selectAllThatApply")}</p> : null}
      {check.options.map((option) => (
        <label key={option.optionId} className="choice">
          <input
            type={isMultiple ? "checkbox" : "radio"}
            name={check.knowledgeCheckId}
            value={option.optionId}
            checked={answer.selectedOptionIds.includes(option.optionId)}
            onChange={() => toggle(option.optionId)}
          />
          <span>{t(option.labelKey)}</span>
        </label>
      ))}
    </>
  );
}

/**
 * Classification as a set of labelled selects rather than drag and drop.
 *
 * Specification section 26 forbids a drag-only activity. A select is keyboard
 * operable by default, works at 320 px, and needs no announcements of its own.
 */
function ClassificationInput({
  check,
  answer,
  onChange,
}: {
  check: KnowledgeCheckDefinition;
  answer: Answer;
  onChange: (answer: Answer) => void;
}): ReactNode {
  const t = useTranslator();
  const categories = check.categories ?? [];

  const assign = (itemId: string, categoryId: string): void => {
    onChange({
      selectedOptionIds: [],
      categoryByItem: { ...answer.categoryByItem, [itemId]: categoryId },
    });
  };

  return (
    <div className="classification">
      {check.options.map((item) => {
        const selectId = `${check.knowledgeCheckId}-${item.optionId}`;
        return (
          <div key={item.optionId} className="classification__row">
            <label className="field__label" htmlFor={selectId}>
              {t(item.labelKey)}
            </label>
            <select
              id={selectId}
              className="field__control"
              value={answer.categoryByItem[item.optionId] ?? ""}
              onChange={(event) => assign(item.optionId, event.target.value)}
            >
              <option value="">{t("check.chooseCategory")}</option>
              {categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {t(category.labelKey)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

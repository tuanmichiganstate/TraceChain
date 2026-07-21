import { useState, type ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { SupplyChainDiagram } from "./supply-chain-diagram";

const DECISION_ID = "INT_ORIENTATION_TRUTH_CHECK";

/**
 * Options in a fixed order. The index is what the compact state codec stores,
 * so reordering them would reinterpret every saved attempt.
 */
const OPTIONS = [
  { optionKey: "stage.orientation.checkOptionYes", isCorrect: false },
  { optionKey: "stage.orientation.checkOptionNo", isCorrect: true },
  { optionKey: "stage.orientation.checkOptionPartly", isCorrect: false },
];

/**
 * Stage 1. Introduces the supply chain and the central caveat: a blockchain
 * records who claimed what and when, not whether the claim is true.
 *
 * This question is diagnostic. Specification section 8.1 requires that it not
 * be scored -- the point is to surface a starting assumption, and penalising it
 * would teach learners to guess defensively rather than answer honestly.
 */
export function OrientationStage(): ReactNode {
  const t = useTranslator();
  const { recordDecision, completeStage } = useSimulation();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);

  const handleSubmit = (): void => {
    if (selectedIndex === null) return;
    recordDecision(DECISION_ID, selectedIndex);
    setHasAnswered(true);
  };

  return (
    <div className="stage stack">
      <header>
        <h2>{t("stage.orientation.title")}</h2>
        <p>{t("stage.orientation.instruction")}</p>
      </header>

      <section className="card">
        <SupplyChainDiagram />
      </section>

      <section className="card">
        <fieldset className="fieldset">
          <legend>
            <h3>{t("stage.orientation.checkQuestion")}</h3>
          </legend>
          <p className="muted">{t("stage.orientation.noPenaltyNotice")}</p>

          {OPTIONS.map((option, index) => (
            <label key={option.optionKey} className="choice">
              <input
                type="radio"
                name={DECISION_ID}
                value={index}
                checked={selectedIndex === index}
                disabled={hasAnswered}
                onChange={() => setSelectedIndex(index)}
              />
              <span>{t(option.optionKey)}</span>
            </label>
          ))}
        </fieldset>

        {!hasAnswered ? (
          <button
            type="button"
            className="button button--primary"
            onClick={handleSubmit}
            disabled={selectedIndex === null}
          >
            {t("navigation.continue")}
          </button>
        ) : (
          <div className="feedback" role="status">
            <p>
              <strong>{t("stage.orientation.checkFeedback")}</strong>
            </p>
            <p>{t("message.inputTruth")}</p>
            <button
              type="button"
              className="button button--primary"
              onClick={() => completeStage(ScenarioStageId.ORIENTATION)}
            >
              {t("navigation.continue")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

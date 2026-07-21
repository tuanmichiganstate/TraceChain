import { useState, type ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { ScoreComponent } from "../domain/types/scoring";
import { TransactionStatus } from "../domain/types/enums";
import { StatusPill } from "./status-pill";

const COMPONENT_LABELS: Readonly<Record<ScoreComponent, string>> = {
  [ScoreComponent.TRANSACTION_ACCURACY]: "score.transactionAccuracy",
  [ScoreComponent.TRACEABILITY_COMPLETENESS]: "score.traceabilityCompleteness",
  [ScoreComponent.DATA_GOVERNANCE]: "score.dataGovernance",
  [ScoreComponent.COMPLIANCE_AND_CORRECTION]: "score.complianceAndCorrection",
  [ScoreComponent.RECALL_PERFORMANCE]: "score.recallPerformance",
  [ScoreComponent.CONCEPTUAL_UNDERSTANDING]: "score.conceptualUnderstanding",
};

const COMPONENT_FIELDS = {
  [ScoreComponent.TRANSACTION_ACCURACY]: "transactionAccuracy",
  [ScoreComponent.TRACEABILITY_COMPLETENESS]: "traceabilityCompleteness",
  [ScoreComponent.DATA_GOVERNANCE]: "dataGovernance",
  [ScoreComponent.COMPLIANCE_AND_CORRECTION]: "complianceAndCorrection",
  [ScoreComponent.RECALL_PERFORMANCE]: "recallPerformance",
  [ScoreComponent.CONCEPTUAL_UNDERSTANDING]: "conceptualUnderstanding",
} as const;

/**
 * What the learner earned, and where.
 *
 * The per-component breakdown is the point: a single number tells a learner
 * they did badly without telling them at what, and the six components map onto
 * the six things the activity actually teaches. Marks lost to hints and
 * rejected transactions are shown separately rather than folded into the total,
 * because those are choices the learner made rather than concepts they missed.
 *
 * Reporting to the LMS is an explicit action. Writing the score the instant the
 * last question is answered would send a result before the learner had seen it.
 */
export function FinalReport(): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state, scoreBreakdown, isPassed, isCompleted, finish } = useSimulation();
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isCompleted) return null;

  const { score } = scoreBreakdown;
  const committedCount = Object.values(state.domain.transactionsById).filter(
    (transaction) => transaction.transactionStatus !== TransactionStatus.REJECTED,
  ).length;

  // Awaited rather than fired and forgotten: "the result has been sent" must
  // not appear until it has been.
  const submit = async (): Promise<void> => {
    await finish();
    setIsSubmitted(true);
  };

  return (
    <section className="card stack" aria-labelledby="final-report-heading">
      <h3 id="final-report-heading">{t("report.heading")}</h3>

      <p>
        <StatusPill tone={isPassed ? "pass" : "warn"}>
          {t("report.totalScore")}: {score.totalScore} / {score.maxScore} —{" "}
          {isPassed ? t("report.passed") : t("report.notPassed")}
        </StatusPill>
      </p>
      <p>{isPassed ? t("report.passNotice") : t("report.retryNotice")}</p>

      <h4>{t("report.breakdownHeading")}</h4>
      <dl className="asset-card__grid">
        {Object.values(ScoreComponent).map((component) => (
          <div className="asset-card__row" key={component}>
            <dt>{t(COMPONENT_LABELS[component])}</dt>
            <dd>
              {score[COMPONENT_FIELDS[component]]} /{" "}
              {scenario.scoringConfiguration.componentPoints[component]}
            </dd>
          </div>
        ))}
        <div className="asset-card__row">
          <dt>{t("report.hintsUsed")}</dt>
          <dd>{score.hintsUsed}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("report.invalidAttempts")}</dt>
          <dd>{score.invalidAttempts}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("report.transactionsCommitted")}</dt>
          <dd>{committedCount}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("report.blocksSealed")}</dt>
          <dd>{state.domain.blockOrder.length}</dd>
        </div>
      </dl>

      {isSubmitted ? (
        <p>
          <StatusPill tone="pass">{t("report.submitted")}</StatusPill>
        </p>
      ) : state.isReadOnly ? (
        // Nothing to send: the grade this attempt earned is already recorded,
        // and offering the button would promise a write that cannot happen.
        null
      ) : (
        <button
          type="button"
          className="button button--primary"
          onClick={() => void submit()}
        >
          {t("report.finish")}
        </button>
      )}
    </section>
  );
}

import { useState, type ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { ScoreComponent } from "../domain/types/scoring";
import { TransactionStatus } from "../domain/types/enums";
import { StatusPill } from "./status-pill";
import { allScoredActions } from "../domain/types/scenario";
import { buildEffectiveValueView } from "../domain/scenario/effective-value-view";
import { formatCorrectionValueLabel } from "../localization/format-correction-value";
import { buildCausalReport } from "../domain/reporting/causal-report";
import { useOptionalConfiguration } from "../app/providers/configuration-provider";
import { GUIDED_PRESET } from "../config/presets";
import { hashConfiguration } from "../config/hash";

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

const DIAGNOSTIC_LABELS = {
  traceability: "report.diagnostic.traceability",
  dataIntegrity: "report.diagnostic.dataIntegrity",
  compliance: "report.diagnostic.compliance",
  consumerSafety: "report.diagnostic.consumerSafety",
  operationalEfficiency: "report.diagnostic.operationalEfficiency",
  governanceQuality: "report.diagnostic.governanceQuality",
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
  const embeddedConfiguration = useOptionalConfiguration();
  const { state, scoreBreakdown, isPassed, isCompleted, finish } = useSimulation();
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isCompleted) return null;

  const { score } = scoreBreakdown;
  const committedCount = Object.values(state.domain.transactionsById).filter(
    (transaction) => transaction.transactionStatus === TransactionStatus.COMMITTED,
  ).length;
  const correctionEvidence = allScoredActions(scenario)
    .map((action) => action.evidence)
    .find((evidence) => evidence?.kind === "EFFECTIVE_VALUE");
  const correctionResolution =
    correctionEvidence === undefined
      ? null
      : buildEffectiveValueView(state.domain, correctionEvidence.target);
  const causalReport = buildCausalReport({
    scenario,
    journal: state.commandJournal,
    runtime: state.simulation,
    hintsUsed: state.hintsUsed,
    configurationIdentifier:
      embeddedConfiguration?.configurationHash ??
      hashConfiguration(GUIDED_PRESET),
  });

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
      </dl>

      {correctionResolution !== null ? (
        <section aria-labelledby="report-correction-heading">
          <h4 id="report-correction-heading">{t("report.correctionLineage")}</h4>
          <dl className="asset-card__grid">
            <div className="asset-card__row">
              <dt>{t("field.correctionOf")}</dt>
              <dd><code>{correctionResolution.originalTransactionId}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("stage.receiveAndCorrect.manifestQuantity")}</dt>
              <dd>{formatCorrectionValueLabel(correctionResolution.originalValue, t)}</dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("stage.receiveAndCorrect.effectiveQuantity")}</dt>
              <dd>{formatCorrectionValueLabel(correctionResolution.effectiveValue, t)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {embeddedConfiguration?.configuration.scoring
        .reportDiagnosticDimensions !== false ? (
        <section aria-labelledby="report-diagnostic-heading">
          <h4 id="report-diagnostic-heading">
            {t("report.diagnosticHeading")}
          </h4>
          <p className="muted">{t("report.diagnosticNotice")}</p>
          <dl className="asset-card__grid">
            {(
              Object.keys(DIAGNOSTIC_LABELS) as Array<
                keyof typeof DIAGNOSTIC_LABELS
              >
            ).map((dimension) => (
              <div className="asset-card__row" key={dimension}>
                <dt>{t(DIAGNOSTIC_LABELS[dimension])}</dt>
                <dd>{causalReport.dimensions[dimension]} / 100</dd>
              </div>
            ))}
            <div className="asset-card__row">
              <dt>{t("report.evidenceStrength")}</dt>
              <dd>
                {t(
                  causalReport.evidenceStrength === "STRONG"
                    ? "report.evidenceStrong"
                    : causalReport.evidenceStrength === "MODERATE"
                      ? "report.evidenceModerate"
                      : "report.evidenceWeak",
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="report-causal-heading">
        <h4 id="report-causal-heading">{t("report.causalHeading")}</h4>
        <ol>
          {causalReport.explanations.map((explanation, index) => (
            <li key={`${explanation.messageKey}-${index}`}>
              {t(explanation.messageKey, explanation.values)}
            </li>
          ))}
        </ol>
      </section>

      {/* Counts, not competencies. Blocks sealed and transactions committed say
          how much machinery ran, never what the learner understood, so they sit
          below the breakdown rather than inside it -- mixed into one list they
          read as marks and crowd out the six things that are. */}
      <section aria-labelledby="report-activity-heading">
        <h4 id="report-activity-heading">{t("report.activityHeading")}</h4>
        <dl className="asset-card__grid">
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
          <div className="asset-card__row">
            <dt>{t("report.manualReviewRecords")}</dt>
            <dd>{causalReport.manualReviewRecords}</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("report.scenarioIdentifier")}</dt>
            <dd>
              <code>
                {causalReport.scenarioId}@{causalReport.scenarioVersion}
              </code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("report.configurationIdentifier")}</dt>
            <dd>
              <code>{causalReport.configurationIdentifier}</code>
            </dd>
          </div>
        </dl>
      </section>

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

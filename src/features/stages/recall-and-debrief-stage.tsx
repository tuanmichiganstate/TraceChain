import { useState, type ReactNode } from "react";
import {
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { TransactionAction } from "../../components/transaction-action";
import { FinalReport } from "../../components/final-report";
import { ClassificationPill, StatusPill } from "../../components/status-pill";
import { decodeAnswer } from "../../domain/scenario/answer-codec";
import {
  assessRecallSelection,
  calculateRecallScope,
  justifyRecallSelection,
} from "../../domain/provenance/recall-scope";
import {
  runtimeCommand,
} from "../../domain/scenario/runtime";
import type { RecallBatchCommand } from "../../domain/commands/commands";
import recallInvestigationImage from "../../assets/illustrations/recall-investigation.webp";
import { buildCausalReport } from "../../domain/reporting/causal-report";
import { useOptionalConfiguration } from "../../app/providers/configuration-provider";
import { shouldRevealDetailedFeedback } from "../../app/feedback-visibility";

/**
 * Stage 9. Trace the contamination forward, recall exactly what it reached, and
 * say what the ledger was actually worth.
 *
 * The scope answer *is* the recall. Filing the correct set regardless of what
 * the learner concluded would make the transaction a formality and the question
 * a quiz; instead the command carries their selection, so an over-broad answer
 * destroys good stock and a narrow one leaves contaminated product on sale.
 * Both are visible immediately, and both are what the precision score reads.
 */
export function RecallAndDebriefStage(): ReactNode {
  const t = useTranslator();
  const { stage, scenario } = useScenario();
  const {
    state,
    isCompleted,
    activeTrustedContext,
    requestRoleHandoff,
  } = useSimulation();
  const packageConfiguration = useOptionalConfiguration();
  const [handoffPending, setHandoffPending] = useState(false);
  const definition = stage(ScenarioStageId.RECALL_AND_DEBRIEF);
  const [scopeCheck, debriefCheck] = definition?.knowledgeChecks ?? [];

  // What the learner concluded, read back from their stored answer rather than
  // from in-session state, so a resumed attempt files the same recall.
  const scopeDecision = scopeCheck === undefined ? undefined : state.decisions[scopeCheck.knowledgeCheckId];
  const selectedAssetIds =
    scopeCheck === undefined || scopeDecision === undefined
      ? []
      : decodeAnswer(scopeCheck, scopeDecision.encodedValue).selectedOptionIds;

  const hasScope = selectedAssetIds.length > 0;
  const recallSourceAssetId = scenario.runtime.assetRoles.recallSourceAssetId;
  const scope = calculateRecallScope(recallSourceAssetId, state.domain);

  // Provenance makes the green batch affected -- it is the contaminated source
  // -- but the question does not offer it, because roasting consumed all of it
  // and there is nothing left to take off a shelf. A learner cannot be marked
  // for missing a lot they were never shown, so the assessment covers exactly
  // the lots on offer, which is also the set the check's own answer key uses.
  const offeredAssetIds = new Set(scopeCheck?.options.map((option) => option.optionId) ?? []);
  const accuracy = assessRecallSelection(selectedAssetIds, {
    ...scope,
    affectedAssetIds: scope.affectedAssetIds.filter((assetId) => offeredAssetIds.has(assetId)),
  });
  const recallDecision = state.decisions["INT_RECALL_COMMITTED"];
  const initialRecallSubmitted = (recallDecision?.attemptCount ?? 0) > 0;
  const recallTransaction = Object.values(state.domain.transactionsById).find(
    (transaction) =>
      transaction.transactionType === TransactionType.RECALL_BATCH &&
      transaction.transactionStatus !== TransactionStatus.REJECTED,
  );
  const recallCommitted =
    recallTransaction?.transactionStatus === TransactionStatus.COMMITTED;
  const recallOrdered =
    recallTransaction?.transactionStatus === TransactionStatus.ORDERED;
  const activeContextId = activeTrustedContext.contextId;
  const availableHandoffs = scenario.runtime.roleHandoffs.filter(
    (handoff) =>
      handoff.stageId === ScenarioStageId.RECALL_AND_DEBRIEF &&
      handoff.fromContextId === activeContextId,
  );
  const isAuthorizedContext =
    scenario.runtime.commandContextByAction["RECALL_BATCH"] === activeContextId;
  const causalPreview = buildCausalReport({
    scenario,
    journal: state.commandJournal,
    runtime: state.simulation,
    hintsUsed: state.hintsUsed,
    configurationIdentifier: "active",
  });
  const revealDetailedFeedback = shouldRevealDetailedFeedback({
    timing:
      packageConfiguration?.configuration.feedbackTiming ?? "immediate",
    stageId: ScenarioStageId.RECALL_AND_DEBRIEF,
    completedStageIds: state.completedStageIds,
    simulationCompleted: isCompleted,
  });
  const handoffControls =
    availableHandoffs.length === 0 ? null : (
      <div className="button-row">
        {availableHandoffs.map((handoff) => (
          <button
            type="button"
            className="button button--secondary"
            key={handoff.handoffId}
            disabled={state.isReadOnly || handoffPending}
            onClick={() => {
              setHandoffPending(true);
              void requestRoleHandoff(handoff.handoffId).finally(() =>
                setHandoffPending(false),
              );
            }}
          >
            {t(handoff.labelKey)}
          </button>
        ))}
      </div>
    );

  return (
    <StageShell
      stageId={ScenarioStageId.RECALL_AND_DEBRIEF}
      briefing={<RecallBriefing />}
    >
      {scopeCheck !== undefined ? (
        <KnowledgeCheckPanel
          check={scopeCheck}
          isLocked={initialRecallSubmitted}
        />
      ) : null}

      {hasScope ? (
        <section className="card card--reference">
          <h3>{t("stage.recallAndDebrief.selectedHeading")}</h3>

          <ul className="recall-scope__list">
            {selectedAssetIds.map((assetId) => (
              revealDetailedFeedback ? (
                <RecallJustificationItem key={assetId} assetId={assetId} />
              ) : (
                <li className="recall-scope__item" key={assetId}>
                  <code>{assetId}</code>
                </li>
              )
            ))}
          </ul>

          {revealDetailedFeedback && accuracy.missed.length > 0 ? (
            <>
              <h4>{t("stage.recallAndDebrief.missedHeading")}</h4>
              <ul className="recall-scope__list">
                {accuracy.missed.map((assetId) => (
                  <RecallJustificationItem key={assetId} assetId={assetId} />
                ))}
              </ul>
              <p className="muted">{t("stage.recallAndDebrief.missedNote")}</p>
            </>
          ) : null}

          <p>
            {!revealDetailedFeedback ? (
              <StatusPill tone="neutral">{t("check.recorded")}</StatusPill>
            ) : accuracy.isExact ? (
              <StatusPill tone="pass">{t("stage.recallAndDebrief.accuracyExact")}</StatusPill>
            ) : (
              <>
                {accuracy.missed.length > 0 ? (
                  <StatusPill tone="fail">
                    {t("stage.recallAndDebrief.accuracyMissed", {
                      count: String(accuracy.missed.length),
                    })}
                  </StatusPill>
                ) : null}
                {accuracy.overSelected.length > 0 ? (
                  <StatusPill tone="warn">
                    {t("stage.recallAndDebrief.accuracyOver", {
                      count: String(accuracy.overSelected.length),
                    })}
                  </StatusPill>
                ) : null}
              </>
            )}
          </p>
        </section>
      ) : null}

      {hasScope && !initialRecallSubmitted ? (
        <>
          <section className="card card--work">
            <h3>{t("stage.recallAndDebrief.authorizationHeading")}</h3>
            <p className="muted">
              {t("stage.recallAndDebrief.precommitHandoffPrompt")}
            </p>
            {handoffControls ?? (
              <p>{t("stage.recallAndDebrief.handoffComplete")}</p>
            )}
          </section>
          {!handoffPending ? (
            <TransactionAction
              decisionId="INT_RECALL_COMMITTED"
              actionId="RECALL_BATCH"
              labelKey="stage.recallAndDebrief.recallAction"
              isFirstOfType
              summary={[
                ["stage.recallAndDebrief.selectedHeading", selectedAssetIds.join(", ")],
                ["field.reason", t("stage.recallAndDebrief.scopeHeading")],
              ]}
              buildCommand={() =>
                runtimeCommand<RecallBatchCommand>(scenario, "RECALL_BATCH", {
                  selectedAssetIds,
                })
              }
              context={{
                actorId: activeTrustedContext.actorId,
                organizationId: activeTrustedContext.organizationId,
              }}
            />
          ) : null}
        </>
      ) : !hasScope ? (
        <p className="muted">{t("stage.recallAndDebrief.recallPending")}</p>
      ) : null}

      {initialRecallSubmitted && !recallCommitted ? (
        <section className="card card--work">
          <h3>{t("stage.recallAndDebrief.authorizationHeading")}</h3>
          {recallOrdered ? (
            <TransactionAction
              key={recallTransaction.transactionId}
              decisionId="INT_RECALL_COMMITTED"
              actionId="RECALL_BATCH"
              labelKey={
                (recallDecision?.attemptCount ?? 0) > 1
                  ? "stage.recallAndDebrief.resubmitAuthorized"
                  : "stage.recallAndDebrief.recallAction"
              }
              isFirstOfType
              summary={[
                ["stage.recallAndDebrief.selectedHeading", selectedAssetIds.join(", ")],
                ["field.reason", t("stage.recallAndDebrief.scopeHeading")],
              ]}
              buildCommand={() =>
                runtimeCommand<RecallBatchCommand>(scenario, "RECALL_BATCH", {
                  selectedAssetIds,
                })
              }
              context={{
                actorId: activeTrustedContext.actorId,
                organizationId: activeTrustedContext.organizationId,
              }}
            />
          ) : !isAuthorizedContext ? (
            <>
              <p>{t("stage.recallAndDebrief.unauthorizedFeedback")}</p>
              <p className="muted">{t("stage.recallAndDebrief.handoffPrompt")}</p>
              {handoffControls}
            </>
          ) : (
            <TransactionAction
              decisionId="INT_RECALL_COMMITTED"
              actionId="RECALL_BATCH"
              labelKey="stage.recallAndDebrief.resubmitAuthorized"
              isFirstOfType
              summary={[
                ["stage.recallAndDebrief.selectedHeading", selectedAssetIds.join(", ")],
                ["field.reason", t("stage.recallAndDebrief.scopeHeading")],
              ]}
              buildCommand={() =>
                runtimeCommand<RecallBatchCommand>(scenario, "RECALL_BATCH", {
                  selectedAssetIds,
                })
              }
              context={{
                actorId: activeTrustedContext.actorId,
                organizationId: activeTrustedContext.organizationId,
              }}
            />
          )}
        </section>
      ) : null}

      {initialRecallSubmitted && revealDetailedFeedback ? (
        <section className="card card--reference">
          <h3>{t("stage.recallAndDebrief.evidenceHeading")}</h3>
          <p>{t("stage.recallAndDebrief.evidenceNotice")}</p>
          <dl className="asset-card__grid">
            <div className="asset-card__row">
              <dt>{t("report.evidenceStrength")}</dt>
              <dd>
                {t(
                  causalPreview.evidenceStrength === "STRONG"
                    ? "report.evidenceStrong"
                    : causalPreview.evidenceStrength === "MODERATE"
                      ? "report.evidenceModerate"
                      : "report.evidenceWeak",
                )}
              </dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("report.manualReviewRecords")}</dt>
              <dd>{causalPreview.manualReviewRecords}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {debriefCheck !== undefined ? <KnowledgeCheckPanel check={debriefCheck} /> : null}

      <FinalReport />
    </StageShell>
  );
}

/**
 * One lot, and why it is or is not in scope.
 *
 * The score already tells the learner whether they were right. Without the path
 * it does not tell them *why*, and for the lookalike lot -- same co-operative,
 * same plant, same roasting date -- "why" is the entire lesson: nothing on the
 * label separates it, only the absence of an edge does. Showing the chain turns
 * a mark into an argument the learner can check.
 */
function RecallJustificationItem({ assetId }: { assetId: string }): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state } = useSimulation();

  const nameOf = (id: string): string => state.domain.assetsById[id]?.productName ?? id;
  const justification = justifyRecallSelection(
    assetId,
    scenario.runtime.assetRoles.recallSourceAssetId,
    state.domain,
  );

  return (
    <li className="recall-scope__item">
      <p className="recall-scope__asset">
        {/* A classification of the goods, not a verdict on the answer. Whether
            the learner was right is the accuracy summary's job, stated
            separately -- an affected lot they correctly identified must not be
            handed a rejection cross for getting it right. */}
        <strong>{nameOf(assetId)}</strong> <code>{assetId}</code>{" "}
        <ClassificationPill tone={justification.isAffected ? "affected" : "unaffected"}>
          {t(
            justification.isAffected
              ? "stage.recallAndDebrief.affected"
              : "stage.recallAndDebrief.notAffected",
          )}
        </ClassificationPill>
      </p>

      {justification.isAffected ? (
        <>
          <p className="muted">{t("stage.recallAndDebrief.reasonAffected")}</p>
          <ol className="recall-scope__path">
            {justification.pathAssetIds.map((pathAssetId) => (
              <li key={pathAssetId}>
                {nameOf(pathAssetId)} <code>{pathAssetId}</code>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="muted">{t("stage.recallAndDebrief.reasonUnaffected")}</p>
      )}
    </li>
  );
}

function RecallBriefing(): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();

  return (
    <section className="card recall-briefing">
      <figure className="recall-briefing__scene">
        <img
          src={recallInvestigationImage}
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          alt={t("stage.recallAndDebrief.sceneAlt")}
        />
      </figure>
      <div className="recall-briefing__content">
        <p className="eyebrow">{t("stage.recallAndDebrief.incidentLabel")}</p>
        <h3>{t("stage.recallAndDebrief.scopeHeading")}</h3>
        <p>{t("stage.recallAndDebrief.scopeNotice")}</p>
        <p className="recall-briefing__source">
          <span>{t("field.assetId")}</span>
          <code>{scenario.runtime.assetRoles.recallSourceAssetId}</code>
        </p>
      </div>
    </section>
  );
}

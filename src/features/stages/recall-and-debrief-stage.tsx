import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
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
  recallBatchCommand,
  REGULATOR_CONTEXT,
} from "../../scenarios/coffee-traceability/commands";
import { GREEN_COFFEE_BATCH_ID } from "../../scenarios/coffee-traceability/stages";
import recallInvestigationImage from "../../assets/illustrations/recall-investigation.webp";

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
  const { stage } = useScenario();
  const { state } = useSimulation();
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
  const scope = calculateRecallScope(GREEN_COFFEE_BATCH_ID, state.domain);

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

  return (
    <StageShell
      stageId={ScenarioStageId.RECALL_AND_DEBRIEF}
      briefing={<RecallBriefing />}
    >
      {scopeCheck !== undefined ? <KnowledgeCheckPanel check={scopeCheck} /> : null}

      {hasScope ? (
        <section className="card">
          <h3>{t("stage.recallAndDebrief.selectedHeading")}</h3>

          <ul className="recall-scope__list">
            {selectedAssetIds.map((assetId) => (
              <RecallJustificationItem key={assetId} assetId={assetId} />
            ))}
          </ul>

          {accuracy.missed.length > 0 ? (
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
            {accuracy.isExact ? (
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

      {hasScope ? (
        <TransactionAction
          decisionId="INT_RECALL_COMMITTED"
          labelKey="stage.recallAndDebrief.recallAction"
          isFirstOfType
          summary={[
            ["stage.recallAndDebrief.selectedHeading", selectedAssetIds.join(", ")],
            ["field.reason", t("stage.recallAndDebrief.scopeHeading")],
          ]}
          buildCommand={() => recallBatchCommand(selectedAssetIds)}
          context={REGULATOR_CONTEXT}
        />
      ) : (
        <p className="muted">{t("stage.recallAndDebrief.recallPending")}</p>
      )}

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
  const { state } = useSimulation();

  const nameOf = (id: string): string => state.domain.assetsById[id]?.productName ?? id;
  const justification = justifyRecallSelection(assetId, GREEN_COFFEE_BATCH_ID, state.domain);

  return (
    <li className="recall-scope__item">
      <p className="recall-scope__asset">
        {/* A classification of the goods, not a verdict on the answer. Whether
            the learner was right is the accuracy summary's job, stated
            separately -- an affected lot they correctly identified must not be
            handed a rejection cross for getting it right. */}
        <ClassificationPill tone={justification.isAffected ? "affected" : "unaffected"}>
          {t(
            justification.isAffected
              ? "stage.recallAndDebrief.affected"
              : "stage.recallAndDebrief.notAffected",
          )}
        </ClassificationPill>{" "}
        <strong>{nameOf(assetId)}</strong> <code>{assetId}</code>
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
          <code>{GREEN_COFFEE_BATCH_ID}</code>
        </p>
      </div>
    </section>
  );
}

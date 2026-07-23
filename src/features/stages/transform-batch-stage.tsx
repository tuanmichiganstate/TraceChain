import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { TransactionAction } from "../../components/transaction-action";
import { ProvenanceViewer } from "../../components/provenance-viewer";
import { commandContext, runtimeCommand } from "../../domain/scenario/runtime";
import type { TransformBatchCommand } from "../../domain/commands/commands";

/**
 * Stage 6. One batch becomes another, and the link between them survives.
 *
 * The yield is real: roasting drives off moisture, so 100 kg of green coffee
 * gives about 82 kg roasted. The provenance viewer appears as soon as the
 * transformation commits, because seeing the edge is what makes the recall
 * three stages later comprehensible rather than magical.
 */
export function TransformBatchStage(): ReactNode {
  const t = useTranslator();
  const { stage, scenario } = useScenario();
  const { state } = useSimulation();
  const definition = stage(ScenarioStageId.TRANSFORM_BATCH);
  const provenanceCheck = definition?.knowledgeChecks[0];

  const command = runtimeCommand<TransformBatchCommand>(scenario, "TRANSFORM_BATCH");
  const sourceBatchId = scenario.runtime.assetRoles.sourceBatchId;
  const transformedBatchId = scenario.runtime.assetRoles.transformedBatchId;
  const input = state.domain.assetsById[sourceBatchId];
  const hasRoasted = state.domain.assetsById[transformedBatchId] !== undefined;

  return (
    <StageShell stageId={ScenarioStageId.TRANSFORM_BATCH}>
      <section className="card card--reference">
        <h3>{t("stage.transformBatch.yieldHeading")}</h3>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.input")}</dt>
            <dd>{input?.quantity ?? command.outputQuantity} kg — {t("organizations.producerCoop.name")}</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.output")}</dt>
            <dd>{command.outputQuantity} kg</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.lossLabel")}</dt>
            <dd>{Math.max(0, (input?.quantity ?? command.outputQuantity) - command.outputQuantity)} kg</dd>
          </div>
        </dl>
        <p className="muted">{t("stage.transformBatch.yieldNotice")}</p>
      </section>

      <TransactionAction
        decisionId="INT_TRANSFORM_BATCH"
        actionId="TRANSFORM_BATCH"
        labelKey="stage.transformBatch.transformAction"
        isFirstOfType
        summary={[
          ["stage.transformBatch.input", <code key="i">{sourceBatchId}</code>],
          ["stage.transformBatch.output", <code key="o">{transformedBatchId}</code>],
          ["field.quantity", `${command.outputQuantity} kg`],
        ]}
        buildCommand={() => runtimeCommand<TransformBatchCommand>(scenario, "TRANSFORM_BATCH")}
        context={commandContext(scenario, "TRANSFORM_BATCH")}
      />

      {hasRoasted ? (
        <section className="card card--reference">
          <ProvenanceViewer state={state.domain} rootAssetId={transformedBatchId} />
        </section>
      ) : null}

      {provenanceCheck !== undefined ? <KnowledgeCheckPanel check={provenanceCheck} /> : null}
    </StageShell>
  );
}

import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { TransactionAction } from "../../components/transaction-action";
import { ProvenanceViewer } from "../../components/provenance-viewer";
import {
  PROCESSOR_CONTEXT,
  transformBatchCommand,
} from "../../scenarios/coffee-traceability/commands";
import {
  GREEN_COFFEE_BATCH_ID,
  ROASTED_COFFEE_BATCH_ID,
} from "../../scenarios/coffee-traceability/stages";

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
  const { stage } = useScenario();
  const { state } = useSimulation();
  const definition = stage(ScenarioStageId.TRANSFORM_BATCH);
  const provenanceCheck = definition?.knowledgeChecks[0];

  const hasRoasted = state.domain.assetsById[ROASTED_COFFEE_BATCH_ID] !== undefined;

  return (
    <StageShell stageId={ScenarioStageId.TRANSFORM_BATCH}>
      <section className="card">
        <h3>{t("stage.transformBatch.yieldHeading")}</h3>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.input")}</dt>
            <dd>100 kg — {t("organizations.producerCoop.name")}</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.output")}</dt>
            <dd>82 kg</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.lossLabel")}</dt>
            <dd>18 kg (18%)</dd>
          </div>
        </dl>
        <p className="muted">{t("stage.transformBatch.yieldNotice")}</p>
      </section>

      <TransactionAction
        decisionId="INT_TRANSFORM_BATCH"
        labelKey="stage.transformBatch.transformAction"
        isFirstOfType
        summary={[
          ["stage.transformBatch.input", <code key="i">{GREEN_COFFEE_BATCH_ID}</code>],
          ["stage.transformBatch.output", <code key="o">{ROASTED_COFFEE_BATCH_ID}</code>],
          ["field.quantity", "82 kg"],
        ]}
        buildCommand={transformBatchCommand}
        context={PROCESSOR_CONTEXT}
      />

      {hasRoasted ? (
        <section className="card">
          <ProvenanceViewer state={state.domain} rootAssetId={ROASTED_COFFEE_BATCH_ID} />
        </section>
      ) : null}

      {provenanceCheck !== undefined ? <KnowledgeCheckPanel check={provenanceCheck} /> : null}
    </StageShell>
  );
}

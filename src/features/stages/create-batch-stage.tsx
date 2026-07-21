import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { TransactionAction } from "../../components/transaction-action";
import { AssetCard } from "../../components/asset-card";
import { LedgerExplorer } from "../../components/ledger-explorer";
import {
  PRODUCER_CONTEXT,
  createBatchCommand,
} from "../../scenarios/coffee-traceability/commands";
import { GREEN_COFFEE_BATCH_ID } from "../../scenarios/coffee-traceability/stages";

/**
 * Stage 2. The first record, and the first block.
 *
 * This is the one stage that shows the whole transaction ceremony expanded and
 * makes sealing the block an explicit action. Ordering and commitment are
 * genuinely separate steps, and this is where a learner gets to watch the
 * second one happen rather than read that it exists.
 */
export function CreateBatchStage(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const asset = state.domain.assetsById[GREEN_COFFEE_BATCH_ID];
  const hasBlock = state.domain.blockOrder.length > 0;

  return (
    <StageShell stageId={ScenarioStageId.CREATE_BATCH}>
      <TransactionAction
        decisionId="INT_CREATE_BATCH"
        labelKey="stage.createBatch.formHeading"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{GREEN_COFFEE_BATCH_ID}</code>],
          ["field.productName", "Arabica"],
          ["field.originLocation", t("locations.producerFarm.name")],
          ["field.quantity", "100 kg"],
          ["field.owner", t("organizations.producerCoop.name")],
          ["field.custodian", t("organizations.producerCoop.name")],
        ]}
        buildCommand={createBatchCommand}
        context={PRODUCER_CONTEXT}
      />

      {asset !== undefined ? (
        <section>
          <h3>{t("state.title")}</h3>
          <AssetCard asset={asset} />
        </section>
      ) : null}

      {hasBlock ? <LedgerExplorer state={state.domain} /> : null}
    </StageShell>
  );
}

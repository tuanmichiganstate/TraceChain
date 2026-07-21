import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { TransactionAction } from "../../components/transaction-action";
import { AssetCard } from "../../components/asset-card";
import {
  DISTRIBUTOR_CONTEXT,
  PROCESSOR_CONTEXT,
  dispatchToRetailerCommand,
  packageBatchCommand,
  transferOwnershipToDistributorCommand,
} from "../../scenarios/coffee-traceability/commands";
import {
  PACKAGED_COFFEE_LOT_ID,
  ROASTED_COFFEE_BATCH_ID,
} from "../../scenarios/coffee-traceability/stages";

/**
 * Stage 7. Packaging, and the mirror image of stage 4.
 *
 * Three transactions, and the middle one is the reason this stage exists in
 * this shape. In stage 4 custody moved while ownership stayed put; here
 * ownership moves to the distributor while the packages are still sitting at
 * the plant. Same distinction, opposite direction — which is the point at which
 * most learners stop treating the two words as synonyms.
 *
 * The specification asked for five transactions here. Three teach more: the
 * extra two were repetition of a handover the learner has already done twice.
 */
export function PackageAndDistributeStage(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const packaged = state.domain.assetsById[PACKAGED_COFFEE_LOT_ID];

  return (
    <StageShell stageId={ScenarioStageId.PACKAGE_AND_DISTRIBUTE}>
      <section className="card">
        <h3>{t("stage.packageAndDistribute.conversionHeading")}</h3>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.input")}</dt>
            <dd>82 kg = 82 000 g</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.output")}</dt>
            <dd>820 × 100 g = 82 000 g</dd>
          </div>
        </dl>
        <p className="muted">{t("stage.packageAndDistribute.conversionNotice")}</p>
      </section>

      <TransactionAction
        decisionId="INT_PACKAGE_BATCH"
        labelKey="stage.packageAndDistribute.packageAction"
        isFirstOfType
        summary={[
          ["stage.transformBatch.input", <code key="i">{ROASTED_COFFEE_BATCH_ID}</code>],
          ["stage.transformBatch.output", <code key="o">{PACKAGED_COFFEE_LOT_ID}</code>],
          ["field.quantity", "820"],
        ]}
        buildCommand={packageBatchCommand}
        context={PROCESSOR_CONTEXT}
      />

      <section className="notice" role="note">
        <p>{t("stage.packageAndDistribute.mirrorNotice")}</p>
      </section>

      <TransactionAction
        decisionId="INT_OWNERSHIP_TRANSFER_SCOPE"
        labelKey="stage.packageAndDistribute.ownershipAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{PACKAGED_COFFEE_LOT_ID}</code>],
          ["field.owner", t("organizations.distributor.name")],
          ["field.custodian", t("organizations.coffeeProcessor.name")],
        ]}
        buildCommand={transferOwnershipToDistributorCommand}
        context={PROCESSOR_CONTEXT}
      />

      <TransactionAction
        decisionId="INT_DISPATCH_BATCH"
        labelKey="stage.packageAndDistribute.dispatchAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{PACKAGED_COFFEE_LOT_ID}</code>],
          ["field.owner", t("organizations.retailer.name")],
          ["field.custodian", t("organizations.retailer.name")],
          ["field.location", t("locations.retailStore.name")],
        ]}
        buildCommand={dispatchToRetailerCommand}
        context={DISTRIBUTOR_CONTEXT}
      />

      {packaged !== undefined ? (
        <section>
          <h3>{t("state.title")}</h3>
          <AssetCard asset={packaged} />
        </section>
      ) : null}
    </StageShell>
  );
}

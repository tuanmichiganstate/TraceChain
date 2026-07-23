import type { ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { TransactionAction } from "../../components/transaction-action";
import { AssetCard } from "../../components/asset-card";
import { useScenario } from "../../app/providers/scenario-provider";
import { commandContext, runtimeCommand } from "../../domain/scenario/runtime";
import type {
  DispatchBatchCommand,
  PackageBatchCommand,
  TransferOwnershipCommand,
} from "../../domain/commands/commands";

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
  const { scenario } = useScenario();
  const { state } = useSimulation();
  const packageCommand = runtimeCommand<PackageBatchCommand>(scenario, "PACKAGE_BATCH");
  const transformedBatchId = scenario.runtime.assetRoles.transformedBatchId;
  const packagedLotId = scenario.runtime.assetRoles.primaryPackagedLotId;
  const transformed = state.domain.assetsById[transformedBatchId];
  const packaged = state.domain.assetsById[packagedLotId];
  const inputGrams =
    (transformed?.quantity ?? packageCommand.packageCount) *
    (transformed?.quantityUnit === "KG" ? 1000 : 1);
  const outputGrams = packageCommand.packageCount * packageCommand.packageSizeGrams;

  return (
    <StageShell stageId={ScenarioStageId.PACKAGE_AND_DISTRIBUTE}>
      <section className="card card--reference">
        <h3>{t("stage.packageAndDistribute.conversionHeading")}</h3>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.input")}</dt>
            <dd>{transformed?.quantity ?? 0} kg = {inputGrams} g</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.transformBatch.output")}</dt>
            <dd>{packageCommand.packageCount} × {packageCommand.packageSizeGrams} g = {outputGrams} g</dd>
          </div>
        </dl>
        <p className="muted">{t("stage.packageAndDistribute.conversionNotice")}</p>
      </section>

      <TransactionAction
        decisionId="INT_PACKAGE_BATCH"
        actionId="PACKAGE_BATCH"
        labelKey="stage.packageAndDistribute.packageAction"
        isFirstOfType
        summary={[
          ["stage.transformBatch.input", <code key="i">{transformedBatchId}</code>],
          ["stage.transformBatch.output", <code key="o">{packagedLotId}</code>],
          ["field.quantity", String(packageCommand.packageCount)],
        ]}
        buildCommand={() => runtimeCommand<PackageBatchCommand>(scenario, "PACKAGE_BATCH")}
        context={commandContext(scenario, "PACKAGE_BATCH")}
      />

      <section className="notice" role="note">
        <p>{t("stage.packageAndDistribute.mirrorNotice")}</p>
      </section>

      <TransactionAction
        decisionId="INT_OWNERSHIP_TRANSFER_SCOPE"
        actionId="TRANSFER_OWNERSHIP"
        labelKey="stage.packageAndDistribute.ownershipAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{packagedLotId}</code>],
          ["field.owner", t("organizations.distributor.name")],
          ["field.custodian", t("organizations.coffeeProcessor.name")],
        ]}
        buildCommand={() =>
          runtimeCommand<TransferOwnershipCommand>(scenario, "TRANSFER_OWNERSHIP")
        }
        context={commandContext(scenario, "TRANSFER_OWNERSHIP")}
      />

      <TransactionAction
        decisionId="INT_DISPATCH_BATCH"
        actionId="DISPATCH_BATCH"
        labelKey="stage.packageAndDistribute.dispatchAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{packagedLotId}</code>],
          ["field.owner", t("organizations.retailer.name")],
          ["field.custodian", t("organizations.retailer.name")],
          ["field.location", t("locations.retailStore.name")],
        ]}
        buildCommand={() => runtimeCommand<DispatchBatchCommand>(scenario, "DISPATCH_BATCH")}
        context={commandContext(scenario, "DISPATCH_BATCH")}
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

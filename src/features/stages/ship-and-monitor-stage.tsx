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
import { AssetCard } from "../../components/asset-card";
import { commandContext, runtimeCommand } from "../../domain/scenario/runtime";
import type {
  RecordTransportConditionCommand,
  TransferCustodyCommand,
} from "../../domain/commands/commands";

/**
 * Stage 4. The handover, and what travels with it.
 *
 * The learner answers what the transaction transfers, and that answer *becomes*
 * the transaction. Choosing "both ownership and custody" is not a wrong tick on
 * a quiz -- it builds a command the rule engine rejects, with a message
 * explaining why a haulier holding your coffee has not bought it. The mark and
 * the mechanic cannot disagree.
 *
 * The role then switches mid-stage: the producer hands over, the carrier
 * records what the sensor saw. That handover is the reason stages 4 and 5 of
 * the specification were merged into one.
 */
export function ShipAndMonitorStage(): ReactNode {
  const t = useTranslator();
  const { stage, scenario } = useScenario();
  const { state } = useSimulation();
  const definition = stage(ScenarioStageId.SHIP_AND_MONITOR);
  const [scopeCheck, transportCheck] = definition?.knowledgeChecks ?? [];

  /** Set once the learner has answered; drives the command they then submit. */
  const [transfersOwnership, setTransfersOwnership] = useState<boolean | null>(null);

  const sourceBatchId = scenario.runtime.assetRoles.sourceBatchId;
  const sensorCommand = runtimeCommand<RecordTransportConditionCommand>(
    scenario,
    "RECORD_TRANSPORT",
  );
  const asset = state.domain.assetsById[sourceBatchId];
  const custodyCommitted = Object.values(
    state.domain.transactionsById,
  ).some(
    (transaction) =>
      transaction.transactionType === TransactionType.TRANSFER_CUSTODY &&
      transaction.transactionStatus === TransactionStatus.COMMITTED,
  );

  return (
    <StageShell stageId={ScenarioStageId.SHIP_AND_MONITOR}>
      {asset !== undefined ? (
        <section>
          <h3>{t("state.title")}</h3>
          <AssetCard asset={asset} />
        </section>
      ) : null}

      {scopeCheck !== undefined ? (
        <KnowledgeCheckPanel
          check={scopeCheck}
          onAnswered={(isCorrect) => {
            // A learner who answered "custody only" submits a valid transfer;
            // anyone else submits the one the rules refuse, and reads why.
            setTransfersOwnership(!isCorrect);
          }}
        />
      ) : null}

      {transfersOwnership !== null ? (
        <TransactionAction
          decisionId="INT_CUSTODY_TRANSFERRED_TRANSACTION"
          actionId="TRANSFER_CUSTODY"
          labelKey="stage.shipAndMonitor.custodyAction"
          isFirstOfType
          summary={[
            ["field.assetId", <code key="a">{sourceBatchId}</code>],
            ["field.custodian", t("organizations.logisticsProvider.name")],
            [
              "field.owner",
              transfersOwnership
                ? t("organizations.logisticsProvider.name")
                : t("organizations.producerCoop.name"),
            ],
            ["field.location", t("locations.transitStation.name")],
          ]}
          buildCommand={() =>
            runtimeCommand<TransferCustodyCommand>(scenario, "TRANSFER_CUSTODY", {
              alsoTransfersOwnership: transfersOwnership,
            })
          }
          context={commandContext(scenario, "TRANSFER_CUSTODY")}
        />
      ) : null}

      <section className="card card--reference">
        <h3>{t("stage.shipAndMonitor.sensorHeading")}</h3>
        <p>{t("stage.shipAndMonitor.roleSwitch")}</p>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("field.sensorId")}</dt>
            <dd>
              <code>{sensorCommand.sensorId}</code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.humidity")}</dt>
            <dd>{sensorCommand.humidityPercent}%</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.humidityLimit")}</dt>
            <dd>{sensorCommand.allowedMaximumHumidityPercent}%</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.location")}</dt>
            <dd>{t("locations.transitStation.name")}</dd>
          </div>
        </dl>
        <p className="muted">{t("stage.shipAndMonitor.oracleNotice")}</p>
      </section>

      {transportCheck !== undefined ? <KnowledgeCheckPanel check={transportCheck} /> : null}

      {custodyCommitted ? (
        <TransactionAction
          decisionId="INT_TRANSPORT_RECORDED_TRANSACTION"
          actionId="RECORD_TRANSPORT"
          labelKey="stage.shipAndMonitor.transportAction"
          isFirstOfType
          summary={[
            ["field.assetId", <code key="a">{sourceBatchId}</code>],
            ["field.humidity", `${sensorCommand.humidityPercent}%`],
            ["field.complianceStatus", t("compliance.INSPECTION_REQUIRED")],
          ]}
          buildCommand={() =>
            runtimeCommand<RecordTransportConditionCommand>(
              scenario,
              "RECORD_TRANSPORT",
            )
          }
          context={commandContext(scenario, "RECORD_TRANSPORT")}
        />
      ) : (
        <section className="card card--work">
          <h3>{t("stage.shipAndMonitor.transportAction")}</h3>
          <p className="muted">
            {t("stage.shipAndMonitor.transportLocked")}
          </p>
        </section>
      )}
    </StageShell>
  );
}

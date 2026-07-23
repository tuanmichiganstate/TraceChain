import { useState, type ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { TransactionAction } from "../../components/transaction-action";
import { AssetCard } from "../../components/asset-card";
import {
  LOGISTICS_CONTEXT,
  PRODUCER_CONTEXT,
  recordTransportConditionCommand,
  transferCustodyCommand,
} from "../../scenarios/coffee-traceability/commands";
import { GREEN_COFFEE_BATCH_ID } from "../../scenarios/coffee-traceability/stages";

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
  const { stage } = useScenario();
  const { state } = useSimulation();
  const definition = stage(ScenarioStageId.SHIP_AND_MONITOR);
  const [scopeCheck, transportCheck] = definition?.knowledgeChecks ?? [];

  /** Set once the learner has answered; drives the command they then submit. */
  const [transfersOwnership, setTransfersOwnership] = useState<boolean | null>(null);

  const asset = state.domain.assetsById[GREEN_COFFEE_BATCH_ID];

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
          labelKey="stage.shipAndMonitor.custodyAction"
          isFirstOfType
          summary={[
            ["field.assetId", <code key="a">{GREEN_COFFEE_BATCH_ID}</code>],
            ["field.custodian", t("organizations.logisticsProvider.name")],
            [
              "field.owner",
              transfersOwnership
                ? t("organizations.logisticsProvider.name")
                : t("organizations.producerCoop.name"),
            ],
            ["field.location", t("locations.transitStation.name")],
          ]}
          buildCommand={() => transferCustodyCommand(transfersOwnership)}
          context={PRODUCER_CONTEXT}
        />
      ) : null}

      <section className="card card--reference">
        <h3>{t("stage.shipAndMonitor.sensorHeading")}</h3>
        <p>{t("stage.shipAndMonitor.roleSwitch")}</p>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("field.sensorId")}</dt>
            <dd>
              <code>SENSOR_HUMIDITY_001</code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.humidity")}</dt>
            <dd>72%</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.humidityLimit")}</dt>
            <dd>70%</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.location")}</dt>
            <dd>{t("locations.transitStation.name")}</dd>
          </div>
        </dl>
        <p className="muted">{t("stage.shipAndMonitor.oracleNotice")}</p>
      </section>

      {transportCheck !== undefined ? <KnowledgeCheckPanel check={transportCheck} /> : null}

      <TransactionAction
        decisionId="INT_TRANSPORT_RECORDED_TRANSACTION"
        labelKey="stage.shipAndMonitor.transportAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{GREEN_COFFEE_BATCH_ID}</code>],
          ["field.humidity", "72%"],
          ["field.complianceStatus", t("compliance.INSPECTION_REQUIRED")],
        ]}
        buildCommand={recordTransportConditionCommand}
        context={LOGISTICS_CONTEXT}
      />
    </StageShell>
  );
}

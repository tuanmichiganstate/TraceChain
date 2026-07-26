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
import { EndorsedTransactionAction } from "../../components/endorsed-transaction-action";
import { AssetCard } from "../../components/asset-card";
import { commandContext, runtimeCommand } from "../../domain/scenario/runtime";
import type {
  RecordTransportConditionCommand,
  TransferCustodyCommand,
} from "../../domain/commands/commands";
import { useOptionalConfiguration } from "../../app/providers/configuration-provider";
import {
  decodeAnswer,
  isAnswerCorrect,
} from "../../domain/scenario/answer-codec";
import { RoleApplicationShell } from "../../components/simulation-workspace";
import { StatusPill } from "../../components/status-pill";
import { RoleHandoffPanel } from "../../components/staff-presence";

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
  const configuration = useOptionalConfiguration();
  const definition = stage(ScenarioStageId.SHIP_AND_MONITOR);
  const [scopeCheck, transportCheck] = definition?.knowledgeChecks ?? [];

  /** Set once the learner has answered; drives the command they then submit. */
  const [currentTransfersOwnership, setTransfersOwnership] =
    useState<boolean | null>(null);
  const restoredScopeDecision =
    scopeCheck === undefined
      ? undefined
      : state.decisions[scopeCheck.knowledgeCheckId];
  const restoredTransfersOwnership =
    scopeCheck === undefined ||
    restoredScopeDecision === undefined
      ? null
      : !isAnswerCorrect(
          scopeCheck,
          decodeAnswer(
            scopeCheck,
            restoredScopeDecision.encodedValue,
          ),
        );
  const transfersOwnership =
    currentTransfersOwnership ??
    restoredTransfersOwnership;

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
  const custodyProposalSubmitted = Object.values(
    state.simulation.pendingProposalsById,
  ).some(
    (proposal) =>
      proposal.actionId === "TRANSFER_CUSTODY" &&
      proposal.status !== "SUPERSEDED",
  );
  const transportCommitted = Object.values(
    state.domain.transactionsById,
  ).some(
    (transaction) =>
      transaction.transactionType ===
        TransactionType.RECORD_TRANSPORT_CONDITION &&
      transaction.transactionStatus === TransactionStatus.COMMITTED,
  );
  const CustodyTransactionAction =
    configuration?.configuration.technicalFeatures
      .endorsementPolicies === true
      ? EndorsedTransactionAction
      : TransactionAction;
  const workspaceStatus = transportCommitted
    ? t("stage.shipAndMonitor.workspace.statusRecorded")
    : custodyCommitted
      ? t("stage.shipAndMonitor.workspace.statusInTransit")
      : custodyProposalSubmitted
        ? t("stage.shipAndMonitor.workspace.statusAwaitingReceiver")
        : transfersOwnership === null
          ? t("stage.shipAndMonitor.workspace.statusReview")
          : t("stage.shipAndMonitor.workspace.statusReady");

  return (
    <StageShell stageId={ScenarioStageId.SHIP_AND_MONITOR}>
      <RoleApplicationShell
        eyebrow={t("stage.shipAndMonitor.workspace.eyebrow")}
        title={t("stage.shipAndMonitor.workspace.title")}
        description={t("stage.shipAndMonitor.workspace.description")}
        statusLabel={t("stage.shipAndMonitor.workspace.statusLabel")}
        status={
          <StatusPill tone={transportCommitted ? "pass" : "neutral"}>
            {workspaceStatus}
          </StatusPill>
        }
      >
        {asset !== undefined ? (
          <section
            className="field-handoff__shipment"
            aria-labelledby="field-handoff-shipment-heading"
          >
            <p className="eyebrow">
              {t("stage.shipAndMonitor.workspace.shipmentLayer")}
            </p>
            <h4 id="field-handoff-shipment-heading">
              {t("stage.shipAndMonitor.workspace.shipmentHeading")}
            </h4>
            <AssetCard asset={asset} />
          </section>
        ) : null}

        <RoleHandoffPanel
          fromActorId={definition?.activeActorIds[0] ?? ""}
          toActorId={definition?.activeActorIds[1] ?? ""}
          explanatoryTextKey="staff.handoff.custodyHelp"
        />

        <div className="field-handoff__workflow">
          <section
            className="field-handoff__phase"
            aria-labelledby="field-handoff-custody-heading"
          >
            <p className="eyebrow">
              {t("stage.shipAndMonitor.workspace.handoffLayer")}
            </p>
            <h4 id="field-handoff-custody-heading">
              {t("stage.shipAndMonitor.workspace.handoffHeading")}
            </h4>

            {scopeCheck !== undefined ? (
              <KnowledgeCheckPanel
                check={scopeCheck}
                presentation="professional"
                layerLabelKey="stage.shipAndMonitor.workspace.scopeDecisionLabel"
                isLocked={
                  custodyProposalSubmitted || custodyCommitted
                }
                onAnswered={(isCorrect) => {
                  // A learner who answered "custody only" submits a valid transfer;
                  // anyone else submits the one the rules refuse, and reads why.
                  setTransfersOwnership(!isCorrect);
                }}
              />
            ) : null}

            {transfersOwnership !== null ? (
              <CompactTransactionReceipt
                isCommitted={custodyCommitted}
                label={t("stage.shipAndMonitor.workspace.custodyReceipt")}
              >
                <CustodyTransactionAction
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
                    runtimeCommand<TransferCustodyCommand>(
                      scenario,
                      "TRANSFER_CUSTODY",
                      {
                        alsoTransfersOwnership: transfersOwnership,
                      },
                    )
                  }
                  context={commandContext(scenario, "TRANSFER_CUSTODY")}
                />
              </CompactTransactionReceipt>
            ) : null}
          </section>

          <section
            className="field-handoff__phase"
            aria-labelledby="field-handoff-monitor-heading"
          >
            <p className="eyebrow">
              {t("stage.shipAndMonitor.workspace.monitorLayer")}
            </p>
            <h4 id="field-handoff-monitor-heading">
              {t("stage.shipAndMonitor.workspace.monitorHeading")}
            </h4>

            <details className="field-inspector">
              <summary>
                <span>
                  <strong>{t("stage.shipAndMonitor.sensorHeading")}</strong>
                  <small>{t("stage.shipAndMonitor.workspace.sensorPrompt")}</small>
                </span>
                <StatusPill tone="warn">
                  {sensorCommand.humidityPercent}% / {sensorCommand.allowedMaximumHumidityPercent}%
                </StatusPill>
              </summary>
              <div className="field-inspector__body">
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
              </div>
            </details>

            {transportCheck !== undefined ? (
              <KnowledgeCheckPanel check={transportCheck} />
            ) : null}

            {custodyCommitted ? (
              <CompactTransactionReceipt
                isCommitted={transportCommitted}
                label={t("stage.shipAndMonitor.workspace.transportReceipt")}
              >
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
              </CompactTransactionReceipt>
            ) : (
              <section className="card card--work field-handoff__locked">
                <h3>{t("stage.shipAndMonitor.transportAction")}</h3>
                <p className="muted">
                  {t("stage.shipAndMonitor.transportLocked")}
                </p>
              </section>
            )}
          </section>
        </div>
      </RoleApplicationShell>
    </StageShell>
  );
}

function CompactTransactionReceipt({
  isCommitted,
  label,
  children,
}: {
  readonly isCommitted: boolean;
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  const t = useTranslator();

  if (!isCommitted) return children;

  return (
    <details className="field-handoff__receipt">
      <summary>
        <StatusPill tone="pass">{label}</StatusPill>
        <span>{t("stage.shipAndMonitor.workspace.viewReceipt")}</span>
      </summary>
      <div className="field-handoff__receipt-body">
        {children}
      </div>
    </details>
  );
}

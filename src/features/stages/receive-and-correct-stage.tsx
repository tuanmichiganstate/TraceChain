import { useState, type ReactNode } from "react";
import {
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { TransactionAction } from "../../components/transaction-action";
import { AssetCard } from "../../components/asset-card";
import { StatusPill } from "../../components/status-pill";
import {
  MANIFEST_QUANTITY_KG,
  PRODUCER_CONTEXT,
  PROCESSOR_CONTEXT,
  SHIPPING_MANIFEST_ANCHOR_ID,
  WEIGHED_QUANTITY_KG,
  purchaseOnReceiptCommand,
  receiveBatchCommand,
  recordCorrectionCommand,
} from "../../scenarios/coffee-traceability/commands";
import { GREEN_COFFEE_BATCH_ID } from "../../scenarios/coffee-traceability/stages";
import type { AnchorDocumentCommand } from "../../domain/commands/commands";
import { resolveEffectiveValue } from "../../domain/ledger/effective-value";

const MINIMUM_REASON_LENGTH = 10;

/**
 * Stage 5. The error that is already on the ledger.
 *
 * The dispatch manifest says 1000 kg. The scales say 100. The learner did not
 * enter the wrong figure and cannot edit it away -- it arrived from another
 * organization and is committed. The only thing they can do is add a correction
 * that says what was wrong, what it should be, and why, with the original left
 * exactly as it was.
 *
 * That constraint is the whole stage. Every learner meets it, rather than only
 * those who fail to spot a typo.
 */
export function ReceiveAndCorrectStage(): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const asset = state.domain.assetsById[GREEN_COFFEE_BATCH_ID];

  const receiptTransaction = Object.values(state.domain.transactionsById).find(
    (transaction) =>
      transaction.transactionType === TransactionType.RECEIVE_BATCH &&
      transaction.transactionStatus === TransactionStatus.COMMITTED,
  );
  const manifestTransaction = state.domain.transactionOrder
    .map((transactionId) => state.domain.transactionsById[transactionId])
    .find(
    (transaction) =>
      transaction?.transactionType === TransactionType.ANCHOR_DOCUMENT &&
      transaction.transactionStatus === TransactionStatus.COMMITTED &&
      (transaction.commandPayload as AnchorDocumentCommand).documentAnchorId ===
        SHIPPING_MANIFEST_ANCHOR_ID,
  );
  const manifestTarget = {
    kind: "DOCUMENT_METADATA_FIELD" as const,
    documentAnchorId: SHIPPING_MANIFEST_ANCHOR_ID,
    field: "declaredQuantity" as const,
  };
  const effectiveManifestValue = resolveEffectiveValue(state.domain, manifestTarget)?.effectiveValue;

  return (
    <StageShell stageId={ScenarioStageId.RECEIVE_AND_CORRECT}>
      <section className="card discrepancy">
        <h3>{t("stage.receiveAndCorrect.discrepancyHeading")}</h3>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("stage.receiveAndCorrect.manifestQuantity")}</dt>
            <dd>
              <StatusPill tone="fail">{MANIFEST_QUANTITY_KG} kg</StatusPill>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.receiveAndCorrect.weighedQuantity")}</dt>
            <dd>
              <StatusPill tone="pass">{WEIGHED_QUANTITY_KG} kg</StatusPill>
            </dd>
          </div>
        </dl>
        <p>{t("stage.receiveAndCorrect.discrepancyBody")}</p>
        <p className="muted">{t("message.correction")}</p>
        {manifestTransaction !== undefined ? (
          <dl className="asset-card__grid">
            <div className="asset-card__row">
              <dt>{t("field.documentAnchor")}</dt>
              <dd><code>{SHIPPING_MANIFEST_ANCHOR_ID}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("history.columnTransaction")}</dt>
              <dd><code>{manifestTransaction.transactionId}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("stage.receiveAndCorrect.effectiveQuantity")}</dt>
              <dd>
                {effectiveManifestValue?.kind === "QUANTITY"
                  ? `${effectiveManifestValue.amount} ${effectiveManifestValue.unit}`
                  : `${MANIFEST_QUANTITY_KG} kg`}
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      <TransactionAction
        decisionId="INT_RECEIVE_BATCH"
        labelKey="stage.receiveAndCorrect.receiveAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{GREEN_COFFEE_BATCH_ID}</code>],
          ["field.custodian", t("organizations.coffeeProcessor.name")],
          ["field.quantity", `${WEIGHED_QUANTITY_KG} kg`],
          ["field.location", t("locations.processingPlant.name")],
        ]}
        buildCommand={receiveBatchCommand}
        context={PROCESSOR_CONTEXT}
      />

      <TransactionAction
        decisionId="INT_OWNERSHIP_PURCHASED_TRANSACTION"
        labelKey="stage.receiveAndCorrect.purchaseAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">{GREEN_COFFEE_BATCH_ID}</code>],
          ["field.owner", t("organizations.coffeeProcessor.name")],
          ["field.custodian", t("organizations.coffeeProcessor.name")],
        ]}
        buildCommand={purchaseOnReceiptCommand}
        context={PRODUCER_CONTEXT}
      />

      {receiptTransaction !== undefined && manifestTransaction !== undefined ? (
        <CorrectionPanel correctionOfTransactionId={manifestTransaction.transactionId} />
      ) : null}

      {asset !== undefined ? (
        <section>
          <h3>{t("state.title")}</h3>
          <AssetCard asset={asset} />
        </section>
      ) : null}
    </StageShell>
  );
}

/**
 * The correction needs a reason in the learner's own words.
 *
 * A free-text box is deliberate here, and is not graded text: the rule only
 * requires that *something* explanatory was written. The original record stays
 * unchanged forever, so the reason is the only explanation anyone reading the
 * ledger later will have, and having to write it is the point.
 */
function CorrectionPanel({
  correctionOfTransactionId,
}: {
  correctionOfTransactionId: string;
}): ReactNode {
  const t = useTranslator();
  const { state } = useSimulation();
  const [reason, setReason] = useState(
    state.correctionReason ?? t("stage.receiveAndCorrect.reasonSuggestion"),
  );

  const isReasonUsable = reason.trim().length >= MINIMUM_REASON_LENGTH;

  return (
    <section className="card">
      <h3>{t("stage.receiveAndCorrect.correctionHeading")}</h3>

      <div className="field">
        <label className="field__label" htmlFor="correction-reason">
          {t("field.correctionReason")}
        </label>
        <textarea
          id="correction-reason"
          className="field__control"
          rows={3}
          maxLength={240}
          value={reason}
          aria-describedby="correction-reason-hint"
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="field__hint" id="correction-reason-hint">
          {t("stage.receiveAndCorrect.reasonHint")}
        </p>
      </div>

      {isReasonUsable ? (
        <TransactionAction
          decisionId="INT_CORRECTION_RECORDED"
          labelKey="stage.receiveAndCorrect.correctionAction"
          isFirstOfType
          summary={[
            ["field.correctionOf", <code key="t">{correctionOfTransactionId}</code>],
            ["field.correctionTarget", `${SHIPPING_MANIFEST_ANCHOR_ID}.declaredQuantity`],
            ["field.incorrectValue", `${MANIFEST_QUANTITY_KG} kg`],
            ["field.correctedValue", `${WEIGHED_QUANTITY_KG} kg`],
            ["field.correctionReason", reason],
          ]}
          buildCommand={() => recordCorrectionCommand(correctionOfTransactionId, reason)}
          context={PROCESSOR_CONTEXT}
        />
      ) : (
        <p className="field__error">{t("validation.correctionReasonRequired")}</p>
      )}
    </section>
  );
}

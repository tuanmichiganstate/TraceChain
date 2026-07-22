import { useState, type ReactNode } from "react";
import { ScenarioStageId, TransactionType } from "../../domain/types/enums";
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
  REWEIGHED_QUANTITY_KG,
  WEIGHED_QUANTITY_KG,
  purchaseOnReceiptCommand,
  receiveBatchCommand,
  recordCorrectionCommand,
} from "../../scenarios/coffee-traceability/commands";
import { GREEN_COFFEE_BATCH_ID } from "../../scenarios/coffee-traceability/stages";

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
      transaction.transactionStatus !== "REJECTED",
  );
  const assetCreationTransaction = Object.values(state.domain.transactionsById).find(
    (transaction) =>
      transaction.transactionType === TransactionType.CREATE_BATCH &&
      transaction.transactionStatus !== "REJECTED",
  );

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
        decisionId={null}
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

      {receiptTransaction !== undefined && assetCreationTransaction !== undefined ? (
        <CorrectionPanel correctionOfTransactionId={assetCreationTransaction.transactionId} />
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
  const [reason, setReason] = useState(t("stage.receiveAndCorrect.reasonSuggestion"));

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
            ["field.incorrectValue", `${WEIGHED_QUANTITY_KG} kg`],
            ["field.correctedValue", `${REWEIGHED_QUANTITY_KG} kg`],
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

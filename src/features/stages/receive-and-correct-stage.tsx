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
import { CorrectionLineage } from "../../components/correction-lineage";
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
import { buildEffectiveValueView } from "../../domain/scenario/effective-value-view";
import { formatCorrectionValueLabel } from "../../localization/format-correction-value";
import manifestDiscrepancyImage from "../../assets/illustrations/manifest-discrepancy.webp";

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
  const effectiveManifestValue = buildEffectiveValueView(
    state.domain,
    manifestTarget,
  )?.effectiveValue;
  // Through the display formatter, not the raw enum: this label sits inches
  // from the manifest and scale figures, which are written `1000 kg`.
  const effectiveQuantityLabel =
    effectiveManifestValue === undefined
      ? `${MANIFEST_QUANTITY_KG} kg`
      : formatCorrectionValueLabel(effectiveManifestValue, t);

  return (
    <StageShell
      stageId={ScenarioStageId.RECEIVE_AND_CORRECT}
      briefing={(
        <ManifestDiscrepancy
          manifestTransactionId={manifestTransaction?.transactionId}
          effectiveQuantityLabel={effectiveQuantityLabel}
        />
      )}
    >
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

      {/* Ledger history beside current state. Stage 5 is the one place the two
          genuinely disagree -- the manifest says 1000 kg forever while the
          effective quantity is 100 -- so this is where the activity's third
          objective, distinguishing them, can actually be seen rather than
          reconstructed from two tabs of the reference workspace. */}
      <div className="state-versus-history">
        {manifestTransaction !== undefined ? (
          <CorrectionLineage state={state.domain} target={manifestTarget} />
        ) : null}

        {asset !== undefined ? (
          <section className="card card--reference">
            <h3>{t("state.title")}</h3>
            <AssetCard asset={asset} />
          </section>
        ) : null}
      </div>
    </StageShell>
  );
}

function ManifestDiscrepancy({
  manifestTransactionId,
  effectiveQuantityLabel,
}: {
  manifestTransactionId: string | undefined;
  effectiveQuantityLabel: string;
}): ReactNode {
  const t = useTranslator();

  return (
    <section className="card discrepancy discrepancy--illustrated">
      <figure className="discrepancy__scene">
        <img
          src={manifestDiscrepancyImage}
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          alt={t("stage.receiveAndCorrect.sceneAlt")}
        />
        <figcaption className="discrepancy__comparison" aria-hidden="true">
          <span className="discrepancy__fact discrepancy__fact--manifest">
            <small>{t("stage.receiveAndCorrect.manifestShort")}</small>
            <strong>{MANIFEST_QUANTITY_KG} kg</strong>
          </span>
          <span className="discrepancy__comparison-arrow">→</span>
          <span className="discrepancy__fact discrepancy__fact--scale">
            <small>{t("stage.receiveAndCorrect.scaleShort")}</small>
            <strong>{WEIGHED_QUANTITY_KG} kg</strong>
          </span>
        </figcaption>
      </figure>

      <div className="discrepancy__content">
        <h3>{t("stage.receiveAndCorrect.discrepancyHeading")}</h3>
        {/*
          Two values, neither of them a verdict. The manifest passed every rule
          when the clerk filed it and is committed for good -- it is inaccurate,
          not invalid -- and a scale reading is not a validation result at all.
          These carried the rejection and success glyphs, which mean "failed"
          and "passed" everywhere else in this interface, on a screen where the
          learner has not yet done anything and could reasonably read a red cross
          as their own mistake. The labels already say which figure came from
          where; the disagreement between them is stated in words.
        */}
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("stage.receiveAndCorrect.manifestQuantity")}</dt>
            <dd className="discrepancy__value">{MANIFEST_QUANTITY_KG} kg</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.receiveAndCorrect.weighedQuantity")}</dt>
            <dd className="discrepancy__value">{WEIGHED_QUANTITY_KG} kg</dd>
          </div>
        </dl>
        <p className="discrepancy__mismatch">{t("stage.receiveAndCorrect.mismatchDetected")}</p>
        <p>{t("stage.receiveAndCorrect.discrepancyBody")}</p>
        <p className="muted">{t("message.correction")}</p>
        {manifestTransactionId !== undefined ? (
          <dl className="asset-card__grid">
            <div className="asset-card__row">
              <dt>{t("field.documentAnchor")}</dt>
              <dd><code>{SHIPPING_MANIFEST_ANCHOR_ID}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("history.columnTransaction")}</dt>
              <dd><code>{manifestTransactionId}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("stage.receiveAndCorrect.effectiveQuantity")}</dt>
              <dd>{effectiveQuantityLabel}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </section>
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
    <section className="card card--work">
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

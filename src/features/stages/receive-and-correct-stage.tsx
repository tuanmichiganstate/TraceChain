import { useState, type ReactNode } from "react";
import {
  ScenarioStageId,
  TransactionStatus,
  TransactionType,
} from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { StageShell } from "../../components/stage-shell";
import { TransactionAction } from "../../components/transaction-action";
import { EndorsedTransactionAction } from "../../components/endorsed-transaction-action";
import { AssetCard } from "../../components/asset-card";
import { CorrectionLineage } from "../../components/correction-lineage";
import type {
  AnchorDocumentCommand,
  ReceiveBatchCommand,
  RecordCorrectionCommand,
  TransferOwnershipCommand,
} from "../../domain/commands/commands";
import { buildEffectiveValueView } from "../../domain/scenario/effective-value-view";
import { commandContext, runtimeCommand } from "../../domain/scenario/runtime";
import { formatCorrectionValueLabel } from "../../localization/format-correction-value";
import manifestDiscrepancyImage from "../../assets/illustrations/manifest-discrepancy.webp";
import {
  evaluateDiscrepancyDecision,
  expandDiscrepancyDecision,
} from "../../domain/simulation/consequential-decisions";
import { JournalOpcode } from "../../domain/simulation/command-journal";
import type {
  DiscrepancyAction,
  SubmitDiscrepancyDecisionCommand,
} from "../../domain/simulation/types";
import { StatusPill } from "../../components/status-pill";
import { useOptionalConfiguration } from "../../app/providers/configuration-provider";
import { shouldRevealDetailedFeedback } from "../../app/feedback-visibility";
import {
  CaseWorkspaceTabs,
  RoleApplicationShell,
} from "../../components/simulation-workspace";

const MINIMUM_REASON_LENGTH = 10;
type DiscrepancyCauseCode =
  SubmitDiscrepancyDecisionCommand["causeCode"];

interface DiscrepancyFormState {
  readonly action: DiscrepancyAction | "";
  readonly causeCode: DiscrepancyCauseCode | "";
}

const EMPTY_DISCREPANCY_FORM: DiscrepancyFormState = {
  action: "",
  causeCode: "",
};

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
  const { scenario } = useScenario();
  const {
    state,
    isCompleted,
    submitDiscrepancyDecision,
    recordMitigation,
  } = useSimulation();
  const packageConfiguration = useOptionalConfiguration();
  const [discrepancyForm, setDiscrepancyForm] =
    useState<DiscrepancyFormState>(EMPTY_DISCREPANCY_FORM);
  const [isSubmittingDecision, setSubmittingDecision] = useState(false);
  const [isMitigating, setMitigating] = useState(false);
  const sourceBatchId = scenario.runtime.assetRoles.sourceBatchId;
  const manifestAnchorId = scenario.runtime.documentRoles.shippingManifestAnchorId;
  const receipt = runtimeCommand<ReceiveBatchCommand>(scenario, "RECEIVE_BATCH");
  const correction = runtimeCommand<RecordCorrectionCommand>(scenario, "RECORD_CORRECTION");
  const incorrectQuantity =
    correction.incorrectValue.kind === "QUANTITY" ? correction.incorrectValue.amount : 0;
  const correctedQuantity =
    correction.correctedValue.kind === "QUANTITY" ? correction.correctedValue.amount : 0;
  const asset = state.domain.assetsById[sourceBatchId];
  const initialEntry = state.commandJournal.find(
    (entry) => entry.opcode === JournalOpcode.SUBMIT_DISCREPANCY_DECISION,
  );
  const initialDecision =
    initialEntry === undefined
      ? null
      : expandDiscrepancyDecision(initialEntry.values);
  const evaluation =
    initialDecision === null
      ? null
      : evaluateDiscrepancyDecision(initialDecision, scenario);
  const investigationRecorded = state.commandJournal.some(
    (entry) => entry.opcode === JournalOpcode.INVESTIGATE_DISCREPANCY,
  );
  const readyToCorrect =
    evaluation !== null &&
    (evaluation.isScorableCorrect || investigationRecorded);
  const revealDetailedFeedback = shouldRevealDetailedFeedback({
    timing:
      packageConfiguration?.configuration.feedbackTiming ?? "immediate",
    stageId: ScenarioStageId.RECEIVE_AND_CORRECT,
    completedStageIds: state.completedStageIds,
    simulationCompleted: isCompleted,
  });

  const receiptTransaction = Object.values(state.domain.transactionsById).find(
    (transaction) =>
      transaction.transactionType === TransactionType.RECEIVE_BATCH &&
      transaction.transactionStatus === TransactionStatus.COMMITTED,
  );
  const ownershipTransaction = Object.values(
    state.domain.transactionsById,
  ).find(
    (transaction) =>
      transaction.transactionType === TransactionType.TRANSFER_OWNERSHIP &&
      transaction.transactionStatus === TransactionStatus.COMMITTED,
  );
  const manifestTransaction = state.domain.transactionOrder
    .map((transactionId) => state.domain.transactionsById[transactionId])
    .find(
    (transaction) =>
      transaction?.transactionType === TransactionType.ANCHOR_DOCUMENT &&
      transaction.transactionStatus === TransactionStatus.COMMITTED &&
      (transaction.commandPayload as AnchorDocumentCommand).documentAnchorId ===
        manifestAnchorId,
  );
  const manifestTarget = {
    kind: "DOCUMENT_METADATA_FIELD" as const,
    documentAnchorId: manifestAnchorId,
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
      ? `${incorrectQuantity} kg`
      : formatCorrectionValueLabel(effectiveManifestValue, t);
  const correctionSubmitted = Object.values(
    state.domain.transactionsById,
  ).some(
    (transaction) =>
      transaction.transactionType === TransactionType.RECORD_CORRECTION &&
      transaction.transactionStatus === TransactionStatus.COMMITTED,
  );
  const receiptComplete =
    receiptTransaction !== undefined && ownershipTransaction !== undefined;
  const investigationComplete =
    evaluation !== null &&
    (!evaluation.requiresMitigation || investigationRecorded);
  const recommendedTab =
    !receiptComplete
      ? "overview"
      : !investigationComplete
        ? "investigation"
        : !correctionSubmitted
          ? "correction"
          : "history";
  const caseStatusKey =
    !receiptComplete
      ? "stage.receiveAndCorrect.workspace.statusReceiving"
      : initialDecision === null
        ? "stage.receiveAndCorrect.workspace.statusInvestigating"
        : !investigationComplete
          ? "stage.receiveAndCorrect.workspace.statusMitigation"
          : !correctionSubmitted
            ? "stage.receiveAndCorrect.workspace.statusCorrection"
            : "stage.receiveAndCorrect.workspace.statusResolved";

  return (
    <StageShell stageId={ScenarioStageId.RECEIVE_AND_CORRECT}>
      <RoleApplicationShell
        eyebrow={t("stage.receiveAndCorrect.workspace.eyebrow")}
        title={t("stage.receiveAndCorrect.workspace.title")}
        description={t("stage.receiveAndCorrect.workspace.description")}
        statusLabel={t("stage.receiveAndCorrect.workspace.statusLabel")}
        status={(
          <StatusPill
            tone={
              correctionSubmitted
                ? "pass"
                : evaluation?.requiresMitigation === true &&
                    !investigationRecorded
                  ? "warn"
                  : "neutral"
            }
          >
            {t(caseStatusKey)}
          </StatusPill>
        )}
      >
        <CaseWorkspaceTabs
          key={recommendedTab}
          label={t("stage.receiveAndCorrect.workspace.tabsLabel")}
          initialTabId={recommendedTab}
          tabs={[
            {
              id: "overview",
              label: t("stage.receiveAndCorrect.workspace.overview"),
              status: t(
                receiptComplete
                  ? "stage.receiveAndCorrect.workspace.complete"
                  : "stage.receiveAndCorrect.workspace.actionRequired",
              ),
              content: (
                <>
                  <ManifestDiscrepancy
                    manifestTransactionId={manifestTransaction?.transactionId}
                    effectiveQuantityLabel={effectiveQuantityLabel}
                    manifestAnchorId={manifestAnchorId}
                    manifestQuantity={incorrectQuantity}
                    weighedQuantity={correctedQuantity}
                  />
                  <TransactionAction
                    decisionId="INT_RECEIVE_BATCH"
                    actionId="RECEIVE_BATCH"
                    labelKey="stage.receiveAndCorrect.receiveAction"
                    isFirstOfType
                    summary={[
                      ["field.assetId", <code key="a">{sourceBatchId}</code>],
                      [
                        "field.custodian",
                        t("organizations.coffeeProcessor.name"),
                      ],
                      ["field.quantity", `${receipt.observedQuantity} kg`],
                      ["field.location", t("locations.processingPlant.name")],
                    ]}
                    buildCommand={() =>
                      runtimeCommand<ReceiveBatchCommand>(
                        scenario,
                        "RECEIVE_BATCH",
                      )
                    }
                    context={commandContext(scenario, "RECEIVE_BATCH")}
                  />
                  <TransactionAction
                    decisionId="INT_OWNERSHIP_PURCHASED_TRANSACTION"
                    actionId="PURCHASE_ON_RECEIPT"
                    labelKey="stage.receiveAndCorrect.purchaseAction"
                    isFirstOfType
                    summary={[
                      ["field.assetId", <code key="a">{sourceBatchId}</code>],
                      [
                        "field.owner",
                        t("organizations.coffeeProcessor.name"),
                      ],
                      [
                        "field.custodian",
                        t("organizations.coffeeProcessor.name"),
                      ],
                    ]}
                    buildCommand={() =>
                      runtimeCommand<TransferOwnershipCommand>(
                        scenario,
                        "PURCHASE_ON_RECEIPT",
                      )
                    }
                    context={commandContext(scenario, "PURCHASE_ON_RECEIPT")}
                  />
                </>
              ),
            },
            {
              id: "investigation",
              label: t("stage.receiveAndCorrect.workspace.investigation"),
              status: t(
                investigationComplete
                  ? "stage.receiveAndCorrect.workspace.complete"
                  : receiptComplete
                    ? "stage.receiveAndCorrect.workspace.actionRequired"
                    : "stage.receiveAndCorrect.workspace.locked",
              ),
              content:
                receiptTransaction !== undefined &&
                manifestTransaction !== undefined ? (
                  <>
                    {initialDecision === null ? (
                      <DiscrepancyDecisionForm
                        value={discrepancyForm}
                        onChange={setDiscrepancyForm}
                        disabled={state.isReadOnly || isSubmittingDecision}
                        onSubmit={() => {
                          if (
                            discrepancyForm.action === "" ||
                            discrepancyForm.causeCode === ""
                          ) {
                            return;
                          }
                          setSubmittingDecision(true);
                          void submitDiscrepancyDecision({
                            commandType: "SUBMIT_DISCREPANCY_DECISION",
                            action: discrepancyForm.action,
                            causeCode: discrepancyForm.causeCode,
                          }).finally(() => setSubmittingDecision(false));
                        }}
                      />
                    ) : (
                      <DiscrepancyDecisionFeedback
                        decision={initialDecision}
                        isRejected={evaluation?.isRejectedAttempt === true}
                        isCorrect={evaluation?.isScorableCorrect === true}
                        revealDetailedFeedback={revealDetailedFeedback}
                      />
                    )}
                    {evaluation !== null &&
                    evaluation.requiresMitigation &&
                    !investigationRecorded ? (
                      <section className="card card--work professional-decision">
                        <p className="eyebrow">
                          {t("professionalDecision.layerLabel")}
                        </p>
                        <h3>
                          {t("stage.receiveAndCorrect.mitigationHeading")}
                        </h3>
                        <p>
                          {t(
                            evaluation.isRejectedAttempt
                              ? "stage.receiveAndCorrect.rejectedAttempt"
                              : "stage.receiveAndCorrect.mitigationNotice",
                          )}
                        </p>
                        <button
                          type="button"
                          className="button button--secondary"
                          disabled={state.isReadOnly || isMitigating}
                          onClick={() => {
                            setMitigating(true);
                            void recordMitigation({
                              commandType: "INVESTIGATE_DISCREPANCY",
                            }).finally(() => setMitigating(false));
                          }}
                        >
                          {t("stage.receiveAndCorrect.investigate")}
                        </button>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <CaseWorkspaceGate>
                    {t("stage.receiveAndCorrect.workspace.receiveFirst")}
                  </CaseWorkspaceGate>
                ),
            },
            {
              id: "correction",
              label: t("stage.receiveAndCorrect.workspace.correction"),
              status: t(
                correctionSubmitted
                  ? "stage.receiveAndCorrect.workspace.complete"
                  : readyToCorrect
                    ? "stage.receiveAndCorrect.workspace.actionRequired"
                    : "stage.receiveAndCorrect.workspace.locked",
              ),
              content:
                readyToCorrect && manifestTransaction !== undefined ? (
                  <CorrectionPanel
                    correctionOfTransactionId={
                      manifestTransaction.transactionId
                    }
                    manifestAnchorId={manifestAnchorId}
                    manifestQuantity={incorrectQuantity}
                    weighedQuantity={correctedQuantity}
                  />
                ) : (
                  <CaseWorkspaceGate>
                    {t("stage.receiveAndCorrect.workspace.investigateFirst")}
                  </CaseWorkspaceGate>
                ),
            },
            {
              id: "history",
              label: t("stage.receiveAndCorrect.workspace.history"),
              status: t("stage.receiveAndCorrect.workspace.available"),
              content: (
                <div className="state-versus-history">
                  {manifestTransaction !== undefined ? (
                    <CorrectionLineage
                      state={state.domain}
                      target={manifestTarget}
                    />
                  ) : null}
                  {asset !== undefined ? (
                    <section className="card card--reference">
                      <h3>{t("state.title")}</h3>
                      <AssetCard asset={asset} />
                    </section>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </RoleApplicationShell>
    </StageShell>
  );
}

function CaseWorkspaceGate({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="card card--reference case-workspace__gate">
      <p>{children}</p>
    </section>
  );
}

function DiscrepancyDecisionForm({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  readonly value: DiscrepancyFormState;
  readonly onChange: (value: DiscrepancyFormState) => void;
  readonly onSubmit: () => void;
  readonly disabled: boolean;
}): ReactNode {
  const t = useTranslator();
  const actionOptions = [
    ["IGNORE", "stage.receiveAndCorrect.actionIgnore"],
    ["OVERWRITE", "stage.receiveAndCorrect.actionOverwrite"],
    ["DELETE", "stage.receiveAndCorrect.actionDelete"],
    ["APPEND_CORRECTION", "stage.receiveAndCorrect.actionAppend"],
    [
      "INVESTIGATE_THEN_CORRECT",
      "stage.receiveAndCorrect.actionInvestigateThenCorrect",
    ],
  ] as const;
  const causeOptions = [
    ["TYPING_ERROR", "stage.receiveAndCorrect.causeTypingError"],
    ["UNIT_MISMATCH", "stage.receiveAndCorrect.causeUnitMismatch"],
    ["PHYSICAL_LOSS", "stage.receiveAndCorrect.causePhysicalLoss"],
    ["FRAUD", "stage.receiveAndCorrect.causeFraud"],
    ["UNKNOWN", "stage.receiveAndCorrect.causeUnknown"],
  ] as const;

  return (
    <section className="card card--work">
      <h3>{t("stage.receiveAndCorrect.decisionHeading")}</h3>
      <p>{t("stage.receiveAndCorrect.atomicNotice")}</p>
      <label className="field">
        <span className="field__label">
          {t("stage.receiveAndCorrect.proposedAction")}
        </span>
        <select
          className="field__control"
          value={value.action}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              action: event.target.value as DiscrepancyAction | "",
            })
          }
        >
          <option value="">{t("check.chooseCategory")}</option>
          {actionOptions.map(([optionValue, labelKey]) => (
            <option value={optionValue} key={optionValue}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">
          {t("stage.receiveAndCorrect.proposedCause")}
        </span>
        <select
          className="field__control"
          value={value.causeCode}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              causeCode: event.target.value as DiscrepancyCauseCode | "",
            })
          }
        >
          <option value="">{t("check.chooseCategory")}</option>
          {causeOptions.map(([optionValue, labelKey]) => (
            <option value={optionValue} key={optionValue}>
              {t(labelKey)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button button--primary"
        disabled={
          disabled || value.action === "" || value.causeCode === ""
        }
        onClick={onSubmit}
      >
        {t("stage.receiveAndCorrect.commitDecision")}
      </button>
    </section>
  );
}

function DiscrepancyDecisionFeedback({
  decision,
  isRejected,
  isCorrect,
  revealDetailedFeedback,
}: {
  readonly decision: SubmitDiscrepancyDecisionCommand;
  readonly isRejected: boolean;
  readonly isCorrect: boolean;
  readonly revealDetailedFeedback: boolean;
}): ReactNode {
  const t = useTranslator();
  const actionLabelKeys: Readonly<Record<DiscrepancyAction, string>> = {
    IGNORE: "stage.receiveAndCorrect.actionIgnore",
    OVERWRITE: "stage.receiveAndCorrect.actionOverwrite",
    DELETE: "stage.receiveAndCorrect.actionDelete",
    APPEND_CORRECTION: "stage.receiveAndCorrect.actionAppend",
    INVESTIGATE_THEN_CORRECT:
      "stage.receiveAndCorrect.actionInvestigateThenCorrect",
  };
  const causeLabelKeys: Readonly<Record<DiscrepancyCauseCode, string>> = {
    TYPING_ERROR: "stage.receiveAndCorrect.causeTypingError",
    UNIT_MISMATCH: "stage.receiveAndCorrect.causeUnitMismatch",
    PHYSICAL_LOSS: "stage.receiveAndCorrect.causePhysicalLoss",
    FRAUD: "stage.receiveAndCorrect.causeFraud",
    UNKNOWN: "stage.receiveAndCorrect.causeUnknown",
  };
  return (
    <section className="card card--reference">
      <h3>{t("stage.receiveAndCorrect.decisionRecorded")}</h3>
      <p>
        <StatusPill
          tone={
            revealDetailedFeedback
              ? isRejected
                ? "fail"
                : isCorrect
                  ? "pass"
                  : "warn"
              : "neutral"
          }
        >
          {t(
            revealDetailedFeedback
              ? isRejected
                ? "stage.receiveAndCorrect.decisionRejected"
                : isCorrect
                  ? "stage.receiveAndCorrect.decisionSound"
                  : "stage.receiveAndCorrect.decisionNeedsMitigation"
              : "check.recorded",
          )}
        </StatusPill>
      </p>
      <dl className="asset-card__grid">
        <div className="asset-card__row">
          <dt>{t("stage.receiveAndCorrect.proposedAction")}</dt>
          <dd>{t(actionLabelKeys[decision.action])}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("stage.receiveAndCorrect.proposedCause")}</dt>
          <dd>{t(causeLabelKeys[decision.causeCode])}</dd>
        </div>
      </dl>
      <p className="muted">
        {t("stage.receiveAndCorrect.initialLocked")}
      </p>
    </section>
  );
}

function ManifestDiscrepancy({
  manifestTransactionId,
  effectiveQuantityLabel,
  manifestAnchorId,
  manifestQuantity,
  weighedQuantity,
}: {
  manifestTransactionId: string | undefined;
  effectiveQuantityLabel: string;
  manifestAnchorId: string;
  manifestQuantity: number;
  weighedQuantity: number;
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
            <strong>{manifestQuantity} kg</strong>
          </span>
          <span className="discrepancy__comparison-arrow">→</span>
          <span className="discrepancy__fact discrepancy__fact--scale">
            <small>{t("stage.receiveAndCorrect.scaleShort")}</small>
            <strong>{weighedQuantity} kg</strong>
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
            <dd className="discrepancy__value">{manifestQuantity} kg</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("stage.receiveAndCorrect.weighedQuantity")}</dt>
            <dd className="discrepancy__value">{weighedQuantity} kg</dd>
          </div>
        </dl>
        <p className="discrepancy__mismatch">{t("stage.receiveAndCorrect.mismatchDetected")}</p>
        <p>{t("stage.receiveAndCorrect.discrepancyBody")}</p>
        <p className="muted">{t("message.correction")}</p>
        {manifestTransactionId !== undefined ? (
          <dl className="asset-card__grid">
            <div className="asset-card__row">
              <dt>{t("field.documentAnchor")}</dt>
              <dd><code>{manifestAnchorId}</code></dd>
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
  manifestAnchorId,
  manifestQuantity,
  weighedQuantity,
}: {
  correctionOfTransactionId: string;
  manifestAnchorId: string;
  manifestQuantity: number;
  weighedQuantity: number;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state } = useSimulation();
  const packageConfiguration = useOptionalConfiguration();
  const [reason, setReason] = useState(
    state.correctionReason ??
      t(
        scenario.runtime.consequentialCases.discrepancy
          .reasonSuggestionKey,
      ),
  );

  const reasonMaximumBytes =
    scenario.runtime.journalLimits.correctionReasonMaximumUtf8Bytes;
  const reasonByteLength = new TextEncoder().encode(reason).length;
  const isReasonTooLong = reasonByteLength > reasonMaximumBytes;
  const isReasonUsable =
    reason.trim().length >= MINIMUM_REASON_LENGTH && !isReasonTooLong;
  const correctionSubmitted = Object.values(
    state.domain.transactionsById,
  ).some(
    (transaction) =>
      transaction.transactionType === TransactionType.RECORD_CORRECTION &&
      transaction.transactionStatus !== TransactionStatus.REJECTED,
  );
  const CorrectionTransactionAction =
    packageConfiguration?.configuration.technicalFeatures
      .endorsementPolicies === true
      ? EndorsedTransactionAction
      : TransactionAction;

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
          maxLength={scenario.runtime.journalLimits.correctionReasonMaximumUtf8Bytes}
          value={reason}
          disabled={state.isReadOnly || correctionSubmitted}
          aria-describedby={
            isReasonUsable
              ? "correction-reason-hint"
              : "correction-reason-hint correction-reason-error"
          }
          aria-invalid={!isReasonUsable}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="field__hint" id="correction-reason-hint">
          {t("stage.receiveAndCorrect.reasonHint", {
            maximum: reasonMaximumBytes,
          })}
        </p>
      </div>

      {isReasonUsable ? (
        <CorrectionTransactionAction
          decisionId="INT_CORRECTION_RECORDED"
          actionId="RECORD_CORRECTION"
          labelKey="stage.receiveAndCorrect.correctionAction"
          isFirstOfType
          summary={[
            ["field.correctionOf", <code key="t">{correctionOfTransactionId}</code>],
            ["field.correctionTarget", `${manifestAnchorId}.declaredQuantity`],
            ["field.incorrectValue", `${manifestQuantity} kg`],
            ["field.correctedValue", `${weighedQuantity} kg`],
            ["field.correctionReason", reason],
          ]}
          buildCommand={() =>
            runtimeCommand<RecordCorrectionCommand>(scenario, "RECORD_CORRECTION", {
              correctionOfTransactionId,
              reason,
            })
          }
          context={commandContext(scenario, "RECORD_CORRECTION")}
          recordDecision={false}
        />
      ) : (
        <p className="field__error" id="correction-reason-error">
          {t(
            isReasonTooLong
              ? "validation.correctionReasonTooLong"
              : "validation.correctionReasonRequired",
            { maximum: reasonMaximumBytes },
          )}
        </p>
      )}
    </section>
  );
}

import { useState, type ReactNode } from "react";
import { DocumentType, TransactionStatus, TransactionType } from "../domain/types/enums";
import type { DomainState } from "../domain/ledger/domain-state";
import type {
  AnchorDocumentCommand,
  RecordCorrectionCommand,
} from "../domain/commands/commands";
import { formatCorrectionValueLabel } from "../localization/format-correction-value";
import { buildEffectiveValueView } from "../domain/scenario/effective-value-view";
import { formatScenarioTime } from "../infrastructure/time/scenario-clock";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { StatusPill, type StatusTone } from "./status-pill";
import { useOptionalNotifications } from "../app/providers/notification-provider";
import { notificationForPersistedAction } from "../app/notifications/action-notifications";
import { copyText } from "./copy-text";

const TONE_BY_STATUS: Readonly<Record<string, StatusTone>> = {
  [TransactionStatus.COMMITTED]: "pass",
  [TransactionStatus.ORDERED]: "warn",
  [TransactionStatus.REJECTED]: "fail",
};

/**
 * Transaction history (specification section 18.7).
 *
 * Rejected transactions are shown alongside committed ones. History is not only
 * what succeeded -- an audit trail that hid refused attempts would be missing
 * half of what an audit trail is for, and the learner needs to be able to look
 * back at why something was turned down.
 */
export function TransactionHistory({ state }: { state: DomainState }): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const transactions = state.transactionOrder
    .map((id) => state.transactionsById[id])
    .filter((transaction) => transaction !== undefined);

  if (transactions.length === 0) {
    return (
      <section aria-labelledby="history-heading">
        <h2 id="history-heading">{t("history.title")}</h2>
        <p className="muted">{t("history.empty")}</p>
      </section>
    );
  }

  const organizationName = (organizationId: string): string => {
    const organization = scenario.organizations.find(
      (candidate) => candidate.organizationId === organizationId,
    );
    return organization === undefined ? organizationId : t(organization.displayNameKey);
  };

  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading">{t("history.title")}</h2>

      <div className="table-scroll">
        <table className="data-table">
          <caption className="visually-hidden">{t("history.title")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("history.columnTime")}</th>
              <th scope="col">{t("history.columnTransaction")}</th>
              <th scope="col">{t("history.columnOrganization")}</th>
              <th scope="col">{t("history.columnAction")}</th>
              <th scope="col">{t("history.columnStatus")}</th>
              <th scope="col">{t("history.columnBlock")}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => {
              if (transaction === undefined) return null;
              const isExpanded = expandedId === transaction.transactionId;
              return (
                <tr key={transaction.transactionId}>
                  <td>{formatScenarioTime(transaction.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="button button--quiet"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : transaction.transactionId)
                      }
                    >
                      <code>{transaction.transactionId}</code>
                    </button>
                  </td>
                  <td>{organizationName(transaction.proposedByOrganizationId)}</td>
                  <td>{t(`transactionType.${transaction.transactionType}`)}</td>
                  <td>
                    <StatusPill tone={TONE_BY_STATUS[transaction.transactionStatus] ?? "neutral"}>
                      {t(`pipeline.${transaction.transactionStatus}`)}
                    </StatusPill>
                  </td>
                  <td>
                    {transaction.blockId === undefined ? (
                      <span className="muted">{t("ledger.pendingQueue")}</span>
                    ) : (
                      <code>{transaction.blockId}</code>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedId !== null ? <TransactionDetail state={state} transactionId={expandedId} /> : null}
    </section>
  );
}

function TransactionDetail({
  state,
  transactionId,
}: {
  state: DomainState;
  transactionId: string;
}): ReactNode {
  const t = useTranslator();
  const notificationChannel = useOptionalNotifications();
  const transaction = state.transactionsById[transactionId];
  if (transaction === undefined) return null;
  const transactionHash = transaction.transactionHash;
  const anchor =
    transaction.transactionType === TransactionType.ANCHOR_DOCUMENT
      ? (transaction.commandPayload as AnchorDocumentCommand)
      : null;
  const correction =
    transaction.transactionType === TransactionType.RECORD_CORRECTION
      ? (transaction.commandPayload as RecordCorrectionCommand)
      : null;
  const effective =
    correction === null
      ? null
      : (buildEffectiveValueView(state, correction.target)?.effectiveValue ?? null);

  return (
    <article className="card card--reference">
      <h3>
        <code>{transaction.transactionId}</code>
      </h3>
      <dl className="asset-card__grid">
        <div className="asset-card__row">
          <dt>{t("history.columnAction")}</dt>
          <dd>{t(`transactionType.${transaction.transactionType}`)}</dd>
        </div>
        {anchor !== null ? (
          <>
            <div className="asset-card__row">
              <dt>{t("field.documentAnchor")}</dt>
              <dd><code>{anchor.documentAnchorId}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("field.documentType")}</dt>
              <dd>{t(`documentType.${anchor.documentType}`)}</dd>
            </div>
            {anchor.metadata.kind === DocumentType.SHIPPING_MANIFEST ? (
              <div className="asset-card__row">
                <dt>{t("stage.receiveAndCorrect.manifestQuantity")}</dt>
                <dd>{formatCorrectionValueLabel(anchor.metadata.declaredQuantity, t)}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {correction !== null ? (
          <>
            <div className="asset-card__row">
              <dt>{t("field.correctionOf")}</dt>
              <dd><code>{correction.correctionOfTransactionId}</code></dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("field.correctionTarget")}</dt>
              <dd>
                <code>
                  {correction.target.kind === "DOCUMENT_METADATA_FIELD"
                    ? `${correction.target.documentAnchorId}.${correction.target.field}`
                    : `${correction.target.assetId}.${correction.target.field}`}
                </code>
              </dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("field.incorrectValue")}</dt>
              <dd>{formatCorrectionValueLabel(correction.incorrectValue, t)}</dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("field.correctedValue")}</dt>
              <dd>{formatCorrectionValueLabel(correction.correctedValue, t)}</dd>
            </div>
            <div className="asset-card__row">
              <dt>{t("stage.receiveAndCorrect.effectiveQuantity")}</dt>
              <dd>{effective === null ? "-" : formatCorrectionValueLabel(effective, t)}</dd>
            </div>
          </>
        ) : null}
        <div className="asset-card__row">
          <dt>{t("history.columnStatus")}</dt>
          <dd>{t(`pipeline.${transaction.transactionStatus}`)}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("transaction.hashLabel")}</dt>
          <dd>
            <span className="hash">{transactionHash ?? "-"}</span>
            {transactionHash === undefined ? null : (
              <button
                type="button"
                className="button button--quiet"
                onClick={() => {
                  const result = {
                    operationId: `copy:${transaction.transactionId}`,
                  } as const;
                  void copyText(transactionHash).then(
                    () => {
                      const notification =
                        notificationForPersistedAction({
                          kind: "HASH_COPIED",
                          ...result,
                        });
                      if (notification !== null) {
                        notificationChannel?.notify(notification);
                      }
                    },
                    () => {
                      const notification =
                        notificationForPersistedAction({
                          kind: "HASH_COPY_FAILED",
                          ...result,
                        });
                      if (notification !== null) {
                        notificationChannel?.notify(notification);
                      }
                    },
                  );
                }}
              >
                {t("transaction.copyHash")}
              </button>
            )}
          </dd>
        </div>
        <div className="asset-card__row">
          <dt>
            {t(
              transaction.signatureEvidence === undefined
                ? "transaction.signatureLabel"
                : "transaction.signatureLabelReal",
            )}
          </dt>
          <dd>
            <span className="hash">
              {transaction.signatureEvidence?.proposalDigest ??
                transaction.simulatedSignature.signedPayloadHash}
            </span>
          </dd>
        </div>
      </dl>

      <h4>{t("validation.heading")}</h4>
      <ul className="validation__list">
        {transaction.validationResults.map((result) => (
          <li key={result.ruleId} className="validation__item">
            <StatusPill
              tone={
                result.status === "PASSED" ? "pass" : result.status === "FAILED" ? "fail" : "warn"
              }
            >
              {t(
                result.status === "PASSED"
                  ? "validation.statusPassed"
                  : result.status === "FAILED"
                    ? "validation.statusFailed"
                    : "validation.statusWarning",
              )}
            </StatusPill>
            <span className="validation__message">{t(result.messageKey)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

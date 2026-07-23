import { useState, type ReactNode } from "react";
import { TransactionStatus } from "../domain/types/enums";
import type { CommandContext, SupplyChainCommand } from "../domain/commands/commands";
import type { LedgerTransaction } from "../domain/types/models";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { TransactionPipeline } from "./transaction-pipeline";
import { ValidationResults } from "./validation-results";
import { ACTION_ACCEPTED } from "../domain/scenario/answer-codec";

/**
 * One transaction: submit it, watch the lifecycle, read the rules, seal it.
 *
 * PROGRESSIVE DISCLOSURE
 * ----------------------
 * The specification's transaction composer has eight sections (18.3). Walking
 * through all eight for roughly fifteen transactions is where the 30-45 minute
 * budget disappears, and by the third repetition the ceremony teaches nothing.
 *
 * So the full detail -- actor, organization, payload, signature -- is shown
 * expanded the *first* time a learner meets a given transaction type, and
 * collapsed behind a disclosure afterwards. The ceremony is memorable once and
 * tedious thereafter.
 */
export function TransactionAction({
  decisionId,
  actionId,
  labelKey,
  summary,
  buildCommand,
  context,
  isFirstOfType = false,
  recordDecision = true,
  onCommitted,
}: {
  /** Persisted action identifier; scoring is declared separately by the scenario. */
  decisionId: string;
  /** Scenario runtime action used for trusted context and compact replay. */
  actionId: string;
  labelKey: string;
  /** Field label/value pairs shown in the detail panel. */
  summary: ReadonlyArray<readonly [string, ReactNode]>;
  buildCommand: () => SupplyChainCommand;
  context: CommandContext;
  isFirstOfType?: boolean;
  /** False when an earlier atomic consequential submission owns this score. */
  recordDecision?: boolean;
  onCommitted?: () => void;
}): ReactNode {
  const t = useTranslator();
  const { state, submitCommand, sealPendingBlock } = useSimulation();
  const [transactionId, setTransactionId] = useState<string | null>(() => {
    if (
      recordDecision &&
      state.decisions[decisionId]?.encodedValue !== ACTION_ACCEPTED
    ) {
      return null;
    }
    const commandType = buildCommand().commandType;
    return (
      [...state.domain.transactionOrder]
        .reverse()
        .map((id) => state.domain.transactionsById[id])
        .find(
          (candidate) =>
            candidate?.transactionType === commandType &&
            candidate.transactionStatus !== TransactionStatus.REJECTED &&
            candidate.proposedByActorId === context.actorId,
        )?.transactionId ?? null
    );
  });
  const [validationReceipt, setValidationReceipt] = useState<LedgerTransaction | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const [isDetailOpen, setDetailOpen] = useState(isFirstOfType);

  const transaction =
    validationReceipt ??
    (transactionId === null ? undefined : state.domain.transactionsById[transactionId]);
  const isRejected = transaction?.transactionStatus === TransactionStatus.REJECTED;
  const isOrdered = transaction?.transactionStatus === TransactionStatus.ORDERED;
  const isCommitted = transaction?.transactionStatus === TransactionStatus.COMMITTED;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setSubmissionFailed(false);
    try {
      const outcome = await submitCommand(actionId, decisionId, buildCommand(), {
        recordDecision,
      });
      setValidationReceipt(outcome.transaction);
      setTransactionId(
        outcome.isAccepted && outcome.transaction !== null
          ? outcome.transaction.transactionId
          : null,
      );
    } catch {
      setSubmissionFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const seal = async (): Promise<void> => {
    if (transaction === undefined) return;
    await sealPendingBlock();
    onCommitted?.();
  };

  return (
    <section className="card card--work transaction-action">
      <h3>{t(labelKey)}</h3>

      {isDetailOpen ? (
        <>
          <dl className="asset-card__grid">
            {summary.map(([labelKeyOrText, value]) => (
              <div key={labelKeyOrText} className="asset-card__row">
                <dt>{t(labelKeyOrText)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">{t("transaction.signatureNotice")}</p>
        </>
      ) : (
        <button
          type="button"
          className="button button--quiet"
          onClick={() => setDetailOpen(true)}
        >
          {t("transaction.showDetail")}
        </button>
      )}

      {transaction === undefined ? (
        <button
          type="button"
          className="button button--primary"
          onClick={() => void submit()}
          disabled={state.isReadOnly || isSubmitting}
        >
          {t("transaction.submit")}
        </button>
      ) : null}

      {submissionFailed ? (
        <p className="field__error" role="alert">
          {t("transaction.submissionFailed")}
        </p>
      ) : null}

      {transaction !== undefined ? (
        <>
          <TransactionPipeline
            status={transaction.transactionStatus}
            blockId={transaction.blockId}
            failureCount={
              transaction.validationResults.filter((result) => result.status === "FAILED").length
            }
          />
          <ValidationResults
            results={transaction.validationResults}
            isValid={!isRejected}
          />

          {transaction.endorsementResults.length > 0 ? (
            <EndorsementList transactionId={transaction.transactionId} />
          ) : null}

          {isRejected ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setValidationReceipt(null);
                setTransactionId(null);
              }}
            >
              {t("transaction.edit")}
            </button>
          ) : null}

          {isOrdered ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => void seal()}
              disabled={state.isReadOnly}
            >
              {t("stage.createBatch.sealBlock")}
            </button>
          ) : null}

          {isCommitted ? (
            <p className="muted">
              {t("pipeline.announceCommitted", { blockId: transaction.blockId ?? "" })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * Endorsements, including the ones the simulation generated.
 *
 * Rendering the counterparty's approval explicitly matters: if it were
 * invisible, learners would conclude one party's say-so moves goods, which is
 * the opposite of what a shared ledger is for.
 */
function EndorsementList({ transactionId }: { transactionId: string }): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state } = useSimulation();
  const transaction = state.domain.transactionsById[transactionId];
  if (transaction === undefined) return null;

  return (
    <section className="endorsements">
      <h3>{t("endorsement.heading")}</h3>
      <ul>
        {transaction.endorsementResults.map((endorsement) => {
          const organization = scenario.organizations.find(
            (candidate) => candidate.organizationId === endorsement.endorsingOrganizationId,
          );
          const name =
            organization === undefined
              ? endorsement.endorsingOrganizationId
              : t(organization.displayNameKey);
          return (
            <li key={endorsement.endorsingOrganizationId}>
              {t(
                endorsement.isSimulatedCounterparty
                  ? "endorsement.simulatedCounterparty"
                  : "endorsement.byOrganization",
                { organization: name },
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted">{t("endorsement.notice")}</p>
    </section>
  );
}

import { useState, type ReactNode } from "react";
import { TransactionStatus } from "../domain/types/enums";
import type { CommandContext, SupplyChainCommand } from "../domain/commands/commands";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import { useSimulation } from "../app/providers/simulation-provider";
import { TransactionPipeline } from "./transaction-pipeline";
import { ValidationResults } from "./validation-results";

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
  labelKey,
  summary,
  buildCommand,
  context,
  isFirstOfType = false,
  onCommitted,
}: {
  /** Scored action identifier; omitted for unscored supporting transactions. */
  decisionId: string | null;
  labelKey: string;
  /** Field label/value pairs shown in the detail panel. */
  summary: ReadonlyArray<readonly [string, ReactNode]>;
  buildCommand: () => SupplyChainCommand;
  context: CommandContext;
  isFirstOfType?: boolean;
  onCommitted?: () => void;
}): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const { state, submitCommand, recordActionOutcome, sealPendingBlock } = useSimulation();
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [isDetailOpen, setDetailOpen] = useState(isFirstOfType);

  const transaction =
    transactionId === null ? undefined : state.domain.transactionsById[transactionId];
  const isRejected = transaction?.transactionStatus === TransactionStatus.REJECTED;
  const isOrdered = transaction?.transactionStatus === TransactionStatus.ORDERED;
  const isCommitted = transaction?.transactionStatus === TransactionStatus.COMMITTED;

  const submit = (): void => {
    const outcome = submitCommand(buildCommand(), context);
    setTransactionId(outcome.transaction.transactionId);
    if (decisionId !== null) {
      recordActionOutcome(decisionId, outcome.isAccepted);
    }
  };

  const seal = (): void => {
    sealPendingBlock(scenario.timeline["batchCreated"] as string);
    onCommitted?.();
  };

  return (
    <section className="card transaction-action">
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
          onClick={submit}
          disabled={state.isReadOnly}
        >
          {t("transaction.submit")}
        </button>
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
              onClick={() => setTransactionId(null)}
            >
              {t("transaction.edit")}
            </button>
          ) : null}

          {isOrdered ? (
            <button
              type="button"
              className="button button--primary"
              onClick={seal}
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

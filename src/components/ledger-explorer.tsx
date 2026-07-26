import { useId, useState, type ReactNode } from "react";
import type { DomainState } from "../domain/ledger/domain-state";
import { verifyIntegrity } from "../domain/ledger/integrity";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { useTranslator } from "../app/providers/locale-provider";
import { StatusPill } from "./status-pill";
import { formatScenarioTime } from "../infrastructure/time/scenario-clock";

/**
 * The block chain (specification section 18.8).
 *
 * Digests are shown in full and allowed to wrap rather than being truncated
 * behind a copy button: the learner needs to *see* that block N's "previous
 * hash" is byte-identical to block N-1's own hash. That visual match is the
 * entire mechanism.
 */
export function LedgerExplorer({
  state,
  headingLevel = 2,
}: {
  readonly state: DomainState;
  readonly headingLevel?: 2 | 3 | 4;
}): ReactNode {
  const t = useTranslator();
  const integrity = verifyIntegrity(state, sha256Hex);
  const headingId = useId();
  const [requestedBlockId, setRequestedBlockId] = useState<string | null>(null);
  const [requestedTransactionId, setRequestedTransactionId] = useState<
    string | null
  >(null);
  const fallbackBlockId = state.blockOrder[state.blockOrder.length - 1];
  const selectedBlockId =
    requestedBlockId !== null &&
    state.blocksById[requestedBlockId] !== undefined
      ? requestedBlockId
      : fallbackBlockId;
  const selectedBlock =
    selectedBlockId === undefined
      ? undefined
      : state.blocksById[selectedBlockId];
  const fallbackTransactionId = selectedBlock?.transactionIds[0];
  const selectedTransactionId =
    requestedTransactionId !== null &&
    selectedBlock?.transactionIds.includes(requestedTransactionId) === true
      ? requestedTransactionId
      : fallbackTransactionId;
  const selectedTransaction =
    selectedTransactionId === undefined
      ? undefined
      : state.transactionsById[selectedTransactionId];

  return (
    <section className="ledger" aria-labelledby={headingId}>
      {headingLevel === 2 ? (
        <h2 id={headingId}>{t("ledger.title")}</h2>
      ) : headingLevel === 3 ? (
        <h3 id={headingId}>{t("ledger.title")}</h3>
      ) : (
        <h4 id={headingId}>{t("ledger.title")}</h4>
      )}

      <p>
        <StatusPill tone={integrity.isValid ? "pass" : "fail"}>
          {t(integrity.isValid ? "ledger.integrityValid" : "ledger.integrityInvalid")}
        </StatusPill>
      </p>

      {/* Said where the digests are first met. The activity tells a learner
          that the signatures are simulated, which invites them to assume the
          same of everything else on screen -- and the hashing is the one part
          that is not. */}
      <p className="muted">{t("ledger.hashesAreReal")}</p>

      {state.blockOrder.length === 0 ? (
        <p className="muted">{t("ledger.empty")}</p>
      ) : (
        <div className="ledger__workspace">
          <ol
            className="ledger__index"
            aria-label={t("ledger.blockIndexLabel")}
          >
            {state.blockOrder.map((blockId) => {
              const block = state.blocksById[blockId];
              if (block === undefined) return null;
              const isInvalid = integrity.invalidBlockIds.includes(blockId);
              return (
                <li key={blockId}>
                  <button
                    type="button"
                    className={`ledger__index-button${
                      selectedBlockId === blockId
                        ? " ledger__index-button--active"
                        : ""
                    }`}
                    aria-pressed={selectedBlockId === blockId}
                    onClick={() => {
                      setRequestedBlockId(blockId);
                      setRequestedTransactionId(null);
                    }}
                  >
                    <span>
                      {t("ledger.blockNumber")} {block.blockNumber}
                    </span>
                    <small>
                      {t("ledger.transactionCount")}:{" "}
                      {block.transactionIds.length}
                    </small>
                    <StatusPill tone={isInvalid ? "fail" : "pass"}>
                      {t(
                        isInvalid
                          ? "ledger.integrityInvalid"
                          : "ledger.integrityValid",
                      )}
                    </StatusPill>
                  </button>
                </li>
              );
            })}
          </ol>

          {selectedBlock === undefined ? null : (
            <section
              className={`card ledger__block-detail${
                integrity.invalidBlockIds.includes(selectedBlock.blockId)
                  ? " ledger__block--invalid"
                  : ""
              }`}
              aria-label={t("ledger.blockDetailLabel", {
                number: selectedBlock.blockNumber,
              })}
            >
              <div className="ledger__block-header">
                <div>
                  <p className="eyebrow">{t("ledger.selectedBlock")}</p>
                  <h3>
                    {t("ledger.blockNumber")} {selectedBlock.blockNumber}
                  </h3>
                </div>
                <StatusPill
                  tone={
                    integrity.invalidBlockIds.includes(selectedBlock.blockId)
                      ? "fail"
                      : "pass"
                  }
                >
                  {t(
                    integrity.invalidBlockIds.includes(selectedBlock.blockId)
                      ? "ledger.integrityInvalid"
                      : "ledger.integrityValid",
                  )}
                </StatusPill>
              </div>

              <dl className="ledger__fields">
                <div>
                  <dt>{t("ledger.createdAt")}</dt>
                  <dd>{formatScenarioTime(selectedBlock.createdAt)}</dd>
                </div>
                <div>
                  <dt>{t("ledger.previousBlockHash")}</dt>
                  <dd>
                    {selectedBlock.previousBlockHash === null ? (
                      <span className="muted">{t("ledger.genesisNotice")}</span>
                    ) : (
                      <span className="hash">
                        {selectedBlock.previousBlockHash}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("ledger.blockHash")}</dt>
                  <dd>
                    <span className="hash">{selectedBlock.blockHash}</span>
                  </dd>
                </div>
              </dl>

              <div className="ledger__transactions">
                <h4>{t("ledger.transactionsInBlock")}</h4>
                <ol aria-label={t("ledger.transactionIndexLabel")}>
                  {selectedBlock.transactionIds.map((transactionId) => {
                    const transaction = state.transactionsById[transactionId];
                    if (transaction === undefined) return null;
                    return (
                      <li key={transactionId}>
                        <button
                          type="button"
                          aria-pressed={
                            selectedTransactionId === transactionId
                          }
                          className={`ledger__transaction-button${
                            selectedTransactionId === transactionId
                              ? " ledger__transaction-button--active"
                              : ""
                          }`}
                          onClick={() =>
                            setRequestedTransactionId(transactionId)
                          }
                        >
                          <code>{transactionId}</code>
                          <span>
                            {t(
                              `transactionType.${transaction.transactionType}`,
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {selectedTransaction === undefined ? null : (
                <article className="ledger__transaction-detail">
                  <p className="eyebrow">
                    {t("ledger.selectedTransaction")}
                  </p>
                  <h4>
                    <code>{selectedTransaction.transactionId}</code>
                  </h4>
                  <dl className="asset-card__grid">
                    <div className="asset-card__row">
                      <dt>{t("history.columnAction")}</dt>
                      <dd>
                        {t(
                          `transactionType.${selectedTransaction.transactionType}`,
                        )}
                      </dd>
                    </div>
                    <div className="asset-card__row">
                      <dt>{t("history.columnOrganization")}</dt>
                      <dd>
                        <code>
                          {selectedTransaction.proposedByOrganizationId}
                        </code>
                      </dd>
                    </div>
                    <div className="asset-card__row">
                      <dt>{t("transaction.hashLabel")}</dt>
                      <dd>
                        <span className="hash">
                          {selectedTransaction.transactionHash ?? "-"}
                        </span>
                      </dd>
                    </div>
                    <div className="asset-card__row">
                      <dt>{t("history.columnStatus")}</dt>
                      <dd>
                        {t(
                          `pipeline.${selectedTransaction.transactionStatus}`,
                        )}
                      </dd>
                    </div>
                  </dl>
                </article>
              )}
            </section>
          )}
        </div>
      )}

      {state.pendingTransactionIds.length > 0 ? (
        <div className="notice">
          <p>
            <strong>{t("ledger.pendingQueue")}</strong> ({state.pendingTransactionIds.length})
          </p>
          <p>{t("ledger.pendingQueueHelp")}</p>
        </div>
      ) : null}
    </section>
  );
}

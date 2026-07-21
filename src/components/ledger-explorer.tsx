import type { ReactNode } from "react";
import type { DomainState } from "../domain/ledger/domain-state";
import { verifyIntegrity } from "../domain/ledger/integrity";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { useTranslator } from "../app/providers/locale-provider";
import { StatusPill } from "./status-pill";

/**
 * The block chain (specification section 18.8).
 *
 * Digests are shown in full and allowed to wrap rather than being truncated
 * behind a copy button: the learner needs to *see* that block N's "previous
 * hash" is byte-identical to block N-1's own hash. That visual match is the
 * entire mechanism.
 */
export function LedgerExplorer({ state }: { state: DomainState }): ReactNode {
  const t = useTranslator();
  const integrity = verifyIntegrity(state, sha256Hex);

  return (
    <section className="ledger" aria-labelledby="ledger-heading">
      <h2 id="ledger-heading">{t("ledger.title")}</h2>

      <p>
        <StatusPill tone={integrity.isValid ? "pass" : "fail"}>
          {t(integrity.isValid ? "ledger.integrityValid" : "ledger.integrityInvalid")}
        </StatusPill>
      </p>

      {state.blockOrder.length === 0 ? (
        <p className="muted">{t("ledger.empty")}</p>
      ) : (
        <ol className="ledger__chain">
          {state.blockOrder.map((blockId) => {
            const block = state.blocksById[blockId];
            if (block === undefined) return null;
            const isInvalid = integrity.invalidBlockIds.includes(blockId);
            return (
              <li key={blockId} className={`card ledger__block${isInvalid ? " ledger__block--invalid" : ""}`}>
                <div className="ledger__block-header">
                  <h3>
                    {t("ledger.blockNumber")} {block.blockNumber}
                  </h3>
                  <StatusPill tone={isInvalid ? "fail" : "pass"}>
                    {t(isInvalid ? "ledger.integrityInvalid" : "ledger.integrityValid")}
                  </StatusPill>
                </div>

                <dl className="ledger__fields">
                  <div>
                    <dt>{t("ledger.transactionCount")}</dt>
                    <dd>{block.transactionIds.length}</dd>
                  </div>
                  <div>
                    <dt>{t("ledger.previousBlockHash")}</dt>
                    <dd>
                      {block.previousBlockHash === null ? (
                        <span className="muted">{t("ledger.genesisNotice")}</span>
                      ) : (
                        <span className="hash">{block.previousBlockHash}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("ledger.blockHash")}</dt>
                    <dd>
                      <span className="hash">{block.blockHash}</span>
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
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

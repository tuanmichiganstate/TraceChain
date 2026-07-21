import { useState, type ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { ProvenanceViewer } from "../../components/provenance-viewer";
import { StatusPill } from "../../components/status-pill";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  chainFingerprint,
  demonstrateTamper,
  type TamperDemonstration,
} from "../../domain/ledger/integrity";
import { PACKAGED_COFFEE_LOT_ID } from "../../scenarios/coffee-traceability/stages";

/**
 * Stage 8. What the public can see, and what happens when someone edits history.
 *
 * The verification half is deliberately read-only: reading the ledger is a
 * query, not a transaction, and giving consumer scans their own transaction type
 * would pollute the ledger the learner is about to inspect.
 *
 * The tampering half runs on a clone and shows the escalation rather than a
 * single verdict, because "the chain noticed" is the shallow version of the
 * lesson. Each forgery repairs one layer and exposes the next, and none of them
 * is prevented -- which is precisely the difference between tamper evident and
 * tamper proof.
 */
export function VerifyAndTamperStage(): ReactNode {
  const t = useTranslator();
  const { stage } = useScenario();
  const { state } = useSimulation();
  const definition = stage(ScenarioStageId.VERIFY_AND_TAMPER);
  const [demonstration, setDemonstration] = useState<TamperDemonstration | null>(null);
  const [isLedgerIntact, setIsLedgerIntact] = useState(true);

  const [tamperIntegrityCheck, dataGovernanceCheck] = definition?.knowledgeChecks ?? [];

  // Only a committed transaction carrying a quantity can be altered, which is
  // what keeps demonstrateTamper's precondition true by construction.
  const target = Object.values(state.domain.transactionsById).find(
    (transaction) =>
      transaction.transactionHash !== undefined &&
      typeof (transaction.commandPayload as { quantity?: unknown }).quantity === "number",
  );

  const runDemonstration = (): void => {
    if (target === undefined) return;
    const fingerprintBefore = chainFingerprint(state.domain, sha256Hex);
    const result = demonstrateTamper(state.domain, sha256Hex, {
      transactionId: target.transactionId,
      quantity: 1,
    });
    setDemonstration(result);
    // Asserted in tests too, but shown to the learner: the attempt they carry on
    // with is the one they had before pressing the button.
    setIsLedgerIntact(chainFingerprint(state.domain, sha256Hex) === fingerprintBefore);
  };

  const packagedLot = state.domain.assetsById[PACKAGED_COFFEE_LOT_ID];

  return (
    <StageShell stageId={ScenarioStageId.VERIFY_AND_TAMPER}>
      <section className="card">
        <h3>{t("stage.verifyAndTamper.publicHeading")}</h3>
        {packagedLot !== undefined ? (
          <ProvenanceViewer state={state.domain} rootAssetId={PACKAGED_COFFEE_LOT_ID} />
        ) : null}
        <p className="muted">{t("stage.verifyAndTamper.publicNotice")}</p>
      </section>

      <section className="card">
        <h3>{t("stage.verifyAndTamper.tamperHeading")}</h3>
        <p>{t("stage.verifyAndTamper.tamperIntro")}</p>

        {demonstration === null ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={runDemonstration}
            disabled={target === undefined}
          >
            {t("stage.verifyAndTamper.runTamper")}
          </button>
        ) : (
          <ol className="stack">
            <TamperStep
              headingKey="stage.verifyAndTamper.step1Heading"
              detail={t("stage.verifyAndTamper.step1Detail", {
                transaction: demonstration.transactionId,
                original: String(demonstration.originalQuantity),
                tampered: String(demonstration.tamperedQuantity),
              })}
              label={t("stage.verifyAndTamper.recordsBroken")}
              count={demonstration.afterEdit.invalidTransactionIds.length}
            />
            <TamperStep
              headingKey="stage.verifyAndTamper.step2Heading"
              detail={t("stage.verifyAndTamper.step2Detail", {
                block: demonstration.editedBlockId ?? "",
              })}
              label={t("stage.verifyAndTamper.blocksBroken")}
              count={demonstration.afterForgingTransaction.invalidBlockIds.length}
            />
            {/* Counted as broken links rather than broken blocks: repairing the
                block digest makes that block verify again, and what fails is
                the next block's link to the digest it recorded. */}
            <TamperStep
              headingKey="stage.verifyAndTamper.step3Heading"
              detail={t("stage.verifyAndTamper.step3Detail", {
                block: demonstration.editedBlockId ?? "",
              })}
              label={t("stage.verifyAndTamper.linksBroken")}
              count={demonstration.cascadingBlockIds.length}
            />
          </ol>
        )}

        {demonstration !== null ? (
          <>
            <p>{t("stage.verifyAndTamper.conclusion")}</p>
            {isLedgerIntact ? (
              <p>
                <StatusPill tone="pass">{t("stage.verifyAndTamper.ledgerIntact")}</StatusPill>
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {tamperIntegrityCheck !== undefined ? (
        <KnowledgeCheckPanel check={tamperIntegrityCheck} />
      ) : null}
      {dataGovernanceCheck !== undefined ? (
        <KnowledgeCheckPanel check={dataGovernanceCheck} />
      ) : null}
    </StageShell>
  );
}

function TamperStep({
  headingKey,
  detail,
  label,
  count,
}: {
  headingKey: string;
  detail: string;
  label: string;
  count: number;
}): ReactNode {
  const t = useTranslator();
  return (
    <li>
      <h4>{t(headingKey)}</h4>
      <p>{detail}</p>
      <p>
        <StatusPill tone="fail">
          {label}: {count}
        </StatusPill>
      </p>
    </li>
  );
}

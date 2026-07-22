import { useState, type ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { KnowledgeCheckPanel } from "../../components/knowledge-check-panel";
import { TransactionAction } from "../../components/transaction-action";
import { ValidationResults } from "../../components/validation-results";
import { StatusPill } from "../../components/status-pill";
import { OrganizationId } from "../../scenarios/coffee-traceability/organizations";
import {
  CERTIFIER_CONTEXT,
  QUALITY_CERTIFICATE_ANCHOR_ID,
  QUALITY_CERTIFICATE_CONTENT,
  anchorCertificateCommand,
  issueCertificateCommand,
} from "../../scenarios/coffee-traceability/commands";
import { sha256Hex } from "../../infrastructure/hashing/sha256";

/**
 * Stage 3. Where a document belongs, and who is allowed to vouch for it.
 *
 * Two lessons, deliberately in this order: first that a large file stays off
 * chain with only its digest anchored, then that a perfectly valid digest from
 * an unrecognized issuer is still worthless. Integrity is not authority, and
 * the second lesson only lands once the first has made the hash feel powerful.
 */
export function AnchorCertificateStage(): ReactNode {
  const t = useTranslator();
  const { stage } = useScenario();
  const definition = stage(ScenarioStageId.ANCHOR_CERTIFICATE);
  const [storageCheck, issuerCheck] = definition?.knowledgeChecks ?? [];

  return (
    <StageShell stageId={ScenarioStageId.ANCHOR_CERTIFICATE}>
      <section className="card">
        <h3>{t("stage.anchorCertificate.documentHeading")}</h3>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("field.fileName")}</dt>
            <dd>giay-chung-nhan-chat-luong-001.pdf</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("field.contentHash")}</dt>
            <dd>
              <span className="hash">{sha256Hex(QUALITY_CERTIFICATE_CONTENT)}</span>
            </dd>
          </div>
        </dl>
        <p className="muted">{t("stage.anchorCertificate.hashNotice")}</p>
      </section>

      {storageCheck !== undefined ? <KnowledgeCheckPanel check={storageCheck} /> : null}

      <TransactionAction
        decisionId="INT_CERTIFICATE_ANCHORED_TRANSACTION"
        labelKey="stage.anchorCertificate.anchorAction"
        isFirstOfType
        summary={[
          ["field.assetId", <code key="a">BAT_GREEN_COFFEE_001</code>],
          ["field.documentAnchor", <code key="d">{QUALITY_CERTIFICATE_ANCHOR_ID}</code>],
          ["field.issuer", t("organizations.certificationBody.name")],
        ]}
        buildCommand={anchorCertificateCommand}
        context={CERTIFIER_CONTEXT}
      />

      <TransactionAction
        decisionId="INT_CERTIFICATE_ISSUED_TRANSACTION"
        labelKey="stage.anchorCertificate.issueAction"
        summary={[
          ["field.assetId", <code key="a">BAT_GREEN_COFFEE_001</code>],
          ["field.certificateId", <code key="c">CERT_QUALITY_001</code>],
        ]}
        buildCommand={issueCertificateCommand}
        context={CERTIFIER_CONTEXT}
      />

      <SuspiciousCertificatePanel />

      {issuerCheck !== undefined ? <KnowledgeCheckPanel check={issuerCheck} /> : null}
    </StageShell>
  );
}

/**
 * The second certificate: valid hash, unrecognized issuer.
 *
 * The learner is invited to try submitting it. The rule engine refuses, and the
 * refusal is the point -- reading `RULE_CERTIFIER_AUTHORIZED` fail against a
 * document whose digest is perfectly intact is a sharper lesson than being told
 * that integrity and authority differ.
 */
function SuspiciousCertificatePanel(): ReactNode {
  const t = useTranslator();
  const { submitCommand, recordActionOutcome } = useSimulation();
  const [attempted, setAttempted] = useState<ReturnType<typeof submitCommand> | null>(null);

  return (
    <section className="card">
      <h3>{t("stage.anchorCertificate.suspiciousHeading")}</h3>
      <p>{t("stage.anchorCertificate.suspiciousBody")}</p>

      <dl className="asset-card__grid">
        <div className="asset-card__row">
          <dt>{t("field.issuer")}</dt>
          <dd>{t("organizations.unrecognizedCertifier.name")}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("field.contentHash")}</dt>
          <dd>
            <StatusPill tone="pass">{t("stage.anchorCertificate.hashValid")}</StatusPill>
          </dd>
        </div>
      </dl>

      {attempted === null ? (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            const result = submitCommand(
              anchorCertificateCommand(OrganizationId.UNRECOGNIZED_CERTIFIER),
              CERTIFIER_CONTEXT,
            );
            recordActionOutcome("INT_SUSPICIOUS_CERTIFICATE_ATTEMPT", result.isAccepted);
            setAttempted(result);
          }}
        >
          {t("stage.anchorCertificate.trySuspicious")}
        </button>
      ) : (
        <>
          <ValidationResults
            results={attempted.transaction.validationResults}
            isValid={attempted.isAccepted}
          />
          <p>{t("stage.anchorCertificate.suspiciousFeedback")}</p>
        </>
      )}
    </section>
  );
}

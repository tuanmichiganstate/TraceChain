import { useState, type ReactNode } from "react";
import { useTranslator } from "../app/providers/locale-provider";
import { useScenario } from "../app/providers/scenario-provider";
import type { SignatureTrustEvidence } from "../crypto/signatures/types";
import { verificationBundleFromEvidence } from "../crypto/signatures/signing-service";
import { StatusPill } from "./status-pill";

export function SignatureTrustSummary({
  evidence,
}: {
  readonly evidence: SignatureTrustEvidence;
}): ReactNode {
  const t = useTranslator();
  const [copyStatus, setCopyStatus] = useState<
    "IDLE" | "COPIED" | "FAILED"
  >("IDLE");
  const { scenario } = useScenario();
  const organization = scenario.organizations.find(
    (candidate) =>
      candidate.organizationId === evidence.signature.organizationId,
  );
  const signer =
    organization === undefined
      ? evidence.signature.organizationId
      : t(organization.displayNameKey);
  const announcement = !evidence.signatureValid
    ? t("signature.announcement.invalid")
    : !evidence.authorization.recognizedIdentity
      ? t("signature.announcement.unknown", { organization: signer })
      : !evidence.authorization.authorized
        ? t("signature.announcement.unauthorized", {
            organization: signer,
          })
        : t("signature.announcement.authorized", {
            organization: signer,
          });

  return (
    <section
      className="signature-trust"
      aria-labelledby={`signature-heading-${evidence.proposal.proposalId}`}
    >
      <h4 id={`signature-heading-${evidence.proposal.proposalId}`}>
        {t("signature.heading")}
      </h4>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <dl className="asset-card__grid">
        <TrustRow
          label={t("signature.signatureLabel")}
          passed={evidence.signatureValid}
          value={t(
            evidence.signatureValid
              ? "signature.valid"
              : "signature.invalid",
          )}
        />
        <div className="asset-card__row">
          <dt>{t("signature.signerLabel")}</dt>
          <dd>{signer}</dd>
        </div>
        <TrustRow
          label={t("signature.identityLabel")}
          passed={evidence.authorization.recognizedIdentity}
          value={t(
            evidence.authorization.recognizedIdentity
              ? "signature.recognized"
              : "signature.unrecognized",
          )}
        />
        <TrustRow
          label={t("signature.keyStatusLabel")}
          passed={evidence.authorization.keyActive}
          value={t(
            evidence.authorization.keyActive
              ? "signature.keyActive"
              : "signature.keyInactive",
          )}
        />
        <TrustRow
          label={t("signature.authorizationLabel")}
          passed={evidence.authorization.authorized}
          value={t(
            evidence.authorization.authorized
              ? "signature.authorized"
              : "signature.notAuthorized",
          )}
        />
        <div className="asset-card__row">
          <dt>{t("signature.endorsementLabel")}</dt>
          <dd>
            <StatusPill tone="neutral">
              {t("signature.notApplicable")}
            </StatusPill>
          </dd>
        </div>
      </dl>
      <p className="muted">{t("signature.truthNotice")}</p>
      <p className="muted">{t("signature.educationalDisclosure")}</p>
      <details className="signature-trust__evidence">
        <summary>{t("signature.viewEvidence")}</summary>
        <dl className="asset-card__grid">
          <div className="asset-card__row">
            <dt>{t("signature.algorithmLabel")}</dt>
            <dd>{evidence.signature.algorithm}</dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("signature.digestLabel")}</dt>
            <dd>
              <code className="hash">{evidence.proposalDigest}</code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("signature.keyIdLabel")}</dt>
            <dd><code>{evidence.signature.keyId}</code></dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("signature.fingerprintLabel")}</dt>
            <dd>
              <code className="hash">
                {evidence.publicKeyFingerprint ??
                  t("common.notAvailable")}
              </code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("signature.signatureValueLabel")}</dt>
            <dd>
              <code className="hash">
                {shortSignature(evidence.signature.signatureBase64Url)}
              </code>
            </dd>
          </div>
          <div className="asset-card__row">
            <dt>{t("signature.stateVersionsLabel")}</dt>
            <dd>
              {Object.entries(
                evidence.proposal.expectedStateVersions,
              ).length === 0 ? (
                t("common.notAvailable")
              ) : (
                <ul className="signature-trust__versions">
                  {Object.entries(
                    evidence.proposal.expectedStateVersions,
                  ).map(([assetId, version]) => (
                    <li key={assetId}>
                      <code>{assetId}</code>: {version}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
        {evidence.publicKeySpkiBase64Url !== null ? (
          <>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                const source = `${JSON.stringify(
                  verificationBundleFromEvidence(evidence),
                  null,
                  2,
                )}\n`;
                void copyText(source).then(
                  () => setCopyStatus("COPIED"),
                  () => setCopyStatus("FAILED"),
                );
              }}
            >
              {t("signature.copyEvidence")}
            </button>
            {copyStatus !== "IDLE" ? (
              <p role="status">
                {t(
                  copyStatus === "COPIED"
                    ? "signature.copyEvidenceSuccess"
                    : "signature.copyEvidenceFailure",
                )}
              </p>
            ) : null}
          </>
        ) : null}
      </details>
    </section>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.insetInlineStart = "-9999px";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Copy command was rejected");
}

function TrustRow({
  label,
  passed,
  value,
}: {
  readonly label: string;
  readonly passed: boolean;
  readonly value: string;
}): ReactNode {
  return (
    <div className="asset-card__row">
      <dt>{label}</dt>
      <dd>
        <StatusPill tone={passed ? "pass" : "fail"}>{value}</StatusPill>
      </dd>
    </div>
  );
}

function shortSignature(signature: string): string {
  return signature.length <= 32
    ? signature
    : `${signature.slice(0, 20)}…${signature.slice(-12)}`;
}

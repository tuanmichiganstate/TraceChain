import { useRef, useState, type ReactNode } from "react";
import { ScenarioStageId } from "../../domain/types/enums";
import { useTranslator } from "../../app/providers/locale-provider";
import { useScenario } from "../../app/providers/scenario-provider";
import { useSimulation } from "../../app/providers/simulation-provider";
import { StageShell } from "../../components/stage-shell";
import { TransactionAction } from "../../components/transaction-action";
import { StatusPill } from "../../components/status-pill";
import {
  commandContext,
  runtimeCommand,
  runtimeMitigationCommand,
} from "../../domain/scenario/runtime";
import type {
  AnchorDocumentCommand,
  IssueCertificateCommand,
} from "../../domain/commands/commands";
import {
  expandCertificateDecision,
  evaluateCertificateDecision,
} from "../../domain/simulation/consequential-decisions";
import { JournalOpcode } from "../../domain/simulation/command-journal";
import type {
  CertificateAssessment,
  CertificateStorageChoice,
  IssuerAssessment,
  LotDisposition,
  SubmitCertificateDecisionCommand,
} from "../../domain/simulation/types";
import { useOptionalConfiguration } from "../../app/providers/configuration-provider";
import { shouldRevealDetailedFeedback } from "../../app/feedback-visibility";
import {
  InspectorSurface,
  RoleApplicationShell,
} from "../../components/simulation-workspace";

interface CertificateFormState {
  readonly certificateAssessment: CertificateAssessment | "";
  readonly issuerAssessment: IssuerAssessment | "";
  readonly storageChoice: CertificateStorageChoice | "";
  readonly lotDisposition: LotDisposition | "";
}

const EMPTY_FORM: CertificateFormState = {
  certificateAssessment: "",
  issuerAssessment: "",
  storageChoice: "",
  lotDisposition: "",
};

/**
 * Stage 3 commits one structured decision. Selecting radio buttons is local
 * form work; only the explicit submission enters the append-only journal.
 */
export function AnchorCertificateStage(): ReactNode {
  const t = useTranslator();
  const { scenario } = useScenario();
  const {
    state,
    isCompleted,
    submitCertificateDecision,
    recordMitigation,
  } = useSimulation();
  const packageConfiguration = useOptionalConfiguration();
  const anchor = runtimeCommand<AnchorDocumentCommand>(
    scenario,
    "ANCHOR_CERTIFICATE",
  );
  const certificate = runtimeCommand<IssueCertificateCommand>(
    scenario,
    "ISSUE_CERTIFICATE",
  );
  const anchorIssuer = scenario.organizations.find(
    (organization) =>
      organization.organizationId === anchor.issuerOrganizationId,
  );
  const [form, setForm] = useState<CertificateFormState>(EMPTY_FORM);
  const [isSubmitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const mitigationInFlightRef = useRef(false);
  const [mitigationInFlight, setMitigationInFlight] = useState<string | null>(
    null,
  );

  const initialEntry = state.commandJournal.find(
    (entry) => entry.opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION,
  );
  const initialDecision =
    initialEntry === undefined
      ? null
      : expandCertificateDecision(initialEntry.values);
  const evaluation =
    initialDecision === null
      ? null
      : evaluateCertificateDecision(initialDecision, scenario);
  const hasMitigation = (opcode: number): boolean =>
    state.commandJournal.some((entry) => entry.opcode === opcode);
  const issuerResolved =
    evaluation !== null &&
    (!evaluation.mitigationActions.includes("REVIEW_ISSUER") ||
      hasMitigation(JournalOpcode.REVIEW_ISSUER));
  const storageResolved =
    evaluation !== null &&
    (evaluation.storageChoiceCorrect ||
      hasMitigation(JournalOpcode.REMEDIATE_STORAGE));
  const dispositionResolved =
    evaluation !== null &&
    (evaluation.lotDispositionCorrect ||
      hasMitigation(JournalOpcode.SUSPEND_LOT));
  const decisionResolved =
    issuerResolved && storageResolved && dispositionResolved;
  const revealDetailedFeedback = shouldRevealDetailedFeedback({
    timing:
      packageConfiguration?.configuration.feedbackTiming ?? "immediate",
    stageId: ScenarioStageId.ANCHOR_CERTIFICATE,
    completedStageIds: state.completedStageIds,
    simulationCompleted: isCompleted,
  });

  const complete =
    form.certificateAssessment !== "" &&
    form.issuerAssessment !== "" &&
    form.storageChoice !== "" &&
    form.lotDisposition !== "";
  const stageComplete = state.completedStageIds.includes(
    ScenarioStageId.ANCHOR_CERTIFICATE,
  );
  const caseStatusKey = stageComplete
    ? "stage.anchorCertificate.console.caseComplete"
    : initialDecision === null
      ? "stage.anchorCertificate.console.caseAwaitingReview"
      : decisionResolved
        ? "stage.anchorCertificate.console.caseReadyForLedger"
        : "stage.anchorCertificate.console.caseActionRequired";
  const caseStatusTone = stageComplete
    ? "pass"
    : evaluation !== null && !decisionResolved
      ? "warn"
      : "neutral";

  const submit = async (): Promise<void> => {
    if (!complete || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmitting(true);
    try {
      await submitCertificateDecision({
        commandType: "SUBMIT_CERTIFICATE_DECISION",
        certificateAssessment: form.certificateAssessment as CertificateAssessment,
        issuerAssessment: form.issuerAssessment as IssuerAssessment,
        storageChoice: form.storageChoice as CertificateStorageChoice,
        lotDisposition: form.lotDisposition as LotDisposition,
      });
    } catch {
      return;
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  };
  const mitigate = async (
    commandType: "REVIEW_ISSUER" | "REMEDIATE_STORAGE" | "SUSPEND_LOT",
  ): Promise<void> => {
    if (mitigationInFlightRef.current) return;
    mitigationInFlightRef.current = true;
    setMitigationInFlight(commandType);
    try {
      await recordMitigation({ commandType });
    } catch {
      return;
    } finally {
      mitigationInFlightRef.current = false;
      setMitigationInFlight(null);
    }
  };

  return (
    <StageShell stageId={ScenarioStageId.ANCHOR_CERTIFICATE}>
      <RoleApplicationShell
        eyebrow={t("stage.anchorCertificate.console.eyebrow")}
        title={t("stage.anchorCertificate.console.title")}
        description={t("stage.anchorCertificate.console.description")}
        statusLabel={t("stage.anchorCertificate.console.caseStatus")}
        status={
          <StatusPill tone={caseStatusTone}>
            {t(caseStatusKey)}
          </StatusPill>
        }
      >
        <div className="certificate-console">
          <section className="card card--reference evidence-document certificate-console__document">
            <p className="eyebrow">{t("evidenceDocument.layerLabel")}</p>
            <h3>{t("stage.anchorCertificate.documentHeading")}</h3>
            <dl className="asset-card__grid">
              <div className="asset-card__row">
                <dt>{t("field.fileName")}</dt>
                <dd>{anchor.fileName}</dd>
              </div>
              <div className="asset-card__row">
                <dt>{t("field.contentHash")}</dt>
                <dd><span className="hash">{anchor.contentHash}</span></dd>
              </div>
              <div className="asset-card__row">
                <dt>{t("field.issuer")}</dt>
                <dd>
                  {anchorIssuer === undefined
                    ? anchor.issuerOrganizationId
                    : t(anchorIssuer.displayNameKey)}
                </dd>
              </div>
              <div className="asset-card__row">
                <dt>{t("field.issuedAt")}</dt>
                <dd>{anchor.issuedAt}</dd>
              </div>
              <div className="asset-card__row">
                <dt>{t("field.expiresAt")}</dt>
                <dd>{anchor.expiresAt ?? t("common.notAvailable")}</dd>
              </div>
            </dl>
            <p className="muted">{t("stage.anchorCertificate.hashNotice")}</p>
          </section>

          <CertificateVerificationConsole
            contentHash={anchor.contentHash}
            decisionRecorded={initialDecision !== null}
            decisionResolved={decisionResolved}
            stageComplete={stageComplete}
          />
        </div>

        {initialDecision === null ? (
          <CertificateDecisionForm
            value={form}
            onChange={setForm}
            onSubmit={() => void submit()}
            disabled={state.isReadOnly || isSubmitting}
            processing={isSubmitting}
          />
        ) : (
          <CertificateDecisionFeedback
            decision={initialDecision}
            evaluation={evaluation}
            revealDetailedFeedback={revealDetailedFeedback}
          />
        )}

      {evaluation !== null && !decisionResolved ? (
        <section className="card card--work professional-decision professional-decision--mitigation">
          <p className="eyebrow">{t("professionalDecision.layerLabel")}</p>
          <h3>{t("stage.anchorCertificate.mitigationHeading")}</h3>
          <p>{t("stage.anchorCertificate.mitigationNotice")}</p>
          <div className="button-row">
            {!issuerResolved ? (
              <button
                type="button"
                className="button button--secondary"
                disabled={state.isReadOnly || mitigationInFlight !== null}
                onClick={() => void mitigate("REVIEW_ISSUER")}
              >
                {t(
                  mitigationInFlight === "REVIEW_ISSUER"
                    ? "action.processing"
                    : "stage.anchorCertificate.reviewIssuer",
                )}
              </button>
            ) : null}
            {!storageResolved ? (
              <button
                type="button"
                className="button button--secondary"
                disabled={state.isReadOnly || mitigationInFlight !== null}
                onClick={() => void mitigate("REMEDIATE_STORAGE")}
              >
                {t(
                  mitigationInFlight === "REMEDIATE_STORAGE"
                    ? "action.processing"
                    : "stage.anchorCertificate.remediateStorage",
                )}
              </button>
            ) : null}
            {!dispositionResolved ? (
              <button
                type="button"
                className="button button--secondary"
                disabled={state.isReadOnly || mitigationInFlight !== null}
                onClick={() => void mitigate("SUSPEND_LOT")}
              >
                {t(
                  mitigationInFlight === "SUSPEND_LOT"
                    ? "action.processing"
                    : "stage.anchorCertificate.suspendLot",
                )}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {decisionResolved ? (
        <InspectorSurface
          eyebrow={t("blockchainInspector.layerLabel")}
          title={t("stage.anchorCertificate.console.inspectorTitle")}
          description={t(
            "stage.anchorCertificate.console.inspectorDescription",
          )}
        >
          {packageConfiguration?.configuration.technicalFeatures
            .digitalSignatures ? (
            <TransactionAction
              decisionId="INT_SUSPICIOUS_CERTIFICATE_ATTEMPT"
              actionId="SUSPICIOUS_CERTIFICATE"
              labelKey="stage.anchorCertificate.signatureInspectionAction"
              summary={[
                [
                  "field.certificateId",
                  <code key="c">{certificate.certificateId}</code>,
                ],
                [
                  "signature.authorizationQuestionLabel",
                  t("stage.anchorCertificate.signatureInspectionPurpose"),
                ],
              ]}
              buildCommand={() =>
                runtimeCommand<IssueCertificateCommand>(
                  scenario,
                  "SUSPICIOUS_CERTIFICATE",
                )
              }
              context={commandContext(
                scenario,
                "SUSPICIOUS_CERTIFICATE",
              )}
              allowRejectedRetry={false}
            />
          ) : null}

          <TransactionAction
            decisionId="INT_CERTIFICATE_ANCHORED_TRANSACTION"
            actionId="ANCHOR_CERTIFICATE"
            labelKey="stage.anchorCertificate.anchorAction"
            isFirstOfType
            summary={[
              ["field.assetId", <code key="a">{anchor.assetId}</code>],
              ["field.documentAnchor", <code key="d">{anchor.documentAnchorId}</code>],
              ["field.issuer", t("organizations.certificationBody.name")],
            ]}
            buildCommand={() =>
              hasMitigation(JournalOpcode.REVIEW_ISSUER)
                ? runtimeMitigationCommand<AnchorDocumentCommand>(
                    scenario,
                    "ANCHOR_CERTIFICATE",
                  )
                : runtimeCommand<AnchorDocumentCommand>(
                    scenario,
                    "ANCHOR_CERTIFICATE",
                  )
            }
            context={commandContext(scenario, "ANCHOR_CERTIFICATE")}
          />

          <TransactionAction
            decisionId="INT_CERTIFICATE_ISSUED_TRANSACTION"
            actionId="ISSUE_CERTIFICATE"
            labelKey="stage.anchorCertificate.issueAction"
            summary={[
              ["field.assetId", <code key="a">{certificate.assetId}</code>],
              ["field.certificateId", <code key="c">{certificate.certificateId}</code>],
            ]}
            buildCommand={() =>
              runtimeCommand<IssueCertificateCommand>(
                scenario,
                "ISSUE_CERTIFICATE",
              )
            }
            context={commandContext(scenario, "ISSUE_CERTIFICATE")}
          />
        </InspectorSurface>
      ) : null}
      </RoleApplicationShell>
    </StageShell>
  );
}

function CertificateVerificationConsole({
  contentHash,
  decisionRecorded,
  decisionResolved,
  stageComplete,
}: {
  readonly contentHash: string;
  readonly decisionRecorded: boolean;
  readonly decisionResolved: boolean;
  readonly stageComplete: boolean;
}): ReactNode {
  const t = useTranslator();
  const ledgerStatusKey = stageComplete
    ? "stage.anchorCertificate.console.ledgerRecorded"
    : decisionResolved
      ? "stage.anchorCertificate.console.ledgerReady"
      : "stage.anchorCertificate.console.ledgerWaiting";

  return (
    <section className="certificate-console__verification">
      <p className="eyebrow">
        {t("stage.anchorCertificate.console.verificationLayer")}
      </p>
      <h3>{t("stage.anchorCertificate.console.verificationHeading")}</h3>
      <dl className="verification-console__list">
        <div>
          <dt>{t("stage.anchorCertificate.console.digestStatus")}</dt>
          <dd>
            <StatusPill tone="pass">
              {t("stage.anchorCertificate.console.digestComputed")}
            </StatusPill>
            <code className="hash verification-console__hash">
              {contentHash}
            </code>
          </dd>
        </div>
        <div>
          <dt>{t("stage.anchorCertificate.console.identityStatus")}</dt>
          <dd>
            <StatusPill tone="neutral">
              {t(
                decisionRecorded
                  ? "stage.anchorCertificate.console.reviewRecorded"
                  : "stage.anchorCertificate.console.reviewPending",
              )}
            </StatusPill>
          </dd>
        </div>
        <div>
          <dt>{t("stage.anchorCertificate.console.decisionStatus")}</dt>
          <dd>
            <StatusPill tone="neutral">
              {t(
                decisionResolved
                  ? "stage.anchorCertificate.console.decisionResolved"
                  : decisionRecorded
                    ? "stage.anchorCertificate.console.decisionNeedsAction"
                    : "stage.anchorCertificate.console.decisionPending",
              )}
            </StatusPill>
          </dd>
        </div>
        <div>
          <dt>{t("stage.anchorCertificate.console.ledgerStatus")}</dt>
          <dd>
            <StatusPill tone={stageComplete ? "pass" : "neutral"}>
              {t(ledgerStatusKey)}
            </StatusPill>
          </dd>
        </div>
      </dl>
      <p className="muted">
        {t("stage.anchorCertificate.console.authenticityBoundary")}
      </p>
    </section>
  );
}

function CertificateDecisionForm({
  value,
  onChange,
  onSubmit,
  disabled,
  processing,
}: {
  readonly value: CertificateFormState;
  readonly onChange: (value: CertificateFormState) => void;
  readonly onSubmit: () => void;
  readonly disabled: boolean;
  readonly processing: boolean;
}): ReactNode {
  const t = useTranslator();
  const select = <TKey extends keyof CertificateFormState>(
    key: TKey,
    next: CertificateFormState[TKey],
  ): void => onChange({ ...value, [key]: next });
  const options = {
    certificateAssessment: [
      ["VALID", "stage.anchorCertificate.assessmentValid"],
      ["EXPIRED", "stage.anchorCertificate.assessmentExpired"],
      ["CONTENT_INVALID", "stage.anchorCertificate.assessmentInvalid"],
    ],
    issuerAssessment: [
      ["RECOGNIZED_AUTHORIZED", "check.certificateIssuer.optionRecognizedAuthorized"],
      ["RECOGNIZED_UNAUTHORIZED", "check.certificateIssuer.optionRecognizedUnauthorized"],
      ["UNRECOGNIZED", "check.certificateIssuer.optionUnrecognized"],
    ],
    storageChoice: [
      ["HASH_OFF_CHAIN", "check.certificateStorage.optionHash"],
      ["FULL_DOCUMENT_ON_CHAIN", "check.certificateStorage.optionWholeFile"],
    ],
    lotDisposition: [
      ["CONTINUE", "stage.anchorCertificate.dispositionContinue"],
      ["HOLD", "stage.anchorCertificate.dispositionHold"],
    ],
  } as const;
  const fieldLabelKeys = {
    certificateAssessment:
      "stage.anchorCertificate.field.certificateAssessment",
    issuerAssessment: "stage.anchorCertificate.field.issuerAssessment",
    storageChoice: "stage.anchorCertificate.field.storageChoice",
    lotDisposition: "stage.anchorCertificate.field.lotDisposition",
  } as const;

  return (
    <section className="card card--work professional-decision">
      <p className="eyebrow">{t("professionalDecision.layerLabel")}</p>
      <h3>{t("stage.anchorCertificate.decisionHeading")}</h3>
      <p>{t("stage.anchorCertificate.atomicNotice")}</p>
      <div className="classification">
        {(
          Object.keys(options) as Array<keyof typeof options>
        ).map((key) => (
          <label className="field" key={key}>
            <span className="field__label">
              {t(fieldLabelKeys[key])}
            </span>
            <select
              className="field__control"
              value={value[key]}
              disabled={disabled}
              onChange={(event) =>
                select(key, event.target.value as CertificateFormState[typeof key])
              }
            >
              <option value="">{t("check.chooseCategory")}</option>
              {options[key].map(([optionValue, labelKey]) => (
                <option value={optionValue} key={optionValue}>
                  {t(labelKey)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="button button--primary"
        disabled={
          disabled ||
          Object.values(value).some((selected) => selected === "")
        }
        onClick={onSubmit}
      >
        {t(
          processing
            ? "action.processing"
            : "stage.anchorCertificate.commitDecision",
        )}
      </button>
    </section>
  );
}

function CertificateDecisionFeedback({
  decision,
  evaluation,
  revealDetailedFeedback,
}: {
  readonly decision: SubmitCertificateDecisionCommand;
  readonly evaluation: ReturnType<typeof evaluateCertificateDecision> | null;
  readonly revealDetailedFeedback: boolean;
}): ReactNode {
  const t = useTranslator();
  if (evaluation === null) return null;
  const allCorrect =
    evaluation.certificateAssessmentCorrect &&
    evaluation.issuerAssessmentCorrect &&
    evaluation.storageChoiceCorrect &&
    evaluation.lotDispositionCorrect &&
    evaluation.mitigationActions.length === 0;
  const valueLabelKeys = {
    VALID: "stage.anchorCertificate.assessmentValid",
    EXPIRED: "stage.anchorCertificate.assessmentExpired",
    CONTENT_INVALID: "stage.anchorCertificate.assessmentInvalid",
    RECOGNIZED_AUTHORIZED:
      "check.certificateIssuer.optionRecognizedAuthorized",
    RECOGNIZED_UNAUTHORIZED:
      "check.certificateIssuer.optionRecognizedUnauthorized",
    UNRECOGNIZED: "check.certificateIssuer.optionUnrecognized",
    HASH_OFF_CHAIN: "check.certificateStorage.optionHash",
    FULL_DOCUMENT_ON_CHAIN: "check.certificateStorage.optionWholeFile",
    CONTINUE: "stage.anchorCertificate.dispositionContinue",
    HOLD: "stage.anchorCertificate.dispositionHold",
  } as const;
  return (
    <section className="card card--reference professional-decision professional-decision--recorded">
      <p className="eyebrow">{t("professionalDecision.recordLabel")}</p>
      <h3>{t("stage.anchorCertificate.decisionRecorded")}</h3>
      <p>
        <StatusPill
          tone={
            revealDetailedFeedback
              ? allCorrect
                ? "pass"
                : "warn"
              : "neutral"
          }
        >
          {t(
            revealDetailedFeedback
              ? allCorrect
                ? "stage.anchorCertificate.decisionSound"
                : "stage.anchorCertificate.decisionNeedsMitigation"
              : "check.recorded",
          )}
        </StatusPill>
      </p>
      <dl className="asset-card__grid">
        <div className="asset-card__row">
          <dt>{t("stage.anchorCertificate.field.certificateAssessment")}</dt>
          <dd>{t(valueLabelKeys[decision.certificateAssessment])}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("stage.anchorCertificate.field.issuerAssessment")}</dt>
          <dd>{t(valueLabelKeys[decision.issuerAssessment])}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("stage.anchorCertificate.field.storageChoice")}</dt>
          <dd>{t(valueLabelKeys[decision.storageChoice])}</dd>
        </div>
        <div className="asset-card__row">
          <dt>{t("stage.anchorCertificate.field.lotDisposition")}</dt>
          <dd>{t(valueLabelKeys[decision.lotDisposition])}</dd>
        </div>
      </dl>
      <p className="muted">{t("stage.anchorCertificate.initialLocked")}</p>
    </section>
  );
}

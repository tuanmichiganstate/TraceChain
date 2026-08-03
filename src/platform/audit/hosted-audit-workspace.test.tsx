import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type { AuditLearnerProjectionV1 } from "../contracts/audit";
import {
  HostedAuditReport,
  HostedAuditWorkspace,
} from "./hosted-audit-workspace";

function text(
  localizationKey: string,
  value: string,
) {
  return {
    localizationKey,
    valuesByLocale: { en: value, vi: value },
  };
}

function auditProjection(): AuditLearnerProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    auditCaseId: "AUDIT_COFFEE_CONTROLS_001",
    auditCaseVersion: "1.0.0",
    sourceProcessId: "COFFEE_PROCESS_COMPLETED_001",
    sourceProcessVersion: "1.0.0",
    sourceStateHash: "a".repeat(64),
    supportProfile: "GUIDED",
    scopeViewed: false,
    objective: text(
      "platformPack.guidedAudit.objective",
      "Review certificate, correction, and recall controls.",
    ),
    scope: {
      title: text(
        "platformPack.guidedAudit.scope",
        "Coffee control review",
      ),
      periodStart: "2026-01-15T03:00:00.000Z",
      periodEnd: "2026-01-17T03:00:00.000Z",
      organizationIds: ["ORG_AUDITOR"],
      entityIds: ["ENTITY_LOT_CERTIFICATE"],
    },
    categories: [
      {
        choiceId: "CATEGORY_CERTIFICATE_CONTROL",
        label: text(
          "platformPack.guidedAudit.category.certificate",
          "Certificate control",
        ),
      },
    ],
    entities: [
      {
        choiceId: "ENTITY_LOT_CERTIFICATE",
        label: text(
          "platformPack.guidedAudit.entity.certificate",
          "Lot certificate",
        ),
      },
    ],
    rootCauses: [
      {
        choiceId: "ROOT_EXPIRY_REVIEW",
        label: text(
          "platformPack.guidedAudit.root.expiryReview",
          "Validity was not reviewed",
        ),
      },
    ],
    recommendations: [
      {
        choiceId: "REC_HOLD_FOR_VALIDATION",
        label: text(
          "platformPack.guidedAudit.recommend.hold",
          "Hold the lot",
        ),
      },
    ],
    hints: [
      {
        hintId: "HINT_CERTIFICATE_REVIEW",
        text: {
          localizationKey:
            "platformPack.guidedAudit.hint.certificate",
          valuesByLocale: {
            en: "Compare the certificate dates.",
          },
        },
        viewed: false,
      },
    ],
    conclusionCategories: [
      {
        conclusionCategory: "QUALIFIED",
        label: text(
          "platformPack.guidedAudit.conclusion.qualified",
          "Qualified conclusion",
        ),
      },
    ],
    sourceRecords: [
      {
        sourceRecordId: "ATTEMPT_RECALL_001",
        recordKind: "ATTEMPT_AUDIT",
        title: text(
          "platformPack.guidedAudit.record.recallAttempt",
          "Rejected recall attempt",
        ),
        occurredAt: "2026-01-17T03:00:00.000Z",
        organizationId: "ORG_PROCESSOR",
        entityIds: ["ENTITY_LOT_CERTIFICATE"],
        evidenceIds: ["EVID_AUD_CERTIFICATE"],
        policyIds: ["POL_CERTIFICATE_ACCEPTANCE"],
        details: { validationRuleId: "RULE_ROLE_NOT_AUTHORIZED" },
        inspected: false,
      },
    ],
    evidence: [
      {
        evidenceId: "EVID_AUD_CERTIFICATE",
        title: text(
          "platformPack.guidedAudit.evidence.certificate",
          "Certificate validity record",
        ),
        evidenceType: "CERTIFICATE",
        sourceOrganizationId: "ORG_CERTIFIER",
        learnerMetadata: {
          ownerOrganizationId: "ORG_CERTIFIER",
          signatureStatus: "NOT_APPLICABLE",
          ledgerStatus: "OFF_CHAIN",
          completeness: "COMPLETE",
          access: {
            classification: "ROLE_RESTRICTED",
            acquisitionMode: "AVAILABLE",
            delayMinutes: 0,
            costUnits: 0,
          },
        },
        content: { status: "EXPIRED" },
        inspected: false,
        bookmarked: false,
      },
    ],
    policies: [
      {
        policyId: "POL_CERTIFICATE_ACCEPTANCE",
        title: text(
          "platformPack.guidedAudit.policy.certificate",
          "Certificate acceptance policy",
        ),
        configuration: { requiresActiveCertificate: true },
      },
    ],
    drafts: [],
    findings: [],
    maximumSubmittedFindings: 5,
    inputLimits: {
      maximumDrafts: 1,
      maximumDraftRecords: 1,
      maximumFindingRecords: 6,
      findingTitleUtf8Bytes: 48,
      findingObservationUtf8Bytes: 120,
      findingRecommendationUtf8Bytes: 120,
      conclusionFieldUtf8Bytes: 96,
      maximumEvidenceCitationsPerFinding: 4,
      maximumPolicyCitationsPerFinding: 2,
    },
  };
}

describe("HostedAuditWorkspace", () => {
  it("presents a distinct evidence-first workbench and emits audit commands", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <LocaleProvider locale="en">
        <HostedAuditWorkspace
          audit={auditProjection()}
          completed={false}
          busy={false}
          onSubmit={onSubmit}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("region", {
        name: "Audit workpaper",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /submit transaction|commit transaction/iu,
      }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("tab", { name: /^Findings,/iu }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save workpaper draft",
      }),
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: "SAVE_AUDIT_FINDING_DRAFT",
        finding: expect.objectContaining({
          title: "",
          observation: "",
          evidenceIds: [],
          policyIds: [],
        }),
      }),
    );

    await user.click(
      screen.getByRole("tab", { name: /^Evidence,/iu }),
    );
    await user.click(
      screen.getByRole("button", { name: "Record inspection" }),
    );
    expect(onSubmit).toHaveBeenCalledWith({
      commandType: "INSPECT_AUDIT_EVIDENCE",
      evidenceId: "EVID_AUD_CERTIFICATE",
    });

    await user.click(
      screen.getByRole("tab", { name: /^Records,/iu }),
    );
    expect(
      screen.getByText(
        /rejected attempts remain separate audit evidence and do not become ledger transactions/iu,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rejected recall attempt"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", { name: /^Findings,/iu }),
    );
    expect(
      screen.getByRole("heading", { name: "Record a finding" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Policy citations"),
    ).toBeInTheDocument();
  });

  it("removes the draft action after the authored draft-record limit is reached", async () => {
    const user = userEvent.setup();
    const projection = auditProjection();
    render(
      <LocaleProvider locale="en">
        <HostedAuditWorkspace
          audit={{
            ...projection,
            drafts: [
              {
                findingId: "F1",
                categoryId: "CATEGORY_CERTIFICATE_CONTROL",
                entityId: "ENTITY_LOT_CERTIFICATE",
                title: "",
                observation: "",
                severity: "MODERATE",
                materiality: "NON_MATERIAL",
                confidence: 50,
                evidenceIds: [],
                policyIds: [],
                rootCauseCode: "ROOT_EXPIRY_REVIEW",
                recommendationCode: "REC_HOLD_FOR_VALIDATION",
                recommendation: "",
                savedAt: "2026-07-27T03:00:00.000Z",
              },
            ],
          }}
          completed={false}
          busy={false}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />
      </LocaleProvider>,
    );

    await user.click(
      screen.getByRole("tab", { name: /^Findings,/iu }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Save workpaper draft",
      }),
    ).not.toBeInTheDocument();
  });

  it("preserves the finding form until the submitted revision appears in the projection", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <LocaleProvider locale="en">
        <HostedAuditWorkspace
          audit={auditProjection()}
          completed={false}
          busy={false}
          onSubmit={onSubmit}
          createFindingId={() => "AUD_FINDING_PENDING"}
        />
      </LocaleProvider>,
    );

    await user.click(
      screen.getByRole("tab", { name: /^Findings,/iu }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Finding title" }),
      "Certificate review gap",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Evidence-based observation" }),
      "The certificate was accepted before review.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Certificate validity record" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Certificate acceptance policy" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Recommendation rationale" }),
      "Require review before acceptance.",
    );
    await user.click(
      screen.getByRole("button", { name: "Submit finding" }),
    );

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("textbox", { name: "Finding title" }),
    ).toHaveValue("Certificate review gap");
  });

  it("applies the authored UTF-8 byte limit to audit conclusions", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <HostedAuditWorkspace
          audit={auditProjection()}
          completed={false}
          busy={false}
          onSubmit={vi.fn().mockResolvedValue(undefined)}
        />
      </LocaleProvider>,
    );

    await user.click(
      screen.getByRole("tab", { name: /^Conclusion,/iu }),
    );
    const scope = screen.getByRole("textbox", {
      name: "Scope summary",
    });
    await user.type(scope, "ă".repeat(49));

    expect(screen.getByText("98 / 96 UTF-8 bytes")).toBeInTheDocument();
    expect(scope).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Submit audit conclusion" }),
    ).toBeDisabled();
  });

  it("renders the same evidence-linked report for learner and instructor replay", () => {
    render(
      <LocaleProvider locale="en">
        <HostedAuditReport
          report={{
            schemaVersion: "1.0.0",
            auditCaseId: "AUDIT_COFFEE_CONTROLS_001",
            auditCaseVersion: "1.0.0",
            sourceProcessId: "COFFEE_PROCESS_COMPLETED_001",
            sourceProcessVersion: "1.0.0",
            sourceStateHash: "a".repeat(64),
            score: 85,
            maximumScore: 100,
            passScore: 70,
            passed: true,
            scoreLines: [
              {
                scorableItemId: "AUD_DETECTION",
                score: 20,
                maximumScore: 25,
                sourceFindingIds: ["AUD_FINDING_001"],
                sourceEvidenceIds: ["EVID_AUD_CERTIFICATE"],
                sourcePolicyIds: ["POL_CERTIFICATE_ACCEPTANCE"],
              },
            ],
            confirmedFindingIds: ["AUD_FINDING_001"],
            unsupportedFindingIds: [],
            missedFindingDefinitionIds: [
              "FINDING_MISSING_INVESTIGATION",
            ],
            conclusionCategory: "QUALIFIED",
            generatedAt: "2026-07-27T03:00:00.000Z",
          }}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("region", { name: "Guided audit report" }),
    ).toHaveTextContent("Audit score: 85/100");
    expect(screen.getByText("Finding detection")).toBeInTheDocument();
    expect(screen.getByText("20/25")).toBeInTheDocument();
  });
});

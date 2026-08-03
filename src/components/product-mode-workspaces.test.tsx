import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AuditFindingBuilder,
  AuditWorkbenchShell,
  LearningCheckpoint,
  LearningShell,
  PersistentResult,
  ProfessionalDecisionConsole,
  type AuditFindingDraft,
} from "./product-mode-workspaces";

describe("product-mode workspace primitives", () => {
  it("keeps learning support, professional work, and academic checks distinct", () => {
    render(
      <LearningShell
        eyebrow="Guided practice"
        title="Certificate activity"
        description="Review the evidence."
        supportTitle="Learning support"
        support={<p>Recognition and authority are separate checks.</p>}
        context={[
          { id: "role", label: "Role", value: "Quality officer" },
        ]}
      >
        <ProfessionalDecisionConsole
          eyebrow="Professional decision"
          title="Lot disposition"
          description="Choose an operational action."
          evidenceTitle="Evidence used"
          evidence={<p>Expired certificate</p>}
          submitLabel="Record decision"
          onSubmit={() => undefined}
        >
          <label>
            <input type="radio" defaultChecked />
            Hold lot
          </label>
        </ProfessionalDecisionConsole>
        <LearningCheckpoint
          eyebrow="Learning checkpoint"
          title="Integrity question"
          description="Academic reflection"
        >
          <p>Question body</p>
        </LearningCheckpoint>
      </LearningShell>,
    );

    expect(
      screen.getByRole("region", { name: "Certificate activity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Learning support" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Lot disposition" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Integrity question" }),
    ).toBeInTheDocument();
  });

  it("records a professional submission and leaves persistent evidence in the document", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    const { rerender } = render(
      <ProfessionalDecisionConsole
        eyebrow="Professional decision"
        title="Lot disposition"
        description="Choose an action."
        evidenceTitle="Evidence used"
        evidence={<p>Certificate evidence</p>}
        submitLabel="Record decision"
        onSubmit={onSubmit}
      >
        <label>
          <input type="radio" defaultChecked />
          Hold lot
        </label>
      </ProfessionalDecisionConsole>,
    );

    await user.click(screen.getByRole("button", { name: "Record decision" }));
    expect(onSubmit).toHaveBeenCalledOnce();

    rerender(
      <PersistentResult
        tone="pass"
        status="Recorded"
        title="Lot placed on hold"
        summary="This result remains after the toast."
      />,
    );

    expect(
      screen.getByRole("region", { name: "Lot placed on hold" }),
    ).toHaveTextContent("This result remains after the toast.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("provides an evidence-first audit workbench without operational controls", () => {
    render(
      <AuditWorkbenchShell
        eyebrow="Audit workbench"
        title="Ledger investigation"
        description="Inspect evidence."
        context={[{ id: "case", label: "Case", value: "AUD-014" }]}
        tabLabel="Audit sections"
        initialTabId="evidence"
        tabs={[
          {
            id: "evidence",
            label: "Evidence",
            status: "3 sources",
            content: <p>Evidence list</p>,
          },
          {
            id: "findings",
            label: "Findings",
            status: "Draft",
            content: <p>Finding list</p>,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Ledger investigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence, 3 sources" }))
      .toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("button", { name: /commit|submit transaction/iu }),
    ).not.toBeInTheDocument();
  });

  it("requires a title, observation, and cited evidence before a finding can be recorded", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    let draft: AuditFindingDraft = {
      findingId: "AUD-F-003",
      categoryId: "CONTROL",
      entityId: "TX-018",
      title: "",
      observation: "",
      severity: "MODERATE",
      materiality: "MATERIAL",
      confidence: 60,
      evidenceIds: [],
      policyIds: ["POL-004"],
      rootCauseCode: "ROOT-001",
      recommendationCode: "REC-001",
      recommendation: "",
    };

    const renderBuilder = () => (
      <AuditFindingBuilder
        eyebrow="Draft finding"
        title="Finding AUD-F-003"
        description="Link the finding to evidence."
        labels={{
          category: "Finding category",
          entity: "Affected entity",
          findingTitle: "Finding title",
          observation: "Observation",
          severity: "Severity",
          materiality: "Materiality",
          confidence: "Confidence",
          evidence: "Supporting evidence",
          policy: "Applicable policy",
          rootCause: "Root cause",
          recommendationChoice: "Response",
          recommendation: "Recommendation",
          utf8ByteCount: ({ used, maximum }) =>
            `${String(used)} / ${String(maximum)} UTF-8 bytes`,
          utf8ByteExceeded: "Shorten this response.",
          submit: "Record draft finding",
        }}
        categoryOptions={[
          { choiceId: "CONTROL", label: "Control exception" },
        ]}
        entityOptions={[
          { choiceId: "TX-018", label: "Transaction TX-018" },
        ]}
        severityOptions={{
          LOW: "Low",
          MODERATE: "Moderate",
          HIGH: "High",
          CRITICAL: "Critical",
        }}
        materialityOptions={{
          NON_MATERIAL: "Non-material",
          MATERIAL: "Material",
        }}
        evidenceOptions={[
          { evidenceId: "TX-018", label: "Transaction TX-018" },
        ]}
        policyOptions={[
          { evidenceId: "POL-004", label: "Policy POL-004" },
        ]}
        rootCauseOptions={[
          { choiceId: "ROOT-001", label: "Missing review" },
        ]}
        recommendationOptions={[
          { choiceId: "REC-001", label: "Require review" },
        ]}
        draft={draft}
        onChange={(next) => {
          draft = next;
          view.rerender(renderBuilder());
        }}
        onSubmit={onSubmit}
      />
    );
    const view = render(renderBuilder());
    const submit = screen.getByRole("button", {
      name: "Record draft finding",
    });

    expect(submit).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Finding title" }), "Missing review");
    await user.type(screen.getByRole("textbox", { name: "Observation" }), "The review was not documented.");
    await user.click(
      screen.getByRole("checkbox", { name: "Transaction TX-018" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Recommendation" }),
      "Require documented review.",
    );

    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("measures authored text limits in UTF-8 bytes instead of characters", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    let draft: AuditFindingDraft = {
      findingId: "AUD-F-UTF8",
      categoryId: "CONTROL",
      entityId: "TX-018",
      title: "",
      observation: "Reviewed evidence",
      severity: "MODERATE",
      materiality: "MATERIAL",
      confidence: 60,
      evidenceIds: ["TX-018"],
      policyIds: ["POL-004"],
      rootCauseCode: "ROOT-001",
      recommendationCode: "REC-001",
      recommendation: "Document the review",
    };
    const renderBuilder = () => (
      <AuditFindingBuilder
        eyebrow="Draft finding"
        title="Finding AUD-F-UTF8"
        description="Link the finding to evidence."
        labels={{
          category: "Finding category",
          entity: "Affected entity",
          findingTitle: "Finding title",
          observation: "Observation",
          severity: "Severity",
          materiality: "Materiality",
          confidence: "Confidence",
          evidence: "Supporting evidence",
          policy: "Applicable policy",
          rootCause: "Root cause",
          recommendationChoice: "Response",
          recommendation: "Recommendation",
          utf8ByteCount: ({ used, maximum }) =>
            `${String(used)} / ${String(maximum)} UTF-8 bytes`,
          utf8ByteExceeded: "Shorten this response.",
          submit: "Record draft finding",
        }}
        categoryOptions={[
          { choiceId: "CONTROL", label: "Control exception" },
        ]}
        entityOptions={[
          { choiceId: "TX-018", label: "Transaction TX-018" },
        ]}
        severityOptions={{
          LOW: "Low",
          MODERATE: "Moderate",
          HIGH: "High",
          CRITICAL: "Critical",
        }}
        materialityOptions={{
          NON_MATERIAL: "Non-material",
          MATERIAL: "Material",
        }}
        evidenceOptions={[
          { evidenceId: "TX-018", label: "Transaction TX-018" },
        ]}
        policyOptions={[
          { evidenceId: "POL-004", label: "Policy POL-004" },
        ]}
        rootCauseOptions={[
          { choiceId: "ROOT-001", label: "Missing review" },
        ]}
        recommendationOptions={[
          { choiceId: "REC-001", label: "Require review" },
        ]}
        inputLimits={{
          findingTitleUtf8Bytes: 48,
          findingObservationUtf8Bytes: 120,
          findingRecommendationUtf8Bytes: 120,
          maximumEvidenceCitationsPerFinding: 4,
          maximumPolicyCitationsPerFinding: 2,
        }}
        draft={draft}
        onChange={(next) => {
          draft = next;
          view.rerender(renderBuilder());
        }}
        onSubmit={onSubmit}
      />
    );
    const view = render(renderBuilder());

    await user.type(
      screen.getByRole("textbox", { name: "Finding title" }),
      "ă".repeat(25),
    );

    expect(screen.getByText("50 / 48 UTF-8 bytes")).toBeInTheDocument();
    expect(screen.getByText("Shorten this response.")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Finding title" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Record draft finding" }),
    ).toBeDisabled();
  });
});

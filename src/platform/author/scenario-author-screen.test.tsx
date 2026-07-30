import { strToU8 } from "fflate";
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  parseScenarioPackBytes,
  ScenarioAuthorScreen,
  type ScenarioAuthoringApi,
} from "./scenario-author-screen";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("scenario author workspace", () => {
  it("shows the verified Moodle author context without expanding its role", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_LTI_AUTHOR_001",
        displayName: "Moodle Scenario Author",
        roles: ["scenario-author"],
        authenticationSource: "lti",
        ltiLaunchType: "resource-link",
        learningContext: {
          schemaVersion: "2.0.0",
          provider: "lti-1.3",
          launchType: "resource-link",
          issuer: "https://moodle.example.edu",
          clientId: "TRACECHAIN_CLIENT",
          deploymentId: "TRACECHAIN_DEPLOYMENT",
          contextId: "COURSE_BLOCKCHAIN_001",
          resourceLinkId: "RESOURCE_TRACECHAIN_AUTHOR",
          contextTitle: "Blockchain Governance",
          returnUrl:
            "https://moodle.example.edu/course/view.php?id=42",
        },
      }),
      logoutSession: vi.fn(),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };

    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );

    expect(
      await screen.findByText("Moodle Scenario Author"),
    ).toBeInTheDocument();
    expect(screen.getByText("Scenario author")).toBeInTheDocument();
    expect(screen.getByText("Moodle course launch")).toBeInTheDocument();
    expect(screen.getByText("Blockchain Governance")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to Moodle" }),
    ).toHaveAttribute(
      "href",
      "https://moodle.example.edu/course/view.php?id=42",
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Instructor"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Administrator"),
    ).not.toBeInTheDocument();
  });

  it("builds a complete scenario draft through the no-code wizard", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 1_200,
      issues: [],
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Scenario Builder" }),
    ).toBeInTheDocument();

    const domain = screen.getByLabelText("Draft domain");
    await user.clear(domain);
    await user.type(domain, "food-safety");

    await user.click(
      screen.getByRole("button", { name: "Delivery modes" }),
    );
    const communication = screen.getByRole("checkbox", {
      name: "Allow learner communication",
    });
    expect(communication).not.toBeChecked();
    await user.click(communication);

    await user.click(
      screen.getByRole("button", {
        name: "Participants and state",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add organization" }),
    );
    const organizationIds =
      screen.getAllByLabelText("Organization ID");
    await user.clear(organizationIds.at(-1)!);
    await user.type(organizationIds.at(-1)!, "ORG_RETAILER");

    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );

    expect(validatePack).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          domain: "food-safety",
        }),
        scenarios: expect.arrayContaining([
          expect.objectContaining({
            modeConfigurations: expect.arrayContaining([
              expect.objectContaining({
                mode: "tutorial",
                allowCommunication: true,
              }),
            ]),
            organizations: expect.arrayContaining([
              expect.objectContaining({
                organizationId: "ORG_RETAILER",
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("keeps workflow references valid when an author renames a node", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 1,
      issues: [],
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Workflow" }),
    );
    const entryNodeInput = screen.getAllByLabelText("Node ID")[0]!;
    await user.clear(entryNodeInput);
    await user.type(entryNodeInput, "NODE_RENAMED_ENTRY");
    await user.click(
      screen.getByRole("button", { name: "Identity" }),
    );

    expect(
      screen.getByLabelText("Entry workflow node"),
    ).toHaveValue("NODE_RENAMED_ENTRY");
    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );
    expect(validatePack).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: [
          expect.objectContaining({
            entryNodeId: "NODE_RENAMED_ENTRY",
          }),
        ],
      }),
    );
  });

  it("keeps generated localization controls unique after IDs are edited", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Evidence and policies",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add evidence" }),
    );
    const firstEvidenceId =
      screen.getAllByLabelText("Evidence ID").at(-1)!;
    await user.clear(firstEvidenceId);
    await user.type(firstEvidenceId, "EVID_FIRST");
    await user.click(
      screen.getByRole("button", { name: "Add evidence" }),
    );

    const evidenceSection = screen
      .getByRole("heading", { name: "Evidence items" })
      .closest("section");
    if (evidenceSection === null) {
      throw new Error("Expected evidence section.");
    }
    const localizedInputIds = Array.from(
      evidenceSection.querySelectorAll<HTMLInputElement>(
        'input[id$="-en"], input[id$="-vi"]',
      ),
    ).map((input) => input.id);
    expect(new Set(localizedInputIds).size).toBe(
      localizedInputIds.length,
    );
  });

  it("exposes complete evidence provenance and assessment metadata", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Evidence and policies",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add evidence" }),
    );

    expect(
      screen.getByLabelText("Evidence owner organization"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Related hidden actual-state fields"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Access classification"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Signature status")).getByRole(
        "option",
        { name: "Valid" },
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Reliability")).getByRole(
        "option",
        { name: "Not assessed" },
      ),
    ).toBeInTheDocument();
  });

  it("lets an author bind an instructor incident to evidence and release nodes", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 1_200,
      issues: [],
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Evidence and policies",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add evidence" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Add incident" }),
    );

    const incidentEvidence = screen.getByRole("group", {
      name: "Evidence released with this incident",
    });
    expect(
      within(incidentEvidence).getByRole("checkbox", {
        name: "EVIDENCE_NEW",
      }),
    ).toBeChecked();
    const releaseNodes = screen.getByRole("group", {
      name: "Workflow nodes where this incident may be released",
    });
    expect(
      within(releaseNodes).getByRole("checkbox", {
        name: "NODE_BRIEFING",
      }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );
    expect(validatePack).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: [
          expect.objectContaining({
            instructorIncidents: [
              expect.objectContaining({
                evidenceIds: ["EVIDENCE_NEW"],
                releaseAtNodeIds: ["NODE_BRIEFING"],
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("describes an unconnected workflow node without calling it terminal", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Workflow" }),
    );
    await user.selectOptions(
      screen.getAllByLabelText("Node type")[0]!,
      "DECISION",
    );
    await user.click(
      screen.getByRole("button", { name: "Add node" }),
    );
    await user.click(
      screen
        .getAllByRole("button", { name: "Remove transition" })
        .at(-1)!,
    );

    expect(
      screen.getByText(
        "No transition has been configured for this node yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Decision ID"),
    ).toHaveValue("DECISION");
    const decisionIdControl = screen.getByLabelText("Decision ID");
    const decisionCard = decisionIdControl.closest("article");
    if (decisionCard === null) {
      throw new Error("Expected the inserted decision card.");
    }
    await user.clear(decisionIdControl);
    await user.type(
      decisionIdControl,
      "DECISION_AWARD_RESPONSE",
    );
    expect(
      within(decisionCard).getByLabelText("Node type"),
    ).toHaveValue("DECISION");
    expect(
      screen.getByLabelText("Decision ID"),
    ).toHaveValue("DECISION_AWARD_RESPONSE");

    await user.click(
      within(decisionCard).getByRole("button", {
        name: "Add transition",
      }),
    );
    expect(
      within(decisionCard).getByLabelText("Destination node"),
    ).toHaveValue("NODE_COMPLETE");
  });

  it("keeps every fixed mode bound to the outcome model that defines its result", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 1_200,
      issues: [],
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Delivery modes" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Standard" }),
    );

    expect(screen.getByLabelText("Outcome model")).toHaveValue(
      "OUTCOME_MODEL_DEFAULT",
    );
    expect(screen.getByLabelText("Forced outcome code")).toHaveValue(
      "OUTCOME_DEFAULT",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );
    expect(validatePack).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarios: [
          expect.objectContaining({
            modeConfigurations: expect.arrayContaining([
              expect.objectContaining({
                mode: "standard",
                outcomeModelId: "OUTCOME_MODEL_DEFAULT",
                forcedOutcomeCode: "OUTCOME_DEFAULT",
              }),
            ]),
          }),
        ],
      }),
    );
  });

  it("inserts a new authored step before completion and keeps the simple path connected", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 1_200,
      issues: [],
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Workflow" }),
    );
    await user.selectOptions(
      screen.getAllByLabelText("Node type")[0]!,
      "DECISION",
    );
    await user.click(
      screen.getByRole("button", { name: "Add node" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );

    const submitted = validatePack.mock.calls[0]?.[0] as
      | ScenarioPackV1
      | undefined;
    const nodes = submitted?.scenarios[0]?.nodes;
    expect(nodes?.map((node) => node.nodeType)).toEqual([
      "BRIEFING",
      "DECISION",
      "COMPLETION",
    ]);
    expect(nodes?.[0]?.transitions[0]?.toNodeId).toBe(
      nodes?.[1]?.nodeId,
    );
    expect(nodes?.[1]?.transitions[0]?.toNodeId).toBe(
      nodes?.[2]?.nodeId,
    );
  });

  it("prevents an incident until there is evidence to release", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Evidence and policies",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Add incident" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Add at least one evidence item before creating an incident.",
      ),
    ).toBeInTheDocument();
  });

  it("shows human-readable assessment controls without opening schema objects", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Assessment" }),
    );

    expect(screen.getByLabelText("Framework ID")).toBeVisible();
    expect(screen.getByLabelText("Competency ID")).toBeVisible();
    expect(
      screen.getByLabelText("Performance indicator ID"),
    ).toBeVisible();
    expect(screen.getByLabelText("Rubric ID")).toBeVisible();
    expect(screen.getByLabelText("Evidence rule ID")).toBeVisible();
    expect(
      screen.queryByText("Value type"),
    ).not.toBeInTheDocument();
  });

  it("shows exact local contract failures in the review step", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.clear(screen.getByLabelText("Draft pack ID"));
    await user.click(
      screen.getByRole("button", { name: "Review" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Complete contract check",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("INVALID_IDENTIFIER"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$.packId").length).toBeGreaterThan(0);
  });

  it("explains which authored item prevents deletion", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Participants and state",
      }),
    );

    expect(
      screen.getByText(
        "Used by ROLE_DECISION_MAKER. Reassign those references before deleting this item.",
      ),
    ).toBeInTheDocument();
  });

  it("names Sandbox unambiguously in Vietnamese", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="vi">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Bắt đầu kịch bản mới",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Chế độ triển khai",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Môi trường thử nghiệm (Sandbox)",
      }),
    ).toBeInTheDocument();
  });

  it("recovers an unfinished scenario draft for the same author", async () => {
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_RECOVERY",
        email: "recovery@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    const firstRender = render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    const domain = screen.getByLabelText("Draft domain");
    await user.clear(domain);
    await user.type(domain, "trade-finance");
    await waitFor(() => {
      expect(window.localStorage.length).toBe(1);
    });
    firstRender.unmount();

    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Saved draft available",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Start a new scenario",
      }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Restore draft" }),
    );
    expect(screen.getByLabelText("Draft domain")).toHaveValue(
      "trade-finance",
    );
  });

  it("opens the builder section named by a validation issue", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: false,
      checkedCount: 42,
      issues: [
        {
          code: "UNKNOWN_ORGANIZATION_REFERENCE",
          path: "$.scenarios[0].evidenceItems[0].sourceOrganizationId",
          message: "must reference a defined organization",
        },
      ],
      packId: "PACK_NEW_SCENARIO",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Start a new scenario",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Open relevant builder section",
      }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Evidence, policies, and incidents",
      }),
    ).toBeInTheDocument();
  });

  it("parses JSON, YAML, and a bounded scenario-pack ZIP as data", () => {
    expect(
      parseScenarioPackBytes(
        "pack.json",
        strToU8('{"packId":"PACK_JSON"}'),
      ),
    ).toEqual({ packId: "PACK_JSON" });
    expect(
      parseScenarioPackBytes(
        "pack.yaml",
        strToU8("packId: PACK_YAML\nversion: 1.0.0\n"),
      ),
    ).toEqual({ packId: "PACK_YAML", version: "1.0.0" });
    expect(
      parseScenarioPackBytes(
        "pack.zip",
        Uint8Array.from(
          Buffer.from(
            "UEsDBBQAAAAIAKqr+Fzpd68TFwAAABUAAAAdAAAAc2NlbmFyaW8vdHJhY2VjaGFpbi5wYWNrLmpzb26rVipITM72TFGyUgpwdPaOj/IMUKoFAFBLAQIUABQAAAAIAKqr+Fzpd68TFwAAABUAAAAdAAAAAAAAAAAAAAAAAAAAAABzY2VuYXJpby90cmFjZWNoYWluLnBhY2suanNvblBLBQYAAAAAAQABAEsAAABSAAAAAAA=",
            "base64",
          ),
        ),
      ),
    ).toEqual({ packId: "PACK_ZIP" });
  });

  it("loads the self-localized disciplinary starter through the same validator", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 1019,
      issues: [],
      packId: "PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Load pharmaceutical cold-chain starter",
      }),
    );
    const domain = screen.getByLabelText("Draft domain");
    await user.clear(domain);
    await user.type(domain, "pharmaceutical-quality");
    await user.click(
      screen.getByRole("button", {
        name: "Evidence and policies",
      }),
    );
    const referencedEvidence = screen
      .getByText("EVID_PHARMA_SENSOR_SUMMARY")
      .closest("article");
    if (referencedEvidence === null) {
      throw new Error("Expected the referenced evidence card.");
    }
    expect(
      within(referencedEvidence).getAllByRole("button", {
        name: "Remove",
      })[0],
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Workflow" }),
    );
    expect(
      screen.getByRole("heading", { name: "Workflow map" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "NODE_PHARMA_BRIEFING → NODE_PHARMA_EVIDENCE",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Assessment" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "1. Apply assessment definitions to this scenario",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "4. Define automated evidence rules",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );

    expect(validatePack).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: "PACK_PHARMACEUTICAL_COLD_CHAIN_STARTER",
        manifest: expect.objectContaining({
          domain: "pharmaceutical-quality",
        }),
        localizationCatalogs: expect.objectContaining({
          en: expect.any(Object),
          vi: expect.any(Object),
        }),
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Validation passed",
      }),
    ).toBeInTheDocument();
  });

  it("loads a complete Audit case bank and exposes its validation contract", async () => {
    const validatePack = vi.fn().mockResolvedValue({
      schemaVersion: "1.0.0",
      valid: true,
      checkedCount: 3_000,
      issues: [],
      packId: "PACK_CHALLENGE_COFFEE_AUDIT",
      version: "1.0.0",
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([]),
      validatePack,
      importPack: vi.fn(),
      loadPack: vi.fn(),
      preview: vi.fn(),
      compare: vi.fn(),
      publish: vi.fn(),
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Load Audit case-bank starter",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Audit authoring contract",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "BANK_COFFEE_AUDIT_CHALLENGE_V1@1.0.0",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Material findings 2–3/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/requires expert review and pilot calibration/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Validate without importing",
      }),
    );
    expect(validatePack).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: "PACK_CHALLENGE_COFFEE_AUDIT",
        auditVariantBanks: [
          expect.objectContaining({
            bankId: "BANK_COFFEE_AUDIT_CHALLENGE_V1",
          }),
        ],
      }),
    );
  });

  it("keeps the default API stable while local library controls rerender", async () => {
    const sessionRequests: string[] = [];
    const libraryRequests: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/v1/session") {
        sessionRequests.push(path);
        return Response.json({
          userId: "USER_AUTHOR_001",
          email: "author@example.edu",
          roles: ["scenario-author"],
        });
      }
      if (path === "/api/v1/scenario-packs") {
        libraryRequests.push(path);
        return Response.json({
          packs: [
            {
              schemaVersion: "1.0.0",
              packId: "PACK_STABLE_LIBRARY",
              version: "1.0.0",
              status: "draft",
              domain: "supply-chain",
              titleKey: "pack.stable.title",
              supportedLocales: ["vi", "en"],
              scenarioCount: 1,
              updatedAt: "2026-07-26T04:00:00.000Z",
              updatedByUserId: "USER_AUTHOR_001",
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);

    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen />
      </LocaleProvider>,
    );

    expect(
      await screen.findByText("PACK_STABLE_LIBRARY"),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Filter by lifecycle status"),
      "draft",
    );

    expect(screen.getByText("PACK_STABLE_LIBRARY")).toBeInTheDocument();
    expect(sessionRequests).toHaveLength(1);
    expect(libraryRequests).toHaveLength(1);
  });

  it("lists lifecycle actions and generates a role-filtered preview", async () => {
    const pack = structuredClone(packJson) as ScenarioPackV1;
    const scenario = pack.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    const item = {
      schemaVersion: "1.0.0" as const,
      packId: pack.packId,
      version: pack.version,
      status: "draft" as const,
      domain: pack.manifest.domain,
      titleKey: pack.manifest.title.localizationKey,
      supportedLocales: pack.supportedLocales,
      scenarioCount: pack.scenarios.length,
      updatedAt: "2026-07-24T03:00:00.000Z",
      updatedByUserId: "USER_AUTHOR_001",
    };
    const publish = vi.fn().mockResolvedValue(undefined);
    const preview = vi.fn().mockResolvedValue({
      schemaVersion: "2.0.0",
      packId: pack.packId,
      packVersion: pack.version,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.version,
      locale: "vi",
      mode: "tutorial",
      roleId: scenario.roles[0]?.roleId,
      scenarioTitle: "Tình huống chứng nhận",
      modeConfiguration: {
        allowHints: true,
        allowRetry: true,
        allowBacktracking: true,
        feedbackTiming: "immediate",
        showScores: true,
        outcomeStrategy: "forced",
        seedPolicy: "generated",
        allowCommunication: false,
        allowEvidenceRequests: false,
      },
      nodes: [
        {
          nodeId: scenario.entryNodeId,
          nodeType: "BRIEFING",
          title: "Nhiệm vụ chứng nhận",
          visibleEvidenceIds: [],
          transitionNodeIds: ["certificate-evidence"],
        },
      ],
      evidenceDefinitions: [
        {
          evidenceId: "EVID_CERTIFICATE_RECORD",
          evidenceType: "DOCUMENT_REFERENCE",
          title: {
            localizationKey: "unused.evidence.title",
            valuesByLocale: {
              en: "Certificate record",
              vi: "Hồ sơ chứng nhận",
            },
          },
          sourceOrganizationId: "ORG_CERTIFICATION_BODY",
          visibleToRoleIds: [
            scenario.roles[0]?.roleId ?? "PRODUCER_MANAGER",
          ],
          learnerMetadata: {
            signatureStatus: "VALID",
            ledgerStatus: "HASH_ANCHORED",
            completeness: "COMPLETE",
            access: {
              classification: "ROLE_RESTRICTED",
              acquisitionMode: "AVAILABLE",
              delayMinutes: 0,
              costUnits: 0,
            },
          },
          assessmentMetadata: {
            reliability: "RELIABLE",
            contentStatus: "ACCURATE",
            limitationCodes: [
              "HASH_DOES_NOT_PROVE_SOURCE_TRUTH",
            ],
            hiddenConditionReferences: [],
          },
        },
      ],
    });
    const api: ScenarioAuthoringApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_001",
        email: "author@example.edu",
        roles: ["scenario-author"],
      }),
      listPacks: vi.fn().mockResolvedValue([item]),
      validatePack: vi.fn(),
      importPack: vi.fn(),
      loadPack: vi.fn().mockResolvedValue(pack),
      preview,
      compare: vi.fn(),
      publish,
      retire: vi.fn(),
    };
    render(
      <LocaleProvider locale="en">
        <ScenarioAuthorScreen api={api} />
      </LocaleProvider>,
    );
    const library = (await screen.findByRole("heading", {
      name: "Scenario library",
    })).closest("section");
    if (library === null) throw new Error("Expected library.");
    const user = userEvent.setup();
    await user.click(
      within(library).getByRole("button", { name: "Open" }),
    );
    const previewHeading = await screen.findByRole("heading", {
      name: `Preview ${pack.packId} version ${pack.version}`,
    });
    const previewSection = previewHeading.closest("section");
    if (previewSection === null) throw new Error("Expected preview.");
    await user.click(
      within(previewSection).getByRole("button", {
        name: "Generate role preview",
      }),
    );

    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: pack.packId,
        version: pack.version,
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenario.version,
        mode: "tutorial",
        locale: pack.supportedLocales[0],
      }),
    );
    expect(
      await within(previewSection).findByText(
        "Nhiệm vụ chứng nhận",
      ),
    ).toBeInTheDocument();
    expect(
      within(previewSection).getByRole("heading", {
        name: "Evidence interpretation contract",
      }),
    ).toBeInTheDocument();
    expect(
      within(previewSection).getByText(
        "HASH_DOES_NOT_PROVE_SOURCE_TRUTH",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(library).getByRole("button", { name: "Publish" }),
    );
    expect(publish).toHaveBeenCalledWith(pack.packId, pack.version);
  });
});

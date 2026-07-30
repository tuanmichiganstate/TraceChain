import { strToU8 } from "fflate";
import { render, screen, within } from "@testing-library/react";
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
  vi.unstubAllGlobals();
});

describe("scenario author workspace", () => {
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

import { strToU8 } from "fflate";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  parseScenarioPackBytes,
  ScenarioAuthorScreen,
  type ScenarioAuthoringApi,
} from "./scenario-author-screen";

describe("scenario author workspace", () => {
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
      schemaVersion: "1.0.0",
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

    await user.click(
      within(library).getByRole("button", { name: "Publish" }),
    );
    expect(publish).toHaveBeenCalledWith(pack.packId, pack.version);
  });
});

import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import en from "../../locales/en.json";
import vi from "../../locales/vi.json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  compareScenarioPackVersions,
  createScenarioRolePreview,
  scenarioPackValidationReport,
} from "./authoring";
import { validateScenarioPack } from "./validation";

function validPack(): ScenarioPackV1 {
  const result = validateScenarioPack(structuredClone(packJson), {
    localizationCatalogs: { en, vi },
  });
  if (!result.isValid) throw new Error("Expected valid fixture pack.");
  return result.pack;
}

describe("scenario authoring services", () => {
  it("returns all actionable validation diagnostics without storing content", () => {
    const invalid = structuredClone(packJson);
    const scenario = invalid.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    scenario.entryNodeId = "MISSING_NODE";
    scenario.modeConfigurations = [];

    const report = scenarioPackValidationReport(invalid, { en, vi });

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MODE_CONFIGURATION_MISMATCH",
        }),
        expect.objectContaining({
          code: "UNKNOWN_ENTRY_NODE",
        }),
      ]),
    );
  });

  it("previews only role-visible evidence in deterministic workflow order", () => {
    const pack = validPack();
    const scenario = pack.scenarios[0];
    const role = scenario?.roles.find(
      (candidate) => candidate.roleId === "LOGISTICS_COORDINATOR",
    );
    if (scenario === undefined || role === undefined) {
      throw new Error("Expected hosted coffee role.");
    }

    const preview = createScenarioRolePreview({
      pack,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.version,
      locale: "en",
      mode: "standard",
      roleId: role.roleId,
      localizationCatalogs: { en, vi },
    });

    expect(preview.scenarioTitle).toBe(
      en[
        "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.title"
      ],
    );
    expect(preview.modeConfiguration).toMatchObject({
      allowHints: false,
      feedbackTiming: "final",
      outcomeStrategy: "forced",
    });
    expect(preview.nodes[0]?.nodeId).toBe(scenario.entryNodeId);
    const release = preview.nodes.find(
      (node) => node.nodeType === "EVIDENCE_RELEASE",
    );
    expect(release?.visibleEvidenceIds).toContain(
      "EVID_CERTIFICATE_RECORD",
    );
    expect(JSON.stringify(preview)).not.toContain("actualState");
  });

  it("previews a self-localized disciplinary pack without application catalogue keys", () => {
    const result = validateScenarioPack(
      structuredClone(pharmaceuticalPackJson),
    );
    if (!result.isValid) {
      throw new Error("Expected the disciplinary starter to validate.");
    }

    const preview = createScenarioRolePreview({
      pack: result.pack,
      scenarioId: "SCN_PHARMA_COLD_CHAIN_STARTER",
      scenarioVersion: "1.0.0",
      locale: "vi",
      mode: "tutorial",
      roleId: "QUALITY_MANAGER",
      localizationCatalogs: {},
    });

    expect(preview.scenarioTitle).toBe("Xem xét sai lệch nhiệt độ");
    expect(preview.nodes.map((node) => node.nodeId)).toEqual([
      "NODE_PHARMA_BRIEFING",
      "NODE_PHARMA_EVIDENCE",
      "NODE_PHARMA_DECISION",
      "NODE_PHARMA_COMPLETE",
    ]);
    expect(preview.nodes[1]?.visibleEvidenceIds).toEqual([
      "EVID_PHARMA_SENSOR_SUMMARY",
    ]);
  });

  it("compares two immutable version definitions by stable JSON path", () => {
    const from = validPack();
    const to = structuredClone(from) as ScenarioPackV1;
    const mutable = to as {
      version: string;
      manifest: { domain: string };
    };
    mutable.version = "1.5.0";
    mutable.manifest.domain = "supply-chain-governance";

    const comparison = compareScenarioPackVersions(from, to);

    expect(comparison).toMatchObject({
      packId: from.packId,
      fromVersion: "1.4.0",
      toVersion: "1.5.0",
    });
    expect(comparison.changedPaths).toEqual(
      expect.arrayContaining(["manifest.domain", "version"]),
    );
  });
});

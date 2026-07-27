import { describe, expect, it } from "vitest";
import packJson from "../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import challengePackJson from "../../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { publishScenarioPack } from "../platform/scenario-packs/publication";
import { validateScenarioPack } from "../platform/scenario-packs/validation";
import { embedConfiguration } from "./hash";
import {
  AUDIT_CHALLENGE_PRESET,
  AUDIT_GUIDED_PRESET,
} from "./presets";
import {
  loadAuditRuntimePackage,
} from "./audit-runtime-loader";
import type { RuntimeFetch } from "./runtime-loader";

function files() {
  const validation = validateScenarioPack(structuredClone(packJson));
  if (!validation.isValid) {
    throw new Error("Guided Audit fixture is invalid.");
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "TRACECHAIN_PACKAGE_GENERATOR",
  });
  const source = `${JSON.stringify(pack, null, 2)}\n`;
  return {
    "./tracechain.config.json":
      embedConfiguration(AUDIT_GUIDED_PRESET),
    "./audit-scenario-pack.json": pack,
    "./build-info.json": {
      auditScenarioPackHash: sha256Hex(source),
      auditScenarioPackContentHash:
        pack.publication?.contentHash,
      auditPersistenceSchemaVersion: "TA2",
    },
  } as const;
}

function fetcher(
  values: Readonly<Record<string, unknown>>,
): RuntimeFetch {
  return async (path) => ({
    ok: path in values,
    status: path in values ? 200 : 404,
    json: async () => values[path],
  });
}

function challengeFiles() {
  const validation = validateScenarioPack(
    structuredClone(challengePackJson),
  );
  if (!validation.isValid) {
    throw new Error("Audit Challenge fixture is invalid.");
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "TRACECHAIN_PACKAGE_GENERATOR",
  });
  const source = `${JSON.stringify(pack, null, 2)}\n`;
  return {
    "./tracechain.config.json":
      embedConfiguration(AUDIT_CHALLENGE_PRESET),
    "./audit-scenario-pack.json": pack,
    "./build-info.json": {
      auditScenarioPackHash: sha256Hex(source),
      auditScenarioPackContentHash:
        pack.publication?.contentHash,
      auditPersistenceSchemaVersion: "TA2",
    },
  } as const;
}

describe("Audit runtime package loader", () => {
  it("loads one exact published Audit case and its TA2 metadata", async () => {
    const runtime = await loadAuditRuntimePackage(
      fetcher(files()),
    );

    expect(runtime.configuration).toEqual(AUDIT_GUIDED_PRESET);
    expect(runtime.pack.status).toBe("published");
    expect(runtime.scenario.scenarioId).toBe(
      AUDIT_GUIDED_PRESET.scenarioId,
    );
    expect(runtime.auditCase.auditCaseId).toBe(
      AUDIT_GUIDED_PRESET.auditCaseId,
    );
  });

  it("rejects package bytes that disagree with build metadata", async () => {
    const values = files();
    await expect(
      loadAuditRuntimePackage(
        fetcher({
          ...values,
          "./build-info.json": {
            ...values["./build-info.json"],
            auditScenarioPackHash: "0".repeat(64),
          },
        }),
      ),
    ).rejects.toThrow(/metadata/iu);
  });

  it("loads the immutable Audit Challenge bank without selecting a new case", async () => {
    const runtime = await loadAuditRuntimePackage(
      fetcher(challengeFiles()),
    );

    expect(runtime.variantBank?.bankId).toBe(
      AUDIT_CHALLENGE_PRESET.scenarioVariation.strategy ===
        "SEEDED_VARIANT_BANK"
        ? AUDIT_CHALLENGE_PRESET.scenarioVariation.bankId
        : "",
    );
    expect(runtime.scenario.scenarioId).toBe(
      runtime.variantBank?.variants[0]?.scenarioId,
    );
  });
});

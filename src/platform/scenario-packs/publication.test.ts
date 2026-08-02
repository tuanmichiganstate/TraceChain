import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import {
  MemoryScenarioPackRepository,
  publishScenarioPack,
  ScenarioPackPublicationError,
  verifyScenarioPackContentHash,
} from "./publication";
import { validateScenarioPack } from "./validation";

function draftPack(): ScenarioPackV2 {
  const result = validateScenarioPack(structuredClone(packJson));
  if (!result.isValid) throw new Error("The test pack must be valid.");
  return result.pack;
}

const publication = {
  publishedAt: "2026-07-24T03:00:00.000Z",
  publishedBy: "USER_SCENARIO_AUTHOR_001",
} as const;

describe("scenario-pack publication", () => {
  it("creates a deterministic content identity and freezes the result", () => {
    const first = publishScenarioPack(draftPack(), publication);
    const second = publishScenarioPack(draftPack(), publication);

    expect(first.status).toBe("published");
    expect(first.publication?.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.publication?.contentHash).toBe(
      second.publication?.contentHash,
    );
    expect(verifyScenarioPackContentHash(first)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.manifest.title)).toBe(true);
    expect(
      Reflect.set(
        first.manifest.title,
        "localizationKey",
        "platformPack.changed.title",
      ),
    ).toBe(false);
    expect(first.manifest.title.localizationKey).not.toBe(
      "platformPack.changed.title",
    );
  });

  it("detects changes to published content", () => {
    const published = publishScenarioPack(draftPack(), publication);
    const changed = structuredClone(published) as ScenarioPackV2;
    const manifest = changed.manifest.title as { localizationKey: string };
    manifest.localizationKey = "platformPack.changed.title";

    expect(verifyScenarioPackContentHash(changed)).toBe(false);
  });

  it("refuses publication when a hosted mode cannot produce a valid experience", () => {
    const invalid = draftPack();
    const standard = invalid.scenarios[0]?.modeConfigurations.find(
      (configuration) => configuration.mode === "standard",
    );
    if (standard === undefined) {
      throw new Error("Expected a standard hosted mode.");
    }
    (
      standard as {
        feedbackTiming: "immediate" | "stage-end" | "final";
      }
    ).feedbackTiming = "immediate";

    expect(() => publishScenarioPack(invalid, publication)).toThrow(
      /assessment delivery requires final feedback/u,
    );
  });

  it("prevents replacement of a published pack version", async () => {
    const repository = new MemoryScenarioPackRepository();
    await repository.saveDraft(draftPack());
    const published = await repository.publish(
      packJson.packId,
      packJson.version,
      publication,
    );

    await expect(repository.saveDraft(draftPack())).rejects.toBeInstanceOf(
      ScenarioPackPublicationError,
    );
    await expect(
      repository.publish(
        packJson.packId,
        packJson.version,
        publication,
      ),
    ).rejects.toBeInstanceOf(ScenarioPackPublicationError);
    expect(
      await repository.find(packJson.packId, packJson.version),
    ).toBe(published);
  });

  it("retires published content as metadata and replays the command idempotently", async () => {
    const repository = new MemoryScenarioPackRepository();
    await repository.saveDraft(draftPack());
    const published = await repository.publish(
      packJson.packId,
      packJson.version,
      publication,
    );
    const originalHash = published.publication?.contentHash;
    const metadata = {
      commandId: "CMD_RETIRE_PACK_001",
      retiredAt: "2026-07-24T04:00:00.000Z",
      retiredBy: "USER_SCENARIO_AUTHOR_001",
    } as const;

    const first = await repository.retire(
      packJson.packId,
      packJson.version,
      metadata,
    );
    const second = await repository.retire(
      packJson.packId,
      packJson.version,
      metadata,
    );

    expect(first.wasIdempotentReplay).toBe(false);
    expect(second.wasIdempotentReplay).toBe(true);
    expect(first.pack.status).toBe("retired");
    expect(first.pack.publication?.contentHash).toBe(originalHash);
    expect(verifyScenarioPackContentHash(first.pack)).toBe(true);
    expect(await repository.list()).toEqual([
      expect.objectContaining({
        packId: packJson.packId,
        version: packJson.version,
        status: "retired",
        retiredAt: metadata.retiredAt,
      }),
    ]);
    await expect(repository.saveDraft(draftPack())).rejects.toBeInstanceOf(
      ScenarioPackPublicationError,
    );
  });
});

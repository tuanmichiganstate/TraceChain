import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  MemoryScenarioPackRepository,
  publishScenarioPack,
  ScenarioPackPublicationError,
  verifyScenarioPackContentHash,
} from "./publication";
import { validateScenarioPack } from "./validation";

function draftPack(): ScenarioPackV1 {
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
    const changed = structuredClone(published) as ScenarioPackV1;
    const manifest = changed.manifest.title as { localizationKey: string };
    manifest.localizationKey = "platformPack.changed.title";

    expect(verifyScenarioPackContentHash(changed)).toBe(false);
  });

  it("prevents replacement of a published pack version", async () => {
    const repository = new MemoryScenarioPackRepository();
    await repository.saveDraft(draftPack());
    const published = await repository.publish(
      "PACK_STANDARD_COFFEE_STAGE3",
      "1.0.0",
      publication,
    );

    await expect(repository.saveDraft(draftPack())).rejects.toBeInstanceOf(
      ScenarioPackPublicationError,
    );
    await expect(
      repository.publish(
        "PACK_STANDARD_COFFEE_STAGE3",
        "1.0.0",
        publication,
      ),
    ).rejects.toBeInstanceOf(ScenarioPackPublicationError);
    expect(
      await repository.find("PACK_STANDARD_COFFEE_STAGE3", "1.0.0"),
    ).toBe(published);
  });
});

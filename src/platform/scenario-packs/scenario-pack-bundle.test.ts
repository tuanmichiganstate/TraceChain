import {
  strToU8,
  unzipSync,
  Zip,
  ZipPassThrough,
} from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pharmaceuticalTemplate from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import {
  createScenarioPackBundle,
  parseScenarioPackBundle,
  ScenarioPackBundleError,
} from "./scenario-pack-bundle";

function zipEntries(
  entries: Readonly<Record<string, Uint8Array>>,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const archive = new Zip((error, chunk) => {
    if (error !== null) throw error;
    if (chunk !== null) chunks.push(chunk);
  });
  for (const [path, bytes] of Object.entries(entries)) {
    const file = new ZipPassThrough(path);
    file.mtime = new Date("1980-01-01T00:00:00.000Z");
    archive.add(file);
    file.push(bytes, true);
  }
  archive.end();
  const byteLength = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function fixture(): {
  readonly pack: ScenarioPackV2;
  readonly assets: ReadonlyMap<string, Uint8Array>;
} {
  const pack = structuredClone(
    pharmaceuticalTemplate,
  ) as ScenarioPackV2;
  const assets = new Map(
    pack.imageAssets.map((asset) => [
      asset.filePath,
      new Uint8Array(
        readFileSync(
          resolve(
            process.cwd(),
            "scenario-packs/pharmaceutical-cold-chain",
            asset.filePath,
          ),
        ),
      ),
    ]),
  );
  return { pack, assets };
}

describe("canonical scenario-pack ZIP", () => {
  it("round-trips one complete pack deterministically", () => {
    const { pack, assets } = fixture();
    const first = createScenarioPackBundle(pack, assets);
    const second = createScenarioPackBundle(pack, assets);
    expect(first).toEqual(second);
    const parsed = parseScenarioPackBundle(first);
    expect(parsed.pack).toEqual(pack);
    expect(parsed.assets).toEqual(assets);
  });

  it("rejects missing, undeclared, and hash-mismatched entries", () => {
    const { pack, assets } = fixture();
    const [path, bytes] = [...assets.entries()][0]!;
    expect(() => createScenarioPackBundle(pack, new Map())).toThrow(
      ScenarioPackBundleError,
    );
    const valid = unzipSync(createScenarioPackBundle(pack, assets));
    expect(() =>
      parseScenarioPackBundle(
        zipEntries({
          ...valid,
          "media/scenes/undeclared.png": bytes,
        }),
      ),
    ).toThrow(/undeclared/u);
    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 1] =
      (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() =>
      parseScenarioPackBundle(
        zipEntries({
          "tracechain.pack.json": strToU8(
            `${JSON.stringify(pack)}\n`,
          ),
          ...Object.fromEntries(
            [...assets.entries()].filter(
              ([assetPath]) => assetPath !== path,
            ),
          ),
          [path]: tampered,
        }),
      ),
    ).toThrow(/digest/u);
  });
});

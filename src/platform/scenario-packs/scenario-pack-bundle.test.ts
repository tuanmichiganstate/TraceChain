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
import { changeScenarioPack } from "../author/scenario-builder-model";
import {
  createScenarioPackBundle,
  parseScenarioPackBundle,
  ScenarioPackBundleError,
} from "./scenario-pack-bundle";
import { inspectScenarioImage } from "./image-assets";

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
  readonly path: string;
  readonly bytes: Uint8Array;
} {
  const bytes = new Uint8Array(
    readFileSync(
      resolve(
        process.cwd(),
        "public/media/staff/producer-manager.webp",
      ),
    ),
  );
  const inspected = inspectScenarioImage(bytes, "cold-room.webp");
  const path = "media/scenes/cold-room.webp";
  const pack = changeScenarioPack(
    structuredClone(pharmaceuticalTemplate) as ScenarioPackV2,
    (draft) => {
      draft.imageAssets = [
        {
          assetId: "IMAGE_COLD_ROOM",
          purpose: "SCENE_ILLUSTRATION",
          sourceType: "ORIGINAL_WITH_RELEASE",
          licenseOrApprovalReference: "TEST_FIXTURE",
          rightsDeclaration: "NO_IDENTIFIABLE_PEOPLE",
          originalFileName: inspected.originalFileName,
          filePath: path,
          sha256: inspected.sha256,
          byteLength: inspected.byteLength,
          width: inspected.width,
          height: inspected.height,
          mimeType: inspected.mimeType,
          defaultAlt: draft.manifest.title,
        },
      ];
      draft.assetHashes = { [path]: inspected.sha256 };
      draft.scenarios[0]!.nodes[0]!.image = {
        assetId: "IMAGE_COLD_ROOM",
      };
    },
  );
  return { pack, path, bytes };
}

describe("canonical scenario-pack ZIP", () => {
  it("round-trips one complete pack deterministically", () => {
    const { pack, path, bytes } = fixture();
    const first = createScenarioPackBundle(
      pack,
      new Map([[path, bytes]]),
    );
    const second = createScenarioPackBundle(
      pack,
      new Map([[path, bytes]]),
    );
    expect(first).toEqual(second);
    const parsed = parseScenarioPackBundle(first);
    expect(parsed.pack).toEqual(pack);
    expect(parsed.assets.get(path)).toEqual(bytes);
    expect([...parsed.assets.keys()]).toEqual([path]);
  });

  it("rejects missing, undeclared, and hash-mismatched entries", () => {
    const { pack, path, bytes } = fixture();
    expect(() => createScenarioPackBundle(pack, new Map())).toThrow(
      ScenarioPackBundleError,
    );
    const valid = unzipSync(
      createScenarioPackBundle(pack, new Map([[path, bytes]])),
    );
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
          [path]: tampered,
        }),
      ),
    ).toThrow(/digest/u);
  });
});

import {
  Zip,
  ZipPassThrough,
  strFromU8,
  strToU8,
  unzipSync,
} from "fflate";
import {
  sha256Bytes,
  toHex,
} from "../../infrastructure/hashing/sha256";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import { inspectScenarioImage } from "./image-assets";
import { validateScenarioPack } from "./validation";

export const SCENARIO_PACK_MANIFEST_PATH = "tracechain.pack.json";
export const MAXIMUM_SCENARIO_BUNDLE_BYTES = 30 * 1024 * 1024;
const MAXIMUM_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_BUNDLE_ENTRY_BYTES = 5 * 1024 * 1024;
const DETERMINISTIC_ZIP_TIME = new Date("1980-01-01T00:00:00.000Z");

export interface ParsedScenarioPackBundle {
  readonly pack: ScenarioPackV2;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

export class ScenarioPackBundleError extends Error {
  constructor(
    readonly code:
      | "BUNDLE_TOO_LARGE"
      | "BUNDLE_MANIFEST_MISSING"
      | "BUNDLE_MANIFEST_INVALID"
      | "BUNDLE_PACK_INVALID"
      | "BUNDLE_PATH_INVALID"
      | "BUNDLE_ASSET_MISSING"
      | "BUNDLE_ASSET_UNDECLARED"
      | "BUNDLE_ASSET_DIGEST_MISMATCH"
      | "BUNDLE_ASSET_METADATA_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ScenarioPackBundleError";
  }
}

function safeBundlePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 240 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..") &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(path)
  );
}

function digest(bytes: Uint8Array): string {
  return toHex(sha256Bytes(bytes));
}

function storedZip(
  entries: readonly (readonly [string, Uint8Array])[],
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const archive = new Zip((error, chunk) => {
    if (error !== null) {
      failure = error;
      return;
    }
    if (chunk !== null) chunks.push(chunk);
  });
  for (const [path, bytes] of entries) {
    const file = new ZipPassThrough(path);
    file.mtime = DETERMINISTIC_ZIP_TIME;
    archive.add(file);
    file.push(bytes, true);
  }
  archive.end();
  if (failure !== null) throw failure;
  const length = chunks.reduce(
    (total, chunk) => total + chunk.byteLength,
    0,
  );
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function assertPackAssets(
  pack: ScenarioPackV2,
  assets: ReadonlyMap<string, Uint8Array>,
): void {
  const expectedPaths = Object.keys(pack.assetHashes).sort();
  const actualPaths = [...assets.keys()].sort();
  for (const path of actualPaths) {
    if (!expectedPaths.includes(path)) {
      throw new ScenarioPackBundleError(
        "BUNDLE_ASSET_UNDECLARED",
        `The bundle contains undeclared asset ${path}.`,
      );
    }
  }
  for (const path of expectedPaths) {
    const bytes = assets.get(path);
    if (bytes === undefined) {
      throw new ScenarioPackBundleError(
        "BUNDLE_ASSET_MISSING",
        `The bundle is missing declared asset ${path}.`,
      );
    }
    if (digest(bytes) !== pack.assetHashes[path]) {
      throw new ScenarioPackBundleError(
        "BUNDLE_ASSET_DIGEST_MISMATCH",
        `The digest for ${path} does not match the pack.`,
      );
    }
  }
  for (const image of pack.imageAssets) {
    const bytes = assets.get(image.filePath);
    if (bytes === undefined) {
      throw new ScenarioPackBundleError(
        "BUNDLE_ASSET_MISSING",
        `The bundle is missing image ${image.filePath}.`,
      );
    }
    let inspected;
    try {
      inspected = inspectScenarioImage(bytes, image.originalFileName);
    } catch (error) {
      throw new ScenarioPackBundleError(
        "BUNDLE_ASSET_METADATA_MISMATCH",
        error instanceof Error
          ? `${image.filePath}: ${error.message}`
          : `${image.filePath} is not a supported image.`,
      );
    }
    if (
      inspected.sha256 !== image.sha256 ||
      inspected.byteLength !== image.byteLength ||
      inspected.width !== image.width ||
      inspected.height !== image.height ||
      inspected.mimeType !== image.mimeType
    ) {
      throw new ScenarioPackBundleError(
        "BUNDLE_ASSET_METADATA_MISMATCH",
        `The image metadata for ${image.filePath} does not match its bytes.`,
      );
    }
  }
}

function validPack(candidate: unknown): ScenarioPackV2 {
  const validation = validateScenarioPack(candidate);
  if (!validation.isValid) {
    const issue = validation.issues[0];
    throw new ScenarioPackBundleError(
      "BUNDLE_PACK_INVALID",
      issue === undefined
        ? "The bundle scenario pack is invalid."
        : `${issue.path}: ${issue.message}`,
    );
  }
  return validation.pack;
}

export function createScenarioPackBundle(
  pack: ScenarioPackV2,
  assets: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const validatedPack = validPack(pack);
  assertPackAssets(validatedPack, assets);
  const entries: (readonly [string, Uint8Array])[] = [
    [
      SCENARIO_PACK_MANIFEST_PATH,
      strToU8(`${JSON.stringify(validatedPack, null, 2)}\n`),
    ],
  ];
  for (const path of Object.keys(validatedPack.assetHashes).sort()) {
    const bytes = assets.get(path);
    if (bytes === undefined) continue;
    entries.push([path, bytes]);
  }
  return storedZip(entries);
}

export function parseScenarioPackBundle(
  bytes: Uint8Array,
): ParsedScenarioPackBundle {
  if (bytes.byteLength > MAXIMUM_SCENARIO_BUNDLE_BYTES) {
    throw new ScenarioPackBundleError(
      "BUNDLE_TOO_LARGE",
      "The scenario bundle exceeds 30 MiB.",
    );
  }
  let expandedBytes = 0;
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes, {
      filter(file) {
        const originalSize = Number.isFinite(file.originalSize)
          ? file.originalSize
          : file.size;
        const maximum =
          file.name === SCENARIO_PACK_MANIFEST_PATH
            ? MAXIMUM_MANIFEST_BYTES
            : MAXIMUM_BUNDLE_ENTRY_BYTES;
        if (originalSize > maximum) {
          throw new ScenarioPackBundleError(
            "BUNDLE_TOO_LARGE",
            `Bundle entry ${file.name} exceeds its size limit.`,
          );
        }
        expandedBytes += originalSize;
        if (expandedBytes > MAXIMUM_SCENARIO_BUNDLE_BYTES) {
          throw new ScenarioPackBundleError(
            "BUNDLE_TOO_LARGE",
            "The expanded scenario bundle exceeds 30 MiB.",
          );
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ScenarioPackBundleError) throw error;
    throw new ScenarioPackBundleError(
      "BUNDLE_MANIFEST_INVALID",
      "The scenario bundle is not a readable ZIP archive.",
    );
  }
  for (const path of Object.keys(archive)) {
    if (!safeBundlePath(path)) {
      throw new ScenarioPackBundleError(
        "BUNDLE_PATH_INVALID",
        `The bundle path ${path} is unsafe.`,
      );
    }
  }
  const manifestBytes = archive[SCENARIO_PACK_MANIFEST_PATH];
  if (manifestBytes === undefined) {
    throw new ScenarioPackBundleError(
      "BUNDLE_MANIFEST_MISSING",
      `The bundle must contain ${SCENARIO_PACK_MANIFEST_PATH} at its root.`,
    );
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(strFromU8(manifestBytes)) as unknown;
  } catch {
    throw new ScenarioPackBundleError(
      "BUNDLE_MANIFEST_INVALID",
      "The scenario bundle manifest is not valid JSON.",
    );
  }
  const pack = validPack(candidate);
  const assets = new Map(
    Object.entries(archive)
      .filter(([path]) => path !== SCENARIO_PACK_MANIFEST_PATH)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  assertPackAssets(pack, assets);
  return { pack, assets };
}

export function scenarioPackBundleFilename(pack: ScenarioPackV2): string {
  const safe = `${pack.packId}_${pack.version}`
    .replace(/[^A-Za-z0-9._-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return `TraceChain_${safe || "Scenario"}.zip`;
}

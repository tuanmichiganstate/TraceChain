#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
function repositoryPackPaths(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return repositoryPackPaths(path);
      return entry.isFile() && entry.name === "tracechain.pack.json"
        ? [path]
        : [];
    })
    .sort();
}

const defaultPackPaths = repositoryPackPaths(
  join(projectRoot, "scenario-packs"),
);
const requestedPaths =
  process.argv.length > 2 ? process.argv.slice(2) : defaultPackPaths;
const packPaths = requestedPaths.map((requestedPath) =>
  isAbsolute(requestedPath)
    ? requestedPath
    : resolve(projectRoot, requestedPath),
);

const cacheRoot = join(projectRoot, "node_modules", ".cache");
mkdirSync(cacheRoot, { recursive: true });
const temporaryDirectory = mkdtempSync(
  join(cacheRoot, "tracechain-platform-pack-"),
);
const bundlePath = join(temporaryDirectory, "validator.mjs");
let failed = false;
let totalChecks = 0;

try {
  await build({
    entryPoints: [
      join(projectRoot, "scripts", "platform-pack-validation-entry.ts"),
    ],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
  });
  const validator = await import(pathToFileURL(bundlePath).href);

  for (const packPath of packPaths) {
    if (!existsSync(packPath)) {
      console.error(`Platform pack not found: ${packPath}`);
      failed = true;
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(packPath, "utf8"));
    } catch (error) {
      console.error(
        `${packPath}: invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      failed = true;
      continue;
    }
    const result = validator.validateRepositoryScenarioPack(parsed);
    totalChecks += result.checkedCount;
    if (!result.isValid) {
      failed = true;
      console.error(`\n${packPath}: validation failed`);
      for (const issue of result.issues) {
        console.error(`  ${issue.code} ${issue.path}: ${issue.message}`);
      }
      continue;
    }
    if (
      (result.pack.status === "published" ||
        result.pack.status === "retired") &&
      !validator.verifyScenarioPackContentHash(result.pack)
    ) {
      failed = true;
      console.error(
        `${packPath}: publication content hash does not match the pack.`,
      );
      continue;
    }
    let assetFailure = false;
    for (const image of result.pack.imageAssets) {
      const candidates = [
        resolve(dirname(packPath), image.filePath),
        resolve(projectRoot, "public", image.filePath),
      ];
      const assetPath = candidates.find((candidate) => existsSync(candidate));
      if (assetPath === undefined) {
        failed = true;
        assetFailure = true;
        console.error(
          `${packPath}: declared image is missing: ${image.filePath}.`,
        );
        continue;
      }
      try {
        const bytes = new Uint8Array(readFileSync(assetPath));
        const inspected = validator.inspectScenarioImage(
          bytes,
          image.originalFileName,
        );
        if (
          inspected.sha256 !== image.sha256 ||
          inspected.byteLength !== image.byteLength ||
          inspected.width !== image.width ||
          inspected.height !== image.height ||
          inspected.mimeType !== image.mimeType ||
          result.pack.assetHashes[image.filePath] !== image.sha256
        ) {
          failed = true;
          assetFailure = true;
          console.error(
            `${packPath}: image metadata does not match ${image.filePath}.`,
          );
        }
      } catch (error) {
        failed = true;
        assetFailure = true;
        console.error(
          `${packPath}: invalid image ${image.filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (assetFailure) continue;
    console.log(
      `Platform pack valid: ${result.pack.packId}@${result.pack.version} (${result.checkedCount} checks).`,
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log(
  `Platform pack validation passed: ${packPaths.length} pack(s), ${totalChecks} checks.`,
);

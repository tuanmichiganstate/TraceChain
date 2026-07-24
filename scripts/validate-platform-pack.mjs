#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
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

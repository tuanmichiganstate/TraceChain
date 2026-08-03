#!/usr/bin/env node

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function matchingFiles(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return matchingFiles(path, suffix);
      return entry.isFile() && entry.name.endsWith(suffix) ? [path] : [];
    })
    .sort();
}

const overlayPaths = matchingFiles(
  join(projectRoot, "curriculum-overlays"),
  ".overlay.json",
);
const packPaths = matchingFiles(
  join(projectRoot, "scenario-packs"),
  "simuledger.pack.json",
);
const cacheRoot = join(projectRoot, "node_modules", ".cache");
mkdirSync(cacheRoot, { recursive: true });
const temporaryDirectory = mkdtempSync(
  join(cacheRoot, "simuledger-curriculum-overlay-"),
);
const bundlePath = join(temporaryDirectory, "validator.mjs");
let failed = false;
let checks = 0;

try {
  await build({
    entryPoints: [
      join(
        projectRoot,
        "scripts",
        "curriculum-overlay-validation-entry.ts",
      ),
    ],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
  });
  const validator = await import(pathToFileURL(bundlePath).href);
  const packs = packPaths.flatMap((packPath) => {
    const result = validator.validateRepositoryScenarioPack(
      JSON.parse(readFileSync(packPath, "utf8")),
    );
    if (!result.isValid) {
      failed = true;
      console.error(`${packPath}: cannot validate overlay compatibility`);
      return [];
    }
    return [result.pack];
  });

  for (const overlayPath of overlayPaths) {
    const result = validator.validateCurriculumOverlay(
      JSON.parse(readFileSync(overlayPath, "utf8")),
    );
    checks += result.checkedCount;
    if (!result.isValid) {
      failed = true;
      console.error(`\n${overlayPath}: validation failed`);
      for (const issue of result.issues) {
        console.error(`  ${issue.code} ${issue.path}: ${issue.message}`);
      }
      continue;
    }
    const compatible = packs.filter(
      (pack) =>
        validator.curriculumOverlayCompatibilityIssues(
          result.overlay,
          pack,
        ).length === 0,
    );
    if (compatible.length === 0) {
      failed = true;
      console.error(
        `${overlayPath}: no repository pack provides every exact SimuLedger framework version.`,
      );
      continue;
    }
    console.log(
      `Curriculum overlay valid: ${result.overlay.overlayId}@${result.overlay.version} (${result.checkedCount} checks; ${compatible.length} compatible pack(s)).`,
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (failed) process.exit(1);
console.log(
  `Curriculum overlay validation passed: ${overlayPaths.length} overlay(s), ${checks} checks.`,
);

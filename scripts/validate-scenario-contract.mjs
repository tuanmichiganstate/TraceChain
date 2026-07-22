#!/usr/bin/env node
/** Execute the coffee scenario's promise-to-evidence contract outside Vitest. */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const errors = [];
let checkedCount = 0;

function check(description, condition, detail = "") {
  checkedCount += 1;
  if (!condition) errors.push(`${description}${detail ? ` -- ${detail}` : ""}`);
}

function sourceFilesAt(sourcePath) {
  if (!existsSync(sourcePath)) return [];
  if (!statSync(sourcePath).isDirectory()) return [sourcePath];
  return readdirSync(sourcePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) =>
      sourceFilesAt(join(sourcePath, entry.name)),
    );
}

const deferredPromisePatterns = [
  ["stage declared before implementation", /\bstages? not yet built\b/i],
  ["interface deferred to a milestone", /\binterface (?:arrives|lands) with Milestone\b/i],
  [
    "implementation promised by a milestone",
    /\bMilestone\s+\d+\s+(?:will|adds|implements|introduces|provides|completes)\b/i,
  ],
  [
    "work deferred to a future milestone",
    /\b(?:will be|to be) (?:added|implemented) in (?:a )?(?:future|later) milestone\b/i,
  ],
  ["explicit deferred scenario work", /\b(?:TODO|FIXME)\b.*\b(?:stage|milestone|scenario|learner)\b/i],
];

const cacheRoot = join(projectRoot, "node_modules", ".cache");
mkdirSync(cacheRoot, { recursive: true });
const temporaryDirectory = mkdtempSync(join(cacheRoot, "tracechain-contract-"));
const bundlePath = join(temporaryDirectory, "scenario-contract.mjs");

try {
  await build({
    entryPoints: [join(projectRoot, "scripts", "scenario-contract-entry.ts")],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
  });

  const module = await import(pathToFileURL(bundlePath).href);
  const result = module.validateCoffeeScenarioContracts();
  checkedCount += result.checkedCount;
  for (const failure of result.failures) {
    errors.push(
      `${failure.checkId}${failure.detail ? ` -- ${failure.detail}` : ""}`,
    );
  }

  const sourceFiles = module.scenarioContractSourceFiles
    .flatMap((sourceFile) => {
      const absolutePath = join(projectRoot, sourceFile);
      check(`Deferred-promise source exists: ${sourceFile}`, existsSync(absolutePath));
      return sourceFilesAt(absolutePath);
    })
    .filter((sourceFile) => [".ts", ".tsx", ".md"].includes(extname(sourceFile)))
    .sort((left, right) => left.localeCompare(right));

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const matches = source.split(/\r?\n/u).flatMap((line, index) =>
      deferredPromisePatterns
        .filter(([, expression]) => expression.test(line))
        .map(([label]) => `${index + 1}: ${label}`),
    );
    check(
      `Deferred-promise audit: ${relative(projectRoot, sourceFile)}`,
      matches.length === 0,
      matches.join(", "),
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error(`\nScenario contract validation FAILED with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  error  ${error}`);
  console.error("");
  process.exit(1);
}

console.log(`Scenario contract validation passed: ${checkedCount} checks.`);

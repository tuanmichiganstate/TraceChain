#!/usr/bin/env node
/**
 * The CI browser matrix really does run the whole Playwright suite.
 *
 * Two mistakes in the workflow would otherwise be silent, because both leave a
 * green tick behind:
 *
 *   - adding a project to playwright.config.ts and forgetting the matrix, so
 *     that project never runs in CI at all;
 *   - editing one shard without the others -- `1/2` becoming `1/3` on its own --
 *     so a third of a project's tests are simply never executed.
 *
 * Neither shows up as a failure. The suite passes; it just covers less. So this
 * reads the matrix out of the workflow and holds it against what Playwright
 * itself reports, rather than against a count written down by hand: counts in a
 * workflow go stale the first time somebody adds a test.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const workflowPath = fileURLToPath(new URL("../.github/workflows/quality.yml", import.meta.url));

const errors = [];

/** Matrix entries, read from the `include:` block without a YAML dependency. */
function readMatrixEntries() {
  const lines = readFileSync(workflowPath, "utf8").split("\n");
  const entries = [];
  let current = null;
  let inInclude = false;

  for (const line of lines) {
    if (/^\s*include:\s*$/.test(line)) {
      inInclude = true;
      continue;
    }
    if (!inInclude) continue;

    // The include block ends at the first line indented no further than it.
    if (line.trim() !== "" && !/^\s{8,}/.test(line)) break;

    const started = line.match(/^\s*-\s+(\w+):\s*(\S.*?)\s*$/);
    if (started !== null) {
      if (current !== null) entries.push(current);
      current = { [started[1]]: started[2] };
      continue;
    }
    const field = line.match(/^\s+(\w+):\s*(\S.*?)\s*$/);
    if (field !== null && current !== null) current[field[1]] = field[2];
  }
  if (current !== null) entries.push(current);
  return entries;
}

/** Test identities Playwright reports for the given arguments. */
function listTests(args) {
  const raw = execFileSync(
    "npx",
    ["playwright", "test", "--list", "--reporter=json", ...args],
    { cwd: projectRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const report = JSON.parse(raw);
  const found = [];

  const walk = (suite, path) => {
    for (const child of suite.suites ?? []) walk(child, [...path, child.title ?? ""]);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        found.push(`${test.projectName}::${[...path, spec.title].filter(Boolean).join(" > ")}`);
      }
    }
  };
  for (const suite of report.suites ?? []) walk(suite, [suite.title ?? ""]);
  return found;
}

const entries = readMatrixEntries();
if (entries.length === 0) {
  errors.push("No matrix entries found in the workflow; the parser or the workflow shape changed");
}

// ---- Every configured project is in the matrix -------------------------

const everyTest = listTests([]);
const configuredProjects = [...new Set(everyTest.map((id) => id.split("::")[0]))].sort();
const matrixProjects = [...new Set(entries.map((entry) => entry.project))].sort();

for (const project of configuredProjects) {
  if (!matrixProjects.includes(project)) {
    errors.push(`Project "${project}" exists in playwright.config.ts but no matrix entry runs it`);
  }
}
for (const project of matrixProjects) {
  if (!configuredProjects.includes(project)) {
    errors.push(`Matrix runs project "${project}", which playwright.config.ts does not define`);
  }
}

// ---- Each project's shards are an exact partition of it ----------------

for (const project of matrixProjects) {
  const shards = entries.filter((entry) => entry.project === project).map((entry) => entry.shard);

  for (const shard of shards) {
    if (!/^\d+\/\d+$/.test(shard ?? "")) {
      errors.push(`Project "${project}" has a matrix entry with shard "${shard}", expected "n/m"`);
    }
  }
  const totals = [...new Set(shards.map((shard) => shard?.split("/")[1]))];
  if (totals.length !== 1) {
    errors.push(`Project "${project}" mixes shard totals (${totals.join(", ")})`);
    continue;
  }
  const total = Number(totals[0]);
  if (shards.length !== total) {
    errors.push(
      `Project "${project}" declares ${total} shard(s) but the matrix runs ${shards.length}; ` +
        `${total - shards.length} shard(s) of its tests would never execute`,
    );
    continue;
  }

  const whole = listTests([`--project=${project}`]).sort();
  const seen = new Map();
  for (const shard of shards) {
    for (const id of listTests([`--project=${project}`, `--shard=${shard}`])) {
      if (seen.has(id)) {
        errors.push(`"${id}" runs in both shard ${seen.get(id)} and shard ${shard}`);
      }
      seen.set(id, shard);
    }
  }
  for (const id of whole) {
    if (!seen.has(id)) errors.push(`"${id}" is in project "${project}" but in no shard`);
  }
  for (const id of seen.keys()) {
    if (!whole.includes(id)) errors.push(`"${id}" is in a shard but not in project "${project}"`);
  }

  const label = total === 1 ? project : `${project} across ${total} shards`;
  console.log(`  ${label}: ${whole.length} tests, exactly once each`);
}

if (errors.length > 0) {
  console.error(`\nCI browser matrix does not cover the suite (${errors.length} problem(s)):\n`);
  for (const error of errors) console.error(`  error  ${error}`);
  console.error("");
  process.exit(1);
}

console.log(
  `CI browser matrix verified: ${entries.length} jobs cover all ${everyTest.length} tests ` +
    `across ${configuredProjects.length} projects.`,
);

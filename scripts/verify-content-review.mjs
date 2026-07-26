#!/usr/bin/env node
/** Verify the committed review pack by deterministic temporary regeneration. */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_FILENAME,
  MANIFEST_FILENAME,
  generateContentReview,
} from "./generate-content-review.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const committedDirectory = join(projectRoot, "docs", "content-review");
const committedManifestPath = join(committedDirectory, MANIFEST_FILENAME);
const sourceOnlyFiles = new Set(["learner-evidence-contract.json"]);
const problems = [];

if (!existsSync(committedManifestPath)) {
  console.error(`Content review manifest missing: ${committedManifestPath}`);
  process.exit(1);
}

const committedManifest = readFileSync(committedManifestPath, "utf8");
const sourceCommitMatch = committedManifest.match(
  /\| Source commit \| `([0-9a-f]{40})` \|/u,
);
if (sourceCommitMatch === null) {
  console.error("Content review manifest has no valid full Source commit field.");
  process.exit(1);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "tracechain-content-review-"));
try {
  const result = await generateContentReview({
    projectRoot,
    outputDirectory: temporaryRoot,
    sourceCommit: sourceCommitMatch[1],
  });

  const committedFiles = readdirSync(committedDirectory)
    .filter((fileName) => !sourceOnlyFiles.has(fileName))
    .sort();
  const expectedFiles = readdirSync(temporaryRoot).sort();
  if (JSON.stringify(committedFiles) !== JSON.stringify(expectedFiles)) {
    problems.push(
      `file set differs: committed [${committedFiles.join(", ")}], ` +
        `generated [${expectedFiles.join(", ")}]`,
    );
  }

  for (const fileName of expectedFiles) {
    const committedPath = join(committedDirectory, fileName);
    if (!existsSync(committedPath)) continue;
    const committed = readFileSync(committedPath);
    const regenerated = readFileSync(join(temporaryRoot, fileName));
    if (!committed.equals(regenerated)) {
      problems.push(`${fileName} is stale; run npm run generate:content-review`);
    }
  }

  const artifactPath = join(committedDirectory, ARTIFACT_FILENAME);
  if (existsSync(artifactPath)) {
    const artifact = readFileSync(artifactPath);
    const digest = createHash("sha256").update(artifact).digest("hex");
    if (!committedManifest.includes(`| Artifact SHA-256 | \`${digest}\` |`)) {
      problems.push(`MANIFEST.md records a stale artifact SHA-256; current value is ${digest}`);
    }
    if (
      !committedManifest.includes(
        `| Locale parity | **${result.localeCount}/${result.localeCount}** strings present, 0 missing |`,
      )
    ) {
      problems.push(`MANIFEST.md records a stale locale parity count`);
    }
  } else {
    problems.push(`${ARTIFACT_FILENAME} is missing`);
  }

  if (problems.length > 0) {
    console.error("Content review verification FAILED:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Content review verified: ${result.localeCount}/${result.localeCount} strings, ` +
        `sha256 ${result.artifactDigest}, source ${result.sourceDigest}`,
    );
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

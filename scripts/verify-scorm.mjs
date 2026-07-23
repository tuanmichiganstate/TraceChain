#!/usr/bin/env node
/**
 * Verify configured SCORM packages and prove that guided and challenge reuse
 * one byte-identical static application build.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPackageFileName,
  NON_RELEASE_FILENAME_SUFFIX,
} from "./scorm-package-policy.mjs";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, "package.json"), "utf8"),
);
const packagingFiles = new Set([
  "imsmanifest.xml",
  "build-info.json",
  "version.json",
  "README.txt",
]);
const packageSpecificFiles = new Set([
  ...packagingFiles,
  "tracechain.config.json",
  "scenario.json",
]);

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Cannot canonicalize a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

function safeFileSegment(value) {
  return value
    .normalize("NFKD")
    .split("")
    .filter((character) => character.charCodeAt(0) <= 127)
    .join("")
    .replace(/[^A-Za-z0-9]+/gu, "")
    .slice(0, 48);
}

function packageFileName(configuration, releaseBuild) {
  const mode =
    configuration.mode.slice(0, 1).toUpperCase() +
    configuration.mode.slice(1).replace(/-([a-z])/gu, (_, letter) =>
      letter.toUpperCase(),
    );
  const scenarioLabel =
    configuration.scenarioId === "SCN_COFFEE_001"
      ? "StandardCoffee"
      : configuration.scenarioId === "SCN_COFFEE_CHALLENGE_A"
        ? "ChallengeA"
        : safeFileSegment(configuration.scenarioId);
  const releaseFileName = [
    "TraceChain",
    safeFileSegment(mode),
    scenarioLabel,
    configuration.locale,
    `v${configuration.scenarioVersion.replace(/[^A-Za-z0-9.-]/gu, "")}`,
  ].join("_") + ".zip";
  return classifyPackageFileName(releaseFileName, releaseBuild);
}

function defaultPackagePaths() {
  return ["guided", "challenge"].map((presetId) => {
    const configurationPath = join(
      projectRoot,
      "dist-scorm",
      presetId,
      "tracechain.config.json",
    );
    if (!existsSync(configurationPath)) {
      throw new Error(
        `Package staging data is missing for ${presetId}. Run \`npm run build:scorm\` first.`,
      );
    }
    const envelope = JSON.parse(readFileSync(configurationPath, "utf8"));
    const buildInformation = JSON.parse(
      readFileSync(
        join(projectRoot, "dist-scorm", presetId, "build-info.json"),
        "utf8",
      ),
    );
    return join(
      projectRoot,
      packageFileName(
        envelope.configuration,
        buildInformation.releaseBuild === true,
      ),
    );
  });
}

function hashStaticEntries(entries) {
  const digest = createHash("sha256");
  const staticEntries = entries
    .filter(
      (entry) =>
        !entry.isDirectory && !packageSpecificFiles.has(entry.entryName),
    )
    .sort((left, right) => left.entryName.localeCompare(right.entryName, "en"));
  for (const entry of staticEntries) {
    digest.update(entry.entryName, "utf8");
    digest.update("\0");
    digest.update(createHash("sha256").update(entry.getData()).digest());
    digest.update("\n");
  }
  return {
    hash: digest.digest("hex"),
    files: Object.fromEntries(
      staticEntries.map((entry) => [
        entry.entryName,
        createHash("sha256").update(entry.getData()).digest("hex"),
      ]),
    ),
  };
}

function verifyPackage(zipPath) {
  const errors = [];
  const checks = [];
  const check = (description, condition, detail = "") => {
    checks.push({ description, passed: Boolean(condition) });
    if (!condition) {
      errors.push(`${description}${detail ? ` -- ${detail}` : ""}`);
    }
  };

  check("Package exists", existsSync(zipPath), zipPath);
  if (!existsSync(zipPath)) {
    return { zipPath, errors, checks, staticBuild: null, configuration: null };
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const entryNames = entries.map((entry) => entry.entryName);
  const required = [
    "imsmanifest.xml",
    "index.html",
    "tracechain.config.json",
    "scenario.json",
    "build-info.json",
    "version.json",
    "README.txt",
  ];
  for (const file of required) {
    check(`${file} is present`, entryNames.includes(file));
  }
  check(
    "Archive entries are deterministically ordered",
    JSON.stringify(entryNames) ===
      JSON.stringify(
        [...entryNames].sort((left, right) => {
          const folded = left
            .toLowerCase()
            .localeCompare(right.toLowerCase(), "en");
          return folded === 0
            ? left.localeCompare(right, "en")
            : folded;
        }),
      ),
  );
  check(
    "Archive entries use normalized timestamps",
    entries.every((entry) => {
      const time = entry.header.time;
      return (
        time.getFullYear() === 2000 &&
        time.getMonth() === 0 &&
        time.getDate() === 1 &&
        time.getHours() === 0 &&
        time.getMinutes() === 0 &&
        time.getSeconds() === 0
      );
    }),
  );

  if (required.some((file) => !entryNames.includes(file))) {
    return { zipPath, errors, checks, staticBuild: null, configuration: null };
  }

  let envelope = null;
  let scenario = null;
  let buildInformation = null;
  let versionMetadata = null;
  try {
    envelope = JSON.parse(zip.readAsText("tracechain.config.json"));
  } catch {
    // The checks below report each malformed file independently.
  }
  try {
    scenario = JSON.parse(zip.readAsText("scenario.json"));
  } catch {
    // Reported below.
  }
  try {
    buildInformation = JSON.parse(zip.readAsText("build-info.json"));
  } catch {
    // Reported below.
  }
  try {
    versionMetadata = JSON.parse(zip.readAsText("version.json"));
  } catch {
    // Reported below.
  }
  check("tracechain.config.json is valid JSON", envelope !== null);
  check("scenario.json is valid JSON", scenario !== null);
  check("build-info.json is valid JSON", buildInformation !== null);
  check("version.json is valid JSON", versionMetadata !== null);

  const configuration = envelope?.configuration;
  const calculatedConfigurationHash =
    configuration === undefined
      ? null
      : createHash("sha256")
          .update(canonicalize(configuration))
          .digest("hex");
  check(
    "Configuration hash matches canonical configuration",
    envelope?.configurationHash === calculatedConfigurationHash,
  );
  check(
    "Scenario identity matches configuration",
    scenario?.scenarioId === configuration?.scenarioId &&
      scenario?.scenarioVersion === configuration?.scenarioVersion,
  );
  check(
    "Scenario scoring matches configuration",
    scenario?.scoringConfiguration?.maxScore ===
      configuration?.scoring?.maximumScore,
  );
  check(
    "Build metadata matches application and package inputs",
    buildInformation?.applicationVersion === packageJson.version &&
      buildInformation?.configurationHash === envelope?.configurationHash &&
      buildInformation?.scenarioId === scenario?.scenarioId &&
      buildInformation?.scenarioVersion === scenario?.scenarioVersion,
  );
  check(
    "Build metadata has deterministic provenance fields",
    typeof buildInformation?.sourceCommit === "string" &&
      typeof buildInformation?.generatedAt === "string" &&
      Number.isFinite(Date.parse(buildInformation?.generatedAt)) &&
      typeof buildInformation?.packageGeneratorVersion === "string" &&
      typeof buildInformation?.applicationBuildHash === "string" &&
      /^[0-9a-f]{64}$/u.test(buildInformation?.applicationBuildHash),
  );
  check(
    "Dirty or explicitly local output is never marked as a release",
    buildInformation?.release === buildInformation?.releaseBuild &&
      (buildInformation?.releaseBuild !== true ||
      (buildInformation?.dirty === false &&
        buildInformation?.reproducibleSource === true)),
  );
  check(
    "Non-release output does not claim source reproducibility",
    buildInformation?.releaseBuild === true ||
      buildInformation?.reproducibleSource === false,
  );
  check(
    "Filename identifies release classification",
    buildInformation?.releaseBuild === true
      ? !basename(zipPath).endsWith(
          `${NON_RELEASE_FILENAME_SUFFIX}.zip`,
        )
      : basename(zipPath).endsWith(
          `${NON_RELEASE_FILENAME_SUFFIX}.zip`,
        ),
  );
  check(
    "Archive metadata normalization is declared",
    buildInformation?.normalizedArchiveMetadata === true,
  );
  check(
    "version.json agrees with build metadata",
    versionMetadata?.version === packageJson.version &&
      versionMetadata?.scenarioId === scenario?.scenarioId &&
      versionMetadata?.masteryScore === configuration?.scoring?.passScore &&
      versionMetadata?.reproducibleBuild === buildInformation?.releaseBuild,
  );

  const manifest = zip.readAsText("imsmanifest.xml");
  check("Manifest declares the XML prolog", manifest.startsWith("<?xml"));
  check(
    "Manifest declares ADL SCORM 1.2",
    manifest.includes("<schema>ADL SCORM</schema>") &&
      manifest.includes("<schemaversion>1.2</schemaversion>"),
  );
  check(
    'Manifest declares adlcp:scormtype="sco"',
    /adlcp:scormtype="sco"/u.test(manifest),
  );
  check(
    "Resource href points at index.html",
    /href="index\.html"/u.test(manifest),
  );
  check(
    "Manifest mastery score matches configuration",
    manifest.includes(
      `<adlcp:masteryscore>${configuration?.scoring?.passScore}</adlcp:masteryscore>`,
    ),
  );
  check(
    "Manifest has exactly one organization default",
    /organizations\s+default="/u.test(manifest),
  );

  const openTags = [
    ...manifest.matchAll(/<(?!\?|!|\/)([a-zA-Z:][\w:.-]*)/gu),
  ].map((match) => match[1]);
  const closeTags = [
    ...manifest.matchAll(/<\/([a-zA-Z:][\w:.-]*)/gu),
  ].map((match) => match[1]);
  const selfClosing = [
    ...manifest.matchAll(/<([a-zA-Z:][\w:.-]*)[^>]*\/>/gu),
  ].map((match) => match[1]);
  const balanced = openTags.filter((tag) => {
    const opens = openTags.filter((candidate) => candidate === tag).length;
    const closes = closeTags.filter((candidate) => candidate === tag).length;
    const selfs = selfClosing.filter((candidate) => candidate === tag).length;
    return opens !== closes + selfs;
  });
  check(
    "Manifest XML tags are balanced",
    balanced.length === 0,
    [...new Set(balanced)].join(", "),
  );

  const declaredFiles = [
    ...manifest.matchAll(/<file\s+href="([^"]+)"/gu),
  ].map((match) => match[1].replace(/&amp;/gu, "&"));
  check("Manifest declares runtime files", declaredFiles.length > 0);
  const missingFromZip = declaredFiles.filter(
    (file) => !entryNames.includes(file),
  );
  check(
    "Every manifest file ships",
    missingFromZip.length === 0,
    missingFromZip.join(", "),
  );
  const undeclared = entryNames.filter(
    (name) => !packagingFiles.has(name) && !declaredFiles.includes(name),
  );
  check(
    "Every shipped runtime file is declared",
    undeclared.length === 0,
    undeclared.join(", "),
  );

  const indexHtml = zip.readAsText("index.html");
  const absolutePaths = [
    ...indexHtml.matchAll(/(?:src|href)="(\/[^/][^"]*)"/gu),
  ].map((match) => match[1]);
  check(
    "index.html uses no absolute paths",
    absolutePaths.length === 0,
    absolutePaths.join(", "),
  );
  const externalReferences = [
    ...indexHtml.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/gu),
  ].map((match) => match[0]);
  check(
    "index.html references no external origin",
    externalReferences.length === 0,
    externalReferences.join(", "),
  );
  const cdnPattern =
    /https?:\/\/(?:cdn|unpkg|jsdelivr|fonts\.googleapis|ajax\.googleapis)/iu;
  const bundlesWithCdn = entries
    .filter(
      (entry) =>
        entry.entryName.endsWith(".js") &&
        cdnPattern.test(zip.readAsText(entry)),
    )
    .map((entry) => entry.entryName);
  check(
    "No bundle contains a CDN reference",
    bundlesWithCdn.length === 0,
    bundlesWithCdn.join(", "),
  );

  const staticBuild = hashStaticEntries(entries);
  check(
    "Static application bytes match the recorded build hash",
    staticBuild.hash === buildInformation?.applicationBuildHash,
  );

  return {
    zipPath,
    errors,
    checks,
    staticBuild,
    configuration,
    buildInformation,
  };
}

let packagePaths;
try {
  packagePaths =
    process.argv.length > 2
      ? process.argv.slice(2).map((path) => resolve(process.cwd(), path))
      : defaultPackagePaths();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const results = packagePaths.map(verifyPackage);
const crossPackageErrors = [];
if (results.length > 1 && results.every((result) => result.staticBuild !== null)) {
  const reference = results[0].staticBuild;
  for (const result of results.slice(1)) {
    if (
      result.staticBuild.hash !== reference.hash ||
      JSON.stringify(result.staticBuild.files) !==
        JSON.stringify(reference.files)
    ) {
      crossPackageErrors.push(
        `${result.zipPath} does not reuse the byte-identical static application build`,
      );
    }
  }
}

const defaultInvocation = process.argv.length === 2;
if (defaultInvocation && results.length === 2) {
  const modes = results.map((result) => result.configuration?.mode).sort();
  if (JSON.stringify(modes) !== JSON.stringify(["challenge", "guided"])) {
    crossPackageErrors.push(
      "Default verification must cover one guided and one challenge package",
    );
  }
  const legacyPath = join(
    projectRoot,
    classifyPackageFileName(
      `tracechain-scorm-v${packageJson.version}.zip`,
      results[0]?.buildInformation?.releaseBuild === true,
    ),
  );
  if (!existsSync(legacyPath)) {
    crossPackageErrors.push("Legacy guided deployment alias is missing");
  } else if (
    !readFileSync(legacyPath).equals(readFileSync(results[0].zipPath))
  ) {
    crossPackageErrors.push(
      "Legacy guided deployment alias is not byte-identical to the guided package",
    );
  }
}

const allErrors = [
  ...results.flatMap((result) =>
    result.errors.map((error) => `${result.zipPath}: ${error}`),
  ),
  ...crossPackageErrors,
];
const checkCount =
  results.reduce((total, result) => total + result.checks.length, 0) +
  Math.max(0, results.length - 1) +
  (defaultInvocation ? 2 : 0);
const passedCount = checkCount - allErrors.length;

if (allErrors.length > 0) {
  console.error(
    `\nSCORM package verification FAILED (${passedCount}/${checkCount} checks passed):\n`,
  );
  for (const error of allErrors) console.error(`  error  ${error}`);
  console.error("");
  process.exit(1);
}

const totalSize = results.reduce(
  (total, result) => total + readFileSync(result.zipPath).length,
  0,
);
console.log(
  `SCORM packages verified: ${passedCount}/${checkCount} checks passed, ` +
    `${results.length} configured packages, ${(totalSize / 1024).toFixed(1)} kB total.`,
);
console.log(
  `Shared static application build: ${results[0]?.staticBuild?.hash ?? "not available"}`,
);

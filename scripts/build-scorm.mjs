#!/usr/bin/env node
/**
 * Build one or more configured SCORM 1.2 packages from one static application
 * build. Configuration and scenario data stay outside the JavaScript bundle.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, posix, relative, resolve, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";
import {
  assertStaticApplicationBuildPaths,
  classifyPackageBuild,
  classifyPackageFileName,
} from "./scorm-package-policy.mjs";

const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, "package.json"), "utf8"),
);
const applicationVersion = packageJson.version;
const packageGeneratorVersion = "1.0.0";
const runtimeFileNames = new Set([
  "tracechain.config.json",
  "audit-scenario-pack.json",
  "scenario.json",
  "scenario-variant-bank.json",
  "media-manifest.json",
  "identity-registry.json",
  "educational-signing-keys.json",
  "authorization-policies.json",
  "endorsement-policies.json",
]);
const packagingFileNames = new Set([
  "imsmanifest.xml",
  "build-info.json",
  "version.json",
  "README.txt",
]);
// ZIP stores local DOS timestamps. Supplying fixed local calendar fields makes
// the archive metadata identical in every runner timezone.
const zipEntryTime = new Date(2000, 0, 1, 0, 0, 0);

function usage() {
  return [
    "Usage:",
    "  npm run package:scorm -- --preset guided",
    "  npm run package:scorm -- --preset guided,practice,challenge,assessment,audit-guided,audit-practice",
    "  npm run package:scorm -- --config configs/package.json",
    "",
    "Options:",
    "  --preset <id[,id]>  Fully resolved lecturer preset(s)",
    "  --config <path>      Fully resolved configuration JSON",
    "  --title <text>       Manifest title (only when generating one package)",
    "  --no-build           Reuse the existing dist/ application build",
    "  --allow-dirty        Permit a non-release local-development package",
    "  --help               Show this help",
  ].join("\n");
}

function parseArguments(arguments_) {
  const options = {
    presetIds: [],
    configurationPaths: [],
    title: undefined,
    noBuild: false,
    allowDirty: false,
    help: false,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const next = () => {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      return value;
    };

    if (argument === "--preset") {
      options.presetIds.push(
        ...next()
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (argument === "--config") {
      options.configurationPaths.push(next());
    } else if (argument === "--title") {
      options.title = next();
    } else if (argument === "--no-build") {
      options.noBuild = true;
    } else if (argument === "--allow-dirty") {
      options.allowDirty = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  const inputCount =
    options.presetIds.length + options.configurationPaths.length;
  if (!options.help && inputCount === 0) {
    throw new Error("Select at least one --preset or --config");
  }
  if (options.title !== undefined && inputCount !== 1) {
    throw new Error("--title can only be used when generating one package");
  }
  if (
    options.title !== undefined &&
    (options.title.length < 1 ||
      options.title.length > 120 ||
      [...options.title].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
      }) ||
      options.title.trim() !== options.title)
  ) {
    throw new Error("--title must be 1-120 printable characters without outer whitespace");
  }

  return options;
}

function runGit(arguments_, fallback = undefined) {
  try {
    return execFileSync("git", arguments_, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function inspectRepository(options) {
  const sourceCommit = runGit(["rev-parse", "HEAD"], "unknown");
  const dirtyOutput = runGit(
    ["status", "--porcelain=v1", "--untracked-files=normal"],
    "__git-unavailable__",
  );
  const dirty = dirtyOutput !== "";
  const classification = classifyPackageBuild({
    dirty,
    allowDirty: options.allowDirty,
  });

  const commitTimestamp = runGit(
    ["show", "-s", "--format=%cI", "HEAD"],
    "2000-01-01T00:00:00.000Z",
  );
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  let generatedAt;
  if (sourceDateEpoch === undefined) {
    generatedAt = new Date(commitTimestamp).toISOString();
  } else if (/^\d+$/u.test(sourceDateEpoch)) {
    generatedAt = new Date(Number(sourceDateEpoch) * 1000).toISOString();
  } else {
    throw new Error("SOURCE_DATE_EPOCH must contain whole Unix seconds");
  }
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("Could not determine a deterministic package timestamp");
  }

  return {
    sourceCommit,
    dirty,
    generatedAt,
    releaseBuild: classification.releaseBuild,
    reproducibleSource: classification.reproducibleSource,
  };
}

function listFilesRecursively(directory, base = directory) {
  const found = [];
  for (const entry of readdirSync(directory).sort((left, right) =>
    left.localeCompare(right, "en"),
  )) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      found.push(...listFilesRecursively(fullPath, base));
    } else {
      found.push(relative(base, fullPath).split(sep).join(posix.sep));
    }
  }
  return found.sort((left, right) => {
    const folded = left.toLowerCase().localeCompare(right.toLowerCase(), "en");
    return folded === 0 ? left.localeCompare(right, "en") : folded;
  });
}

function hashStaticApplication(directory) {
  const digest = createHash("sha256");
  const files = listFilesRecursively(directory).filter(
    (file) =>
      !runtimeFileNames.has(file) &&
      !packagingFileNames.has(file) &&
      !file.startsWith("media/"),
  );
  for (const file of files) {
    digest.update(file, "utf8");
    digest.update("\0");
    digest.update(createHash("sha256").update(readFileSync(join(directory, file))).digest());
    digest.update("\n");
  }
  return { hash: digest.digest("hex"), files };
}

function escapeXml(text) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

async function loadPackageDefinitions() {
  const cacheRoot = join(projectRoot, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(
    join(cacheRoot, "tracechain-package-generator-"),
  );
  const bundlePath = join(temporaryDirectory, "package-entry.mjs");

  try {
    await bundle({
      entryPoints: [join(projectRoot, "scripts", "package-entry.ts")],
      outfile: bundlePath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      logLevel: "silent",
    });
    return await import(`${pathToFileURL(bundlePath).href}?package-generator=1`);
  } finally {
    // Imported ESM is retained by Node after loading, so the temporary bundle
    // can be removed before package assembly begins.
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function loadConfigurationFile(configurationPath, definitions) {
  const absolutePath = resolve(process.cwd(), configurationPath);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read configuration "${configurationPath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const configuration =
    parsed !== null &&
    typeof parsed === "object" &&
    "configuration" in parsed
      ? parsed.configuration
      : parsed;
  const validation = definitions.validateConfiguration(configuration);
  if (!validation.isValid) {
    throw new Error(
      `Configuration "${configurationPath}" is invalid:\n${validation.issues
        .map((issue) => `  ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "configurationHash" in parsed &&
    parsed.configurationHash !== definitions.hashConfiguration(configuration)
  ) {
    throw new Error(
      `Configuration hash in "${configurationPath}" does not match its content`,
    );
  }
  return {
    configuration: structuredClone(configuration),
    sourceLabel: basename(configurationPath, ".json"),
  };
}

function scenarioMap(definitions) {
  return new Map([
    [definitions.coffeeScenario.scenarioId, definitions.coffeeScenario],
    [definitions.practiceAScenario.scenarioId, definitions.practiceAScenario],
    [definitions.challengeAScenario.scenarioId, definitions.challengeAScenario],
  ]);
}

function auditPackMap(definitions) {
  return new Map([
    [definitions.guidedAuditPack.packId, definitions.guidedAuditPack],
    [definitions.practiceAuditPack.packId, definitions.practiceAuditPack],
  ]);
}

function scenarioVersionOf(scenario) {
  return scenario.scenarioVersion ?? scenario.version;
}

function validateAuditPackageInput(
  configuration,
  draftPack,
  definitions,
  provenance,
) {
  const configurationValidation =
    definitions.validateConfiguration(configuration);
  if (!configurationValidation.isValid) {
    throw new Error(
      `Resolved Audit configuration is invalid:\n${configurationValidation.issues
        .map((issue) => `  ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  const validation = definitions.validateScenarioPack(
    structuredClone(draftPack),
  );
  if (!validation.isValid) {
    throw new Error(
      `Audit pack ${draftPack.packId} is invalid:\n${validation.issues
        .map((issue) => `  ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  const pack = definitions.publishScenarioPack(validation.pack, {
    publishedAt: provenance.generatedAt,
    publishedBy: "TRACECHAIN_PACKAGE_GENERATOR",
  });
  const scenario = pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === configuration.scenarioId &&
      candidate.version === configuration.scenarioVersion,
  );
  if (
    pack.packId !== configuration.content.packId ||
    pack.version !== configuration.content.packVersion ||
    scenario?.auditCase === undefined ||
    scenario.auditCase.auditCaseId !== configuration.auditCaseId ||
    scenario.auditCase.version !== configuration.auditCaseVersion ||
    scenario.auditCase.scoringBlueprint.scoringBlueprintId !==
      configuration.scoring.scoringBlueprintId ||
    scenario.auditCase.scoringBlueprint.version !==
      configuration.scoring.scoringBlueprintVersion ||
    scenario.auditCase.scoringBlueprint.maximumScore !==
      configuration.scoring.maximumScore ||
    scenario.auditCase.scoringBlueprint.passScore !==
      configuration.scoring.passScore
  ) {
    throw new Error(
      "Audit pack, scenario, case, or scoring identity does not match the resolved configuration",
    );
  }
  return { pack, scenario };
}

function variantBankForConfiguration(configuration, definitions) {
  if (configuration.scenarioVariation.strategy !== "SEEDED_VARIANT_BANK") {
    return null;
  }
  const bank = [
    definitions.practiceVariantBank,
    definitions.challengeVariantBank,
  ].find(
    (candidate) =>
      candidate.bankId ===
        configuration.scenarioVariation.bankId &&
      candidate.bankVersion ===
        configuration.scenarioVariation.bankVersion,
  );
  if (bank === undefined) {
    throw new Error(
      `No authored variant bank is available for ` +
        `${configuration.scenarioVariation.bankId} ` +
        `v${configuration.scenarioVariation.bankVersion}`,
    );
  }
  return bank;
}

function validatePackageInput(
  configuration,
  scenario,
  variantBank,
  definitions,
) {
  const configurationValidation =
    definitions.validateConfiguration(configuration);
  if (!configurationValidation.isValid) {
    throw new Error(
      `Resolved configuration is invalid:\n${configurationValidation.issues
        .map((issue) => `  ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  const scenarioValidation = definitions.validateScenario(scenario);
  if (!scenarioValidation.isValid) {
    throw new Error(
      `Scenario ${scenario.scenarioId} is invalid:\n${scenarioValidation.issues
        .filter((issue) => issue.severity === "ERROR")
        .map((issue) => `  ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  if (
    scenario.scenarioId !== configuration.scenarioId ||
    scenario.scenarioVersion !== configuration.scenarioVersion
  ) {
    throw new Error(
      `Configuration requests ${configuration.scenarioId} ` +
        `v${configuration.scenarioVersion}, but the selected scenario is ` +
        `${scenario.scenarioId} v${scenario.scenarioVersion}`,
    );
  }
  if (
    scenario.scoringConfiguration.maxScore !==
    configuration.scoring.maximumScore
  ) {
    throw new Error(
      "Scenario maximum score does not match the resolved package configuration",
    );
  }
  if (variantBank !== null) {
    const bankValidation = definitions.validateVariantBank({
      bank: variantBank,
      configuration,
    });
    if (!bankValidation.isValid) {
      throw new Error(
        `Variant bank ${variantBank.bankId} is invalid:\n${bankValidation.issues
          .filter((issue) => issue.severity === "ERROR")
          .map((issue) => `  ${issue.path}: ${issue.message}`)
          .join("\n")}`,
      );
    }
  }
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

function safeDirectorySegment(value) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
}

function defaultScenarioLabel(configuration) {
  if (configuration.scenarioId === "SCN_COFFEE_001") return "StandardCoffee";
  if (configuration.scenarioId === "SCN_COFFEE_PRACTICE") return "PracticeCase";
  if (configuration.scenarioId === "SCN_COFFEE_CHALLENGE") return "ChallengeBank";
  if (configuration.scenarioId === "SCN_GUIDED_COFFEE_AUDIT") {
    return "GuidedCoffeeAudit";
  }
  if (configuration.scenarioId === "SCN_PRACTICE_COFFEE_AUDIT") {
    return "PracticeCoffeeAudit";
  }
  return safeFileSegment(configuration.scenarioId);
}

function packageFileName(configuration, releaseBuild) {
  const preset =
    configuration.presetId.slice(0, 1).toUpperCase() +
    configuration.presetId.slice(1).replace(/-([a-z])/gu, (_, letter) =>
      letter.toUpperCase(),
    );
  const releaseFileName = [
    "TraceChain",
    safeFileSegment(preset),
    defaultScenarioLabel(configuration),
    configuration.locale,
    `v${configuration.scenarioVersion.replace(/[^A-Za-z0-9.-]/gu, "")}`,
  ].join("_") + ".zip";
  return classifyPackageFileName(releaseFileName, releaseBuild);
}

function resolvePackageText(configuration, scenario, titleOverride) {
  const locale = JSON.parse(
    readFileSync(
      join(projectRoot, "src", "locales", `${configuration.locale}.json`),
      "utf8",
    ),
  );
  const modeTitleKey = `package.${configuration.presetId}.title`;
  const modeDescriptionKey = `package.${configuration.presetId}.description`;
  return {
    title:
      titleOverride ??
      locale[modeTitleKey] ??
      locale[scenario.titleKey] ??
      locale[scenario.title?.localizationKey] ??
      `TraceChain ${configuration.presetId}`,
    description:
      locale[modeDescriptionKey] ??
      locale[scenario.descriptionKey] ??
      locale["app.subtitle"] ??
      "TraceChain supply-chain decision simulation",
  };
}

function printPackageSummary({ configuration, scenario, text }) {
  const inspections = Object.entries(configuration.technicalFeatures ?? {})
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature)
    .join(", ");
  console.log(
    [
      "Resolved package:",
      `  package title: ${text.title}`,
      `  preset: ${configuration.presetId}`,
      `  activity: ${configuration.activityType}`,
      `  support: ${configuration.supportProfile}`,
      `  purpose: ${configuration.deliveryPurpose}`,
      `  outcome: ${configuration.outcomeStrategy}`,
      `  scenario: ${scenario.scenarioId} v${scenarioVersionOf(scenario)}`,
      `  feedback: ${configuration.feedback.timing}`,
      `  hints: ${configuration.hints.availability}`,
      `  reference workspace: ${configuration.guidance.referenceWorkspace ? "enabled" : "disabled"}`,
      `  technical inspection: ${inspections || "none"}`,
      `  pass score: ${configuration.scoring.passScore}`,
      `  language: ${configuration.locale}`,
    ].join("\n"),
  );
}

function manifestSource({
  identifier,
  version,
  title,
  description,
  masteryScore,
  files,
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(identifier)}" version="${escapeXml(version)}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="TRACECHAIN_ORGANIZATION">
    <organization identifier="TRACECHAIN_ORGANIZATION" structure="hierarchical">
      <title>${escapeXml(title)}</title>
      <item identifier="ITEM_TRACECHAIN" identifierref="RESOURCE_TRACECHAIN" isvisible="true">
        <title>${escapeXml(title)}</title>
        <adlcp:masteryscore>${masteryScore}</adlcp:masteryscore>
        <adlcp:maxtimeallowed></adlcp:maxtimeallowed>
        <adlcp:datafromlms></adlcp:datafromlms>
      </item>
      <metadata>
        <adlcp:location>${escapeXml(description)}</adlcp:location>
      </metadata>
    </organization>
  </organizations>

  <resources>
    <resource identifier="RESOURCE_TRACECHAIN" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files.map((file) => `      <file href="${escapeXml(file)}" />`).join("\n")}
    </resource>
  </resources>

</manifest>
`;
}

function addFilesToZip(packageDirectory, zipPath) {
  const zip = new AdmZip();
  for (const file of listFilesRecursively(packageDirectory)) {
    const directory = posix.dirname(file);
    zip.addLocalFile(
      join(packageDirectory, file),
      directory === "." ? "" : directory,
    );
    const entry = zip.getEntry(file);
    if (entry === null || entry === undefined) {
      throw new Error(`Failed to add ${file} to the SCORM archive`);
    }
    entry.header.time = zipEntryTime;
  }
  zip.writeZip(zipPath);
}

function packageOne({
  auditPack,
  configuration,
  cryptographicRuntime,
  sourceLabel,
  scenario,
  variantBank,
  definitions,
  provenance,
  staticBuild,
  text,
}) {
  const distDirectory = join(projectRoot, "dist");
  const packageDirectory = join(
    projectRoot,
    "dist-scorm",
    safeDirectorySegment(sourceLabel) ||
      safeFileSegment(configuration.presetId),
  );
  rmSync(packageDirectory, { recursive: true, force: true });
  mkdirSync(packageDirectory, { recursive: true });
  cpSync(distDirectory, packageDirectory, { recursive: true });
  for (const runtimeFileName of runtimeFileNames) {
    rmSync(join(packageDirectory, runtimeFileName), {
      force: true,
    });
  }

  const embeddedConfiguration = definitions.embedConfiguration(configuration);
  writeFileSync(
    join(packageDirectory, "tracechain.config.json"),
    `${JSON.stringify(embeddedConfiguration, null, 2)}\n`,
    "utf8",
  );
  let scenarioHash = null;
  let auditScenarioPackHash = null;
  let auditScenarioPackContentHash = null;
  let variantBankHash = null;
  const variantContentHashes = {};
  let mediaManifestContent = null;
  const portraitMediaHashes = {};
  if (auditPack !== null) {
    const auditPackContent = `${JSON.stringify(auditPack, null, 2)}\n`;
    writeFileSync(
      join(packageDirectory, "audit-scenario-pack.json"),
      auditPackContent,
      "utf8",
    );
    auditScenarioPackHash = createHash("sha256")
      .update(auditPackContent, "utf8")
      .digest("hex");
    auditScenarioPackContentHash =
      auditPack.publication.contentHash;
  } else {
    const scenarioContent = `${JSON.stringify(scenario, null, 2)}\n`;
    writeFileSync(
      join(packageDirectory, "scenario.json"),
      scenarioContent,
      "utf8",
    );
    scenarioHash = createHash("sha256")
      .update(scenarioContent, "utf8")
      .digest("hex");
  }
  if (auditPack === null && variantBank !== null) {
    const variantBankContent = `${JSON.stringify(variantBank, null, 2)}\n`;
    writeFileSync(
      join(packageDirectory, "scenario-variant-bank.json"),
      variantBankContent,
      "utf8",
    );
    variantBankHash = createHash("sha256")
      .update(variantBankContent, "utf8")
      .digest("hex");
    for (const variant of variantBank.variants) {
      variantContentHashes[variant.metadata.variantId] =
        variant.metadata.contentHash;
    }
  }
  if (auditPack === null) {
    const mediaManifest = {
      schemaVersion: "1",
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      assets: scenario.portraitAssets,
    };
    mediaManifestContent = `${JSON.stringify(mediaManifest, null, 2)}\n`;
    writeFileSync(
      join(packageDirectory, "media-manifest.json"),
      mediaManifestContent,
      "utf8",
    );
    for (const asset of scenario.portraitAssets) {
      const assetPath = join(
        packageDirectory,
        ...asset.filePath.split("/"),
      );
      if (!existsSync(assetPath)) {
        throw new Error(
          `Portrait asset "${asset.assetId}" is missing at ${asset.filePath}`,
        );
      }
      const digest = createHash("sha256")
        .update(readFileSync(assetPath))
        .digest("hex");
      if (digest !== asset.sha256) {
        throw new Error(
          `Portrait asset "${asset.assetId}" does not match its authored SHA-256`,
        );
      }
      portraitMediaHashes[asset.filePath] = digest;
    }
  }
  const cryptographicRuntimeHashes = {};
  if (cryptographicRuntime !== null) {
    for (const [fileName, value] of [
      ["identity-registry.json", cryptographicRuntime.identityRegistry],
      ["educational-signing-keys.json", cryptographicRuntime.signingKeys],
      ["authorization-policies.json", cryptographicRuntime.authorizationPolicies],
      ["endorsement-policies.json", cryptographicRuntime.endorsementPolicies],
    ]) {
      const content = `${JSON.stringify(value, null, 2)}\n`;
      writeFileSync(join(packageDirectory, fileName), content, "utf8");
      cryptographicRuntimeHashes[fileName] = createHash("sha256")
        .update(content, "utf8")
        .digest("hex");
    }
  }

  const { title, description } = text;
  const runtimeFiles = listFilesRecursively(packageDirectory).filter(
    (file) => !packagingFileNames.has(file),
  );
  const identifier = `TRACECHAIN_${embeddedConfiguration.configurationHash
    .slice(0, 20)
    .toUpperCase()}`;

  writeFileSync(
    join(packageDirectory, "imsmanifest.xml"),
    manifestSource({
      identifier,
      version: applicationVersion,
      title,
      description,
      masteryScore: configuration.scoring.passScore,
      files: runtimeFiles,
    }),
    "utf8",
  );

  const buildInformation = {
    applicationVersion,
    sourceCommit: provenance.sourceCommit,
    packageGeneratorVersion,
    configurationHash: embeddedConfiguration.configurationHash,
    configurationSchemaVersion:
      configuration.configurationSchemaVersion,
    presetId: configuration.presetId,
    activityType: configuration.activityType,
    supportProfile: configuration.supportProfile,
    deliveryPurpose: configuration.deliveryPurpose,
    outcomeStrategy: configuration.outcomeStrategy,
    contentPackId: configuration.content.packId,
    contentPackVersion: configuration.content.packVersion,
    scoringBlueprintId: configuration.scoring.scoringBlueprintId,
    scoringBlueprintVersion:
      configuration.scoring.scoringBlueprintVersion,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenarioVersionOf(scenario),
    scenarioHash,
    auditScenarioPackHash,
    auditScenarioPackContentHash,
    auditPersistenceSchemaVersion:
      auditPack === null ? null : "TA1",
    variantBankId: variantBank?.bankId ?? null,
    variantBankVersion: variantBank?.bankVersion ?? null,
    variantBankHash,
    variantContentHashes,
    generatedAt: provenance.generatedAt,
    applicationBuildHash: staticBuild.hash,
    dirty: provenance.dirty,
    release: provenance.releaseBuild,
    releaseBuild: provenance.releaseBuild,
    reproducibleSource: provenance.reproducibleSource,
    normalizedArchiveMetadata: true,
    cryptographicEvidenceSchemaVersion:
      cryptographicRuntime === null
        ? null
        : configuration.technicalFeatures.endorsementPolicies
          ? "2"
          : "1",
    cryptographicRuntimeHashes,
    portraitMediaSchemaVersion:
      auditPack === null ? "1" : null,
    portraitMediaManifestHash:
      mediaManifestContent === null
        ? null
        : createHash("sha256")
            .update(mediaManifestContent, "utf8")
            .digest("hex"),
    portraitMediaHashes,
    cryptographicMechanisms:
      cryptographicRuntime === null
        ? null
        : {
            signatureAlgorithm: "Ed25519",
            signatureProvider: "@noble/ed25519@3.1.0",
            signatureComputation: "REAL",
            endorsementSignatureComputation:
              configuration.technicalFeatures.endorsementPolicies
                ? "REAL"
                : "DISABLED",
            endorsementPolicyEvaluation:
              configuration.technicalFeatures.endorsementPolicies
                ? "CONSTRAINED_SERIALIZABLE_POLICY_TREE"
                : "DISABLED",
            organizationalIdentity: "EDUCATIONAL_SIMULATION",
            keyCustody: "STATIC_EDUCATIONAL_FIXTURE",
            certificateIssuance: "EDUCATIONAL_SIMULATION",
            networkAndConsensus: "EDUCATIONAL_SIMULATION",
          },
  };
  writeFileSync(
    join(packageDirectory, "build-info.json"),
    `${JSON.stringify(buildInformation, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageDirectory, "version.json"),
    `${JSON.stringify(
      {
        name: "tracechain",
        version: applicationVersion,
        scenarioId: scenario.scenarioId,
        scenarioVersion: scenarioVersionOf(scenario),
        scormVersion: "1.2",
        packageFormatVersion: 2,
        reproducibleBuild: provenance.releaseBuild,
        masteryScore: configuration.scoring.passScore,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageDirectory, "README.txt"),
    [
      `${title} — TraceChain ${applicationVersion}`,
      description,
      "",
      "DEPLOYMENT",
      "  Upload this ZIP to the LMS as a SCORM 1.2 package activity.",
      "  No server, database, blockchain node, or network access is required.",
      "",
      "LMS-OWNED SETTINGS",
      "  Configure availability, attempts, access restrictions, gradebook",
      "  aggregation, and completion handling in the LMS.",
      "",
      `PACKAGE PRESET     ${configuration.presetId}`,
      `ACTIVITY TYPE      ${configuration.activityType}`,
      `SUPPORT PROFILE    ${configuration.supportProfile}`,
      `DELIVERY PURPOSE   ${configuration.deliveryPurpose}`,
      `OUTCOME STRATEGY   ${configuration.outcomeStrategy}`,
      `SCENARIO           ${scenario.scenarioId} v${scenarioVersionOf(scenario)}`,
      `CONFIGURATION      ${embeddedConfiguration.configurationHash}`,
      `PASSING SCORE      ${configuration.scoring.passScore} of 100`,
      `LANGUAGE           ${configuration.locale}`,
      `RELEASE BUILD      ${provenance.releaseBuild ? "yes" : "no"}`,
      "",
      "FICTIONAL STAFF",
      "  The people and portrait images in this simulation are fictional.",
      "  They do not represent real staff of the organizations shown.",
      ...(cryptographicRuntime === null
        ? []
        : [
            "",
            "CRYPTOGRAPHIC AUTHENTICITY",
            "  SHA-256 hashing and Ed25519 signing and verification are genuine",
            "  cryptographic computations. Organizational identity, certificate",
            "  issuance, key custody, the network, ordering, and consensus are",
            "  educational simulations.",
            "  Educational private-key fixtures are inspectable in this static package.",
            "  They must never be used for authentication or real transactions.",
          ]),
      "",
    ].join("\n"),
    "utf8",
  );

  const outputName = packageFileName(
    configuration,
    provenance.releaseBuild,
  );
  const outputPath = join(projectRoot, outputName);
  addFilesToZip(packageDirectory, outputPath);
  return {
    configuration,
    configurationHash: embeddedConfiguration.configurationHash,
    outputName,
    outputPath,
    packageDirectory,
    title,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const provenance = inspectRepository(options);
  const definitions = await loadPackageDefinitions();
  const scenarios = scenarioMap(definitions);
  const auditPacks = auditPackMap(definitions);
  const requested = [];
  const seenPresetIds = new Set();

  for (const presetId of options.presetIds) {
    if (seenPresetIds.has(presetId)) {
      throw new Error(`Preset "${presetId}" was selected more than once`);
    }
    seenPresetIds.add(presetId);
    const configuration = definitions.LECTURER_PRESETS[presetId];
    if (configuration === undefined) {
      throw new Error(
        `Unknown preset "${presetId}". Available presets: ${Object.keys(
          definitions.LECTURER_PRESETS,
        ).join(", ")}`,
      );
    }
    requested.push({
      configuration: structuredClone(configuration),
      sourceLabel: presetId,
    });
  }
  for (const configurationPath of options.configurationPaths) {
    requested.push(loadConfigurationFile(configurationPath, definitions));
  }

  const resolvedInputs = await Promise.all(requested.map(async ({ configuration, sourceLabel }) => {
    if (configuration.activityType === "AUDIT") {
      const draftPack = auditPacks.get(
        configuration.content.packId,
      );
      if (draftPack === undefined) {
        throw new Error(
          `No authored Audit pack is available for ${configuration.content.packId}`,
        );
      }
      const { pack, scenario } = validateAuditPackageInput(
        configuration,
        draftPack,
        definitions,
        provenance,
      );
      return {
        auditPack: pack,
        configuration,
        sourceLabel,
        scenario,
        variantBank: null,
        cryptographicRuntime: null,
        text: resolvePackageText(
          configuration,
          scenario,
          options.title,
        ),
      };
    }
    const scenario = scenarios.get(configuration.scenarioId);
    if (scenario === undefined) {
      throw new Error(
        `No authored scenario is available for ${configuration.scenarioId}`,
      );
    }
    const variantBank = variantBankForConfiguration(
      configuration,
      definitions,
    );
    validatePackageInput(
      configuration,
      scenario,
      variantBank,
      definitions,
    );
    const cryptographicRuntime =
      configuration.technicalFeatures.digitalSignatures
        ? definitions.coffeeCryptographicRuntime
        : null;
    if (cryptographicRuntime !== null) {
      const cryptographicScenarios =
        variantBank === null
          ? [scenario]
          : variantBank.variants.map((variant) => variant.scenario);
      for (const cryptographicScenario of cryptographicScenarios) {
        const validation = await definitions.validateCryptographicRuntime({
          runtime: cryptographicRuntime,
          scenario: cryptographicScenario,
          provider: new definitions.NobleEd25519Provider(),
        });
        if (!validation.isValid) {
          throw new Error(
            `Cryptographic runtime is invalid for ` +
              `${cryptographicScenario.scenarioId} ` +
              `v${cryptographicScenario.scenarioVersion}:\n` +
              validation.issues
                .map((issue) => `  ${issue.path}: ${issue.message}`)
                .join("\n"),
          );
        }
      }
    }
    const text = resolvePackageText(configuration, scenario, options.title);
    return {
      auditPack: null,
      configuration,
      sourceLabel,
      scenario,
      variantBank,
      cryptographicRuntime,
      text,
    };
  }));

  for (const input of resolvedInputs) {
    printPackageSummary(input);
  }

  if (!options.noBuild) {
    const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
    const buildResult = spawnSync(npmExecutable, ["run", "build"], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    if (buildResult.status !== 0) {
      throw new Error("Application build failed; no SCORM package was generated");
    }
  }

  const distDirectory = join(projectRoot, "dist");
  const applicationBuildPaths = existsSync(distDirectory)
    ? listFilesRecursively(distDirectory)
    : [];
  assertStaticApplicationBuildPaths(applicationBuildPaths);
  const staticBuild = hashStaticApplication(distDirectory);

  const results = resolvedInputs.map(
    ({
      auditPack,
      configuration,
      sourceLabel,
      scenario,
      variantBank,
      cryptographicRuntime,
      text,
    }) =>
      packageOne({
        auditPack,
        configuration,
        cryptographicRuntime,
        sourceLabel,
        scenario,
        variantBank,
        definitions,
        provenance,
        staticBuild,
        text,
      }),
  );

  for (const result of results) {
    const sizeKilobytes = (statSync(result.outputPath).size / 1024).toFixed(1);
    console.log(
      [
        `SCORM package written: ${result.outputName}`,
        `  title: ${result.title}`,
        `  preset: ${result.configuration.presetId}`,
        `  scenario: ${result.configuration.scenarioId} v${result.configuration.scenarioVersion}`,
        `  configuration: ${result.configurationHash}`,
        `  application build: ${staticBuild.hash}`,
        `  release: ${provenance.releaseBuild ? "yes" : "no"}`,
        `  size: ${sizeKilobytes} kB`,
      ].join("\n"),
    );
  }
  const artifactCatalog = {
    schemaVersion: "2.0.0",
    generatedAt: provenance.generatedAt,
    sourceCommit: provenance.sourceCommit,
    applicationBuildHash: staticBuild.hash,
    release: provenance.releaseBuild,
    packages: results.map((result) => {
      const bytes = readFileSync(result.outputPath);
      const buildInformation = JSON.parse(
        readFileSync(
          join(result.packageDirectory, "build-info.json"),
          "utf8",
        ),
      );
      return {
        presetId: result.configuration.presetId,
        configurationSchemaVersion:
          result.configuration.configurationSchemaVersion,
        activityType: result.configuration.activityType,
        supportProfile: result.configuration.supportProfile,
        deliveryPurpose: result.configuration.deliveryPurpose,
        outcomeStrategy: result.configuration.outcomeStrategy,
        contentPackId: result.configuration.content.packId,
        contentPackVersion:
          result.configuration.content.packVersion,
        scoringBlueprintId:
          result.configuration.scoring.scoringBlueprintId,
        scoringBlueprintVersion:
          result.configuration.scoring.scoringBlueprintVersion,
        title: result.title,
        filename: result.outputName,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.byteLength,
        release: provenance.releaseBuild,
        configurationHash: result.configurationHash,
        scenarioId: result.configuration.scenarioId,
        scenarioVersion: result.configuration.scenarioVersion,
        applicationBuildHash: staticBuild.hash,
        sourceCommit: provenance.sourceCommit,
        generatedAt: provenance.generatedAt,
        cryptographicEvidenceSchemaVersion:
          buildInformation.cryptographicEvidenceSchemaVersion,
      };
    }),
  };
  mkdirSync(join(projectRoot, "dist-scorm"), { recursive: true });
  writeFileSync(
    join(projectRoot, "dist-scorm", "package-catalog.json"),
    `${JSON.stringify(artifactCatalog, null, 2)}\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error(`SCORM package generation failed: ${error.message}`);
  console.error("");
  console.error(usage());
  process.exitCode = 1;
});

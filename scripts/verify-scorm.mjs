#!/usr/bin/env node
/**
 * Verify configured SCORM packages and prove that every preset reuses one
 * byte-identical static application build.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
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
  "scenario-variant-bank.json",
  "media-manifest.json",
  "identity-registry.json",
  "educational-signing-keys.json",
  "authorization-policies.json",
  "endorsement-policies.json",
]);
const cryptographicRuntimeFileNames = [
  "identity-registry.json",
  "educational-signing-keys.json",
  "authorization-policies.json",
  "endorsement-policies.json",
];

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
  const preset =
    configuration.presetId.slice(0, 1).toUpperCase() +
    configuration.presetId.slice(1).replace(/-([a-z])/gu, (_, letter) =>
      letter.toUpperCase(),
    );
  const scenarioLabel =
    configuration.scenarioId === "SCN_COFFEE_001"
      ? "StandardCoffee"
      : configuration.scenarioId === "SCN_COFFEE_PRACTICE"
        ? "PracticeCase"
        : configuration.scenarioId === "SCN_COFFEE_CHALLENGE"
          ? "ChallengeBank"
          : safeFileSegment(configuration.scenarioId);
  const releaseFileName = [
    "TraceChain",
    safeFileSegment(preset),
    scenarioLabel,
    configuration.locale,
    `v${configuration.scenarioVersion.replace(/[^A-Za-z0-9.-]/gu, "")}`,
  ].join("_") + ".zip";
  return classifyPackageFileName(releaseFileName, releaseBuild);
}

function defaultPackagePaths() {
  return ["guided", "practice", "challenge", "assessment"].map((presetId) => {
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
        !entry.isDirectory &&
        !packageSpecificFiles.has(entry.entryName) &&
        !entry.entryName.startsWith("media/"),
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

function webpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  return null;
}

function verifyPortraitMedia({
  zip,
  entryNames,
  scenario,
  buildInformation,
  check,
}) {
  let manifest = null;
  try {
    manifest = JSON.parse(zip.readAsText("media-manifest.json"));
  } catch {
    // The checks below report the malformed manifest.
  }
  check("media-manifest.json is valid JSON", manifest !== null);
  if (manifest === null) return;

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const scenarioAssets = Array.isArray(scenario?.portraitAssets)
    ? scenario.portraitAssets
    : [];
  check(
    "Portrait media manifest is bound to the exact scenario",
    manifest.schemaVersion === "1" &&
      manifest.scenarioId === scenario?.scenarioId &&
      manifest.scenarioVersion === scenario?.scenarioVersion &&
      JSON.stringify(assets) === JSON.stringify(scenarioAssets),
  );
  check(
    "Portrait media manifest matches its recorded hash",
    buildInformation?.portraitMediaSchemaVersion === "1" &&
      buildInformation?.portraitMediaManifestHash ===
        createHash("sha256")
          .update(zip.getEntry("media-manifest.json").getData())
          .digest("hex"),
  );

  const organizationIds = new Set(
    (scenario?.organizations ?? []).map(
      (organization) => organization.organizationId,
    ),
  );
  const actorIds = new Set(
    (scenario?.actors ?? []).map((actor) => actor.actorId),
  );
  const assetIds = assets.map((asset) => asset.assetId);
  const profiles = Array.isArray(scenario?.staffProfiles)
    ? scenario.staffProfiles
    : [];
  check(
    "Portrait asset IDs are unique",
    new Set(assetIds).size === assetIds.length,
  );
  check(
    "Staff profiles reference known actors, organizations, and portrait assets",
    profiles.every(
      (profile) =>
        profile.fictional === true &&
        actorIds.has(profile.actorId) &&
        organizationIds.has(profile.organizationId) &&
        assetIds.includes(profile.portraitAssetId),
    ),
  );

  const recordedHashes = buildInformation?.portraitMediaHashes;
  for (const asset of assets) {
    const safePath =
      typeof asset.filePath === "string" &&
      asset.filePath.startsWith("media/staff/") &&
      !asset.filePath.includes("..") &&
      !asset.filePath.includes("\\") &&
      !/^[a-z][a-z0-9+.-]*:/iu.test(asset.filePath);
    check(`${asset.assetId} uses a safe local path`, safePath);
    check(
      `${asset.assetId} is an approved fictional portrait`,
      asset.fictionalSubject === true &&
        asset.developmentPlaceholder === false &&
        typeof asset.licenseOrApprovalReference === "string" &&
        asset.licenseOrApprovalReference.length > 0,
    );
    check(`${asset.assetId} is present`, entryNames.includes(asset.filePath));
    if (!safePath || !entryNames.includes(asset.filePath)) continue;
    const bytes = zip.getEntry(asset.filePath).getData();
    const digest = createHash("sha256").update(bytes).digest("hex");
    const dimensions = webpDimensions(bytes);
    check(
      `${asset.assetId} matches its authored and recorded hashes`,
      digest === asset.sha256 &&
        recordedHashes?.[asset.filePath] === digest,
    );
    check(
      `${asset.assetId} is an adequate WebP portrait`,
      asset.format === "webp" &&
        dimensions !== null &&
        dimensions.width === asset.width &&
        dimensions.height === asset.height &&
        dimensions.width >= 320 &&
        dimensions.height >= 400,
    );
  }

  const localeFiles = ["en", "vi"].map((locale) =>
    JSON.parse(
      readFileSync(
        join(projectRoot, "src", "locales", `${locale}.json`),
        "utf8",
      ),
    ),
  );
  const profileLocaleKeys = profiles.flatMap((profile) =>
    [
      profile.displayNameKey,
      profile.roleTitleKey,
      profile.departmentKey,
      profile.portraitAltKey,
      profile.shortProfileKey,
      profile.professionalResponsibilityKey,
    ].filter((key) => typeof key === "string"),
  );
  check(
    "Every staff-profile locale key exists in Vietnamese and English",
    profileLocaleKeys.every((key) =>
      localeFiles.every((locale) => typeof locale[key] === "string"),
    ),
  );
}

function verifyCryptographicRuntime({
  zip,
  entries,
  entryNames,
  configuration,
  scenario,
  buildInformation,
  check,
}) {
  const signaturesEnabled =
    configuration?.technicalFeatures?.digitalSignatures === true;
  const endorsementsEnabled =
    configuration?.technicalFeatures?.endorsementPolicies === true;
  check(
    "Endorsement policies cannot be enabled without digital signatures",
    !endorsementsEnabled || signaturesEnabled,
  );
  if (!signaturesEnabled) return;

  for (const fileName of cryptographicRuntimeFileNames) {
    check(
      `${fileName} is present when signatures are enabled`,
      entryNames.includes(fileName),
    );
  }
  if (
    cryptographicRuntimeFileNames.some(
      (fileName) => !entryNames.includes(fileName),
    )
  ) {
    return;
  }

  let identities = null;
  let keys = null;
  let policies = null;
  let endorsementPolicies = null;
  try {
    identities = JSON.parse(zip.readAsText("identity-registry.json"));
  } catch {
    // Individual checks below report malformed files.
  }
  try {
    keys = JSON.parse(zip.readAsText("educational-signing-keys.json"));
  } catch {
    // Individual checks below report malformed files.
  }
  try {
    policies = JSON.parse(zip.readAsText("authorization-policies.json"));
  } catch {
    // Individual checks below report malformed files.
  }
  try {
    endorsementPolicies = JSON.parse(
      zip.readAsText("endorsement-policies.json"),
    );
  } catch {
    // Individual checks below report malformed files.
  }
  check("Identity registry is valid JSON", identities !== null);
  check("Educational signing-key fixture is valid JSON", keys !== null);
  check("Authorization-policy registry is valid JSON", policies !== null);
  check(
    "Endorsement-policy registry is valid JSON",
    endorsementPolicies !== null,
  );
  if (
    identities === null ||
    keys === null ||
    policies === null ||
    endorsementPolicies === null
  ) {
    return;
  }

  check(
    "Cryptographic evidence schema is recorded",
    buildInformation?.cryptographicEvidenceSchemaVersion ===
      (endorsementsEnabled ? "2" : "1"),
  );
  const recordedHashes = buildInformation?.cryptographicRuntimeHashes;
  check(
    "Cryptographic runtime hashes are recorded",
    typeof recordedHashes === "object" && recordedHashes !== null,
  );
  for (const fileName of cryptographicRuntimeFileNames) {
    const calculated = createHash("sha256")
      .update(zip.getEntry(fileName).getData())
      .digest("hex");
    check(
      `${fileName} matches its recorded hash`,
      recordedHashes?.[fileName] === calculated,
    );
  }
  check(
    "Build metadata distinguishes real cryptography from simulated identity and infrastructure",
    buildInformation?.cryptographicMechanisms?.signatureAlgorithm ===
      "Ed25519" &&
      buildInformation?.cryptographicMechanisms?.signatureProvider ===
        "@noble/ed25519@3.1.0" &&
      buildInformation?.cryptographicMechanisms?.signatureComputation ===
        "REAL" &&
      buildInformation?.cryptographicMechanisms
        ?.endorsementSignatureComputation ===
        (endorsementsEnabled ? "REAL" : "DISABLED") &&
      buildInformation?.cryptographicMechanisms
        ?.endorsementPolicyEvaluation ===
        (endorsementsEnabled
          ? "CONSTRAINED_SERIALIZABLE_POLICY_TREE"
          : "DISABLED") &&
      buildInformation?.cryptographicMechanisms?.organizationalIdentity ===
        "EDUCATIONAL_SIMULATION" &&
      buildInformation?.cryptographicMechanisms?.keyCustody ===
        "STATIC_EDUCATIONAL_FIXTURE" &&
      buildInformation?.cryptographicMechanisms?.certificateIssuance ===
        "EDUCATIONAL_SIMULATION" &&
      buildInformation?.cryptographicMechanisms?.networkAndConsensus ===
        "EDUCATIONAL_SIMULATION",
  );

  const identityList = Array.isArray(identities.identities)
    ? identities.identities
    : [];
  const keyList = Array.isArray(keys.keys) ? keys.keys : [];
  const policyList = Array.isArray(policies.policies)
    ? policies.policies
    : [];
  const endorsementPolicyList = Array.isArray(
    endorsementPolicies.policies,
  )
    ? endorsementPolicies.policies
    : [];
  check(
    "Cryptographic runtime schemas are version 1",
    identities.schemaVersion === "1" &&
      keys.schemaVersion === "1" &&
      policies.schemaVersion === "1" &&
      endorsementPolicies.schemaVersion === "1",
  );
  check("Identity registry is nonempty", identityList.length > 0);
  check("Educational key fixture is nonempty", keyList.length > 0);
  check("Authorization policy registry is nonempty", policyList.length > 0);
  check(
    "Endorsement policy registry is nonempty when endorsements are enabled",
    !endorsementsEnabled || endorsementPolicyList.length > 0,
  );

  const organizationIds = new Set(
    (scenario?.organizations ?? []).map(
      (organization) => organization.organizationId,
    ),
  );
  const roleIds = new Set(
    (scenario?.actors ?? []).map((actor) => actor.actorRole),
  );
  const identityIds = identityList.map((identity) => identity.organizationId);
  const keyIds = keyList.map((key) => key.keyId);
  check(
    "Educational identities are unique and reference scenario organizations",
    new Set(identityIds).size === identityIds.length &&
      identityList.every(
        (identity) =>
          organizationIds.has(identity.organizationId) &&
          typeof identity.recognized === "boolean" &&
          Array.isArray(identity.activeKeyIds) &&
          identity.activeKeyIds.length > 0,
      ),
  );
  check(
    "Educational key IDs are unique and every key is explicitly educational-only",
    new Set(keyIds).size === keyIds.length &&
      keyList.every(
        (key) =>
          key.algorithm === "Ed25519" &&
          key.educationalOnly === true &&
          organizationIds.has(key.organizationId),
      ),
  );
  check(
    "Every identity key belongs to that identity",
    identityList.every((identity) =>
      Array.isArray(identity.activeKeyIds) &&
      identity.activeKeyIds.every((keyId) =>
        keyList.some(
          (key) =>
            key.keyId === keyId &&
            key.organizationId === identity.organizationId,
        ),
      ),
    ),
  );

  let keyPairsMatch = true;
  let deterministicSignatures = true;
  for (const key of keyList) {
    try {
      const privateKey = createPrivateKey({
        key: Buffer.from(key.privateKeyPkcs8Base64Url, "base64url"),
        format: "der",
        type: "pkcs8",
      });
      const publicKey = createPublicKey({
        key: Buffer.from(key.publicKeySpkiBase64Url, "base64url"),
        format: "der",
        type: "spki",
      });
      const message = Buffer.from(
        `TraceChain offline package verification:${key.keyId}`,
        "utf8",
      );
      const first = sign(null, message, privateKey);
      const second = sign(null, message, privateKey);
      keyPairsMatch =
        keyPairsMatch &&
        privateKey.asymmetricKeyType === "ed25519" &&
        publicKey.asymmetricKeyType === "ed25519" &&
        verify(null, message, publicKey, first);
      deterministicSignatures =
        deterministicSignatures && first.equals(second);
    } catch {
      keyPairsMatch = false;
      deterministicSignatures = false;
    }
  }
  check(
    "Every educational public/private key pair matches and verifies offline",
    keyPairsMatch,
  );
  check(
    "Every educational key produces deterministic Ed25519 signatures",
    deterministicSignatures,
  );

  const knownCommandTypes = new Set([
    ...(scenario?.organizations ?? []).flatMap(
      (organization) => organization.authorizedActions ?? [],
    ),
    ...Object.values(
      scenario?.runtime?.learnerCommandTemplates ?? {},
    ).map((command) => command.commandType),
    ...(scenario?.seedTransactions ?? []).map(
      (seed) => seed.command.commandType,
    ),
    ...(scenario?.scriptedTransactions ?? []).map(
      (script) => script.command.commandType,
    ),
  ]);
  for (const commandType of [...knownCommandTypes]) {
    knownCommandTypes.add(`ENDORSE:${commandType}`);
  }
  const policyIds = policyList.map(
    (policy) => policy.authorizationPolicyId,
  );
  const allowedPolicyKeys = new Set([
    "authorizationPolicyId",
    "commandTypes",
    "allowedOrganizationIds",
    "allowedRoleIds",
    "signerOrganizationMustMatchActorOrganization",
    "localizationKey",
  ]);
  check(
    "Authorization policies are constrained, unique, and reference known scenario vocabulary",
    new Set(policyIds).size === policyIds.length &&
      policyList.every(
        (policy) =>
          Object.keys(policy).every((key) => allowedPolicyKeys.has(key)) &&
          Array.isArray(policy.commandTypes) &&
          policy.commandTypes.length > 0 &&
          policy.commandTypes.every((commandType) =>
            knownCommandTypes.has(commandType),
          ) &&
          Array.isArray(policy.allowedOrganizationIds) &&
          policy.allowedOrganizationIds.length > 0 &&
          policy.allowedOrganizationIds.every((organizationId) =>
            organizationIds.has(organizationId),
          ) &&
          Array.isArray(policy.allowedRoleIds) &&
          policy.allowedRoleIds.length > 0 &&
          policy.allowedRoleIds.every((roleId) => roleIds.has(roleId)) &&
          typeof policy.signerOrganizationMustMatchActorOrganization ===
            "boolean",
      ),
  );
  const requiredCommandTypes = new Set(
    Object.values(
      scenario?.runtime?.learnerCommandTemplates ?? {},
    ).map((command) => command.commandType),
  );
  check(
    "Every learner command type has one unambiguous authorization policy",
    [...requiredCommandTypes].every(
      (commandType) =>
        policyList.filter((policy) =>
          Array.isArray(policy.commandTypes) &&
          policy.commandTypes.includes(commandType),
        ).length === 1,
    ),
  );

  const endorsementPolicyIds = endorsementPolicyList.map(
    (policy) => policy.endorsementPolicyId,
  );
  const endorsementPolicyAllowedKeys = new Set([
    "endorsementPolicyId",
    "appliesToCommandTypes",
    "expression",
    "localizationKey",
  ]);
  const expressionOrganizations = (expression) => {
    if (
      expression === null ||
      typeof expression !== "object" ||
      Array.isArray(expression)
    ) {
      return null;
    }
    if (expression.kind === "SIGNED_BY") {
      return organizationIds.has(expression.organizationId)
        ? [expression.organizationId]
        : null;
    }
    if (
      expression.kind === "ALL_OF" ||
      expression.kind === "ANY_OF"
    ) {
      if (
        !Array.isArray(expression.policies) ||
        expression.policies.length === 0
      ) {
        return null;
      }
      const nested = expression.policies.map(
        expressionOrganizations,
      );
      return nested.every((value) => value !== null)
        ? nested.flat()
        : null;
    }
    if (expression.kind === "THRESHOLD") {
      if (
        !Array.isArray(expression.organizationIds) ||
        new Set(expression.organizationIds).size !==
          expression.organizationIds.length ||
        !Number.isInteger(expression.required) ||
        expression.required < 1 ||
        expression.required >
          expression.organizationIds.length ||
        !expression.organizationIds.every((organizationId) =>
          organizationIds.has(organizationId),
        )
      ) {
        return null;
      }
      return expression.organizationIds;
    }
    return null;
  };
  const endorsementCommandCounts = new Map();
  let endorsementPoliciesValid =
    new Set(endorsementPolicyIds).size ===
    endorsementPolicyIds.length;
  for (const policy of endorsementPolicyList) {
    const organizationsForPolicy =
      expressionOrganizations(policy.expression);
    const policyOrganizationIds =
      organizationsForPolicy ?? [];
    endorsementPoliciesValid =
      endorsementPoliciesValid &&
      Object.keys(policy).every((key) =>
        endorsementPolicyAllowedKeys.has(key),
      ) &&
      Array.isArray(policy.appliesToCommandTypes) &&
      policy.appliesToCommandTypes.length > 0 &&
      policy.appliesToCommandTypes.every((commandType) =>
        knownCommandTypes.has(commandType),
      ) &&
      organizationsForPolicy !== null &&
      new Set(policyOrganizationIds).size ===
        policyOrganizationIds.length &&
      typeof policy.localizationKey === "string" &&
      policy.localizationKey.length > 0;
    for (const commandType of policy.appliesToCommandTypes ?? []) {
      endorsementCommandCounts.set(
        commandType,
        (endorsementCommandCounts.get(commandType) ?? 0) + 1,
      );
      for (const organizationId of organizationsForPolicy ?? []) {
        const scenarioRoles = (scenario?.runtime?.trustedContexts ?? [])
          .filter(
            (context) =>
              context.organizationId === organizationId,
          )
          .map((context) => context.roleId);
        const authorizationAction = `ENDORSE:${commandType}`;
        const satisfiable = policyList.some(
          (authorizationPolicy) =>
            authorizationPolicy.commandTypes?.includes(
              authorizationAction,
            ) &&
            authorizationPolicy.allowedOrganizationIds?.includes(
              organizationId,
            ) &&
            scenarioRoles.some((roleId) =>
              authorizationPolicy.allowedRoleIds?.includes(roleId),
            ),
        );
        endorsementPoliciesValid =
          endorsementPoliciesValid && satisfiable;
      }
    }
  }
  endorsementPoliciesValid =
    endorsementPoliciesValid &&
    [...endorsementCommandCounts.values()].every(
      (count) => count === 1,
    );
  check(
    "Endorsement policies are constrained, unambiguous, and satisfiable by trusted roles",
    endorsementPoliciesValid,
  );
  check(
    "Enabled endorsement content covers custody transfer and quantity correction",
    !endorsementsEnabled ||
      (endorsementCommandCounts.get("TRANSFER_CUSTODY") === 1 &&
        endorsementCommandCounts.get("RECORD_CORRECTION") === 1),
  );

  const privateKeyValues = keyList
    .map((key) => key.privateKeyPkcs8Base64Url)
    .filter((value) => typeof value === "string" && value.length > 0);
  const learnerFacingFiles = entries.filter(
    (entry) =>
      entry.entryName.endsWith(".html") ||
      entry.entryName.endsWith(".js") ||
      entry.entryName.endsWith(".css"),
  );
  const privateKeyLeaks = learnerFacingFiles.flatMap((entry) => {
    const source = zip.readAsText(entry);
    return privateKeyValues.some((key) => source.includes(key))
      ? [entry.entryName]
      : [];
  });
  check(
    "No educational private key appears in learner-facing HTML, JavaScript, or CSS",
    privateKeyLeaks.length === 0,
    privateKeyLeaks.join(", "),
  );
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
    "media-manifest.json",
    "build-info.json",
    "version.json",
    "README.txt",
  ];
  for (const file of required) {
    check(`${file} is present`, entryNames.includes(file));
  }
  if (entryNames.includes("README.txt")) {
    const packageReadme = zip.readAsText("README.txt");
    check(
      "Package documentation discloses fictional staff portraits",
      packageReadme.includes(
        "The people and portrait images in this simulation are fictional.",
      ),
    );
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
  let variantBank = null;
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
  if (entryNames.includes("scenario-variant-bank.json")) {
    try {
      variantBank = JSON.parse(
        zip.readAsText("scenario-variant-bank.json"),
      );
    } catch {
      // Reported below.
    }
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
  const usesVariantBank =
    configuration?.scenarioVariation?.strategy ===
    "SEEDED_VARIANT_BANK";
  check(
    "Variant-bank runtime presence matches configuration",
    usesVariantBank
      ? entryNames.includes("scenario-variant-bank.json") &&
          variantBank !== null
      : !entryNames.includes("scenario-variant-bank.json"),
  );
  if (usesVariantBank && variantBank !== null) {
    const variantIds = variantBank.variants?.map(
      (variant) => variant?.metadata?.variantId,
    ) ?? [];
    const caseReferences = variantBank.variants?.map(
      (variant) => variant?.metadata?.caseReference,
    ) ?? [];
    check(
      "Variant bank identity matches configuration",
      variantBank.bankId ===
        configuration.scenarioVariation.bankId &&
        variantBank.bankVersion ===
          configuration.scenarioVariation.bankVersion,
    );
    const minimumVariantCount =
      configuration.supportProfile === "CHALLENGE" ? 3 : 1;
    check(
      "Variant bank contains the required unique curated cases",
      variantIds.length >= minimumVariantCount &&
        new Set(variantIds).size === variantIds.length &&
        new Set(caseReferences).size === caseReferences.length,
    );
    check(
      "Every variant matches the configured scenario family",
      variantBank.variants.every(
        (variant) =>
          variant?.scenario?.scenarioId ===
            configuration.scenarioId &&
          variant?.scenario?.scenarioVersion ===
            configuration.scenarioVersion,
      ),
    );
    check(
      "Every canonical variant hash matches its scenario",
      variantBank.variants.every(
        (variant) =>
          variant?.metadata?.contentHash ===
          createHash("sha256")
            .update(
              canonicalize({
                domain: "TRACECHAIN_SCENARIO_VARIANT_V1",
                scenario: variant.scenario,
              }),
            )
            .digest("hex"),
      ),
    );
    check(
      "Variant bank bytes match recorded build metadata",
      buildInformation?.variantBankId === variantBank.bankId &&
        buildInformation?.variantBankVersion ===
          variantBank.bankVersion &&
        buildInformation?.variantBankHash ===
          createHash("sha256")
            .update(
              zip.getEntry("scenario-variant-bank.json").getData(),
            )
            .digest("hex"),
    );
    check(
      "Recorded variant hashes match bank metadata",
      variantBank.variants.every(
        (variant) =>
          buildInformation?.variantContentHashes?.[
            variant.metadata.variantId
          ] === variant.metadata.contentHash,
      ),
    );
  } else {
    check(
      "Fixed package records no variant-bank metadata",
      buildInformation?.variantBankId === null &&
        buildInformation?.variantBankVersion === null &&
        buildInformation?.variantBankHash === null &&
        Object.keys(
          buildInformation?.variantContentHashes ?? {},
        ).length === 0,
    );
  }
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
    "Scenario content matches its recorded hash",
    buildInformation?.scenarioHash ===
      createHash("sha256")
        .update(zip.getEntry("scenario.json").getData())
        .digest("hex"),
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
      buildInformation?.scenarioVersion === scenario?.scenarioVersion &&
      buildInformation?.configurationSchemaVersion ===
        configuration?.configurationSchemaVersion &&
      buildInformation?.presetId === configuration?.presetId &&
      buildInformation?.activityType === configuration?.activityType &&
      buildInformation?.supportProfile ===
        configuration?.supportProfile &&
      buildInformation?.deliveryPurpose ===
        configuration?.deliveryPurpose &&
      buildInformation?.outcomeStrategy ===
        configuration?.outcomeStrategy &&
      buildInformation?.contentPackId ===
        configuration?.content?.packId &&
      buildInformation?.contentPackVersion ===
        configuration?.content?.packVersion &&
      buildInformation?.scoringBlueprintId ===
        configuration?.scoring?.scoringBlueprintId &&
      buildInformation?.scoringBlueprintVersion ===
        configuration?.scoring?.scoringBlueprintVersion,
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

  verifyCryptographicRuntime({
    zip,
    entries,
    entryNames,
    configuration,
    scenario,
    buildInformation,
    check,
  });
  verifyPortraitMedia({
    zip,
    entryNames,
    scenario,
    buildInformation,
    check,
  });

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
if (defaultInvocation && results.length === 4) {
  const presetIds = results
    .map((result) => result.configuration?.presetId)
    .sort();
  if (
    JSON.stringify(presetIds) !==
    JSON.stringify(["assessment", "challenge", "guided", "practice"])
  ) {
    crossPackageErrors.push(
      "Default verification must cover guided, practice, challenge, and assessment packages",
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
  (defaultInvocation ? 1 : 0);
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

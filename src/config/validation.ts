import type { TraceChainConfiguration } from "./types";

export interface ConfigurationValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ConfigurationValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly ConfigurationValidationIssue[];
}

const MODES = new Set([
  "guided",
  "challenge",
  "assessment",
  "technical-lab",
]);
const BUSINESS_MODES = new Set(["guided", "challenge", "assessment"]);
const DIFFICULTIES = new Set(["introductory", "intermediate"]);
const BUSINESS_FEEDBACK = new Set(["immediate", "stage-end", "final"]);
const LAB_FEEDBACK = new Set(["immediate", "module-end", "final"]);
const HINTS = new Set(["enabled", "limited", "disabled"]);
const LOCALES = new Set(["vi", "en"]);
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/;
const COMMON_FIELDS = [
  "configurationVersion",
  "applicationCompatibilityVersion",
  "mode",
  "feedbackTiming",
  "hints",
  "referenceWorkspace",
  "scoring",
  "locale",
] as const;
const BUSINESS_TOP_LEVEL_FIELDS = new Set([
  ...COMMON_FIELDS,
  "scenarioId",
  "scenarioVersion",
  "scenarioSeed",
  "difficulty",
  "scenarioVariation",
  "technicalFeatures",
]);
const LAB_TOP_LEVEL_FIELDS = new Set([
  ...COMMON_FIELDS,
  "labPackId",
  "labPackVersion",
  "presetId",
  "includedModuleIds",
  "scoringMode",
]);
const TECHNICAL_FEATURE_FIELDS = new Set([
  "hashInspection",
  "digitalSignatures",
  "endorsementPolicies",
  "stateVersionConflicts",
  "merkleLab",
  "proofOfWorkLab",
]);
const SCORING_FIELDS = new Set([
  "maximumScore",
  "passScore",
  "reportDiagnosticDimensions",
]);
const FIXED_VARIATION_FIELDS = new Set([
  "strategy",
  "optionOrdering",
  "attemptPolicy",
  "displayCaseReferenceToLearner",
]);
const BANK_VARIATION_FIELDS = new Set([
  ...FIXED_VARIATION_FIELDS,
  "bankId",
  "bankVersion",
  "selectionAlgorithmVersion",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPortableIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function validateScoring(
  value: Record<string, unknown>,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value.scoring)) {
    issue("scoring", "must be an object");
    return;
  }
  for (const field of Object.keys(value.scoring)) {
    if (!SCORING_FIELDS.has(field)) {
      issue(`scoring.${field}`, "is not a documented scoring field");
    }
  }
  if (value.scoring.maximumScore !== 100) {
    issue("scoring.maximumScore", "must be exactly 100 in this release");
  }
  if (
    typeof value.scoring.passScore !== "number" ||
    !Number.isFinite(value.scoring.passScore) ||
    value.scoring.passScore < 0 ||
    value.scoring.passScore > 100
  ) {
    issue("scoring.passScore", "must be between 0 and 100");
  }
  if (typeof value.scoring.reportDiagnosticDimensions !== "boolean") {
    issue("scoring.reportDiagnosticDimensions", "must be boolean");
  }
}

function validateScenarioVariation(
  variation: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(variation)) {
    issue("scenarioVariation", "must be an object");
    return;
  }
  const strategy = variation.strategy;
  const allowedFields =
    strategy === "FIXED"
      ? FIXED_VARIATION_FIELDS
      : BANK_VARIATION_FIELDS;
  for (const field of Object.keys(variation)) {
    if (!allowedFields.has(field)) {
      issue(
        `scenarioVariation.${field}`,
        "is not a documented variation field for this strategy",
      );
    }
  }
  if (strategy !== "FIXED" && strategy !== "SEEDED_VARIANT_BANK") {
    issue(
      "scenarioVariation.strategy",
      "must be FIXED or SEEDED_VARIANT_BANK",
    );
  }
  if (variation.optionOrdering !== "FIXED") {
    issue(
      "scenarioVariation.optionOrdering",
      "only fixed option ordering is available in this release",
    );
  }
  if (variation.attemptPolicy !== "STABLE_WITHIN_ATTEMPT") {
    issue(
      "scenarioVariation.attemptPolicy",
      "SCORM variation must remain stable within one attempt",
    );
  }
  if (typeof variation.displayCaseReferenceToLearner !== "boolean") {
    issue(
      "scenarioVariation.displayCaseReferenceToLearner",
      "must be boolean",
    );
  }
  if (strategy === "FIXED") {
    if (variation.displayCaseReferenceToLearner !== false) {
      issue(
        "scenarioVariation.displayCaseReferenceToLearner",
        "fixed scenarios do not expose a variant case reference",
      );
    }
    return;
  }
  if (strategy === "SEEDED_VARIANT_BANK") {
    for (const field of [
      "bankId",
      "bankVersion",
      "selectionAlgorithmVersion",
    ] as const) {
      if (!isPortableIdentifier(variation[field])) {
        issue(
          `scenarioVariation.${field}`,
          "must be a bounded portable identifier",
        );
      }
    }
    if (variation.selectionAlgorithmVersion !== "1") {
      issue(
        "scenarioVariation.selectionAlgorithmVersion",
        "is not supported by this player",
      );
    }
  }
}

function validateTechnicalFeatures(
  features: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(features)) {
    issue("technicalFeatures", "must be an object");
    return;
  }
  for (const name of TECHNICAL_FEATURE_FIELDS) {
    if (typeof features[name] !== "boolean") {
      issue(`technicalFeatures.${name}`, "must be boolean");
    }
  }
  for (const field of Object.keys(features)) {
    if (!TECHNICAL_FEATURE_FIELDS.has(field)) {
      issue(
        `technicalFeatures.${field}`,
        "is not a documented technical feature",
      );
    }
  }
  if (features.hashInspection !== true) {
    issue(
      "technicalFeatures.hashInspection",
      "must remain enabled while the main scenario exposes real hashes",
    );
  }
  for (const unavailable of [
    "stateVersionConflicts",
    "merkleLab",
    "proofOfWorkLab",
  ] as const) {
    if (features[unavailable] === true) {
      issue(
        `technicalFeatures.${unavailable}`,
        "content is not available in the business simulation",
      );
    }
  }
  if (
    features.endorsementPolicies === true &&
    features.digitalSignatures !== true
  ) {
    issue(
      "technicalFeatures.endorsementPolicies",
      "requires digital signatures",
    );
  }
}

function validateBusinessConfiguration(
  value: Record<string, unknown>,
  issue: (path: string, message: string) => void,
): void {
  if (value.applicationCompatibilityVersion !== "tc3-v2") {
    issue(
      "applicationCompatibilityVersion",
      "is not compatible with the business-simulation player",
    );
  }
  for (const field of [
    "scenarioId",
    "scenarioVersion",
    "scenarioSeed",
  ] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(field, "must be a bounded portable identifier");
    }
  }
  if (!DIFFICULTIES.has(String(value.difficulty))) {
    issue("difficulty", "is not supported");
  }
  if (!BUSINESS_FEEDBACK.has(String(value.feedbackTiming))) {
    issue("feedbackTiming", "is not supported");
  }
  validateScenarioVariation(value.scenarioVariation, issue);
  validateTechnicalFeatures(value.technicalFeatures, issue);

  if (value.mode === "assessment") {
    if (
      typeof value.scenarioSeed !== "string" ||
      value.scenarioSeed.length === 0
    ) {
      issue("scenarioSeed", "assessment mode requires a fixed seed");
    }
    if (value.feedbackTiming !== "final") {
      issue("feedbackTiming", "assessment mode requires final feedback");
    }
    if (value.hints !== "disabled") {
      issue("hints", "assessment mode requires disabled hints");
    }
    if (value.scenarioId !== "SCN_COFFEE_001") {
      issue(
        "scenarioId",
        "assessment mode requires the reviewed standard coffee scenario",
      );
    }
    if (
      isObject(value.scenarioVariation) &&
      value.scenarioVariation.strategy !== "FIXED"
    ) {
      issue(
        "scenarioVariation.strategy",
        "the formal Assessment variant bank is not available in this release",
      );
    }
  }
  if (value.feedbackTiming === "final" && value.mode === "guided") {
    issue(
      "feedbackTiming",
      "guided mode requires feedback before the final report",
    );
  }
  if (value.mode === "guided" && value.scenarioId !== "SCN_COFFEE_001") {
    issue("scenarioId", "guided mode requires the standard coffee scenario");
  }
  if (
    value.mode === "guided" &&
    isObject(value.scenarioVariation) &&
    value.scenarioVariation.strategy !== "FIXED"
  ) {
    issue("scenarioVariation.strategy", "guided mode must remain fixed");
  }
  if (
    value.mode === "challenge" &&
    value.scenarioId !== "SCN_COFFEE_CHALLENGE"
  ) {
    issue(
      "scenarioId",
      "challenge mode requires the curated Challenge variant bank",
    );
  }
  if (
    value.mode === "challenge" &&
    isObject(value.scenarioVariation) &&
    value.scenarioVariation.strategy !== "SEEDED_VARIANT_BANK"
  ) {
    issue(
      "scenarioVariation.strategy",
      "challenge mode requires the seeded curated variant bank",
    );
  }
}

function validateTechnicalLabConfiguration(
  value: Record<string, unknown>,
  issue: (path: string, message: string) => void,
): void {
  if (value.applicationCompatibilityVersion !== "tl1-v1") {
    issue(
      "applicationCompatibilityVersion",
      "is not compatible with the technical-laboratory player",
    );
  }
  for (const field of ["labPackId", "labPackVersion"] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(field, "must be a bounded portable identifier");
    }
  }
  if (value.presetId !== "permissioned-blockchain-foundations") {
    issue(
      "presetId",
      "must be the accepted permissioned-blockchain-foundations preset",
    );
  }
  if (!Array.isArray(value.includedModuleIds)) {
    issue("includedModuleIds", "must be an array");
  } else {
    if (
      value.includedModuleIds.length === 0 ||
      value.includedModuleIds.length > 7
    ) {
      issue(
        "includedModuleIds",
        "must contain one to seven bounded module identifiers",
      );
    }
    const moduleIds = new Set<string>();
    value.includedModuleIds.forEach((moduleId, index) => {
      if (!isPortableIdentifier(moduleId)) {
        issue(
          `includedModuleIds.${index}`,
          "must be a bounded portable identifier",
        );
      } else if (moduleIds.has(moduleId)) {
        issue(
          `includedModuleIds.${index}`,
          "must not duplicate another module identifier",
        );
      } else {
        moduleIds.add(moduleId);
      }
    });
  }
  if (!LAB_FEEDBACK.has(String(value.feedbackTiming))) {
    issue("feedbackTiming", "is not supported for a technical laboratory");
  }
  if (value.scoringMode !== "graded") {
    issue("scoringMode", "must be graded in the first accepted preset");
  }
}

export function validateConfiguration(
  value: unknown,
): ConfigurationValidationResult {
  const issues: ConfigurationValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  if (!isObject(value)) {
    return {
      isValid: false,
      issues: [{ path: "$", message: "Configuration must be an object" }],
    };
  }

  const isTechnicalLab = value.mode === "technical-lab";
  const allowedFields = isTechnicalLab
    ? LAB_TOP_LEVEL_FIELDS
    : BUSINESS_TOP_LEVEL_FIELDS;
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      issue(field, "is not a documented configuration field for this mode");
    }
  }

  if (value.configurationVersion !== "3") {
    issue("configurationVersion", "is not supported by this generator");
  }
  if (!MODES.has(String(value.mode))) {
    issue("mode", "is not supported");
  }
  if (!HINTS.has(String(value.hints))) {
    issue("hints", "is not supported");
  }
  if (
    value.referenceWorkspace !== "enabled" &&
    value.referenceWorkspace !== "disabled"
  ) {
    issue("referenceWorkspace", "must be enabled or disabled");
  }
  if (!LOCALES.has(String(value.locale))) {
    issue("locale", "must be vi or en");
  }
  validateScoring(value, issue);

  if (isTechnicalLab) {
    validateTechnicalLabConfiguration(value, issue);
  } else {
    if (!BUSINESS_MODES.has(String(value.mode))) {
      issue("mode", "must select a business or technical-laboratory mode");
    }
    validateBusinessConfiguration(value, issue);
  }

  return { isValid: issues.length === 0, issues };
}

export function assertValidConfiguration(
  value: unknown,
): asserts value is TraceChainConfiguration {
  const result = validateConfiguration(value);
  if (!result.isValid) {
    throw new Error(
      `TraceChain configuration is invalid:\n${result.issues
        .map((entry) => `  ${entry.path}: ${entry.message}`)
        .join("\n")}`,
    );
  }
}

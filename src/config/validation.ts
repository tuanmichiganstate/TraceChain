import {
  isAllowedExperienceCombination,
  resolveProductDimensions,
} from "./experience";
import type { TraceChainConfiguration } from "./types";

export interface ConfigurationValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ConfigurationValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly ConfigurationValidationIssue[];
}

const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,96}$/;
const LOCALES = new Set(["vi", "en"]);
const ACTIVITY_TYPES = new Set([
  "OPERATIONS",
  "AUDIT",
  "TECHNICAL_LAB",
]);
const SUPPORT_PROFILES = new Set([
  "GUIDED",
  "PRACTICE",
  "CHALLENGE",
]);
const DELIVERY_PURPOSES = new Set([
  "FORMATIVE",
  "ASSESSMENT",
  "SANDBOX",
]);
const OUTCOME_STRATEGIES = new Set([
  "FIXED",
  "CURATED_VARIANT",
  "SEEDED_STOCHASTIC",
  "FORCED_CONDITION",
]);
const BUSINESS_PRESETS = new Set([
  "guided",
  "practice",
  "challenge",
  "assessment",
]);
const AUDIT_PRESETS = new Set([
  "audit-guided",
  "audit-practice",
  "audit-challenge",
  "audit-assessment",
]);
const BUSINESS_FEEDBACK = new Set([
  "IMMEDIATE",
  "STAGE_END",
  "FINAL",
]);
const LAB_FEEDBACK = new Set([
  "IMMEDIATE",
  "MODULE_END",
  "FINAL",
]);
const HINT_AVAILABILITY = new Set([
  "ENABLED",
  "LIMITED",
  "DISABLED",
]);
const COMMON_TOP_LEVEL_FIELDS = [
  "configurationSchemaVersion",
  "applicationCompatibilityVersion",
  "presetId",
  "activityType",
  "supportProfile",
  "deliveryPurpose",
  "outcomeStrategy",
  "content",
  "guidance",
  "feedback",
  "hints",
  "retries",
  "decisions",
  "scoring",
  "reporting",
  "delivery",
  "locale",
] as const;
const BUSINESS_TOP_LEVEL_FIELDS = new Set([
  ...COMMON_TOP_LEVEL_FIELDS,
  "scenarioId",
  "scenarioVersion",
  "scenarioSeed",
  "difficulty",
  "scenarioVariation",
  "technicalFeatures",
]);
const AUDIT_TOP_LEVEL_FIELDS = new Set([
  ...COMMON_TOP_LEVEL_FIELDS,
  "scenarioId",
  "scenarioVersion",
  "auditCaseId",
  "auditCaseVersion",
  "scenarioSeed",
  "scenarioVariation",
]);
const LAB_TOP_LEVEL_FIELDS = new Set([
  ...COMMON_TOP_LEVEL_FIELDS,
  "labPackId",
  "labPackVersion",
  "laboratoryPresetId",
  "includedModuleIds",
  "scoringMode",
]);
const CONTENT_FIELDS = new Set([
  "packId",
  "packVersion",
  "scenarioId",
  "scenarioVersion",
  "variantBankId",
  "variantBankVersion",
  "laboratoryPackId",
  "laboratoryPackVersion",
]);
const GUIDANCE_FIELDS = new Set([
  "missionDetail",
  "evidenceGuidance",
  "policyGuidance",
  "nextActionGuidance",
  "fadeByProgress",
  "showWorkedExamples",
  "referenceWorkspace",
]);
const FEEDBACK_FIELDS = new Set([
  "timing",
  "showCorrectness",
  "showCausalConsequences",
  "showWorkedExplanation",
  "releaseRuleId",
]);
const HINT_FIELDS = new Set([
  "availability",
  "proactiveOffer",
  "itemScoped",
  "disclosureRequired",
  "maximumHintsPerRun",
]);
const RETRY_FIELDS = new Set([
  "knowledgeRetry",
  "professionalDecisionRevision",
  "maximumKnowledgeAttempts",
  "maximumMitigationActions",
]);
const DECISION_FIELDS = new Set([
  "requireRationale",
  "requireEvidenceCitations",
  "requirePolicyCitations",
  "requireConfidence",
  "requireRiskEstimate",
  "allowDrafts",
]);
const SCORING_FIELDS = new Set([
  "scoringBlueprintId",
  "scoringBlueprintVersion",
  "maximumScore",
  "passScore",
  "official",
  "competencyEvidenceEnabled",
  "reportDiagnosticDimensions",
]);
const REPORTING_FIELDS = new Set([
  "causalReport",
  "auditReport",
  "competencyReport",
  "activitySummary",
  "showTechnicalMetadataToLearner",
]);
const DELIVERY_FIELDS = new Set([
  "channel",
  "persistencePolicyId",
  "attemptPolicyId",
  "timeLimitMinutes",
  "availabilityRuleId",
]);
const TECHNICAL_FEATURE_FIELDS = new Set([
  "hashInspection",
  "digitalSignatures",
  "endorsementPolicies",
  "stateVersionConflicts",
  "merkleLab",
  "proofOfWorkLab",
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
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPortableIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function exactFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issue: (path: string, message: string) => void,
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      issue(
        path.length === 0 ? field : `${path}.${field}`,
        "is not a documented configuration field",
      );
    }
  }
}

function boundedOptionalInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issue: (path: string, message: string) => void,
): void {
  if (
    value !== undefined &&
    (!Number.isInteger(value) ||
      (value as number) < minimum ||
      (value as number) > maximum)
  ) {
    issue(path, `must be an integer from ${minimum} to ${maximum}`);
  }
}

function validateContent(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("content", "must be an object");
    return;
  }
  exactFields(value, CONTENT_FIELDS, "content", issue);
  for (const field of ["packId", "packVersion"] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(`content.${field}`, "must be a bounded portable identifier");
    }
  }
  for (const field of [
    "scenarioId",
    "scenarioVersion",
    "variantBankId",
    "variantBankVersion",
    "laboratoryPackId",
    "laboratoryPackVersion",
  ] as const) {
    if (
      value[field] !== undefined &&
      !isPortableIdentifier(value[field])
    ) {
      issue(`content.${field}`, "must be a bounded portable identifier");
    }
  }
}

function validateGuidance(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("guidance", "must be an object");
    return;
  }
  exactFields(value, GUIDANCE_FIELDS, "guidance", issue);
  if (!["FULL", "CONCISE", "MINIMAL"].includes(String(value.missionDetail))) {
    issue("guidance.missionDetail", "is not supported");
  }
  for (const field of [
    "evidenceGuidance",
    "policyGuidance",
  ] as const) {
    if (!["DIRECT", "SUGGESTED", "NONE"].includes(String(value[field]))) {
      issue(`guidance.${field}`, "is not supported");
    }
  }
  if (
    !["EXPLICIT", "GOAL_ONLY", "NONE"].includes(
      String(value.nextActionGuidance),
    )
  ) {
    issue("guidance.nextActionGuidance", "is not supported");
  }
  for (const field of [
    "fadeByProgress",
    "showWorkedExamples",
    "referenceWorkspace",
  ] as const) {
    if (typeof value[field] !== "boolean") {
      issue(`guidance.${field}`, "must be boolean");
    }
  }
}

function validateFeedback(
  value: unknown,
  isTechnicalLab: boolean,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("feedback", "must be an object");
    return;
  }
  exactFields(value, FEEDBACK_FIELDS, "feedback", issue);
  const allowed = isTechnicalLab ? LAB_FEEDBACK : BUSINESS_FEEDBACK;
  if (!allowed.has(String(value.timing))) {
    issue("feedback.timing", "is not supported for this activity");
  }
  for (const field of [
    "showCorrectness",
    "showCausalConsequences",
    "showWorkedExplanation",
  ] as const) {
    if (typeof value[field] !== "boolean") {
      issue(`feedback.${field}`, "must be boolean");
    }
  }
  if (
    value.releaseRuleId !== undefined &&
    !isPortableIdentifier(value.releaseRuleId)
  ) {
    issue(
      "feedback.releaseRuleId",
      "must be a bounded portable identifier",
    );
  }
}

function validateHints(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("hints", "must be an object");
    return;
  }
  exactFields(value, HINT_FIELDS, "hints", issue);
  if (!HINT_AVAILABILITY.has(String(value.availability))) {
    issue("hints.availability", "is not supported");
  }
  if (
    ![
      "OFFERED",
      "AVAILABLE_ON_REQUEST",
      "NOT_AVAILABLE",
    ].includes(String(value.proactiveOffer))
  ) {
    issue("hints.proactiveOffer", "is not supported");
  }
  if (value.itemScoped !== true) {
    issue("hints.itemScoped", "must remain true");
  }
  if (typeof value.disclosureRequired !== "boolean") {
    issue("hints.disclosureRequired", "must be boolean");
  }
  boundedOptionalInteger(
    value.maximumHintsPerRun,
    "hints.maximumHintsPerRun",
    0,
    100,
    issue,
  );
}

function validateRetries(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("retries", "must be an object");
    return;
  }
  exactFields(value, RETRY_FIELDS, "retries", issue);
  if (
    !["ENABLED", "LIMITED", "DISABLED"].includes(
      String(value.knowledgeRetry),
    )
  ) {
    issue("retries.knowledgeRetry", "is not supported");
  }
  if (
    ![
      "APPEND_ONLY_MITIGATION",
      "ONE_SHOT",
      "FREE_REVISION",
    ].includes(String(value.professionalDecisionRevision))
  ) {
    issue(
      "retries.professionalDecisionRevision",
      "is not supported",
    );
  }
  boundedOptionalInteger(
    value.maximumKnowledgeAttempts,
    "retries.maximumKnowledgeAttempts",
    1,
    20,
    issue,
  );
  boundedOptionalInteger(
    value.maximumMitigationActions,
    "retries.maximumMitigationActions",
    0,
    20,
    issue,
  );
}

function validateDecisions(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("decisions", "must be an object");
    return;
  }
  exactFields(value, DECISION_FIELDS, "decisions", issue);
  for (const field of DECISION_FIELDS) {
    if (typeof value[field] !== "boolean") {
      issue(`decisions.${field}`, "must be boolean");
    }
  }
}

function validateScoring(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("scoring", "must be an object");
    return;
  }
  exactFields(value, SCORING_FIELDS, "scoring", issue);
  for (const field of [
    "scoringBlueprintId",
    "scoringBlueprintVersion",
  ] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(`scoring.${field}`, "must be a bounded portable identifier");
    }
  }
  if (value.maximumScore !== 100) {
    issue("scoring.maximumScore", "must be exactly 100 in this release");
  }
  if (
    typeof value.passScore !== "number" ||
    !Number.isFinite(value.passScore) ||
    value.passScore < 0 ||
    value.passScore > 100
  ) {
    issue("scoring.passScore", "must be between 0 and 100");
  }
  for (const field of [
    "official",
    "competencyEvidenceEnabled",
    "reportDiagnosticDimensions",
  ] as const) {
    if (typeof value[field] !== "boolean") {
      issue(`scoring.${field}`, "must be boolean");
    }
  }
}

function validateReporting(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("reporting", "must be an object");
    return;
  }
  exactFields(value, REPORTING_FIELDS, "reporting", issue);
  for (const field of REPORTING_FIELDS) {
    if (typeof value[field] !== "boolean") {
      issue(`reporting.${field}`, "must be boolean");
    }
  }
}

function validateDelivery(
  value: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(value)) {
    issue("delivery", "must be an object");
    return;
  }
  exactFields(value, DELIVERY_FIELDS, "delivery", issue);
  if (value.channel !== "SCORM") {
    issue("delivery.channel", "package configuration must use SCORM");
  }
  for (const field of [
    "persistencePolicyId",
    "attemptPolicyId",
  ] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(`delivery.${field}`, "must be a bounded portable identifier");
    }
  }
  boundedOptionalInteger(
    value.timeLimitMinutes,
    "delivery.timeLimitMinutes",
    1,
    1440,
    issue,
  );
  if (
    value.availabilityRuleId !== undefined &&
    !isPortableIdentifier(value.availabilityRuleId)
  ) {
    issue(
      "delivery.availabilityRuleId",
      "must be a bounded portable identifier",
    );
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
  exactFields(
    variation,
    strategy === "FIXED"
      ? FIXED_VARIATION_FIELDS
      : BANK_VARIATION_FIELDS,
    "scenarioVariation",
    issue,
  );
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

function validateTechnicalFeatures(
  features: unknown,
  issue: (path: string, message: string) => void,
): void {
  if (!isObject(features)) {
    issue("technicalFeatures", "must be an object");
    return;
  }
  exactFields(
    features,
    TECHNICAL_FEATURE_FIELDS,
    "technicalFeatures",
    issue,
  );
  for (const name of TECHNICAL_FEATURE_FIELDS) {
    if (typeof features[name] !== "boolean") {
      issue(`technicalFeatures.${name}`, "must be boolean");
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

function validateDimensions(
  value: Record<string, unknown>,
  issue: (path: string, message: string) => void,
): void {
  if (!ACTIVITY_TYPES.has(String(value.activityType))) {
    issue("activityType", "is not supported");
  }
  if (!SUPPORT_PROFILES.has(String(value.supportProfile))) {
    issue("supportProfile", "is not supported");
  }
  if (!DELIVERY_PURPOSES.has(String(value.deliveryPurpose))) {
    issue("deliveryPurpose", "is not supported");
  }
  if (!OUTCOME_STRATEGIES.has(String(value.outcomeStrategy))) {
    issue("outcomeStrategy", "is not supported");
  }
  if (
    ACTIVITY_TYPES.has(String(value.activityType)) &&
    SUPPORT_PROFILES.has(String(value.supportProfile)) &&
    DELIVERY_PURPOSES.has(String(value.deliveryPurpose)) &&
    OUTCOME_STRATEGIES.has(String(value.outcomeStrategy)) &&
    !isAllowedExperienceCombination(
      value as unknown as Parameters<
        typeof isAllowedExperienceCombination
      >[0],
    )
  ) {
    issue(
      "activityType",
      "activity, support, delivery, and outcome dimensions are incompatible",
    );
  }
  if (
    typeof value.presetId === "string" &&
    [
      "guided",
      "practice",
      "challenge",
      "assessment",
      "audit-guided",
      "audit-practice",
      "audit-challenge",
      "audit-assessment",
      "technical-lab",
    ].includes(value.presetId)
  ) {
    const expected = resolveProductDimensions(
      value.presetId as
        | "guided"
        | "practice"
        | "challenge"
        | "assessment"
        | "audit-guided"
        | "audit-practice"
        | "audit-challenge"
        | "audit-assessment"
        | "technical-lab",
    );
    for (const field of [
      "activityType",
      "supportProfile",
      "deliveryPurpose",
      "outcomeStrategy",
    ] as const) {
      if (value[field] !== expected[field]) {
        issue(
          field,
          `does not match resolved preset ${value.presetId}`,
        );
      }
    }
  }
}

function validateCommon(
  value: Record<string, unknown>,
  isTechnicalLab: boolean,
  issue: (path: string, message: string) => void,
): void {
  if (value.configurationSchemaVersion !== "2") {
    issue(
      "configurationSchemaVersion",
      "must be the active schema version 2",
    );
  }
  if (!isPortableIdentifier(value.presetId)) {
    issue("presetId", "must be a bounded portable identifier");
  }
  validateDimensions(value, issue);
  validateContent(value.content, issue);
  validateGuidance(value.guidance, issue);
  validateFeedback(value.feedback, isTechnicalLab, issue);
  validateHints(value.hints, issue);
  validateRetries(value.retries, issue);
  validateDecisions(value.decisions, issue);
  validateScoring(value.scoring, issue);
  validateReporting(value.reporting, issue);
  validateDelivery(value.delivery, issue);
  if (!LOCALES.has(String(value.locale))) {
    issue("locale", "must be vi or en");
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
  if (!BUSINESS_PRESETS.has(String(value.presetId))) {
    issue("presetId", "is not a shipped business preset");
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
  if (
    !["introductory", "intermediate"].includes(
      String(value.difficulty),
    )
  ) {
    issue("difficulty", "is not supported");
  }
  validateScenarioVariation(value.scenarioVariation, issue);
  validateTechnicalFeatures(value.technicalFeatures, issue);

  if (isObject(value.content)) {
    if (
      value.content.scenarioId !== value.scenarioId ||
      value.content.scenarioVersion !== value.scenarioVersion
    ) {
      issue(
        "content.scenarioId",
        "must identify the exact runtime scenario",
      );
    }
  }
  if (
    isObject(value.scenarioVariation) &&
    ((value.outcomeStrategy === "CURATED_VARIANT") !==
      (value.scenarioVariation.strategy ===
        "SEEDED_VARIANT_BANK"))
  ) {
    issue(
      "outcomeStrategy",
      "must agree with the scenario variation strategy",
    );
  }
  if (value.presetId === "assessment") {
    if (value.scenarioId !== "SCN_COFFEE_001") {
      issue(
        "scenarioId",
        "assessment preset requires the reviewed standard coffee scenario",
      );
    }
    if (value.feedback !== undefined &&
      isObject(value.feedback) &&
      value.feedback.timing !== "FINAL") {
      issue(
        "feedback.timing",
        "assessment delivery requires final feedback",
      );
    }
    if (
      isObject(value.hints) &&
      value.hints.availability !== "DISABLED"
    ) {
      issue(
        "hints.availability",
        "assessment delivery requires disabled hints",
      );
    }
    if (
      isObject(value.scoring) &&
      value.scoring.official !== true
    ) {
      issue("scoring.official", "assessment scoring must be official");
    }
  }
  if (
    value.presetId === "guided" &&
    value.scenarioId !== "SCN_COFFEE_001"
  ) {
    issue(
      "scenarioId",
      "guided preset requires the standard coffee scenario",
    );
  }
  if (
    value.presetId === "practice" &&
    value.scenarioId !== "SCN_COFFEE_PRACTICE"
  ) {
    issue(
      "scenarioId",
      "practice preset requires the curated Practice case",
    );
  }
  if (
    value.presetId === "challenge" &&
    value.scenarioId !== "SCN_COFFEE_CHALLENGE"
  ) {
    issue(
      "scenarioId",
      "challenge preset requires the curated Challenge bank",
    );
  }

  const presetId = String(value.presetId);
  if (
    ["guided", "practice"].includes(presetId) &&
    isObject(value.feedback) &&
    value.feedback.timing !== "IMMEDIATE"
  ) {
    issue(
      "feedback.timing",
      `${presetId} delivery requires immediate feedback`,
    );
  }
  if (
    presetId === "challenge" &&
    isObject(value.feedback) &&
    value.feedback.timing !== "STAGE_END"
  ) {
    issue(
      "feedback.timing",
      "challenge delivery requires stage-end feedback",
    );
  }
  if (
    ["guided", "practice"].includes(presetId) &&
    isObject(value.hints) &&
    value.hints.availability !== "ENABLED"
  ) {
    issue(
      "hints.availability",
      `${presetId} delivery requires enabled hints`,
    );
  }
  if (
    presetId === "challenge" &&
    isObject(value.hints) &&
    value.hints.availability !== "LIMITED"
  ) {
    issue(
      "hints.availability",
      "challenge delivery requires limited hints",
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
  if (value.presetId !== "technical-lab") {
    issue("presetId", "must select the technical-lab product preset");
  }
  for (const field of ["labPackId", "labPackVersion"] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(field, "must be a bounded portable identifier");
    }
  }
  if (
    value.laboratoryPresetId !==
    "permissioned-blockchain-foundations"
  ) {
    issue(
      "laboratoryPresetId",
      "must select the accepted laboratory content preset",
    );
  }
  if (!Array.isArray(value.includedModuleIds)) {
    issue("includedModuleIds", "must be an array");
  } else {
    const moduleIds = new Set<string>();
    if (
      value.includedModuleIds.length === 0 ||
      value.includedModuleIds.length > 7
    ) {
      issue(
        "includedModuleIds",
        "must contain one to seven bounded module identifiers",
      );
    }
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
  if (value.scoringMode !== "graded") {
    issue("scoringMode", "must be graded in the accepted preset");
  }
  if (
    isObject(value.content) &&
    (value.content.laboratoryPackId !== value.labPackId ||
      value.content.laboratoryPackVersion !== value.labPackVersion)
  ) {
    issue(
      "content.laboratoryPackId",
      "must identify the exact laboratory pack",
    );
  }
}

function validateAuditConfiguration(
  value: Record<string, unknown>,
  issue: (path: string, message: string) => void,
): void {
  if (value.applicationCompatibilityVersion !== "ta2-v1") {
    issue(
      "applicationCompatibilityVersion",
      "is not compatible with the Audit SCORM player",
    );
  }
  if (!AUDIT_PRESETS.has(String(value.presetId))) {
    issue("presetId", "is not a shipped Audit preset");
  }
  for (const field of [
    "scenarioId",
    "scenarioVersion",
    "auditCaseId",
    "auditCaseVersion",
    "scenarioSeed",
  ] as const) {
    if (!isPortableIdentifier(value[field])) {
      issue(field, "must be a bounded portable identifier");
    }
  }
  validateScenarioVariation(value.scenarioVariation, issue);
  if (
    isObject(value.content) &&
    (value.content.scenarioId !== value.scenarioId ||
      value.content.scenarioVersion !== value.scenarioVersion)
  ) {
    issue(
      "content.scenarioId",
      "must identify the exact Audit scenario",
    );
  }
  if (
    value.presetId === "audit-guided" &&
    (value.scenarioId !== "SCN_GUIDED_COFFEE_AUDIT" ||
      value.auditCaseId !== "AUDIT_COFFEE_CONTROLS_001")
  ) {
    issue(
      "scenarioId",
      "audit-guided requires the reviewed Guided coffee Audit case",
    );
  }
  if (
    value.presetId === "audit-practice" &&
    (value.scenarioId !== "SCN_PRACTICE_COFFEE_AUDIT" ||
      value.auditCaseId !==
        "AUDIT_COFFEE_CONTROLS_PRACTICE_001")
  ) {
    issue(
      "scenarioId",
      "audit-practice requires the curated Practice Audit case",
    );
  }
  if (
    (value.presetId === "audit-guided" ||
      value.presetId === "audit-practice") &&
    isObject(value.feedback) &&
    value.feedback.timing !== "IMMEDIATE"
  ) {
    issue(
      "feedback.timing",
      "Guided and Practice Audit require immediate feedback",
    );
  }
  if (
    (value.presetId === "audit-guided" ||
      value.presetId === "audit-practice") &&
    isObject(value.hints) &&
    value.hints.availability !== "ENABLED"
  ) {
    issue(
      "hints.availability",
      "Guided and Practice Audit require on-request hints",
    );
  }
  if (
    (value.presetId === "audit-challenge" ||
      value.presetId === "audit-assessment") &&
    (value.scenarioId !==
      "SCN_COFFEE_AUDIT_CHALLENGE_BANK" ||
      value.auditCaseId !== "AUDIT_COFFEE_CHALLENGE_BANK")
  ) {
    issue(
      "scenarioId",
      "Audit Challenge and Assessment require the curated Audit bank",
    );
  }
  if (
    (value.presetId === "audit-challenge" ||
      value.presetId === "audit-assessment") &&
    isObject(value.scenarioVariation) &&
    ((value.outcomeStrategy === "CURATED_VARIANT") !==
      (value.scenarioVariation.strategy ===
        "SEEDED_VARIANT_BANK"))
  ) {
    issue(
      "outcomeStrategy",
      "must agree with the Audit scenario variation strategy",
    );
  }
  if (
    isObject(value.scenarioVariation) &&
    value.scenarioVariation.strategy ===
      "SEEDED_VARIANT_BANK" &&
    isObject(value.content) &&
    (value.content.variantBankId !==
      value.scenarioVariation.bankId ||
      value.content.variantBankVersion !==
        value.scenarioVariation.bankVersion)
  ) {
    issue(
      "content.variantBankId",
      "must identify the exact Audit variant bank",
    );
  }
  if (
    value.presetId === "audit-challenge" &&
    isObject(value.feedback) &&
    value.feedback.timing !== "STAGE_END"
  ) {
    issue(
      "feedback.timing",
      "Audit Challenge requires delayed stage-end feedback",
    );
  }
  if (
    value.presetId === "audit-challenge" &&
    isObject(value.hints) &&
    (value.hints.availability !== "LIMITED" ||
      value.hints.maximumHintsPerRun !== 1)
  ) {
    issue(
      "hints",
      "Audit Challenge permits exactly one on-request hint",
    );
  }
  if (
    value.presetId === "audit-assessment" &&
    isObject(value.feedback) &&
    value.feedback.timing !== "FINAL"
  ) {
    issue(
      "feedback.timing",
      "Audit Assessment requires final feedback",
    );
  }
  if (
    value.presetId === "audit-assessment" &&
    isObject(value.hints) &&
    value.hints.availability !== "DISABLED"
  ) {
    issue(
      "hints.availability",
      "Audit Assessment requires disabled hints",
    );
  }
  if (
    isObject(value.scoring) &&
    (value.scoring.scoringBlueprintId !==
      "AUDIT_COFFEE_100" ||
      value.scoring.maximumScore !== 100 ||
      value.scoring.passScore !== 70 ||
      value.scoring.official !==
        (value.presetId === "audit-assessment"))
  ) {
    issue(
      "scoring",
      "must use the 100-point Audit scoring contract with official status only for Assessment",
    );
  }
  if (
    isObject(value.reporting) &&
    (value.reporting.auditReport !== true ||
      value.reporting.causalReport !== false)
  ) {
    issue(
      "reporting",
      "Audit delivery requires the Audit report and no Operations causal report",
    );
  }
  if (
    isObject(value.delivery) &&
    (value.delivery.channel !== "SCORM" ||
      value.delivery.persistencePolicyId !==
        "TA2_COMPACT_WORKPAPER")
  ) {
    issue(
      "delivery",
      "Audit packages require compact SCORM workpaper persistence",
    );
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
      issues: [
        { path: "$", message: "Configuration must be an object" },
      ],
    };
  }

  const isTechnicalLab = value.activityType === "TECHNICAL_LAB";
  const isAudit = value.activityType === "AUDIT";
  exactFields(
    value,
    isTechnicalLab
      ? LAB_TOP_LEVEL_FIELDS
      : isAudit
        ? AUDIT_TOP_LEVEL_FIELDS
      : BUSINESS_TOP_LEVEL_FIELDS,
    "",
    issue,
  );
  validateCommon(value, isTechnicalLab, issue);

  if (isTechnicalLab) {
    validateTechnicalLabConfiguration(value, issue);
  } else if (isAudit) {
    validateAuditConfiguration(value, issue);
  } else {
    if (value.activityType !== "OPERATIONS") {
      issue(
        "activityType",
        "the current package player supports Operations or Technical Laboratory",
      );
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

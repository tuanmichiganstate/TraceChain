import type { CompetencyFrameworkV1 } from "../contracts/competency";
import { isJsonObject } from "../contracts/json";
import type {
  ScenarioDefinitionV1,
  ScenarioNodeV1,
  ScenarioPackV2,
} from "../contracts/scenario-pack";
import type {
  AuditVariantBankDefinitionV1,
} from "../contracts/audit";
import {
  validateAuditVariantBank,
} from "../audit/audit-variant-bank";

export interface ScenarioPackValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ScenarioPackValidationOptions {
  readonly localizationCatalogs?: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}

export type ScenarioPackValidationResult =
  | {
      readonly isValid: true;
      readonly pack: ScenarioPackV2;
      readonly issues: readonly [];
      readonly checkedCount: number;
    }
  | {
      readonly isValid: false;
      readonly issues: readonly ScenarioPackValidationIssue[];
      readonly checkedCount: number;
    };

const SEMANTIC_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const FIELD_PATH =
  /^(?!(?:.*\.)?(?:__proto__|constructor|prototype)(?:\.|$))[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const IMAGE_MIME_TYPES = new Set([
  "image/webp",
  "image/png",
  "image/jpeg",
]);
const IMAGE_PURPOSES = new Set([
  "STAFF_PORTRAIT",
  "SCENE_ILLUSTRATION",
  "EVIDENCE_IMAGE",
]);
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const FORBIDDEN_EXECUTABLE_KEYS = new Set([
  "eval",
  "function",
  "javascript",
  "module",
  "script",
  "sourcecode",
]);

function learnerPresentableContentPaths(
  value: unknown,
  prefix = "",
): readonly string[] {
  if (isJsonObject(value)) {
    return Object.entries(value).flatMap(([key, nested]) =>
      learnerPresentableContentPaths(
        nested,
        prefix.length === 0 ? key : `${prefix}.${key}`,
      ),
    );
  }
  return prefix.length === 0 ? [] : [prefix];
}

const ROOT_KEYS = [
  "$schema",
  "schemaVersion",
  "packId",
  "version",
  "status",
  "supportedLocales",
  "localizationCatalogs",
  "manifest",
  "competencyFrameworks",
  "rubrics",
  "evidenceRules",
  "imageAssets",
  "auditVariantBanks",
  "scenarios",
  "assetHashes",
  "publication",
] as const;

const NODE_TYPES = new Set([
  "BRIEFING",
  "EVIDENCE_RELEASE",
  "DECISION",
  "TRANSACTION_PROPOSAL",
  "ENDORSEMENT",
  "POLICY_CHECK",
  "COMMUNICATION",
  "STOCHASTIC_EVENT",
  "CONSEQUENCE",
  "FEEDBACK",
  "REFLECTION",
  "COMPLETION",
]);

const RUN_MODES = new Set([
  "tutorial",
  "standard",
  "sandbox",
  "configured",
]);
const FEEDBACK_TIMINGS = new Set([
  "immediate",
  "stage-end",
  "final",
]);
const OUTCOME_STRATEGIES = new Set([
  "forced",
  "probabilistic",
]);
const SEED_POLICIES = new Set(["supplied", "generated"]);
const COUNTERFACTUAL_AVAILABILITY = new Set([
  "AFTER_RUN_COMPLETION",
  "AFTER_FEEDBACK_RELEASE",
  "INSTRUCTOR_ONLY",
]);
const COUNTERFACTUAL_CREATORS = new Set([
  "LEARNER",
  "INSTRUCTOR",
  "RATER",
]);
const COUNTERFACTUAL_DOWNSTREAM_POLICIES = new Set([
  "REUSE_BASELINE_WHERE_VALID",
  "INTERACTIVE_AFTER_FORK",
]);
const COUNTERFACTUAL_VALUE_TYPES = new Set([
  "NUMBER",
  "ORDINAL",
  "CATEGORICAL",
]);
const COUNTERFACTUAL_DIRECTIONS = new Set([
  "HIGHER_IS_BETTER",
  "LOWER_IS_BETTER",
  "CONTEXT_DEPENDENT",
]);
const COUNTERFACTUAL_CHANGED_VALUE_ATTRIBUTIONS = new Set([
  "DIRECT_INTERVENTION_EFFECT",
  "DOWNSTREAM_STATE_EFFECT",
  "LATER_DECISION_EFFECT",
  "STOCHASTIC_OUTCOME_EFFECT",
  "CONDITION_OVERRIDE_EFFECT",
]);
const AUDIT_SEVERITIES = new Set([
  "LOW",
  "MODERATE",
  "HIGH",
  "CRITICAL",
]);
const AUDIT_MATERIALITIES = new Set([
  "NON_MATERIAL",
  "MATERIAL",
]);
const AUDIT_CONCLUSION_CATEGORIES = new Set([
  "EFFECTIVE",
  "QUALIFIED",
  "ADVERSE",
  "INSUFFICIENT_EVIDENCE",
]);
const AUDIT_SOURCE_RECORD_KINDS = new Set([
  "LEDGER_TRANSACTION",
  "SOURCE_DOCUMENT",
  "ATTEMPT_AUDIT",
  "PROCESS_EVENT",
]);
const EVIDENCE_SIGNATURE_STATUSES = new Set([
  "VALID",
  "INVALID",
  "NOT_SIGNED",
  "NOT_CHECKED",
  "NOT_APPLICABLE",
]);
const EVIDENCE_LEDGER_STATUSES = new Set([
  "FULL_RECORD_ON_LEDGER",
  "HASH_ANCHORED",
  "OFF_CHAIN",
  "NOT_APPLICABLE",
]);
const EVIDENCE_COMPLETENESS_VALUES = new Set([
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
]);
const EVIDENCE_ACCESS_CLASSIFICATIONS = new Set([
  "SHARED",
  "ROLE_RESTRICTED",
  "CONFIDENTIAL",
]);
const EVIDENCE_ACQUISITION_MODES = new Set([
  "AVAILABLE",
  "REQUEST_REQUIRED",
]);
const EVIDENCE_RELIABILITY_VALUES = new Set([
  "RELIABLE",
  "CONTESTED",
  "UNRELIABLE",
  "NOT_ASSESSED",
]);
const EVIDENCE_CONTENT_STATUSES = new Set([
  "ACCURATE",
  "INACCURATE",
  "MISLEADING",
  "INCOMPLETE",
  "NOT_ASSESSED",
]);
const AUDIT_SCORABLE_ITEMS = new Map([
  ["AUD_DETECTION", 25],
  ["AUD_FALSE_POSITIVE_AVOIDANCE", 15],
  ["AUD_EVIDENCE", 15],
  ["AUD_POLICY", 10],
  ["AUD_CLASSIFICATION", 10],
  ["AUD_RECOMMENDATION", 10],
  ["AUD_CONCLUSION", 15],
]);

const LIFECYCLE_STATUSES = new Set([
  "draft",
  "validated",
  "published",
  "retired",
]);
class ValidationContext {
  readonly issues: ScenarioPackValidationIssue[] = [];
  checkedCount = 0;
  localizationCatalogs: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;

  constructor(
    readonly options: ScenarioPackValidationOptions = {},
  ) {
    this.localizationCatalogs = options.localizationCatalogs ?? {};
  }

  check(
    condition: boolean,
    code: string,
    path: string,
    message: string,
  ): condition is true {
    this.checkedCount += 1;
    if (!condition) {
      this.issues.push({ code, path, message });
    }
    return condition;
  }

  object(value: unknown, path: string): Record<string, unknown> | null {
    if (
      !this.check(
        isJsonObject(value),
        "EXPECTED_OBJECT",
        path,
        "must be an object",
      )
    ) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  array(value: unknown, path: string): readonly unknown[] | null {
    if (
      !this.check(
        Array.isArray(value),
        "EXPECTED_ARRAY",
        path,
        "must be an array",
      )
    ) {
      return null;
    }
    return value as readonly unknown[];
  }

  string(
    value: unknown,
    path: string,
    options: {
      readonly identifier?: boolean;
      readonly semanticVersion?: boolean;
      readonly nonEmpty?: boolean;
    } = {},
  ): string | null {
    if (
      !this.check(
        typeof value === "string",
        "EXPECTED_STRING",
        path,
        "must be a string",
      )
    ) {
      return null;
    }
    const text = value as string;
    if (options.nonEmpty ?? true) {
      this.check(
        text.trim().length > 0,
        "EMPTY_STRING",
        path,
        "must not be empty",
      );
    }
    if (options.identifier === true) {
      this.check(
        IDENTIFIER.test(text),
        "INVALID_IDENTIFIER",
        path,
        "must be a stable identifier",
      );
    }
    if (options.semanticVersion === true) {
      this.check(
        SEMANTIC_VERSION.test(text),
        "INVALID_VERSION",
        path,
        "must be a semantic version",
      );
    }
    return text;
  }

  number(
    value: unknown,
    path: string,
    options: {
      readonly integer?: boolean;
      readonly minimum?: number;
      readonly maximum?: number;
    } = {},
  ): number | null {
    if (
      !this.check(
        typeof value === "number" && Number.isFinite(value),
        "EXPECTED_NUMBER",
        path,
        "must be a finite number",
      )
    ) {
      return null;
    }
    if (options.integer === true) {
      this.check(
        Number.isInteger(value),
        "EXPECTED_INTEGER",
        path,
        "must be an integer",
      );
    }
    const numberValue = value as number;
    if (options.minimum !== undefined) {
      this.check(
        numberValue >= options.minimum,
        "NUMBER_BELOW_MINIMUM",
        path,
        `must be at least ${String(options.minimum)}`,
      );
    }
    if (options.maximum !== undefined) {
      this.check(
        numberValue <= options.maximum,
        "NUMBER_ABOVE_MAXIMUM",
        path,
        `must be no more than ${String(options.maximum)}`,
      );
    }
    return numberValue;
  }

  allowedKeys(
    record: Readonly<Record<string, unknown>>,
    keys: readonly string[],
    path: string,
  ): void {
    const allowed = new Set(keys);
    if (
      typeof record.nodeType === "string" &&
      NODE_TYPES.has(record.nodeType)
    ) {
      allowed.add("image");
    }
    for (const key of Object.keys(record)) {
      this.check(
        allowed.has(key),
        "UNKNOWN_PROPERTY",
        `${path}.${key}`,
        "is not permitted by this schema version",
      );
    }
  }
}

function validateUniqueStrings(
  context: ValidationContext,
  value: unknown,
  path: string,
  options: {
    readonly minimumItems?: number;
    readonly identifiers?: boolean;
  } = {},
): readonly string[] {
  const values = context.array(value, path);
  if (values === null) return [];
  context.check(
    values.length >= (options.minimumItems ?? 0),
    "TOO_FEW_ITEMS",
    path,
    `must contain at least ${String(options.minimumItems ?? 0)} item(s)`,
  );
  const strings = values.flatMap((item, index) => {
    const result = context.string(item, `${path}[${String(index)}]`, {
      identifier: options.identifiers === true,
    });
    return result === null ? [] : [result];
  });
  context.check(
    new Set(strings).size === strings.length,
    "DUPLICATE_VALUE",
    path,
    "must not contain duplicate values",
  );
  return strings;
}

function validatePackLocalizationCatalogs(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
): void {
  if (value === undefined) return;
  const catalogs = context.object(value, path);
  if (catalogs === null) return;
  const normalized: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [locale, catalogValue] of Object.entries(catalogs)) {
    context.check(
      supportedLocales.includes(locale),
      "UNSUPPORTED_LOCALIZATION_CATALOG",
      `${path}.${locale}`,
      "must match a locale declared by supportedLocales",
    );
    const catalog = context.object(catalogValue, `${path}.${locale}`);
    if (catalog === null) continue;
    const normalizedCatalog: Record<string, string> = {};
    for (const [key, text] of Object.entries(catalog)) {
      context.check(
        /^[A-Za-z][A-Za-z0-9._-]*$/u.test(key),
        "INVALID_LOCALIZATION_KEY",
        `${path}.${locale}.${key}`,
        "must use a stable catalogue key",
      );
      const isNonEmptyText =
        typeof text === "string" && text.trim().length > 0;
      context.check(
        isNonEmptyText,
        "INVALID_LOCALIZATION_VALUE",
        `${path}.${locale}.${key}`,
        "must be a non-empty string",
      );
      if (isNonEmptyText && typeof text === "string") {
        normalizedCatalog[key] = text;
      }
    }
    normalized[locale] = normalizedCatalog;
  }
  for (const locale of supportedLocales) {
    context.check(
      normalized[locale] !== undefined,
      "MISSING_LOCALIZATION_CATALOG",
      `${path}.${locale}`,
      "must provide a catalogue for every supported locale",
    );
  }
  context.localizationCatalogs = Object.fromEntries(
    supportedLocales.map((locale) => [
      locale,
      {
        ...(context.localizationCatalogs[locale] ?? {}),
        ...(normalized[locale] ?? {}),
      },
    ]),
  );
}

function validateLocalizedText(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
): void {
  const record = context.object(value, path);
  if (record === null) return;
  context.allowedKeys(record, ["localizationKey"], path);
  const localizationKey = context.string(
    record.localizationKey,
    `${path}.localizationKey`,
  );
  if (localizationKey === null) return;
  context.check(
    /^[A-Za-z][A-Za-z0-9._-]*$/u.test(localizationKey),
    "INVALID_LOCALIZATION_KEY",
    `${path}.localizationKey`,
    "must be a stable catalogue key",
  );
  for (const locale of supportedLocales) {
    const catalog = context.localizationCatalogs[locale];
    if (catalog !== undefined) {
      context.check(
        typeof catalog[localizationKey] === "string" &&
          (catalog[localizationKey] as string).trim().length > 0,
        "MISSING_LOCALIZATION_KEY",
        `${path}.localizationKey`,
        `must exist in the ${locale} locale catalogue`,
      );
    }
  }
}

function validateImageReference(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
  imagePurposesByAssetId: ReadonlyMap<string, string>,
  expectedPurpose: "SCENE_ILLUSTRATION" | "EVIDENCE_IMAGE",
): void {
  const reference = context.object(value, path);
  if (reference === null) return;
  context.allowedKeys(reference, ["assetId", "alt", "caption"], path);
  const assetId = context.string(
    reference.assetId,
    `${path}.assetId`,
    { identifier: true },
  );
  if (assetId !== null) {
    context.check(
      imagePurposesByAssetId.get(assetId) === expectedPurpose,
      "IMAGE_PURPOSE_MISMATCH",
      `${path}.assetId`,
      `must reference a ${expectedPurpose} image asset`,
    );
  }
  if (reference.alt !== undefined) {
    validateLocalizedText(
      context,
      reference.alt,
      `${path}.alt`,
      supportedLocales,
    );
  }
  if (reference.caption !== undefined) {
    validateLocalizedText(
      context,
      reference.caption,
      `${path}.caption`,
      supportedLocales,
    );
  }
}

function validateLocalizationKey(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
): void {
  const localizationKey = context.string(value, path);
  if (localizationKey === null) return;
  context.check(
    /^[A-Za-z][A-Za-z0-9._-]*$/u.test(localizationKey),
    "INVALID_LOCALIZATION_KEY",
    path,
    "must be a stable catalogue key",
  );
  for (const locale of supportedLocales) {
    const catalog = context.localizationCatalogs[locale];
    if (catalog !== undefined) {
      context.check(
        typeof catalog[localizationKey] === "string" &&
          (catalog[localizationKey] as string).trim().length > 0,
        "MISSING_LOCALIZATION_KEY",
        path,
        `must exist in the ${locale} locale catalogue`,
      );
    }
  }
}

function validateJsonData(
  context: ValidationContext,
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): void {
  context.checkedCount += 1;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    context.check(
      Number.isFinite(value),
      "NON_FINITE_NUMBER",
      path,
      "must be a finite JSON number",
    );
    return;
  }
  if (typeof value !== "object") {
    context.issues.push({
      code: "NON_JSON_VALUE",
      path,
      message: "must contain JSON data only",
    });
    return;
  }
  if (ancestors.has(value)) {
    context.issues.push({
      code: "CIRCULAR_VALUE",
      path,
      message: "must not contain circular data",
    });
    return;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateJsonData(context, item, `${path}[${String(index)}]`, ancestors);
    });
  } else {
    for (const [key, nested] of Object.entries(value)) {
      context.check(
        !FORBIDDEN_EXECUTABLE_KEYS.has(key.toLowerCase()),
        "EXECUTABLE_CONTENT_FORBIDDEN",
        `${path}.${key}`,
        "may not contain executable scenario content",
      );
      validateJsonData(context, nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function validateCompetencyFramework(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
  competencyIds: Set<string>,
  indicatorIds: Set<string>,
): void {
  const framework = context.object(value, path);
  if (framework === null) return;
  context.allowedKeys(
    framework,
    [
      "schemaVersion",
      "frameworkId",
      "version",
      "status",
      "title",
      "competencies",
    ],
    path,
  );
  context.check(
    framework.schemaVersion === "1.0.0",
    "UNSUPPORTED_SCHEMA_VERSION",
    `${path}.schemaVersion`,
    "must equal 1.0.0",
  );
  context.string(framework.frameworkId, `${path}.frameworkId`, {
    identifier: true,
  });
  context.string(framework.version, `${path}.version`, {
    semanticVersion: true,
  });
  context.check(
    typeof framework.status === "string" &&
      LIFECYCLE_STATUSES.has(framework.status),
    "INVALID_LIFECYCLE_STATUS",
    `${path}.status`,
    "must be draft, validated, published, or retired",
  );
  validateLocalizedText(
    context,
    framework.title,
    `${path}.title`,
    supportedLocales,
  );
  const competencies = context.array(
    framework.competencies,
    `${path}.competencies`,
  );
  if (competencies === null) return;
  context.check(
    competencies.length > 0,
    "EMPTY_COMPETENCY_FRAMEWORK",
    `${path}.competencies`,
    "must contain at least one competency",
  );
  competencies.forEach((item, competencyIndex) => {
    const competencyPath = `${path}.competencies[${String(competencyIndex)}]`;
    const competency = context.object(item, competencyPath);
    if (competency === null) return;
    context.allowedKeys(
      competency,
      [
        "competencyId",
        "version",
        "title",
        "description",
        "indicators",
      ],
      competencyPath,
    );
    const competencyId = context.string(
      competency.competencyId,
      `${competencyPath}.competencyId`,
      { identifier: true },
    );
    if (competencyId !== null) {
      context.check(
        !competencyIds.has(competencyId),
        "DUPLICATE_COMPETENCY_ID",
        `${competencyPath}.competencyId`,
        "must be unique across the pack",
      );
      competencyIds.add(competencyId);
    }
    context.string(competency.version, `${competencyPath}.version`, {
      semanticVersion: true,
    });
    validateLocalizedText(
      context,
      competency.title,
      `${competencyPath}.title`,
      supportedLocales,
    );
    validateLocalizedText(
      context,
      competency.description,
      `${competencyPath}.description`,
      supportedLocales,
    );
    const indicators = context.array(
      competency.indicators,
      `${competencyPath}.indicators`,
    );
    if (indicators === null) return;
    context.check(
      indicators.length > 0,
      "COMPETENCY_WITHOUT_INDICATORS",
      `${competencyPath}.indicators`,
      "must contain at least one observable indicator",
    );
    indicators.forEach((indicatorValue, indicatorIndex) => {
      const indicatorPath =
        `${competencyPath}.indicators[${String(indicatorIndex)}]`;
      const indicator = context.object(indicatorValue, indicatorPath);
      if (indicator === null) return;
      context.allowedKeys(
        indicator,
        ["indicatorId", "version", "statement"],
        indicatorPath,
      );
      const indicatorId = context.string(
        indicator.indicatorId,
        `${indicatorPath}.indicatorId`,
        { identifier: true },
      );
      if (indicatorId !== null) {
        context.check(
          indicatorId.startsWith(`${competencyId ?? ""}.`),
          "INDICATOR_NAMESPACE_MISMATCH",
          `${indicatorPath}.indicatorId`,
          "must be namespaced under its competency ID",
        );
        context.check(
          !indicatorIds.has(indicatorId),
          "DUPLICATE_INDICATOR_ID",
          `${indicatorPath}.indicatorId`,
          "must be unique across the pack",
        );
        indicatorIds.add(indicatorId);
      }
      context.string(indicator.version, `${indicatorPath}.version`, {
        semanticVersion: true,
      });
      validateLocalizedText(
        context,
        indicator.statement,
        `${indicatorPath}.statement`,
        supportedLocales,
      );
    });
  });
}

function validateRubrics(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
  indicatorIds: ReadonlySet<string>,
): Set<string> {
  const rubricIds = new Set<string>();
  const rubrics = context.array(value, path);
  if (rubrics === null) return rubricIds;
  rubrics.forEach((item, rubricIndex) => {
    const rubricPath = `${path}[${String(rubricIndex)}]`;
    const rubric = context.object(item, rubricPath);
    if (rubric === null) return;
    context.allowedKeys(
      rubric,
      ["rubricId", "version", "title", "levels", "criteria"],
      rubricPath,
    );
    const rubricId = context.string(rubric.rubricId, `${rubricPath}.rubricId`, {
      identifier: true,
    });
    if (rubricId !== null) {
      context.check(
        !rubricIds.has(rubricId),
        "DUPLICATE_RUBRIC_ID",
        `${rubricPath}.rubricId`,
        "must be unique",
      );
      rubricIds.add(rubricId);
    }
    context.string(rubric.version, `${rubricPath}.version`, {
      semanticVersion: true,
    });
    validateLocalizedText(
      context,
      rubric.title,
      `${rubricPath}.title`,
      supportedLocales,
    );
    const levels = context.array(rubric.levels, `${rubricPath}.levels`);
    if (levels !== null) {
      context.check(
        levels.length >= 2,
        "RUBRIC_LEVELS_TOO_SHORT",
        `${rubricPath}.levels`,
        "must contain at least two levels",
      );
      const numericLevels: number[] = [];
      levels.forEach((levelValue, levelIndex) => {
        const levelPath = `${rubricPath}.levels[${String(levelIndex)}]`;
        const level = context.object(levelValue, levelPath);
        if (level === null) return;
        context.allowedKeys(level, ["value", "label"], levelPath);
        const numericLevel = context.number(level.value, `${levelPath}.value`, {
          integer: true,
          minimum: 0,
        });
        if (numericLevel !== null) numericLevels.push(numericLevel);
        validateLocalizedText(
          context,
          level.label,
          `${levelPath}.label`,
          supportedLocales,
        );
      });
      context.check(
        new Set(numericLevels).size === numericLevels.length,
        "DUPLICATE_RUBRIC_LEVEL",
        `${rubricPath}.levels`,
        "must use unique numeric level values",
      );
    }
    const criteria = context.array(
      rubric.criteria,
      `${rubricPath}.criteria`,
    );
    if (criteria !== null) {
      context.check(
        criteria.length > 0,
        "RUBRIC_WITHOUT_CRITERIA",
        `${rubricPath}.criteria`,
        "must contain at least one criterion",
      );
      const criterionIds = new Set<string>();
      criteria.forEach((criterionValue, criterionIndex) => {
        const criterionPath =
          `${rubricPath}.criteria[${String(criterionIndex)}]`;
        const criterion = context.object(criterionValue, criterionPath);
        if (criterion === null) return;
        context.allowedKeys(
          criterion,
          [
            "criterionId",
            "title",
            "description",
            "indicatorIds",
            "evidenceRuleIds",
          ],
          criterionPath,
        );
        const criterionId = context.string(
          criterion.criterionId,
          `${criterionPath}.criterionId`,
          { identifier: true },
        );
        if (criterionId !== null) {
          context.check(
            !criterionIds.has(criterionId),
            "DUPLICATE_RUBRIC_CRITERION",
            `${criterionPath}.criterionId`,
            "must be unique within the rubric",
          );
          criterionIds.add(criterionId);
        }
        validateLocalizedText(
          context,
          criterion.title,
          `${criterionPath}.title`,
          supportedLocales,
        );
        validateLocalizedText(
          context,
          criterion.description,
          `${criterionPath}.description`,
          supportedLocales,
        );
        const criterionIndicatorIds = validateUniqueStrings(
          context,
          criterion.indicatorIds,
          `${criterionPath}.indicatorIds`,
          { minimumItems: 1, identifiers: true },
        );
        criterionIndicatorIds.forEach((indicatorId, indicatorIndex) => {
          context.check(
            indicatorIds.has(indicatorId),
            "UNKNOWN_INDICATOR_REFERENCE",
            `${criterionPath}.indicatorIds[${String(indicatorIndex)}]`,
            "must reference an indicator defined by this pack",
          );
        });
        validateUniqueStrings(
          context,
          criterion.evidenceRuleIds,
          `${criterionPath}.evidenceRuleIds`,
          { identifiers: true },
        );
      });
    }
  });
  return rubricIds;
}

function validateEvidenceRules(
  context: ValidationContext,
  value: unknown,
  path: string,
  indicatorIds: ReadonlySet<string>,
): Set<string> {
  const evidenceRuleIds = new Set<string>();
  const rules = context.array(value, path);
  if (rules === null) return evidenceRuleIds;
  rules.forEach((item, ruleIndex) => {
    const rulePath = `${path}[${String(ruleIndex)}]`;
    const rule = context.object(item, rulePath);
    if (rule === null) return;
    context.allowedKeys(
      rule,
      [
        "evidenceRuleId",
        "version",
        "indicatorIds",
        "operator",
        "eventType",
        "fieldPath",
        "expectedValue",
        "expectedValues",
      ],
      rulePath,
    );
    const ruleId = context.string(
      rule.evidenceRuleId,
      `${rulePath}.evidenceRuleId`,
      { identifier: true },
    );
    if (ruleId !== null) {
      context.check(
        !evidenceRuleIds.has(ruleId),
        "DUPLICATE_EVIDENCE_RULE_ID",
        `${rulePath}.evidenceRuleId`,
        "must be unique",
      );
      evidenceRuleIds.add(ruleId);
    }
    context.string(rule.version, `${rulePath}.version`, {
      semanticVersion: true,
    });
    const targetIndicators = validateUniqueStrings(
      context,
      rule.indicatorIds,
      `${rulePath}.indicatorIds`,
      { minimumItems: 1, identifiers: true },
    );
    targetIndicators.forEach((indicatorId, indicatorIndex) => {
      context.check(
        indicatorIds.has(indicatorId),
        "UNKNOWN_INDICATOR_REFERENCE",
        `${rulePath}.indicatorIds[${String(indicatorIndex)}]`,
        "must reference an indicator defined by this pack",
      );
    });
    const operator = context.string(rule.operator, `${rulePath}.operator`);
    context.check(
      operator === "EVENT_OCCURRED" ||
        operator === "FIELD_EQUALS" ||
        operator === "FIELD_IN",
      "INVALID_EVIDENCE_OPERATOR",
      `${rulePath}.operator`,
      "must be EVENT_OCCURRED, FIELD_EQUALS, or FIELD_IN",
    );
    context.string(rule.eventType, `${rulePath}.eventType`, {
      identifier: true,
    });
    if (operator === "FIELD_EQUALS" || operator === "FIELD_IN") {
      const fieldPath = context.string(
        rule.fieldPath,
        `${rulePath}.fieldPath`,
      );
      if (fieldPath !== null) {
        context.check(
          fieldPath.length <= 200,
          "EVIDENCE_FIELD_PATH_TOO_LONG",
          `${rulePath}.fieldPath`,
          "must contain at most 200 characters",
        );
        context.check(
          /^(?!(?:.*\.)?(?:__proto__|constructor|prototype)(?:\.|$))[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(
            fieldPath,
          ),
          "INVALID_EVIDENCE_FIELD_PATH",
          `${rulePath}.fieldPath`,
          "must be a bounded dot-separated payload path without prototype fields",
        );
      }
    }
    if (operator === "FIELD_EQUALS") {
      context.check(
        ["string", "number", "boolean"].includes(typeof rule.expectedValue),
        "EXPECTED_RULE_VALUE",
        `${rulePath}.expectedValue`,
        "is required for FIELD_EQUALS",
      );
    }
    if (operator === "FIELD_IN") {
      const expectedValues = context.array(
        rule.expectedValues,
        `${rulePath}.expectedValues`,
      );
      if (expectedValues !== null) {
        context.check(
          expectedValues.length > 0,
          "EMPTY_RULE_VALUES",
          `${rulePath}.expectedValues`,
          "must contain at least one value",
        );
        expectedValues.forEach((expectedValue, expectedValueIndex) => {
          context.check(
            ["string", "number", "boolean"].includes(typeof expectedValue),
            "INVALID_RULE_VALUE",
            `${rulePath}.expectedValues[${String(expectedValueIndex)}]`,
            "must be a string, number, or boolean",
          );
        });
      }
    }
  });
  return evidenceRuleIds;
}

function validateTransitions(
  context: ValidationContext,
  transitionsValue: unknown,
  path: string,
  nodeIds: ReadonlySet<string>,
  decisionIds: ReadonlySet<string>,
  policyIds: ReadonlySet<string>,
): readonly string[] {
  const transitions = context.array(transitionsValue, path);
  if (transitions === null) return [];
  const transitionIds = new Set<string>();
  const targets: string[] = [];
  transitions.forEach((transitionValue, transitionIndex) => {
    const transitionPath = `${path}[${String(transitionIndex)}]`;
    const transition = context.object(transitionValue, transitionPath);
    if (transition === null) return;
    context.allowedKeys(
      transition,
      ["transitionId", "toNodeId", "when"],
      transitionPath,
    );
    const transitionId = context.string(
      transition.transitionId,
      `${transitionPath}.transitionId`,
      { identifier: true },
    );
    if (transitionId !== null) {
      context.check(
        !transitionIds.has(transitionId),
        "DUPLICATE_TRANSITION_ID",
        `${transitionPath}.transitionId`,
        "must be unique within the node",
      );
      transitionIds.add(transitionId);
    }
    const toNodeId = context.string(
      transition.toNodeId,
      `${transitionPath}.toNodeId`,
      { identifier: true },
    );
    if (toNodeId !== null) {
      targets.push(toNodeId);
      context.check(
        nodeIds.has(toNodeId),
        "UNKNOWN_TRANSITION_TARGET",
        `${transitionPath}.toNodeId`,
        "must reference a node in this scenario",
      );
    }
    const conditionPath = `${transitionPath}.when`;
    const condition = context.object(transition.when, conditionPath);
    if (condition === null) return;
    const kind = context.string(condition.kind, `${conditionPath}.kind`);
    switch (kind) {
      case "ALWAYS":
        context.allowedKeys(condition, ["kind"], conditionPath);
        break;
      case "DECISION_OPTION_SELECTED":
        context.allowedKeys(
          condition,
          ["kind", "decisionId", "optionId"],
          conditionPath,
        );
        {
          const decisionId = context.string(
            condition.decisionId,
            `${conditionPath}.decisionId`,
            { identifier: true },
          );
          if (decisionId !== null) {
            context.check(
              decisionIds.has(decisionId),
              "UNKNOWN_DECISION_REFERENCE",
              `${conditionPath}.decisionId`,
              "must reference a decision node in this scenario",
            );
          }
        }
        context.string(condition.optionId, `${conditionPath}.optionId`, {
          identifier: true,
        });
        break;
      case "POLICY_RESULT":
        context.allowedKeys(
          condition,
          ["kind", "policyId", "outcome"],
          conditionPath,
        );
        {
          const policyId = context.string(
            condition.policyId,
            `${conditionPath}.policyId`,
            { identifier: true },
          );
          if (policyId !== null) {
            context.check(
              policyIds.has(policyId),
              "UNKNOWN_POLICY_REFERENCE",
              `${conditionPath}.policyId`,
              "must reference a policy in this scenario",
            );
          }
        }
        context.check(
          condition.outcome === "pass" || condition.outcome === "fail",
          "INVALID_POLICY_OUTCOME",
          `${conditionPath}.outcome`,
          "must be pass or fail",
        );
        break;
      case "EVENT_OCCURRED":
        context.allowedKeys(
          condition,
          ["kind", "eventType"],
          conditionPath,
        );
        context.string(condition.eventType, `${conditionPath}.eventType`, {
          identifier: true,
        });
        break;
      default:
        context.issues.push({
          code: "INVALID_TRANSITION_CONDITION",
          path: `${conditionPath}.kind`,
          message: "uses an unsupported declarative condition",
        });
    }
  });
  return targets;
}

function validateNodeContent(
  context: ValidationContext,
  node: Readonly<Record<string, unknown>>,
  path: string,
  supportedLocales: readonly string[],
  evidenceIds: ReadonlySet<string>,
  policyIds: ReadonlySet<string>,
  roleIds: ReadonlySet<string>,
  decisionIds: ReadonlySet<string>,
  proposalNodeIds: ReadonlySet<string>,
  counterfactualDimensionIds: ReadonlySet<string>,
  counterfactualMetricIds: ReadonlySet<string>,
  outcomeCodesByRandomStream: ReadonlyMap<
    string,
    ReadonlySet<string>
  >,
  imagePurposesByAssetId: ReadonlyMap<string, string>,
): void {
  const nodeType = node.nodeType;
  if (node.image !== undefined) {
    validateImageReference(
      context,
      node.image,
      `${path}.image`,
      supportedLocales,
      imagePurposesByAssetId,
      "SCENE_ILLUSTRATION",
    );
  }
  switch (nodeType) {
    case "BRIEFING":
      context.allowedKeys(
        node,
        ["nodeId", "nodeType", "title", "transitions", "body"],
        path,
      );
      validateLocalizedText(
        context,
        node.body,
        `${path}.body`,
        supportedLocales,
      );
      break;
    case "EVIDENCE_RELEASE":
      context.allowedKeys(
        node,
        ["nodeId", "nodeType", "title", "transitions", "evidenceIds"],
        path,
      );
      validateUniqueStrings(
        context,
        node.evidenceIds,
        `${path}.evidenceIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((evidenceId, index) => {
        context.check(
          evidenceIds.has(evidenceId),
          "UNKNOWN_EVIDENCE_REFERENCE",
          `${path}.evidenceIds[${String(index)}]`,
          "must reference scenario evidence",
        );
      });
      break;
    case "DECISION": {
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "decisionId",
          "prompt",
          "fields",
          "justification",
          "structuredResponse",
          "assessment",
          "counterfactual",
        ],
        path,
      );
      context.string(node.decisionId, `${path}.decisionId`, {
        identifier: true,
      });
      validateLocalizedText(
        context,
        node.prompt,
        `${path}.prompt`,
        supportedLocales,
      );
      const decisionOptionIds = new Set<string>();
      const decisionOptionIdsByField = new Map<
        string,
        ReadonlySet<string>
      >();
      {
        const fields = context.array(node.fields, `${path}.fields`);
        if (fields !== null) {
          context.check(
            fields.length > 0,
            "DECISION_WITHOUT_FIELDS",
            `${path}.fields`,
            "must contain at least one structured field",
          );
          const fieldIds = new Set<string>();
          fields.forEach((fieldValue, fieldIndex) => {
            const fieldPath = `${path}.fields[${String(fieldIndex)}]`;
            const field = context.object(fieldValue, fieldPath);
            if (field === null) return;
            context.allowedKeys(
              field,
              ["fieldId", "prompt", "selection", "options"],
              fieldPath,
            );
            const fieldId = context.string(
              field.fieldId,
              `${fieldPath}.fieldId`,
              { identifier: true },
            );
            if (fieldId !== null) {
              context.check(
                !fieldIds.has(fieldId),
                "DUPLICATE_DECISION_FIELD",
                `${fieldPath}.fieldId`,
                "must be unique within the decision",
              );
              fieldIds.add(fieldId);
            }
            validateLocalizedText(
              context,
              field.prompt,
              `${fieldPath}.prompt`,
              supportedLocales,
            );
            context.check(
              field.selection === "single" || field.selection === "multiple",
              "INVALID_SELECTION_MODE",
              `${fieldPath}.selection`,
              "must be single or multiple",
            );
            const options = context.array(
              field.options,
              `${fieldPath}.options`,
            );
            if (options !== null) {
              context.check(
                options.length >= 2,
                "TOO_FEW_DECISION_OPTIONS",
                `${fieldPath}.options`,
                "must contain at least two options",
              );
              const optionIds = new Set<string>();
              options.forEach((optionValue, optionIndex) => {
                const optionPath =
                  `${fieldPath}.options[${String(optionIndex)}]`;
                const option = context.object(optionValue, optionPath);
                if (option === null) return;
                context.allowedKeys(
                  option,
                  [
                    "optionId",
                    "label",
                    "authoredValue",
                    "professionalConsequenceEffects",
                  ],
                  optionPath,
                );
                const optionId = context.string(
                  option.optionId,
                  `${optionPath}.optionId`,
                  { identifier: true },
                );
                if (optionId !== null) {
                  context.check(
                    !optionIds.has(optionId),
                    "DUPLICATE_DECISION_OPTION",
                    `${optionPath}.optionId`,
                    "must be unique within the field",
                  );
                  optionIds.add(optionId);
                  decisionOptionIds.add(optionId);
                }
                validateLocalizedText(
                  context,
                  option.label,
                  `${optionPath}.label`,
                  supportedLocales,
                );
                validateJsonData(
                  context,
                  option.authoredValue,
                  `${optionPath}.authoredValue`,
                );
                if (option.professionalConsequenceEffects !== undefined) {
                  const effects = context.object(
                    option.professionalConsequenceEffects,
                    `${optionPath}.professionalConsequenceEffects`,
                  );
                  if (effects !== null) {
                    context.check(
                      Object.keys(effects).length > 0,
                      "EMPTY_PROFESSIONAL_CONSEQUENCE_EFFECTS",
                      `${optionPath}.professionalConsequenceEffects`,
                      "must contain at least one professional consequence effect",
                    );
                    for (const [metricId, metricValue] of Object.entries(
                      effects,
                    )) {
                      context.check(
                        IDENTIFIER.test(metricId),
                        "INVALID_IDENTIFIER",
                        `${optionPath}.professionalConsequenceEffects.${metricId}`,
                        "metric ID must be a valid identifier",
                      );
                      context.number(
                        metricValue,
                        `${optionPath}.professionalConsequenceEffects.${metricId}`,
                      );
                      context.check(
                        counterfactualMetricIds.has(metricId),
                        "UNKNOWN_PROFESSIONAL_CONSEQUENCE_METRIC",
                        `${optionPath}.professionalConsequenceEffects.${metricId}`,
                        "must reference a runtime metric declared by a scenario comparison dimension",
                      );
                    }
                  }
                }
              });
              if (fieldId !== null) {
                decisionOptionIdsByField.set(
                  fieldId,
                  new Set(optionIds),
                );
              }
            }
          });
        }
      }
      if (node.justification !== undefined) {
        const justification = context.object(
          node.justification,
          `${path}.justification`,
        );
        if (justification !== null) {
          context.allowedKeys(
            justification,
            ["required", "maximumLength"],
            `${path}.justification`,
          );
          context.check(
            typeof justification.required === "boolean",
            "EXPECTED_BOOLEAN",
            `${path}.justification.required`,
            "must be a boolean",
          );
          context.number(
            justification.maximumLength,
            `${path}.justification.maximumLength`,
            { integer: true, minimum: 1, maximum: 10_000 },
          );
        }
      }
      if (node.structuredResponse !== undefined) {
        const structuredResponse = context.object(
          node.structuredResponse,
          `${path}.structuredResponse`,
        );
        if (structuredResponse !== null) {
          context.allowedKeys(
            structuredResponse,
            [
              "evidenceCitations",
              "policyCitations",
              "confidenceRating",
              "adverseEventProbabilityPercent",
            ],
            `${path}.structuredResponse`,
          );
          context.check(
            Object.keys(structuredResponse).length > 0,
            "EMPTY_STRUCTURED_RESPONSE",
            `${path}.structuredResponse`,
            "must configure at least one response field",
          );
          for (const citationFieldName of [
            "evidenceCitations",
            "policyCitations",
          ] as const) {
            if (structuredResponse[citationFieldName] === undefined) {
              continue;
            }
            const citations = context.object(
              structuredResponse[citationFieldName],
              `${path}.structuredResponse.${citationFieldName}`,
            );
            if (citations !== null) {
              context.allowedKeys(
                citations,
                ["required", "minimumItems", "maximumItems"],
                `${path}.structuredResponse.${citationFieldName}`,
              );
              context.check(
                typeof citations.required === "boolean",
                "EXPECTED_BOOLEAN",
                `${path}.structuredResponse.${citationFieldName}.required`,
                "must be a boolean",
              );
              const minimumItems = context.number(
                citations.minimumItems,
                `${path}.structuredResponse.${citationFieldName}.minimumItems`,
                { integer: true, minimum: 0, maximum: 20 },
              );
              const maximumItems = context.number(
                citations.maximumItems,
                `${path}.structuredResponse.${citationFieldName}.maximumItems`,
                { integer: true, minimum: 1, maximum: 20 },
              );
              if (minimumItems !== null && maximumItems !== null) {
                context.check(
                  minimumItems <= maximumItems,
                  "INVALID_DECISION_RESPONSE_RANGE",
                  `${path}.structuredResponse.${citationFieldName}`,
                  "minimumItems must not exceed maximumItems",
                );
              }
              if (citations.required === true && minimumItems !== null) {
                context.check(
                  minimumItems >= 1,
                  "REQUIRED_DECISION_RESPONSE_WITHOUT_MINIMUM",
                  `${path}.structuredResponse.${citationFieldName}.minimumItems`,
                  "must be at least 1 when citations are required",
                );
              }
            }
          }
          for (const fieldName of [
            "confidenceRating",
            "adverseEventProbabilityPercent",
          ] as const) {
            const fieldValue = structuredResponse[fieldName];
            if (fieldValue === undefined) continue;
            const field = context.object(
              fieldValue,
              `${path}.structuredResponse.${fieldName}`,
            );
            if (field === null) continue;
            context.allowedKeys(
              field,
              ["required", "minimum", "maximum"],
              `${path}.structuredResponse.${fieldName}`,
            );
            context.check(
              typeof field.required === "boolean",
              "EXPECTED_BOOLEAN",
              `${path}.structuredResponse.${fieldName}.required`,
              "must be a boolean",
            );
            const minimum = context.number(
              field.minimum,
              `${path}.structuredResponse.${fieldName}.minimum`,
              { integer: true, minimum: 0, maximum: 100 },
            );
            const maximum = context.number(
              field.maximum,
              `${path}.structuredResponse.${fieldName}.maximum`,
              { integer: true, minimum: 0, maximum: 100 },
            );
            if (minimum !== null && maximum !== null) {
              context.check(
                minimum <= maximum,
                "INVALID_DECISION_RESPONSE_RANGE",
                `${path}.structuredResponse.${fieldName}`,
                "minimum must not exceed maximum",
              );
            }
          }
        }
      }
      if (node.assessment !== undefined) {
        const assessment = context.object(
          node.assessment,
          `${path}.assessment`,
        );
        if (assessment !== null) {
          context.allowedKeys(
            assessment,
            [
              "decisionItemId",
              "maximumPoints",
              "correctOptionIdsByField",
            ],
            `${path}.assessment`,
          );
          context.string(
            assessment.decisionItemId,
            `${path}.assessment.decisionItemId`,
            { identifier: true },
          );
          context.number(
            assessment.maximumPoints,
            `${path}.assessment.maximumPoints`,
            { integer: true, minimum: 1, maximum: 100 },
          );
          const correct = context.object(
            assessment.correctOptionIdsByField,
            `${path}.assessment.correctOptionIdsByField`,
          );
          if (correct !== null) {
            context.check(
              Object.keys(correct).length ===
                decisionOptionIdsByField.size,
              "INCOMPLETE_DECISION_ASSESSMENT",
              `${path}.assessment.correctOptionIdsByField`,
              "must define correct options for every decision field",
            );
            for (const [fieldId, optionIdsValue] of Object.entries(
              correct,
            )) {
              const optionIds = validateUniqueStrings(
                context,
                optionIdsValue,
                `${path}.assessment.correctOptionIdsByField.${fieldId}`,
                { minimumItems: 1, identifiers: true },
              );
              const authoredOptionIds =
                decisionOptionIdsByField.get(fieldId);
              context.check(
                authoredOptionIds !== undefined,
                "UNKNOWN_DECISION_ASSESSMENT_FIELD",
                `${path}.assessment.correctOptionIdsByField.${fieldId}`,
                "must reference an authored decision field",
              );
              optionIds.forEach((optionId, optionIndex) => {
                context.check(
                  authoredOptionIds?.has(optionId) ?? false,
                  "UNKNOWN_DECISION_ASSESSMENT_OPTION",
                  `${path}.assessment.correctOptionIdsByField.${fieldId}[${String(optionIndex)}]`,
                  "must reference an option authored for this field",
                );
              });
            }
          }
        }
      }
      if (node.counterfactual !== undefined) {
        const counterfactual = context.object(
          node.counterfactual,
          `${path}.counterfactual`,
        );
        if (counterfactual !== null) {
          context.allowedKeys(
            counterfactual,
            [
              "enabled",
              "availability",
              "permittedCreators",
              "allowedAlternativeOptionIds",
              "comparisonDimensionIds",
              "downstreamPolicy",
              "maxBranchesPerLearner",
              "reflectionRequired",
              "localizationKey",
            ],
            `${path}.counterfactual`,
          );
          context.check(
            typeof counterfactual.enabled === "boolean",
            "EXPECTED_BOOLEAN",
            `${path}.counterfactual.enabled`,
            "must be a boolean",
          );
          context.check(
            typeof counterfactual.availability === "string" &&
              COUNTERFACTUAL_AVAILABILITY.has(
                counterfactual.availability,
              ),
            "INVALID_COUNTERFACTUAL_AVAILABILITY",
            `${path}.counterfactual.availability`,
            "must use an authored counterfactual release boundary",
          );
          validateUniqueStrings(
            context,
            counterfactual.permittedCreators,
            `${path}.counterfactual.permittedCreators`,
            { minimumItems: 1 },
          ).forEach((creator, creatorIndex) => {
            context.check(
              COUNTERFACTUAL_CREATORS.has(creator),
              "INVALID_COUNTERFACTUAL_CREATOR",
              `${path}.counterfactual.permittedCreators[${String(creatorIndex)}]`,
              "must be LEARNER, INSTRUCTOR, or RATER",
            );
          });
          validateUniqueStrings(
            context,
            counterfactual.allowedAlternativeOptionIds,
            `${path}.counterfactual.allowedAlternativeOptionIds`,
            { minimumItems: 1, identifiers: true },
          ).forEach((optionId, optionIndex) => {
            context.check(
              decisionOptionIds.has(optionId),
              "UNKNOWN_COUNTERFACTUAL_ALTERNATIVE",
              `${path}.counterfactual.allowedAlternativeOptionIds[${String(optionIndex)}]`,
              "must reference an option authored by this decision",
            );
          });
          validateUniqueStrings(
            context,
            counterfactual.comparisonDimensionIds,
            `${path}.counterfactual.comparisonDimensionIds`,
            { minimumItems: 1, identifiers: true },
          ).forEach((dimensionId, dimensionIndex) => {
            context.check(
              counterfactualDimensionIds.has(dimensionId),
              "UNKNOWN_COUNTERFACTUAL_COMPARISON_DIMENSION",
              `${path}.counterfactual.comparisonDimensionIds[${String(dimensionIndex)}]`,
              "must reference a scenario comparison dimension",
            );
          });
          context.check(
            typeof counterfactual.downstreamPolicy === "string" &&
              COUNTERFACTUAL_DOWNSTREAM_POLICIES.has(
                counterfactual.downstreamPolicy,
              ),
            "INVALID_COUNTERFACTUAL_DOWNSTREAM_POLICY",
            `${path}.counterfactual.downstreamPolicy`,
            "must use a supported deterministic downstream policy",
          );
          if (counterfactual.maxBranchesPerLearner !== undefined) {
            context.number(
              counterfactual.maxBranchesPerLearner,
              `${path}.counterfactual.maxBranchesPerLearner`,
              { integer: true, minimum: 1, maximum: 20 },
            );
          }
          if (counterfactual.reflectionRequired !== undefined) {
            context.check(
              typeof counterfactual.reflectionRequired === "boolean",
              "EXPECTED_BOOLEAN",
              `${path}.counterfactual.reflectionRequired`,
              "must be a boolean",
            );
          }
          validateLocalizationKey(
            context,
            counterfactual.localizationKey,
            `${path}.counterfactual.localizationKey`,
            supportedLocales,
          );
        }
      }
      break;
    }
    case "TRANSACTION_PROPOSAL":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "proposalType",
          "sourceDecisionId",
          "policyIds",
          "runtimeActionBindingId",
        ],
        path,
      );
      context.string(node.proposalType, `${path}.proposalType`, {
        identifier: true,
      });
      {
        const sourceDecisionId = context.string(
          node.sourceDecisionId,
          `${path}.sourceDecisionId`,
          { identifier: true },
        );
        if (sourceDecisionId !== null) {
          context.check(
            decisionIds.has(sourceDecisionId),
            "UNKNOWN_DECISION_REFERENCE",
            `${path}.sourceDecisionId`,
            "must reference a decision in this scenario",
          );
        }
      }
      validateUniqueStrings(
        context,
        node.policyIds,
        `${path}.policyIds`,
        { identifiers: true },
      ).forEach((policyId, index) => {
        context.check(
          policyIds.has(policyId),
          "UNKNOWN_POLICY_REFERENCE",
          `${path}.policyIds[${String(index)}]`,
          "must reference a policy in this scenario",
        );
      });
      if (node.runtimeActionBindingId !== undefined) {
        context.string(
          node.runtimeActionBindingId,
          `${path}.runtimeActionBindingId`,
          { identifier: true },
        );
      }
      break;
    case "ENDORSEMENT":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "proposalNodeId",
          "policyId",
          "permittedRoleIds",
        ],
        path,
      );
      validateProposalReference(context, node, path, proposalNodeIds);
      validatePolicyReference(context, node, path, policyIds);
      validateUniqueStrings(
        context,
        node.permittedRoleIds,
        `${path}.permittedRoleIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((roleId, index) => {
        context.check(
          roleIds.has(roleId),
          "UNKNOWN_ROLE_REFERENCE",
          `${path}.permittedRoleIds[${String(index)}]`,
          "must reference a role in this scenario",
        );
      });
      break;
    case "POLICY_CHECK":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "policyId",
          "proposalNodeId",
        ],
        path,
      );
      validateProposalReference(context, node, path, proposalNodeIds);
      validatePolicyReference(context, node, path, policyIds);
      break;
    case "COMMUNICATION":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "messageId",
          "message",
          "visibleToRoleIds",
        ],
        path,
      );
      context.string(node.messageId, `${path}.messageId`, {
        identifier: true,
      });
      validateLocalizedText(
        context,
        node.message,
        `${path}.message`,
        supportedLocales,
      );
      validateRoleReferences(context, node, path, roleIds);
      break;
    case "STOCHASTIC_EVENT":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "randomStreamId",
          "outcomes",
        ],
        path,
      );
      {
        const randomStreamId = context.string(
          node.randomStreamId,
          `${path}.randomStreamId`,
          { identifier: true },
        );
        const expectedOutcomeCodes =
          randomStreamId === null
            ? undefined
            : outcomeCodesByRandomStream.get(randomStreamId);
        context.check(
          randomStreamId === null ||
            expectedOutcomeCodes !== undefined,
          "UNKNOWN_STOCHASTIC_OUTCOME_MODEL",
          `${path}.randomStreamId`,
          "must match the random stream of an authored outcome model",
        );
        const resultCodes: string[] = [];
        const outcomes = context.array(
          node.outcomes,
          `${path}.outcomes`,
        );
        if (outcomes !== null) {
          context.check(
            outcomes.length >= 2,
            "TOO_FEW_STOCHASTIC_OUTCOMES",
            `${path}.outcomes`,
            "must contain at least two outcomes",
          );
          outcomes.forEach((outcomeValue, outcomeIndex) => {
            const outcomePath =
              `${path}.outcomes[${String(outcomeIndex)}]`;
            const outcome = context.object(outcomeValue, outcomePath);
            if (outcome === null) return;
            context.allowedKeys(
              outcome,
              ["outcomeId", "weight", "resultCode", "label"],
              outcomePath,
            );
            context.string(outcome.outcomeId, `${outcomePath}.outcomeId`, {
              identifier: true,
            });
            context.number(outcome.weight, `${outcomePath}.weight`, {
              minimum: Number.EPSILON,
            });
            const resultCode = context.string(
              outcome.resultCode,
              `${outcomePath}.resultCode`,
              { identifier: true },
            );
            if (resultCode !== null) {
              resultCodes.push(resultCode);
              context.check(
                expectedOutcomeCodes === undefined ||
                  expectedOutcomeCodes.has(resultCode),
                "STOCHASTIC_OUTCOME_MODEL_MISMATCH",
                `${outcomePath}.resultCode`,
                "must be an outcome code in the model for this random stream",
              );
            }
            if (outcome.label !== undefined) {
              validateLocalizedText(
                context,
                outcome.label,
                `${outcomePath}.label`,
                supportedLocales,
              );
            }
          });
        }
        context.check(
          expectedOutcomeCodes === undefined ||
            (resultCodes.length === expectedOutcomeCodes.size &&
              [...expectedOutcomeCodes].every((code) =>
                resultCodes.includes(code),
              )),
          "STOCHASTIC_OUTCOME_MODEL_MISMATCH",
          `${path}.outcomes`,
          "must cover every outcome code in the model for this random stream exactly once",
        );
      }
      break;
    case "CONSEQUENCE":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "consequenceCode",
          "message",
        ],
        path,
      );
      context.string(node.consequenceCode, `${path}.consequenceCode`, {
        identifier: true,
      });
      validateLocalizedText(
        context,
        node.message,
        `${path}.message`,
        supportedLocales,
      );
      break;
    case "FEEDBACK":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "feedbackCode",
          "message",
        ],
        path,
      );
      context.string(node.feedbackCode, `${path}.feedbackCode`, {
        identifier: true,
      });
      validateLocalizedText(
        context,
        node.message,
        `${path}.message`,
        supportedLocales,
      );
      break;
    case "REFLECTION":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "reflectionId",
          "prompt",
          "maximumLength",
        ],
        path,
      );
      context.string(node.reflectionId, `${path}.reflectionId`, {
        identifier: true,
      });
      validateLocalizedText(
        context,
        node.prompt,
        `${path}.prompt`,
        supportedLocales,
      );
      context.number(node.maximumLength, `${path}.maximumLength`, {
        integer: true,
        minimum: 1,
        maximum: 10_000,
      });
      break;
    case "COMPLETION":
      context.allowedKeys(
        node,
        [
          "nodeId",
          "nodeType",
          "title",
          "transitions",
          "outcomeCode",
          "message",
        ],
        path,
      );
      context.string(node.outcomeCode, `${path}.outcomeCode`, {
        identifier: true,
      });
      context.check(
        Array.isArray(node.transitions) && node.transitions.length === 0,
        "COMPLETION_HAS_TRANSITIONS",
        `${path}.transitions`,
        "must be empty for a completion node",
      );
      if (node.message !== undefined) {
        validateLocalizedText(
          context,
          node.message,
          `${path}.message`,
          supportedLocales,
        );
      }
      break;
    default:
      context.issues.push({
        code: "UNSUPPORTED_NODE_TYPE",
        path: `${path}.nodeType`,
        message: "uses a node type unsupported by schema version 1.0.0",
      });
  }
}

function validateProposalReference(
  context: ValidationContext,
  node: Readonly<Record<string, unknown>>,
  path: string,
  proposalNodeIds: ReadonlySet<string>,
): void {
  const proposalNodeId = context.string(
    node.proposalNodeId,
    `${path}.proposalNodeId`,
    { identifier: true },
  );
  if (proposalNodeId !== null) {
    context.check(
      proposalNodeIds.has(proposalNodeId),
      "UNKNOWN_PROPOSAL_REFERENCE",
      `${path}.proposalNodeId`,
      "must reference a transaction-proposal node",
    );
  }
}

function validatePolicyReference(
  context: ValidationContext,
  node: Readonly<Record<string, unknown>>,
  path: string,
  policyIds: ReadonlySet<string>,
): void {
  const policyId = context.string(node.policyId, `${path}.policyId`, {
    identifier: true,
  });
  if (policyId !== null) {
    context.check(
      policyIds.has(policyId),
      "UNKNOWN_POLICY_REFERENCE",
      `${path}.policyId`,
      "must reference a policy in this scenario",
    );
  }
}

function validateRoleReferences(
  context: ValidationContext,
  node: Readonly<Record<string, unknown>>,
  path: string,
  roleIds: ReadonlySet<string>,
): void {
  validateUniqueStrings(
    context,
    node.visibleToRoleIds,
    `${path}.visibleToRoleIds`,
    { minimumItems: 1, identifiers: true },
  ).forEach((roleId, index) => {
    context.check(
      roleIds.has(roleId),
      "UNKNOWN_ROLE_REFERENCE",
      `${path}.visibleToRoleIds[${String(index)}]`,
      "must reference a role in this scenario",
    );
  });
}

function validateCounterfactualComparisonDimensions(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
): ReadonlySet<string> {
  const dimensionIds = new Set<string>();
  const dimensions = context.array(value, path);
  if (dimensions === null) return dimensionIds;
  dimensions.forEach((dimensionValue, dimensionIndex) => {
    const dimensionPath = `${path}[${String(dimensionIndex)}]`;
    const dimension = context.object(dimensionValue, dimensionPath);
    if (dimension === null) return;
    context.allowedKeys(
      dimension,
      [
        "dimensionId",
        "title",
        "description",
        "valueType",
        "direction",
        "unit",
        "evaluation",
      ],
      dimensionPath,
    );
    const dimensionId = context.string(
      dimension.dimensionId,
      `${dimensionPath}.dimensionId`,
      { identifier: true },
    );
    if (dimensionId !== null) {
      context.check(
        !dimensionIds.has(dimensionId),
        "DUPLICATE_COUNTERFACTUAL_COMPARISON_DIMENSION",
        `${dimensionPath}.dimensionId`,
        "must be unique within the scenario",
      );
      dimensionIds.add(dimensionId);
    }
    validateLocalizedText(
      context,
      dimension.title,
      `${dimensionPath}.title`,
      supportedLocales,
    );
    validateLocalizedText(
      context,
      dimension.description,
      `${dimensionPath}.description`,
      supportedLocales,
    );
    context.check(
      typeof dimension.valueType === "string" &&
        COUNTERFACTUAL_VALUE_TYPES.has(dimension.valueType),
      "INVALID_COUNTERFACTUAL_VALUE_TYPE",
      `${dimensionPath}.valueType`,
      "must be NUMBER, ORDINAL, or CATEGORICAL",
    );
    context.check(
      typeof dimension.direction === "string" &&
        COUNTERFACTUAL_DIRECTIONS.has(dimension.direction),
      "INVALID_COUNTERFACTUAL_DIRECTION",
      `${dimensionPath}.direction`,
      "must define how comparison values should be interpreted",
    );
    if (dimension.unit !== undefined) {
      context.string(dimension.unit, `${dimensionPath}.unit`, {
        identifier: true,
      });
    }
    const evaluation = context.object(
      dimension.evaluation,
      `${dimensionPath}.evaluation`,
    );
    if (evaluation !== null) {
      context.allowedKeys(
        evaluation,
        ["kind", "metricId", "changedValueAttribution"],
        `${dimensionPath}.evaluation`,
      );
      context.check(
        evaluation.kind === "RUNTIME_METRIC",
        "INVALID_COUNTERFACTUAL_EVALUATION_KIND",
        `${dimensionPath}.evaluation.kind`,
        "must use the constrained RUNTIME_METRIC evaluator",
      );
      context.string(
        evaluation.metricId,
        `${dimensionPath}.evaluation.metricId`,
        { identifier: true },
      );
      context.check(
        typeof evaluation.changedValueAttribution === "string" &&
          COUNTERFACTUAL_CHANGED_VALUE_ATTRIBUTIONS.has(
            evaluation.changedValueAttribution,
          ),
        "INVALID_COUNTERFACTUAL_CAUSAL_ATTRIBUTION",
        `${dimensionPath}.evaluation.changedValueAttribution`,
        "must use one supported authored causal classification",
      );
    }
  });
  return dimensionIds;
}

function validateInstructorIncidents(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
  roleIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
  nodeIds: ReadonlySet<string>,
  professionalMetricIds: ReadonlySet<string>,
): void {
  const incidents = context.array(value, path);
  if (incidents === null) return;
  const incidentIds = new Set<string>();
  incidents.forEach((incidentValue, incidentIndex) => {
    const incidentPath = `${path}[${String(incidentIndex)}]`;
    const incident = context.object(incidentValue, incidentPath);
    if (incident === null) return;
    context.allowedKeys(
      incident,
      [
        "incidentId",
        "version",
        "title",
        "message",
        "visibleToRoleIds",
        "releaseAtNodeIds",
        "evidenceIds",
        "professionalConsequenceEffects",
      ],
      incidentPath,
    );
    const incidentId = context.string(
      incident.incidentId,
      `${incidentPath}.incidentId`,
      { identifier: true },
    );
    if (incidentId !== null) {
      context.check(
        !incidentIds.has(incidentId),
        "DUPLICATE_INSTRUCTOR_INCIDENT",
        `${incidentPath}.incidentId`,
        "must be unique within the scenario",
      );
      incidentIds.add(incidentId);
    }
    context.string(incident.version, `${incidentPath}.version`, {
      semanticVersion: true,
    });
    validateLocalizedText(
      context,
      incident.title,
      `${incidentPath}.title`,
      supportedLocales,
    );
    validateLocalizedText(
      context,
      incident.message,
      `${incidentPath}.message`,
      supportedLocales,
    );
    validateUniqueStrings(
      context,
      incident.visibleToRoleIds,
      `${incidentPath}.visibleToRoleIds`,
      { minimumItems: 1, identifiers: true },
    ).forEach((roleId, index) => {
      context.check(
        roleIds.has(roleId),
        "UNKNOWN_ROLE_REFERENCE",
        `${incidentPath}.visibleToRoleIds[${String(index)}]`,
        "must reference a role in this scenario",
      );
    });
    validateUniqueStrings(
      context,
      incident.releaseAtNodeIds,
      `${incidentPath}.releaseAtNodeIds`,
      { minimumItems: 1, identifiers: true },
    ).forEach((nodeId, index) => {
      context.check(
        nodeIds.has(nodeId),
        "UNKNOWN_NODE_REFERENCE",
        `${incidentPath}.releaseAtNodeIds[${String(index)}]`,
        "must reference a node in this scenario",
      );
    });
    validateUniqueStrings(
      context,
      incident.evidenceIds,
      `${incidentPath}.evidenceIds`,
      { minimumItems: 1, identifiers: true },
    ).forEach((evidenceId, index) => {
      context.check(
        evidenceIds.has(evidenceId),
        "UNKNOWN_EVIDENCE_REFERENCE",
        `${incidentPath}.evidenceIds[${String(index)}]`,
        "must reference evidence in this scenario",
      );
    });
    const effects = context.object(
      incident.professionalConsequenceEffects,
      `${incidentPath}.professionalConsequenceEffects`,
    );
    if (effects === null) return;
    for (const [metricId, metricValue] of Object.entries(effects)) {
      context.check(
        IDENTIFIER.test(metricId),
        "INVALID_IDENTIFIER",
        `${incidentPath}.professionalConsequenceEffects.${metricId}`,
        "metric ID must be a valid identifier",
      );
      context.number(
        metricValue,
        `${incidentPath}.professionalConsequenceEffects.${metricId}`,
      );
      context.check(
        professionalMetricIds.has(metricId),
        "UNKNOWN_PROFESSIONAL_CONSEQUENCE_METRIC",
        `${incidentPath}.professionalConsequenceEffects.${metricId}`,
        "must reference a runtime metric declared by a scenario comparison dimension",
      );
    }
  });
}

function validateCounterfactualConditions(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
  supportedLocales: readonly string[],
  counterfactualDimensionIds: ReadonlySet<string>,
): void {
  const conditions = context.array(
    scenario.counterfactualConditions,
    `${path}.counterfactualConditions`,
  );
  if (conditions === null) return;
  const conditionIds = new Set<string>();
  const decisionNodeIds = new Set(
    (Array.isArray(scenario.nodes) ? scenario.nodes : [])
      .filter(
        (node): node is Readonly<Record<string, unknown>> =>
          typeof node === "object" &&
          node !== null &&
          !Array.isArray(node) &&
          (node as { nodeType?: unknown }).nodeType === "DECISION" &&
          typeof (node as { nodeId?: unknown }).nodeId === "string",
      )
      .map((node) => node.nodeId as string),
  );
  conditions.forEach((conditionValue, conditionIndex) => {
    const conditionPath =
      `${path}.counterfactualConditions[${String(conditionIndex)}]`;
    const condition = context.object(
      conditionValue,
      conditionPath,
    );
    if (condition === null) return;
    context.allowedKeys(
      condition,
      [
        "enabled",
        "conditionId",
        "availability",
        "permittedCreators",
        "forkNodeId",
        "runtimeConditionKey",
        "allowedValues",
        "affectsInformationBeforeFork",
        "comparisonDimensionIds",
        "maxBranchesPerLearner",
        "reflectionRequired",
        "localizationKey",
      ],
      conditionPath,
    );
    context.check(
      typeof condition.enabled === "boolean",
      "EXPECTED_BOOLEAN",
      `${conditionPath}.enabled`,
      "must be a boolean",
    );
    const conditionId = context.string(
      condition.conditionId,
      `${conditionPath}.conditionId`,
      { identifier: true },
    );
    if (conditionId !== null) {
      context.check(
        !conditionIds.has(conditionId),
        "DUPLICATE_COUNTERFACTUAL_CONDITION",
        `${conditionPath}.conditionId`,
        "must be unique within the scenario",
      );
      conditionIds.add(conditionId);
    }
    context.check(
      typeof condition.availability === "string" &&
        COUNTERFACTUAL_AVAILABILITY.has(condition.availability),
      "INVALID_COUNTERFACTUAL_AVAILABILITY",
      `${conditionPath}.availability`,
      "must use an authored counterfactual release boundary",
    );
    validateUniqueStrings(
      context,
      condition.permittedCreators,
      `${conditionPath}.permittedCreators`,
      { minimumItems: 1 },
    ).forEach((creator, creatorIndex) => {
      context.check(
        COUNTERFACTUAL_CREATORS.has(creator),
        "INVALID_COUNTERFACTUAL_CREATOR",
        `${conditionPath}.permittedCreators[${String(creatorIndex)}]`,
        "must be LEARNER, INSTRUCTOR, or RATER",
      );
    });
    const forkNodeId = context.string(
      condition.forkNodeId,
      `${conditionPath}.forkNodeId`,
      { identifier: true },
    );
    if (forkNodeId !== null) {
      context.check(
        decisionNodeIds.has(forkNodeId),
        "UNKNOWN_COUNTERFACTUAL_CONDITION_FORK",
        `${conditionPath}.forkNodeId`,
        "must reference a decision node in this scenario",
      );
    }
    context.check(
      condition.runtimeConditionKey === "COFFEE_CASE_VARIANT",
      "INVALID_COUNTERFACTUAL_CONDITION_KEY",
      `${conditionPath}.runtimeConditionKey`,
      "must use a supported declarative runtime condition",
    );
    context.check(
      typeof condition.affectsInformationBeforeFork === "boolean",
      "EXPECTED_BOOLEAN",
      `${conditionPath}.affectsInformationBeforeFork`,
      "must declare whether visible information changes",
    );
    const valueIds = new Set<string>();
    const runtimeValues = new Set<string>();
    const values = context.array(
      condition.allowedValues,
      `${conditionPath}.allowedValues`,
    );
    if (values !== null) {
      context.check(
        values.length >= 2,
        "COUNTERFACTUAL_CONDITION_WITHOUT_ALTERNATIVE",
        `${conditionPath}.allowedValues`,
        "must contain at least two authored values",
      );
      values.forEach((value, valueIndex) => {
        const valuePath =
          `${conditionPath}.allowedValues[${String(valueIndex)}]`;
        const record = context.object(value, valuePath);
        if (record === null) return;
        context.allowedKeys(
          record,
          ["conditionValueId", "runtimeValue", "label"],
          valuePath,
        );
        const valueId = context.string(
          record.conditionValueId,
          `${valuePath}.conditionValueId`,
          { identifier: true },
        );
        if (valueId !== null) {
          context.check(
            !valueIds.has(valueId),
            "DUPLICATE_COUNTERFACTUAL_CONDITION_VALUE",
            `${valuePath}.conditionValueId`,
            "must be unique within the condition",
          );
          valueIds.add(valueId);
        }
        const runtimeValue = context.string(
          record.runtimeValue,
          `${valuePath}.runtimeValue`,
          { identifier: true },
        );
        if (runtimeValue !== null) {
          context.check(
            runtimeValue === "authorized-certifier" ||
              runtimeValue === "unauthorized-transporter",
            "INVALID_COUNTERFACTUAL_CONDITION_VALUE",
            `${valuePath}.runtimeValue`,
            "must be one supported coffee case variant",
          );
          context.check(
            !runtimeValues.has(runtimeValue),
            "DUPLICATE_COUNTERFACTUAL_RUNTIME_VALUE",
            `${valuePath}.runtimeValue`,
            "must be unique within the condition",
          );
          runtimeValues.add(runtimeValue);
        }
        validateLocalizedText(
          context,
          record.label,
          `${valuePath}.label`,
          supportedLocales,
        );
      });
    }
    validateUniqueStrings(
      context,
      condition.comparisonDimensionIds,
      `${conditionPath}.comparisonDimensionIds`,
      { minimumItems: 1, identifiers: true },
    ).forEach((dimensionId, dimensionIndex) => {
      context.check(
        counterfactualDimensionIds.has(dimensionId),
        "UNKNOWN_COUNTERFACTUAL_COMPARISON_DIMENSION",
        `${conditionPath}.comparisonDimensionIds[${String(dimensionIndex)}]`,
        "must reference a scenario comparison dimension",
      );
    });
    if (condition.maxBranchesPerLearner !== undefined) {
      context.number(
        condition.maxBranchesPerLearner,
        `${conditionPath}.maxBranchesPerLearner`,
        { integer: true, minimum: 1, maximum: 20 },
      );
    }
    if (condition.reflectionRequired !== undefined) {
      context.check(
        typeof condition.reflectionRequired === "boolean",
        "EXPECTED_BOOLEAN",
        `${conditionPath}.reflectionRequired`,
        "must be a boolean",
      );
    }
    context.string(
      condition.localizationKey,
      `${conditionPath}.localizationKey`,
      { identifier: true },
    );
  });
}

function validateScenarioNodes(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
  supportedLocales: readonly string[],
  evidenceIds: ReadonlySet<string>,
  policyIds: ReadonlySet<string>,
  roleIds: ReadonlySet<string>,
  counterfactualDimensionIds: ReadonlySet<string>,
  counterfactualMetricIds: ReadonlySet<string>,
  outcomeCodesByRandomStream: ReadonlyMap<
    string,
    ReadonlySet<string>
  >,
  imagePurposesByAssetId: ReadonlyMap<string, string>,
): void {
  const nodes = context.array(scenario.nodes, `${path}.nodes`);
  if (nodes === null) return;
  context.check(
    nodes.length > 0,
    "SCENARIO_WITHOUT_NODES",
    `${path}.nodes`,
    "must contain at least one workflow node",
  );
  const nodeRecords = nodes.flatMap((nodeValue, nodeIndex) => {
    const nodePath = `${path}.nodes[${String(nodeIndex)}]`;
    const node = context.object(nodeValue, nodePath);
    return node === null ? [] : [{ node, nodePath }];
  });
  const nodeIds = new Set<string>();
  const decisionIds = new Set<string>();
  const proposalNodeIds = new Set<string>();
  nodeRecords.forEach(({ node, nodePath }) => {
    const nodeId = context.string(node.nodeId, `${nodePath}.nodeId`, {
      identifier: true,
    });
    if (nodeId !== null) {
      context.check(
        !nodeIds.has(nodeId),
        "DUPLICATE_NODE_ID",
        `${nodePath}.nodeId`,
        "must be unique within the scenario",
      );
      nodeIds.add(nodeId);
    }
    context.check(
      typeof node.nodeType === "string" && NODE_TYPES.has(node.nodeType),
      "UNSUPPORTED_NODE_TYPE",
      `${nodePath}.nodeType`,
      "must use a supported declarative node type",
    );
    validateLocalizedText(
      context,
      node.title,
      `${nodePath}.title`,
      supportedLocales,
    );
    if (node.nodeType === "DECISION") {
      const decisionId = context.string(
        node.decisionId,
        `${nodePath}.decisionId`,
        { identifier: true },
      );
      if (decisionId !== null) {
        context.check(
          !decisionIds.has(decisionId),
          "DUPLICATE_DECISION_ID",
          `${nodePath}.decisionId`,
          "must be unique within the scenario",
        );
        decisionIds.add(decisionId);
      }
    }
    if (node.nodeType === "TRANSACTION_PROPOSAL" && nodeId !== null) {
      proposalNodeIds.add(nodeId);
    }
  });
  const adjacency = new Map<string, readonly string[]>();
  nodeRecords.forEach(({ node, nodePath }) => {
    validateNodeContent(
      context,
      node,
      nodePath,
      supportedLocales,
      evidenceIds,
      policyIds,
      roleIds,
      decisionIds,
      proposalNodeIds,
      counterfactualDimensionIds,
      counterfactualMetricIds,
      outcomeCodesByRandomStream,
      imagePurposesByAssetId,
    );
    const targets = validateTransitions(
      context,
      node.transitions,
      `${nodePath}.transitions`,
      nodeIds,
      decisionIds,
      policyIds,
    );
    if (typeof node.nodeId === "string") {
      adjacency.set(node.nodeId, targets);
    }
  });
  const entryNodeId = context.string(
    scenario.entryNodeId,
    `${path}.entryNodeId`,
    { identifier: true },
  );
  if (entryNodeId === null) return;
  context.check(
    nodeIds.has(entryNodeId),
    "UNKNOWN_ENTRY_NODE",
    `${path}.entryNodeId`,
    "must reference a node in this scenario",
  );
  const reachable = new Set<string>();
  const pending = [entryNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (nodeId === undefined || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) pending.push(target);
  }
  for (const nodeId of nodeIds) {
    context.check(
      reachable.has(nodeId),
      "UNREACHABLE_NODE",
      `${path}.nodes`,
      `node ${nodeId} is not reachable from the entry node`,
    );
  }
  const completionNodeIds = nodeRecords
    .filter(({ node }) => node.nodeType === "COMPLETION")
    .flatMap(({ node }) =>
      typeof node.nodeId === "string" ? [node.nodeId] : [],
    );
  context.check(
    completionNodeIds.some((nodeId) => reachable.has(nodeId)),
    "MISSING_COMPLETION_PATH",
    `${path}.nodes`,
    "must contain a reachable completion node",
  );
}

function validateEvidenceRequestReachability(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
): void {
  const requestRequired = (
    Array.isArray(scenario.evidenceItems)
      ? scenario.evidenceItems
      : []
  ).flatMap((value, index) => {
    if (!isJsonObject(value)) return [];
    const learnerMetadata = value.learnerMetadata;
    if (!isJsonObject(learnerMetadata)) return [];
    const access = learnerMetadata.access;
    return isJsonObject(access) &&
      access.acquisitionMode === "REQUEST_REQUIRED" &&
      typeof value.evidenceId === "string"
      ? [
          {
            evidenceId: value.evidenceId,
            index,
            permissionPolicyId:
              typeof access.permissionPolicyId === "string"
                ? access.permissionPolicyId
                : undefined,
            visibleToRoleIds: Array.isArray(
              value.visibleToRoleIds,
            )
              ? value.visibleToRoleIds.filter(
                  (roleId): roleId is string =>
                    typeof roleId === "string",
                )
              : [],
          },
        ]
      : [];
  });
  if (requestRequired.length === 0) return;
  const offeredEvidenceIds = new Set(
    (Array.isArray(scenario.nodes) ? scenario.nodes : []).flatMap(
      (value) =>
        isJsonObject(value) &&
        value.nodeType === "EVIDENCE_RELEASE" &&
        Array.isArray(value.evidenceIds)
          ? value.evidenceIds.filter(
              (evidenceId): evidenceId is string =>
                typeof evidenceId === "string",
            )
          : [],
    ),
  );
  for (const { evidenceId, index } of requestRequired) {
    context.check(
      offeredEvidenceIds.has(evidenceId),
      "REQUEST_REQUIRED_EVIDENCE_NOT_OFFERED",
      `${path}.evidenceItems[${String(index)}].learnerMetadata.access.acquisitionMode`,
      "request-required evidence must be introduced by a reachable evidence-release node",
    );
  }
  const policies = Array.isArray(scenario.policies)
    ? scenario.policies
    : [];
  const roleIds = new Set(
    (Array.isArray(scenario.roles) ? scenario.roles : []).flatMap(
      (value) =>
        isJsonObject(value) && typeof value.roleId === "string"
          ? [value.roleId]
          : [],
    ),
  );
  const organizationIds = new Set(
    (
      Array.isArray(scenario.organizations)
        ? scenario.organizations
        : []
    ).flatMap((value) =>
      isJsonObject(value) &&
      typeof value.organizationId === "string"
        ? [value.organizationId]
        : [],
    ),
  );
  for (const {
    permissionPolicyId,
    visibleToRoleIds,
    index,
  } of requestRequired) {
    if (permissionPolicyId === undefined) continue;
    const policy = policies.find(
      (value) =>
        isJsonObject(value) &&
        value.policyId === permissionPolicyId,
    );
    const policyPath =
      `${path}.evidenceItems[${String(index)}].learnerMetadata.access.permissionPolicyId`;
    context.check(
      isJsonObject(policy) &&
        policy.policyType === "AUTHORIZATION",
      "INVALID_EVIDENCE_REQUEST_PERMISSION_POLICY",
      policyPath,
      "must reference an authorization policy",
    );
    if (
      !isJsonObject(policy) ||
      !isJsonObject(policy.configuration)
    ) {
      continue;
    }
    const authorizedRoleId =
      policy.configuration.authorizedRoleId;
    const authorizedOrganizationId =
      policy.configuration.authorizedOrganizationId;
    context.check(
      typeof authorizedRoleId === "string" ||
        typeof authorizedOrganizationId === "string",
      "UNSUPPORTED_EVIDENCE_REQUEST_PERMISSION_POLICY",
      policyPath,
      "must declare an authorized role or organization",
    );
    if (typeof authorizedRoleId === "string") {
      context.check(
        roleIds.has(authorizedRoleId),
        "UNKNOWN_ROLE_REFERENCE",
        policyPath,
        "authorization policy must reference a scenario role",
      );
      context.check(
        visibleToRoleIds.includes(authorizedRoleId),
        "EVIDENCE_REQUEST_POLICY_ROLE_NOT_VISIBLE",
        policyPath,
        "authorized request role must also be able to see the evidence",
      );
    }
    if (typeof authorizedOrganizationId === "string") {
      context.check(
        organizationIds.has(authorizedOrganizationId),
        "UNKNOWN_ORGANIZATION_REFERENCE",
        policyPath,
        "authorization policy must reference a scenario organization",
      );
    }
  }
  const requestEnabled = (
    Array.isArray(scenario.modeConfigurations)
      ? scenario.modeConfigurations
      : []
  ).some(
    (value) =>
      isJsonObject(value) &&
      value.allowEvidenceRequests === true,
  );
  context.check(
    requestEnabled,
    "REQUEST_REQUIRED_EVIDENCE_DISABLED",
    `${path}.modeConfigurations`,
    "at least one supported mode must allow authored evidence requests",
  );
}

function validateEvidenceLearnerMetadata(
  context: ValidationContext,
  value: unknown,
  path: string,
  organizationIds: ReadonlySet<string>,
  policyIds: ReadonlySet<string>,
): void {
  const metadata = context.object(value, path);
  if (metadata === null) return;
  context.allowedKeys(
    metadata,
    [
      "createdAt",
      "effectiveFrom",
      "ownerOrganizationId",
      "signatureStatus",
      "ledgerStatus",
      "completeness",
      "access",
    ],
    path,
  );
  for (const timestampField of ["createdAt", "effectiveFrom"] as const) {
    if (metadata[timestampField] === undefined) continue;
    const timestamp = context.string(
      metadata[timestampField],
      `${path}.${timestampField}`,
    );
    if (timestamp !== null) {
      context.check(
        ISO_TIMESTAMP.test(timestamp),
        "INVALID_EVIDENCE_TIMESTAMP",
        `${path}.${timestampField}`,
        "must be an ISO UTC timestamp",
      );
    }
  }
  if (metadata.ownerOrganizationId !== undefined) {
    const ownerOrganizationId = context.string(
      metadata.ownerOrganizationId,
      `${path}.ownerOrganizationId`,
      { identifier: true },
    );
    context.check(
      ownerOrganizationId !== null &&
        organizationIds.has(ownerOrganizationId),
      "UNKNOWN_ORGANIZATION_REFERENCE",
      `${path}.ownerOrganizationId`,
      "must reference an organization in this scenario",
    );
  }
  context.check(
    typeof metadata.signatureStatus === "string" &&
      EVIDENCE_SIGNATURE_STATUSES.has(metadata.signatureStatus),
    "INVALID_EVIDENCE_SIGNATURE_STATUS",
    `${path}.signatureStatus`,
    "must use a supported learner-visible signature status",
  );
  context.check(
    typeof metadata.ledgerStatus === "string" &&
      EVIDENCE_LEDGER_STATUSES.has(metadata.ledgerStatus),
    "INVALID_EVIDENCE_LEDGER_STATUS",
    `${path}.ledgerStatus`,
    "must use a supported learner-visible ledger status",
  );
  context.check(
    typeof metadata.completeness === "string" &&
      EVIDENCE_COMPLETENESS_VALUES.has(metadata.completeness),
    "INVALID_EVIDENCE_COMPLETENESS",
    `${path}.completeness`,
    "must use a supported learner-visible completeness value",
  );
  const access = context.object(metadata.access, `${path}.access`);
  if (access === null) return;
  context.allowedKeys(
    access,
    [
      "classification",
      "acquisitionMode",
      "delayMinutes",
      "costUnits",
      "permissionPolicyId",
    ],
    `${path}.access`,
  );
  context.check(
    typeof access.classification === "string" &&
      EVIDENCE_ACCESS_CLASSIFICATIONS.has(access.classification),
    "INVALID_EVIDENCE_ACCESS_CLASSIFICATION",
    `${path}.access.classification`,
    "must use a supported access classification",
  );
  context.check(
    typeof access.acquisitionMode === "string" &&
      EVIDENCE_ACQUISITION_MODES.has(access.acquisitionMode),
    "INVALID_EVIDENCE_ACQUISITION_MODE",
    `${path}.access.acquisitionMode`,
    "must be available or require an authored request",
  );
  const delayMinutes = context.number(
    access.delayMinutes,
    `${path}.access.delayMinutes`,
    { integer: true, minimum: 0 },
  );
  const costUnits = context.number(
    access.costUnits,
    `${path}.access.costUnits`,
    { integer: true, minimum: 0 },
  );
  if (access.permissionPolicyId !== undefined) {
    const permissionPolicyId = context.string(
      access.permissionPolicyId,
      `${path}.access.permissionPolicyId`,
      { identifier: true },
    );
    context.check(
      permissionPolicyId !== null &&
        policyIds.has(permissionPolicyId),
      "UNKNOWN_POLICY_REFERENCE",
      `${path}.access.permissionPolicyId`,
      "must reference a policy in this scenario",
    );
  }
  if (access.acquisitionMode === "AVAILABLE") {
    context.check(
      delayMinutes === 0 && costUnits === 0,
      "AVAILABLE_EVIDENCE_HAS_ACQUISITION_COST",
      `${path}.access`,
      "available evidence must have zero delay and cost",
    );
    context.check(
      access.permissionPolicyId === undefined,
      "AVAILABLE_EVIDENCE_HAS_PERMISSION_POLICY",
      `${path}.access.permissionPolicyId`,
      "available evidence cannot require a permission policy",
    );
  }
}

function validateEvidenceAssessmentMetadata(
  context: ValidationContext,
  value: unknown,
  path: string,
  actualStateKeys: ReadonlySet<string>,
): void {
  const metadata = context.object(value, path);
  if (metadata === null) return;
  context.allowedKeys(
    metadata,
    [
      "reliability",
      "contentStatus",
      "limitationCodes",
      "hiddenConditionReferences",
    ],
    path,
  );
  context.check(
    typeof metadata.reliability === "string" &&
      EVIDENCE_RELIABILITY_VALUES.has(metadata.reliability),
    "INVALID_EVIDENCE_RELIABILITY",
    `${path}.reliability`,
    "must use a supported instructor-only reliability value",
  );
  context.check(
    typeof metadata.contentStatus === "string" &&
      EVIDENCE_CONTENT_STATUSES.has(metadata.contentStatus),
    "INVALID_EVIDENCE_CONTENT_STATUS",
    `${path}.contentStatus`,
    "must use a supported instructor-only content status",
  );
  validateUniqueStrings(
    context,
    metadata.limitationCodes,
    `${path}.limitationCodes`,
    { identifiers: true },
  );
  const hiddenConditionReferences = validateUniqueStrings(
    context,
    metadata.hiddenConditionReferences,
    `${path}.hiddenConditionReferences`,
    { identifiers: true },
  );
  hiddenConditionReferences.forEach((reference, index) => {
    context.check(
      actualStateKeys.has(reference),
      "UNKNOWN_HIDDEN_CONDITION_REFERENCE",
      `${path}.hiddenConditionReferences[${String(index)}]`,
      "must reference a top-level field in the scenario actual state",
    );
  });
}

function validateScenario(
  context: ValidationContext,
  value: unknown,
  path: string,
  schemaVersion: unknown,
  supportedLocales: readonly string[],
  competencyIds: ReadonlySet<string>,
  indicatorIds: ReadonlySet<string>,
  rubricIds: ReadonlySet<string>,
  evidenceRuleIds: ReadonlySet<string>,
  imagePurposesByAssetId: ReadonlyMap<string, string>,
): void {
  const scenario = context.object(value, path);
  if (scenario === null) return;
  context.allowedKeys(
    scenario,
    [
      "scenarioId",
      "version",
      "status",
      "title",
      "supportedModes",
      "modeConfigurations",
      "outcomeModels",
      "competencyTargets",
      "organizations",
      "roles",
      "staffProfiles",
      "assetTypes",
      "initialState",
      "policies",
      "evidenceItems",
      "instructorIncidents",
      "counterfactualComparisonDimensions",
      "counterfactualConditions",
      "entryNodeId",
      "nodes",
      "rubricIds",
      "evidenceRuleIds",
      "hostedRuntime",
      "auditCase",
    ],
    path,
  );
  context.string(scenario.scenarioId, `${path}.scenarioId`, {
    identifier: true,
  });
  context.string(scenario.version, `${path}.version`, {
    semanticVersion: true,
  });
  context.check(
    typeof scenario.status === "string" &&
      LIFECYCLE_STATUSES.has(scenario.status),
    "INVALID_LIFECYCLE_STATUS",
    `${path}.status`,
    "must be draft, validated, published, or retired",
  );
  validateLocalizedText(
    context,
    scenario.title,
    `${path}.title`,
    supportedLocales,
  );
  const modes = validateUniqueStrings(
    context,
    scenario.supportedModes,
    `${path}.supportedModes`,
    { minimumItems: 1 },
  );
  modes.forEach((mode, index) => {
    context.check(
      RUN_MODES.has(mode),
      "INVALID_RUN_MODE",
      `${path}.supportedModes[${String(index)}]`,
      "must be tutorial, standard, sandbox, or configured",
    );
  });
  const outcomeModels = context.array(
    scenario.outcomeModels,
    `${path}.outcomeModels`,
  );
  const outcomeCodesByModel = new Map<string, ReadonlySet<string>>();
  const outcomeCodesByRandomStream = new Map<
    string,
    ReadonlySet<string>
  >();
  if (outcomeModels !== null) {
    outcomeModels.forEach((value, index) => {
      const modelPath = `${path}.outcomeModels[${String(index)}]`;
      const model = context.object(value, modelPath);
      if (model === null) return;
      const distribution = context.string(
        model.distribution,
        `${modelPath}.distribution`,
      );
      const outcomeModelId = context.string(
        model.outcomeModelId,
        `${modelPath}.outcomeModelId`,
        { identifier: true },
      );
      const randomStreamId = context.string(
        model.randomStreamId,
        `${modelPath}.randomStreamId`,
        { identifier: true },
      );
      if (distribution === "bernoulli") {
        context.allowedKeys(
          model,
          [
            "outcomeModelId",
            "distribution",
            "randomStreamId",
            "probability",
            "onTrue",
            "onFalse",
          ],
          modelPath,
        );
        context.number(
          model.probability,
          `${modelPath}.probability`,
          { minimum: 0, maximum: 1 },
        );
        const onTrue = context.string(
          model.onTrue,
          `${modelPath}.onTrue`,
          { identifier: true },
        );
        const onFalse = context.string(
          model.onFalse,
          `${modelPath}.onFalse`,
          { identifier: true },
        );
        context.check(
          onTrue === null || onFalse === null || onTrue !== onFalse,
          "DUPLICATE_OUTCOME_CODE",
          modelPath,
          "must define two distinct Bernoulli outcome codes",
        );
        if (
          outcomeModelId !== null &&
          onTrue !== null &&
          onFalse !== null
        ) {
          const codes = new Set([onTrue, onFalse]);
          outcomeCodesByModel.set(outcomeModelId, codes);
          if (randomStreamId !== null) {
            context.check(
              !outcomeCodesByRandomStream.has(randomStreamId),
              "DUPLICATE_RANDOM_STREAM",
              `${modelPath}.randomStreamId`,
              "must be unique among outcome models in this scenario",
            );
            outcomeCodesByRandomStream.set(randomStreamId, codes);
          }
        }
        return;
      }
      context.allowedKeys(
        model,
        [
          "outcomeModelId",
          "distribution",
          "randomStreamId",
          "outcomes",
        ],
        modelPath,
      );
      context.check(
        distribution === "weighted-categorical",
        "INVALID_OUTCOME_DISTRIBUTION",
        `${modelPath}.distribution`,
        "must be bernoulli or weighted-categorical",
      );
      const outcomes = context.array(
        model.outcomes,
        `${modelPath}.outcomes`,
      );
      const codes: string[] = [];
      if (outcomes !== null) {
        context.check(
          outcomes.length >= 2,
          "TOO_FEW_STOCHASTIC_OUTCOMES",
          `${modelPath}.outcomes`,
          "must contain at least two outcomes",
        );
        outcomes.forEach((outcomeValue, outcomeIndex) => {
          const outcomePath =
            `${modelPath}.outcomes[${String(outcomeIndex)}]`;
          const outcome = context.object(outcomeValue, outcomePath);
          if (outcome === null) return;
          context.allowedKeys(
            outcome,
            ["outcomeCode", "weight"],
            outcomePath,
          );
          const code = context.string(
            outcome.outcomeCode,
            `${outcomePath}.outcomeCode`,
            { identifier: true },
          );
          if (code !== null) codes.push(code);
          context.number(
            outcome.weight,
            `${outcomePath}.weight`,
            { minimum: Number.MIN_VALUE },
          );
        });
      }
      context.check(
        new Set(codes).size === codes.length,
        "DUPLICATE_OUTCOME_CODE",
        `${modelPath}.outcomes`,
        "must not contain duplicate outcome codes",
      );
      if (outcomeModelId !== null) {
        const codeSet = new Set(codes);
        outcomeCodesByModel.set(outcomeModelId, codeSet);
        if (randomStreamId !== null) {
          context.check(
            !outcomeCodesByRandomStream.has(randomStreamId),
            "DUPLICATE_RANDOM_STREAM",
            `${modelPath}.randomStreamId`,
            "must be unique among outcome models in this scenario",
          );
          outcomeCodesByRandomStream.set(randomStreamId, codeSet);
        }
      }
    });
  }
  context.check(
    outcomeCodesByModel.size === (outcomeModels?.length ?? 0),
    "DUPLICATE_OUTCOME_MODEL",
    `${path}.outcomeModels`,
    "must not contain duplicate outcome-model identifiers",
  );

  const modeConfigurations = context.array(
    scenario.modeConfigurations,
    `${path}.modeConfigurations`,
  );
  const configuredModes: string[] = [];
  if (modeConfigurations !== null) {
    modeConfigurations.forEach((value, index) => {
      const configurationPath =
        `${path}.modeConfigurations[${String(index)}]`;
      const configuration = context.object(
        value,
        configurationPath,
      );
      if (configuration === null) return;
      context.allowedKeys(
        configuration,
        [
          "mode",
          "allowHints",
          "allowRetry",
          "allowBacktracking",
          "feedbackTiming",
          "showScores",
          "outcomeStrategy",
          "seedPolicy",
          "timeLimitMinutes",
          "allowCommunication",
          "allowEvidenceRequests",
          "outcomeModelId",
          "forcedOutcomeCode",
        ],
        configurationPath,
      );
      const mode = context.string(
        configuration.mode,
        `${configurationPath}.mode`,
      );
      if (mode !== null) configuredModes.push(mode);
      context.check(
        mode !== null && RUN_MODES.has(mode),
        "INVALID_RUN_MODE",
        `${configurationPath}.mode`,
        "must be tutorial, standard, sandbox, or configured",
      );
      for (const key of [
        "allowHints",
        "allowRetry",
        "allowBacktracking",
        "showScores",
        "allowCommunication",
        "allowEvidenceRequests",
      ] as const) {
        context.check(
          typeof configuration[key] === "boolean",
          "EXPECTED_BOOLEAN",
          `${configurationPath}.${key}`,
          "must be a boolean",
        );
      }
      context.check(
        typeof configuration.feedbackTiming === "string" &&
          FEEDBACK_TIMINGS.has(configuration.feedbackTiming),
        "INVALID_FEEDBACK_TIMING",
        `${configurationPath}.feedbackTiming`,
        "must be immediate, stage-end, or final",
      );
      context.check(
        typeof configuration.outcomeStrategy === "string" &&
          OUTCOME_STRATEGIES.has(configuration.outcomeStrategy),
        "INVALID_OUTCOME_STRATEGY",
        `${configurationPath}.outcomeStrategy`,
        "must be forced or probabilistic",
      );
      context.check(
        typeof configuration.seedPolicy === "string" &&
          SEED_POLICIES.has(configuration.seedPolicy),
        "INVALID_SEED_POLICY",
        `${configurationPath}.seedPolicy`,
        "must be supplied or generated",
      );
      if (configuration.timeLimitMinutes !== undefined) {
        context.number(
          configuration.timeLimitMinutes,
          `${configurationPath}.timeLimitMinutes`,
          { integer: true, minimum: 1, maximum: 1440 },
        );
      }
      const outcomeModelId =
        configuration.outcomeModelId === undefined
          ? null
          : context.string(
              configuration.outcomeModelId,
              `${configurationPath}.outcomeModelId`,
              { identifier: true },
            );
      if (outcomeModelId !== null) {
        context.check(
          outcomeCodesByModel.has(outcomeModelId),
          "UNKNOWN_OUTCOME_MODEL",
          `${configurationPath}.outcomeModelId`,
          "must reference an outcome model defined by this scenario",
        );
      }
      if (configuration.outcomeStrategy === "probabilistic") {
        context.check(
          outcomeModelId !== null,
          "MISSING_OUTCOME_MODEL",
          `${configurationPath}.outcomeModelId`,
          "is required for probabilistic outcomes",
        );
      }
      if (configuration.forcedOutcomeCode !== undefined) {
        const forcedOutcomeCode = context.string(
          configuration.forcedOutcomeCode,
          `${configurationPath}.forcedOutcomeCode`,
          { identifier: true },
        );
        context.check(
          forcedOutcomeCode !== null &&
            outcomeModelId !== null &&
            (outcomeCodesByModel.get(outcomeModelId)?.has(
              forcedOutcomeCode,
            ) ??
              false),
          "INVALID_FORCED_OUTCOME",
          `${configurationPath}.forcedOutcomeCode`,
          "must be an outcome code in the referenced model",
        );
      }
    });
  }
  context.check(
    new Set(configuredModes).size === configuredModes.length,
    "DUPLICATE_MODE_CONFIGURATION",
    `${path}.modeConfigurations`,
    "must define each hosted mode at most once",
  );
  context.check(
    modes.length === configuredModes.length &&
      modes.every((mode) => configuredModes.includes(mode)),
    "MODE_CONFIGURATION_MISMATCH",
    `${path}.modeConfigurations`,
    "must define exactly one configuration for every supported mode",
  );

  const targets = context.array(
    scenario.competencyTargets,
    `${path}.competencyTargets`,
  );
  if (targets !== null) {
    targets.forEach((targetValue, targetIndex) => {
      const targetPath =
        `${path}.competencyTargets[${String(targetIndex)}]`;
      const target = context.object(targetValue, targetPath);
      if (target === null) return;
      context.allowedKeys(
        target,
        ["competencyId", "indicatorIds", "targetType"],
        targetPath,
      );
      const competencyId = context.string(
        target.competencyId,
        `${targetPath}.competencyId`,
        { identifier: true },
      );
      if (competencyId !== null) {
        context.check(
          competencyIds.has(competencyId),
          "UNKNOWN_COMPETENCY_REFERENCE",
          `${targetPath}.competencyId`,
          "must reference a competency defined by this pack",
        );
      }
      validateUniqueStrings(
        context,
        target.indicatorIds,
        `${targetPath}.indicatorIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((indicatorId, indicatorIndex) => {
        context.check(
          indicatorIds.has(indicatorId),
          "UNKNOWN_INDICATOR_REFERENCE",
          `${targetPath}.indicatorIds[${String(indicatorIndex)}]`,
          "must reference an indicator defined by this pack",
        );
        context.check(
          competencyId === null ||
            indicatorId.startsWith(`${competencyId}.`),
          "TARGET_INDICATOR_MISMATCH",
          `${targetPath}.indicatorIds[${String(indicatorIndex)}]`,
          "must belong to the targeted competency",
        );
      });
      context.check(
        target.targetType === "primary" ||
          target.targetType === "supporting" ||
          target.targetType === "contextual",
        "INVALID_COMPETENCY_TARGET_TYPE",
        `${targetPath}.targetType`,
        "must be primary, supporting, or contextual",
      );
    });
  }

  const organizationIds = new Set<string>();
  const organizations = context.array(
    scenario.organizations,
    `${path}.organizations`,
  );
  if (organizations !== null) {
    context.check(
      organizations.length > 0,
      "SCENARIO_WITHOUT_ORGANIZATIONS",
      `${path}.organizations`,
      "must contain at least one organization",
    );
    organizations.forEach((organizationValue, organizationIndex) => {
      const organizationPath =
        `${path}.organizations[${String(organizationIndex)}]`;
      const organization = context.object(
        organizationValue,
        organizationPath,
      );
      if (organization === null) return;
      context.allowedKeys(
        organization,
        ["organizationId", "displayName"],
        organizationPath,
      );
      const organizationId = context.string(
        organization.organizationId,
        `${organizationPath}.organizationId`,
        { identifier: true },
      );
      if (organizationId !== null) {
        context.check(
          !organizationIds.has(organizationId),
          "DUPLICATE_ORGANIZATION_ID",
          `${organizationPath}.organizationId`,
          "must be unique within the scenario",
        );
        organizationIds.add(organizationId);
      }
      validateLocalizedText(
        context,
        organization.displayName,
        `${organizationPath}.displayName`,
        supportedLocales,
      );
    });
  }

  const roleIds = new Set<string>();
  const roles = context.array(scenario.roles, `${path}.roles`);
  if (roles !== null) {
    context.check(
      roles.length > 0,
      "SCENARIO_WITHOUT_ROLES",
      `${path}.roles`,
      "must contain at least one role",
    );
    roles.forEach((roleValue, roleIndex) => {
      const rolePath = `${path}.roles[${String(roleIndex)}]`;
      const role = context.object(roleValue, rolePath);
      if (role === null) return;
      context.allowedKeys(
        role,
        ["roleId", "organizationId", "displayName"],
        rolePath,
      );
      const roleId = context.string(role.roleId, `${rolePath}.roleId`, {
        identifier: true,
      });
      if (roleId !== null) {
        context.check(
          !roleIds.has(roleId),
          "DUPLICATE_ROLE_ID",
          `${rolePath}.roleId`,
          "must be unique within the scenario",
        );
        roleIds.add(roleId);
      }
      const organizationId = context.string(
        role.organizationId,
        `${rolePath}.organizationId`,
        { identifier: true },
      );
      if (organizationId !== null) {
        context.check(
          organizationIds.has(organizationId),
          "UNKNOWN_ORGANIZATION_REFERENCE",
          `${rolePath}.organizationId`,
          "must reference an organization in this scenario",
        );
      }
      validateLocalizedText(
        context,
        role.displayName,
        `${rolePath}.displayName`,
        supportedLocales,
      );
    });
  }

  const staffProfileIds = new Set<string>();
  const staffProfiles = context.array(
    scenario.staffProfiles,
    `${path}.staffProfiles`,
  );
  if (staffProfiles !== null) {
    staffProfiles.forEach((profileValue, profileIndex) => {
      const profilePath =
        `${path}.staffProfiles[${String(profileIndex)}]`;
      const profile = context.object(profileValue, profilePath);
      if (profile === null) return;
      context.allowedKeys(
        profile,
        [
          "staffProfileId",
          "roleId",
          "organizationId",
          "displayName",
          "roleTitle",
          "portraitAssetId",
          "portraitAlt",
          "shortProfile",
          "professionalResponsibility",
          "visibility",
          "fictional",
        ],
        profilePath,
      );
      const profileId = context.string(
        profile.staffProfileId,
        `${profilePath}.staffProfileId`,
        { identifier: true },
      );
      if (profileId !== null) {
        context.check(
          !staffProfileIds.has(profileId),
          "DUPLICATE_STAFF_PROFILE_ID",
          `${profilePath}.staffProfileId`,
          "must be unique within the scenario",
        );
        staffProfileIds.add(profileId);
      }
      const roleId = context.string(
        profile.roleId,
        `${profilePath}.roleId`,
        { identifier: true },
      );
      context.check(
        roleId !== null && roleIds.has(roleId),
        "UNKNOWN_ROLE_REFERENCE",
        `${profilePath}.roleId`,
        "must reference a role in this scenario",
      );
      const organizationId = context.string(
        profile.organizationId,
        `${profilePath}.organizationId`,
        { identifier: true },
      );
      context.check(
        organizationId !== null && organizationIds.has(organizationId),
        "UNKNOWN_ORGANIZATION_REFERENCE",
        `${profilePath}.organizationId`,
        "must reference an organization in this scenario",
      );
      const portraitAssetId = context.string(
        profile.portraitAssetId,
        `${profilePath}.portraitAssetId`,
        { identifier: true },
      );
      context.check(
        portraitAssetId !== null &&
          imagePurposesByAssetId.get(portraitAssetId) ===
            "STAFF_PORTRAIT",
        "UNKNOWN_PORTRAIT_ASSET_REFERENCE",
        `${profilePath}.portraitAssetId`,
        "must reference a STAFF_PORTRAIT image asset in this pack",
      );
      validateLocalizedText(
        context,
        profile.displayName,
        `${profilePath}.displayName`,
        supportedLocales,
      );
      validateLocalizedText(
        context,
        profile.roleTitle,
        `${profilePath}.roleTitle`,
        supportedLocales,
      );
      validateLocalizedText(
        context,
        profile.portraitAlt,
        `${profilePath}.portraitAlt`,
        supportedLocales,
      );
      if (profile.shortProfile !== undefined) {
        validateLocalizedText(
          context,
          profile.shortProfile,
          `${profilePath}.shortProfile`,
          supportedLocales,
        );
      }
      if (profile.professionalResponsibility !== undefined) {
        validateLocalizedText(
          context,
          profile.professionalResponsibility,
          `${profilePath}.professionalResponsibility`,
          supportedLocales,
        );
      }
      context.check(
        profile.visibility === "LEARNER_VISIBLE" ||
          profile.visibility === "INSTRUCTOR_ONLY",
        "INVALID_STAFF_VISIBILITY",
        `${profilePath}.visibility`,
        "must be learner-visible or instructor-only",
      );
      context.check(
        profile.fictional === true,
        "STAFF_PROFILE_MUST_BE_FICTIONAL",
        `${profilePath}.fictional`,
        "must explicitly declare a fictional person",
      );
    });
  }

  const assetTypes = context.array(
    scenario.assetTypes,
    `${path}.assetTypes`,
  );
  if (assetTypes !== null) {
    const assetTypeIds = new Set<string>();
    assetTypes.forEach((assetTypeValue, assetTypeIndex) => {
      const assetTypePath =
        `${path}.assetTypes[${String(assetTypeIndex)}]`;
      const assetType = context.object(assetTypeValue, assetTypePath);
      if (assetType === null) return;
      context.allowedKeys(
        assetType,
        ["assetTypeId", "displayName", "schema"],
        assetTypePath,
      );
      const assetTypeId = context.string(
        assetType.assetTypeId,
        `${assetTypePath}.assetTypeId`,
        { identifier: true },
      );
      if (assetTypeId !== null) {
        context.check(
          !assetTypeIds.has(assetTypeId),
          "DUPLICATE_ASSET_TYPE_ID",
          `${assetTypePath}.assetTypeId`,
          "must be unique within the scenario",
        );
        assetTypeIds.add(assetTypeId);
      }
      validateLocalizedText(
        context,
        assetType.displayName,
        `${assetTypePath}.displayName`,
        supportedLocales,
      );
      validateJsonData(context, assetType.schema, `${assetTypePath}.schema`);
    });
  }

  const actualStateKeys = new Set<string>();
  const initialState = context.object(
    scenario.initialState,
    `${path}.initialState`,
  );
  if (initialState !== null) {
    context.allowedKeys(
      initialState,
      [
        "actualState",
        "businessState",
        "ledgerState",
        "informationState",
      ],
      `${path}.initialState`,
    );
    for (const stateName of [
      "actualState",
      "businessState",
      "ledgerState",
      "informationState",
    ]) {
      const state = context.object(
        initialState[stateName],
        `${path}.initialState.${stateName}`,
      );
      if (state !== null) {
        if (stateName === "actualState") {
          Object.keys(state).forEach((key) =>
            actualStateKeys.add(key),
          );
        }
        validateJsonData(
          context,
          state,
          `${path}.initialState.${stateName}`,
        );
      }
    }
  }

  const policyIds = new Set<string>();
  const policies = context.array(scenario.policies, `${path}.policies`);
  if (policies !== null) {
    policies.forEach((policyValue, policyIndex) => {
      const policyPath = `${path}.policies[${String(policyIndex)}]`;
      const policy = context.object(policyValue, policyPath);
      if (policy === null) return;
      context.allowedKeys(
        policy,
        [
          "policyId",
          "policyType",
          "title",
          "learnerStatement",
          "configuration",
        ],
        policyPath,
      );
      const policyId = context.string(
        policy.policyId,
        `${policyPath}.policyId`,
        { identifier: true },
      );
      if (policyId !== null) {
        context.check(
          !policyIds.has(policyId),
          "DUPLICATE_POLICY_ID",
          `${policyPath}.policyId`,
          "must be unique within the scenario",
        );
        policyIds.add(policyId);
      }
      context.check(
        policy.policyType === "AUTHORIZATION" ||
          policy.policyType === "BUSINESS_RULE" ||
          policy.policyType === "RUNTIME_POLICY",
        "INVALID_POLICY_TYPE",
        `${policyPath}.policyType`,
        "must use a supported declarative policy type",
      );
      validateLocalizedText(
        context,
        policy.title,
        `${policyPath}.title`,
        supportedLocales,
      );
      validateLocalizedText(
        context,
        policy.learnerStatement,
        `${policyPath}.learnerStatement`,
        supportedLocales,
      );
      validateJsonData(
        context,
        policy.configuration,
        `${policyPath}.configuration`,
      );
    });
  }

  const evidenceIds = new Set<string>();
  const evidenceItems = context.array(
    scenario.evidenceItems,
    `${path}.evidenceItems`,
  );
  if (evidenceItems !== null) {
    evidenceItems.forEach((evidenceValue, evidenceIndex) => {
      const evidencePath =
        `${path}.evidenceItems[${String(evidenceIndex)}]`;
      const evidence = context.object(evidenceValue, evidencePath);
      if (evidence === null) return;
      context.allowedKeys(
        evidence,
        [
          "evidenceId",
          "evidenceType",
          "title",
          "sourceOrganizationId",
          "staffProfileId",
          "visibleToRoleIds",
          "learnerMetadata",
          "assessmentMetadata",
          "learnerPresentation",
          "image",
          "content",
        ],
        evidencePath,
      );
      const evidenceId = context.string(
        evidence.evidenceId,
        `${evidencePath}.evidenceId`,
        { identifier: true },
      );
      if (evidenceId !== null) {
        context.check(
          !evidenceIds.has(evidenceId),
          "DUPLICATE_EVIDENCE_ID",
          `${evidencePath}.evidenceId`,
          "must be unique within the scenario",
        );
        evidenceIds.add(evidenceId);
      }
      context.string(
        evidence.evidenceType,
        `${evidencePath}.evidenceType`,
        { identifier: true },
      );
      validateLocalizedText(
        context,
        evidence.title,
        `${evidencePath}.title`,
        supportedLocales,
      );
      const sourceOrganizationId = context.string(
        evidence.sourceOrganizationId,
        `${evidencePath}.sourceOrganizationId`,
        { identifier: true },
      );
      if (sourceOrganizationId !== null) {
        context.check(
          organizationIds.has(sourceOrganizationId),
          "UNKNOWN_ORGANIZATION_REFERENCE",
          `${evidencePath}.sourceOrganizationId`,
          "must reference an organization in this scenario",
        );
      }
      if (evidence.staffProfileId !== undefined) {
        const staffProfileId = context.string(
          evidence.staffProfileId,
          `${evidencePath}.staffProfileId`,
          { identifier: true },
        );
        context.check(
          staffProfileId !== null && staffProfileIds.has(staffProfileId),
          "UNKNOWN_STAFF_PROFILE_REFERENCE",
          `${evidencePath}.staffProfileId`,
          "must reference a staff profile in this scenario",
        );
      }
      validateUniqueStrings(
        context,
        evidence.visibleToRoleIds,
        `${evidencePath}.visibleToRoleIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((roleId, roleIndex) => {
        context.check(
          roleIds.has(roleId),
          "UNKNOWN_ROLE_REFERENCE",
          `${evidencePath}.visibleToRoleIds[${String(roleIndex)}]`,
          "must reference a role in this scenario",
        );
      });
      validateEvidenceLearnerMetadata(
        context,
        evidence.learnerMetadata,
        `${evidencePath}.learnerMetadata`,
        organizationIds,
        policyIds,
      );
      validateEvidenceAssessmentMetadata(
        context,
        evidence.assessmentMetadata,
        `${evidencePath}.assessmentMetadata`,
        actualStateKeys,
      );
      const learnerPresentation =
        evidence.learnerPresentation === undefined
          ? null
          : context.object(
              evidence.learnerPresentation,
              `${evidencePath}.learnerPresentation`,
            );
      if (
        scenario.hostedRuntime === undefined &&
        scenario.auditCase === undefined
      ) {
        context.check(
          learnerPresentation !== null,
          "GENERIC_EVIDENCE_PRESENTATION_REQUIRED",
          `${evidencePath}.learnerPresentation`,
          "is required so the generic learner runtime never exposes raw scenario data",
        );
      }
      if (learnerPresentation !== null) {
        const presentationPath =
          `${evidencePath}.learnerPresentation`;
        context.allowedKeys(
          learnerPresentation,
          ["summary", "fields"],
          presentationPath,
        );
        if (learnerPresentation.summary !== undefined) {
          validateLocalizedText(
            context,
            learnerPresentation.summary,
            `${presentationPath}.summary`,
            supportedLocales,
          );
        }
        const fields = context.array(
          learnerPresentation.fields,
          `${presentationPath}.fields`,
        );
        const presentedPaths = new Set<string>();
        if (fields !== null) {
          context.check(
            fields.length > 0,
            "EMPTY_EVIDENCE_PRESENTATION",
            `${presentationPath}.fields`,
            "must present at least one learner-visible fact",
          );
          fields.forEach((fieldValue, fieldIndex) => {
            const fieldPath =
              `${presentationPath}.fields[${String(fieldIndex)}]`;
            const field = context.object(fieldValue, fieldPath);
            if (field === null) return;
            context.allowedKeys(
              field,
              [
                "fieldPath",
                "label",
                "valueType",
                "unit",
                "valueLabels",
              ],
              fieldPath,
            );
            let resolvedContentValue: unknown;
            const contentPath = context.string(
              field.fieldPath,
              `${fieldPath}.fieldPath`,
            );
            if (contentPath !== null) {
              context.check(
                FIELD_PATH.test(contentPath),
                "INVALID_FIELD_PATH",
                `${fieldPath}.fieldPath`,
                "must be a safe dotted field path",
              );
              context.check(
                !presentedPaths.has(contentPath),
                "DUPLICATE_EVIDENCE_PRESENTATION_FIELD",
                `${fieldPath}.fieldPath`,
                "must be unique within the evidence presentation",
              );
              presentedPaths.add(contentPath);
              let value: unknown = evidence.content;
              for (const segment of contentPath.split(".")) {
                value =
                  isJsonObject(value) && segment in value
                    ? value[segment]
                    : undefined;
              }
              resolvedContentValue = value;
              context.check(
                value !== undefined &&
                  (typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean" ||
                    (Array.isArray(value) &&
                      value.every(
                        (item) =>
                          typeof item === "string" ||
                          typeof item === "number" ||
                          typeof item === "boolean",
                      ))),
                "INVALID_EVIDENCE_PRESENTATION_PATH",
                `${fieldPath}.fieldPath`,
                "must resolve to a learner-presentable scalar or scalar list",
              );
            }
            validateLocalizedText(
              context,
              field.label,
              `${fieldPath}.label`,
              supportedLocales,
            );
            context.check(
              typeof field.valueType === "string" &&
                [
                  "TEXT",
                  "NUMBER",
                  "BOOLEAN",
                  "DATE_TIME",
                  "TEMPERATURE_C",
                  "PERCENT",
                  "RATE_PER_MINUTE",
                  "TEXT_LIST",
                ].includes(field.valueType),
              "INVALID_EVIDENCE_PRESENTATION_TYPE",
              `${fieldPath}.valueType`,
              "must use a supported learner presentation type",
            );
            if (field.unit !== undefined) {
              validateLocalizedText(
                context,
                field.unit,
                `${fieldPath}.unit`,
                supportedLocales,
              );
            }
            if (field.valueLabels !== undefined) {
              const labels = context.object(
                field.valueLabels,
                `${fieldPath}.valueLabels`,
              );
              if (labels !== null) {
                context.check(
                  Object.keys(labels).length > 0,
                  "EMPTY_EVIDENCE_VALUE_LABELS",
                  `${fieldPath}.valueLabels`,
                  "must contain at least one authored value label",
                );
                Object.entries(labels).forEach(
                  ([valueKey, label]) => {
                    validateLocalizedText(
                      context,
                      label,
                      `${fieldPath}.valueLabels.${valueKey}`,
                      supportedLocales,
                    );
                  },
                );
              }
            }
            const identifierLikeValues =
              typeof resolvedContentValue === "string"
                ? [resolvedContentValue]
                : Array.isArray(resolvedContentValue)
                  ? resolvedContentValue.filter(
                      (value): value is string =>
                        typeof value === "string",
                    )
                  : [];
            identifierLikeValues
              .filter((value) =>
                /^[A-Z][A-Z0-9_:-]+$/u.test(value),
              )
              .forEach((value) => {
              context.check(
                isJsonObject(field.valueLabels) &&
                    field.valueLabels[value] !== undefined,
                "UNLABELLED_EVIDENCE_ENUM",
                `${fieldPath}.valueLabels`,
                  `must provide a localized learner label for the identifier-like evidence value ${value}`,
              );
              });
          });
        }
        if (isJsonObject(evidence.content)) {
          learnerPresentableContentPaths(evidence.content).forEach(
            (contentPath) => {
              context.check(
                presentedPaths.has(contentPath),
                "UNPRESENTED_EVIDENCE_CONTENT",
                `${presentationPath}.fields`,
                `must present the learner-visible content field ${contentPath}`,
              );
            },
          );
        }
      }
      if (evidence.image !== undefined) {
        validateImageReference(
          context,
          evidence.image,
          `${evidencePath}.image`,
          supportedLocales,
          imagePurposesByAssetId,
          "EVIDENCE_IMAGE",
        );
      }
      validateJsonData(
        context,
        evidence.content,
        `${evidencePath}.content`,
      );
    });
  }

  validateUniqueStrings(
    context,
    scenario.rubricIds,
    `${path}.rubricIds`,
    { minimumItems: 1, identifiers: true },
  ).forEach((rubricId, rubricIndex) => {
    context.check(
      rubricIds.has(rubricId),
      "UNKNOWN_RUBRIC_REFERENCE",
      `${path}.rubricIds[${String(rubricIndex)}]`,
      "must reference a rubric defined by this pack",
    );
  });
  validateUniqueStrings(
    context,
    scenario.evidenceRuleIds,
    `${path}.evidenceRuleIds`,
    { minimumItems: 1, identifiers: true },
  ).forEach((evidenceRuleId, evidenceRuleIndex) => {
    context.check(
      evidenceRuleIds.has(evidenceRuleId),
      "UNKNOWN_EVIDENCE_RULE_REFERENCE",
      `${path}.evidenceRuleIds[${String(evidenceRuleIndex)}]`,
      "must reference an evidence rule defined by this pack",
    );
  });

  const counterfactualDimensionIds =
    validateCounterfactualComparisonDimensions(
      context,
      scenario.counterfactualComparisonDimensions,
      `${path}.counterfactualComparisonDimensions`,
      supportedLocales,
    );
  const counterfactualMetricIds = new Set(
    (Array.isArray(scenario.counterfactualComparisonDimensions)
      ? scenario.counterfactualComparisonDimensions
      : []
    ).flatMap((dimension) => {
      if (!isJsonObject(dimension)) return [];
      const evaluation = dimension.evaluation;
      return isJsonObject(evaluation) &&
        typeof evaluation.metricId === "string"
        ? [evaluation.metricId]
        : [];
    }),
  );
  validateInstructorIncidents(
    context,
    scenario.instructorIncidents,
    `${path}.instructorIncidents`,
    supportedLocales,
    roleIds,
    evidenceIds,
    new Set(
      (Array.isArray(scenario.nodes) ? scenario.nodes : []).flatMap(
        (node) =>
          isJsonObject(node) && typeof node.nodeId === "string"
            ? [node.nodeId]
            : [],
      ),
    ),
    counterfactualMetricIds,
  );
  validateCounterfactualConditions(
    context,
    scenario,
    path,
    supportedLocales,
    counterfactualDimensionIds,
  );
  validateScenarioNodes(
    context,
    scenario,
    path,
    supportedLocales,
    evidenceIds,
    policyIds,
    roleIds,
    counterfactualDimensionIds,
    counterfactualMetricIds,
    outcomeCodesByRandomStream,
    imagePurposesByAssetId,
  );
  if (
    scenario.hostedRuntime === undefined &&
    scenario.auditCase === undefined
  ) {
    const authoredNodes = Array.isArray(scenario.nodes)
      ? scenario.nodes.filter(isJsonObject)
      : [];
    const decisionNodes = authoredNodes.filter(
      (node) => node.nodeType === "DECISION",
    );
    const scoreDisplayEnabled =
      Array.isArray(scenario.modeConfigurations) &&
      scenario.modeConfigurations.some(
        (configuration) =>
          isJsonObject(configuration) &&
          configuration.showScores === true,
      );
    if (scoreDisplayEnabled) {
      const assessedDecisions = decisionNodes.filter((node) =>
        isJsonObject(node.assessment),
      );
      context.check(
        assessedDecisions.length === decisionNodes.length &&
          decisionNodes.length > 0,
        "SCORE_DISPLAY_WITHOUT_COMPLETE_ASSESSMENT",
        `${path}.modeConfigurations`,
        "may show scores only when every generic decision has an authored assessment",
      );
      const total = assessedDecisions.reduce((sum, node) => {
        const assessment = node.assessment;
        return (
          sum +
          (isJsonObject(assessment) &&
          typeof assessment.maximumPoints === "number"
            ? assessment.maximumPoints
            : 0)
        );
      }, 0);
      context.check(
        total === 100,
        "INVALID_GENERIC_SCORE_TOTAL",
        `${path}.nodes`,
        "generic decision assessments must award exactly 100 points when scores are shown",
      );
      const decisionItemIds = assessedDecisions.flatMap((node) => {
        const assessment = node.assessment;
        return isJsonObject(assessment) &&
          typeof assessment.decisionItemId === "string"
          ? [assessment.decisionItemId]
          : [];
      });
      context.check(
        new Set(decisionItemIds).size === decisionItemIds.length,
        "DUPLICATE_GENERIC_DECISION_ITEM",
        `${path}.nodes`,
        "generic decision item identifiers must be unique",
      );
    }

    for (const node of authoredNodes) {
      if (node.nodeType === "COMPLETION") {
        context.check(
          isJsonObject(node.message),
          "GENERIC_COMPLETION_MESSAGE_REQUIRED",
          `${path}.nodes.${String(node.nodeId)}.message`,
          "is required so a generic run ends with an authored learner debrief",
        );
      }
      if (node.nodeType === "STOCHASTIC_EVENT") {
        const outcomes = Array.isArray(node.outcomes)
          ? node.outcomes.filter(isJsonObject)
          : [];
        outcomes.forEach((outcome, outcomeIndex) => {
          context.check(
            isJsonObject(outcome.label),
            "GENERIC_STOCHASTIC_OUTCOME_LABEL_REQUIRED",
            `${path}.nodes.${String(node.nodeId)}.outcomes[${String(outcomeIndex)}].label`,
            "is required so the learner debrief explains the realized outcome without exposing an internal result code",
          );
        });
      }
      if (node.nodeType !== "ENDORSEMENT") continue;
      const policy = (
        Array.isArray(scenario.policies)
          ? scenario.policies.filter(isJsonObject)
          : []
      ).find((candidate) => candidate.policyId === node.policyId);
      const configuration = isJsonObject(policy?.configuration)
        ? policy.configuration
        : {};
      const requiredRoles = Array.isArray(
        configuration.requiredEndorsementRoleIds,
      )
        ? configuration.requiredEndorsementRoleIds.filter(
            (roleId): roleId is string =>
              typeof roleId === "string",
          )
        : [];
      const permittedRoles = Array.isArray(node.permittedRoleIds)
        ? node.permittedRoleIds
        : [];
      requiredRoles.forEach((roleId, roleIndex) => {
        context.check(
          permittedRoles.includes(roleId),
          "UNREACHABLE_REQUIRED_ENDORSER",
          `${path}.nodes.${String(node.nodeId)}.permittedRoleIds[${String(roleIndex)}]`,
          "must permit every role required by the endorsement policy",
        );
      });
      const minimum = configuration.minimumEndorsements;
      if (typeof minimum === "number") {
        context.check(
          minimum <= new Set(permittedRoles).size,
          "UNREACHABLE_ENDORSEMENT_THRESHOLD",
          `${path}.nodes.${String(node.nodeId)}.permittedRoleIds`,
          "must expose enough distinct roles to satisfy the endorsement threshold",
        );
      }
    }
  }
  validateEvidenceRequestReachability(context, scenario, path);
  validateAuditCase(
    context,
    scenario,
    path,
    supportedLocales,
    organizationIds,
    evidenceIds,
    policyIds,
    indicatorIds,
  );
  validateHostedRuntime(context, scenario, path, schemaVersion);
}

function validateAuditCase(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
  supportedLocales: readonly string[],
  organizationIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
  policyIds: ReadonlySet<string>,
  indicatorIds: ReadonlySet<string>,
): void {
  if (scenario.auditCase === undefined) return;
  const casePath = `${path}.auditCase`;
  const auditCase = context.object(scenario.auditCase, casePath);
  if (auditCase === null) return;
  context.allowedKeys(
    auditCase,
    [
      "schemaVersion",
      "auditCaseId",
      "version",
      "sourceProcessId",
      "sourceProcessVersion",
      "auditObjective",
      "scope",
      "categories",
      "entities",
      "rootCauses",
      "recommendations",
      "hints",
      "conclusionCategories",
      "expectedConclusionCategory",
      "sourceRecords",
      "evidenceItemIds",
      "policyIds",
      "findingDefinitions",
      "decoyDefinitions",
      "scoringBlueprint",
      "supportProfiles",
      "inputLimits",
      "completionDefinition",
    ],
    casePath,
  );
  context.check(
    auditCase.schemaVersion === "3.0.0",
    "INVALID_AUDIT_CASE_SCHEMA",
    `${casePath}.schemaVersion`,
    "must equal 3.0.0",
  );
  for (const key of ["auditCaseId", "sourceProcessId"] as const) {
    context.string(auditCase[key], `${casePath}.${key}`, {
      identifier: true,
    });
  }
  for (const key of ["version", "sourceProcessVersion"] as const) {
    context.string(auditCase[key], `${casePath}.${key}`, {
      semanticVersion: true,
    });
  }
  validateLocalizedText(
    context,
    auditCase.auditObjective,
    `${casePath}.auditObjective`,
    supportedLocales,
  );

  const scope = context.object(auditCase.scope, `${casePath}.scope`);
  if (scope !== null) {
    context.allowedKeys(
      scope,
      [
        "title",
        "periodStart",
        "periodEnd",
        "organizationIds",
        "entityIds",
      ],
      `${casePath}.scope`,
    );
    validateLocalizedText(
      context,
      scope.title,
      `${casePath}.scope.title`,
      supportedLocales,
    );
    const periodStart = context.string(
      scope.periodStart,
      `${casePath}.scope.periodStart`,
    );
    const periodEnd = context.string(
      scope.periodEnd,
      `${casePath}.scope.periodEnd`,
    );
    context.check(
      periodStart !== null &&
        periodEnd !== null &&
        Number.isFinite(Date.parse(periodStart)) &&
        Number.isFinite(Date.parse(periodEnd)) &&
        Date.parse(periodStart) <= Date.parse(periodEnd),
      "INVALID_AUDIT_PERIOD",
      `${casePath}.scope`,
      "must contain an ordered pair of ISO timestamps",
    );
    validateUniqueStrings(
      context,
      scope.organizationIds,
      `${casePath}.scope.organizationIds`,
      { minimumItems: 1, identifiers: true },
    ).forEach((organizationId, index) => {
      context.check(
        organizationIds.has(organizationId),
        "UNKNOWN_ORGANIZATION_REFERENCE",
        `${casePath}.scope.organizationIds[${String(index)}]`,
        "must reference an organization in this scenario",
      );
    });
    validateUniqueStrings(
      context,
      scope.entityIds,
      `${casePath}.scope.entityIds`,
      { minimumItems: 1, identifiers: true },
    );
  }

  const choiceIdsByField = new Map<string, Set<string>>();
  for (const field of [
    "categories",
    "entities",
    "rootCauses",
    "recommendations",
  ] as const) {
    const values = context.array(
      auditCase[field],
      `${casePath}.${field}`,
    );
    const choiceIds = new Set<string>();
    choiceIdsByField.set(field, choiceIds);
    if (values === null) continue;
    context.check(
      values.length > 0,
      "EMPTY_AUDIT_CHOICE_SET",
      `${casePath}.${field}`,
      "must contain at least one authored choice",
    );
    values.forEach((value, index) => {
      const choicePath = `${casePath}.${field}[${String(index)}]`;
      const choice = context.object(value, choicePath);
      if (choice === null) return;
      context.allowedKeys(choice, ["choiceId", "label"], choicePath);
      const choiceId = context.string(
        choice.choiceId,
        `${choicePath}.choiceId`,
        { identifier: true },
      );
      if (choiceId !== null) {
        context.check(
          !choiceIds.has(choiceId),
          "DUPLICATE_AUDIT_CHOICE",
          `${choicePath}.choiceId`,
          "must be unique within its choice set",
        );
        choiceIds.add(choiceId);
      }
      validateLocalizedText(
        context,
        choice.label,
        `${choicePath}.label`,
        supportedLocales,
      );
    });
  }
  const hintIds = new Set<string>();
  const hints = context.array(
    auditCase.hints,
    `${casePath}.hints`,
  );
  if (hints !== null) {
    context.check(
      hints.length > 0 && hints.length <= 6,
      "INVALID_AUDIT_HINTS",
      `${casePath}.hints`,
      "must contain from one to six authored hints",
    );
    hints.forEach((value, index) => {
      const hintPath = `${casePath}.hints[${String(index)}]`;
      const hint = context.object(value, hintPath);
      if (hint === null) return;
      context.allowedKeys(hint, ["hintId", "text"], hintPath);
      const hintId = context.string(
        hint.hintId,
        `${hintPath}.hintId`,
        { identifier: true },
      );
      if (hintId !== null) {
        context.check(
          !hintIds.has(hintId),
          "DUPLICATE_AUDIT_HINT",
          `${hintPath}.hintId`,
          "must be unique",
        );
        hintIds.add(hintId);
      }
      validateLocalizedText(
        context,
        hint.text,
        `${hintPath}.text`,
        supportedLocales,
      );
    });
  }

  const conclusionCategories = context.array(
    auditCase.conclusionCategories,
    `${casePath}.conclusionCategories`,
  );
  const conclusionCategoryIds = new Set<string>();
  if (conclusionCategories !== null) {
    conclusionCategories.forEach((value, index) => {
      const categoryPath =
        `${casePath}.conclusionCategories[${String(index)}]`;
      const category = context.object(value, categoryPath);
      if (category === null) return;
      context.allowedKeys(
        category,
        ["conclusionCategory", "label"],
        categoryPath,
      );
      const categoryId = context.string(
        category.conclusionCategory,
        `${categoryPath}.conclusionCategory`,
      );
      if (categoryId !== null) {
        context.check(
          AUDIT_CONCLUSION_CATEGORIES.has(categoryId),
          "INVALID_AUDIT_CONCLUSION_CATEGORY",
          `${categoryPath}.conclusionCategory`,
          "must be a supported audit conclusion category",
        );
        context.check(
          !conclusionCategoryIds.has(categoryId),
          "DUPLICATE_AUDIT_CONCLUSION_CATEGORY",
          `${categoryPath}.conclusionCategory`,
          "must be unique",
        );
        conclusionCategoryIds.add(categoryId);
      }
      validateLocalizedText(
        context,
        category.label,
        `${categoryPath}.label`,
        supportedLocales,
      );
    });
  }
  context.check(
    typeof auditCase.expectedConclusionCategory === "string" &&
      conclusionCategoryIds.has(
        auditCase.expectedConclusionCategory,
      ),
    "UNKNOWN_EXPECTED_AUDIT_CONCLUSION",
    `${casePath}.expectedConclusionCategory`,
    "must reference an authored conclusion category",
  );

  const authoredEvidenceIds = new Set(
    validateUniqueStrings(
      context,
      auditCase.evidenceItemIds,
      `${casePath}.evidenceItemIds`,
      { minimumItems: 1, identifiers: true },
    ),
  );
  for (const evidenceId of authoredEvidenceIds) {
    context.check(
      evidenceIds.has(evidenceId),
      "UNKNOWN_EVIDENCE_REFERENCE",
      `${casePath}.evidenceItemIds`,
      `references unknown evidence ${evidenceId}`,
    );
  }
  const authoredPolicyIds = new Set(
    validateUniqueStrings(
      context,
      auditCase.policyIds,
      `${casePath}.policyIds`,
      { minimumItems: 1, identifiers: true },
    ),
  );
  for (const policyId of authoredPolicyIds) {
    context.check(
      policyIds.has(policyId),
      "UNKNOWN_POLICY_REFERENCE",
      `${casePath}.policyIds`,
      `references unknown policy ${policyId}`,
    );
  }

  const sourceRecords = context.array(
    auditCase.sourceRecords,
    `${casePath}.sourceRecords`,
  );
  const sourceRecordIds = new Set<string>();
  if (sourceRecords !== null) {
    context.check(
      sourceRecords.length > 0,
      "AUDIT_CASE_WITHOUT_SOURCE_RECORDS",
      `${casePath}.sourceRecords`,
      "must contain immutable source records",
    );
    sourceRecords.forEach((value, index) => {
      const recordPath =
        `${casePath}.sourceRecords[${String(index)}]`;
      const record = context.object(value, recordPath);
      if (record === null) return;
      context.allowedKeys(
        record,
        [
          "sourceRecordId",
          "recordKind",
          "title",
          "occurredAt",
          "organizationId",
          "entityIds",
          "evidenceIds",
          "policyIds",
          "details",
        ],
        recordPath,
      );
      const recordId = context.string(
        record.sourceRecordId,
        `${recordPath}.sourceRecordId`,
        { identifier: true },
      );
      if (recordId !== null) {
        context.check(
          !sourceRecordIds.has(recordId),
          "DUPLICATE_AUDIT_SOURCE_RECORD",
          `${recordPath}.sourceRecordId`,
          "must be unique",
        );
        sourceRecordIds.add(recordId);
      }
      context.check(
        typeof record.recordKind === "string" &&
          AUDIT_SOURCE_RECORD_KINDS.has(record.recordKind),
        "INVALID_AUDIT_SOURCE_RECORD_KIND",
        `${recordPath}.recordKind`,
        "must be a supported immutable source-record kind",
      );
      validateLocalizedText(
        context,
        record.title,
        `${recordPath}.title`,
        supportedLocales,
      );
      const occurredAt = context.string(
        record.occurredAt,
        `${recordPath}.occurredAt`,
      );
      context.check(
        occurredAt !== null &&
          Number.isFinite(Date.parse(occurredAt)),
        "INVALID_TIMESTAMP",
        `${recordPath}.occurredAt`,
        "must be an ISO timestamp",
      );
      const organizationId = context.string(
        record.organizationId,
        `${recordPath}.organizationId`,
        { identifier: true },
      );
      context.check(
        organizationId !== null &&
          organizationIds.has(organizationId),
        "UNKNOWN_ORGANIZATION_REFERENCE",
        `${recordPath}.organizationId`,
        "must reference an organization in this scenario",
      );
      validateUniqueStrings(
        context,
        record.entityIds,
        `${recordPath}.entityIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((entityId, entityIndex) => {
        context.check(
          choiceIdsByField.get("entities")?.has(entityId) ?? false,
          "UNKNOWN_AUDIT_ENTITY",
          `${recordPath}.entityIds[${String(entityIndex)}]`,
          "must reference an authored audit entity",
        );
      });
      validateUniqueStrings(
        context,
        record.evidenceIds,
        `${recordPath}.evidenceIds`,
        { identifiers: true },
      ).forEach((evidenceId, evidenceIndex) => {
        context.check(
          authoredEvidenceIds.has(evidenceId),
          "UNKNOWN_EVIDENCE_REFERENCE",
          `${recordPath}.evidenceIds[${String(evidenceIndex)}]`,
          "must reference evidence in the audit case",
        );
      });
      validateUniqueStrings(
        context,
        record.policyIds,
        `${recordPath}.policyIds`,
        { identifiers: true },
      ).forEach((policyId, policyIndex) => {
        context.check(
          authoredPolicyIds.has(policyId),
          "UNKNOWN_POLICY_REFERENCE",
          `${recordPath}.policyIds[${String(policyIndex)}]`,
          "must reference a policy in the audit case",
        );
      });
      context.object(record.details, `${recordPath}.details`);
    });
  }

  const findingDefinitionIds = new Set<string>();
  const findingKeys = new Set<string>();
  const findingDefinitions = context.array(
    auditCase.findingDefinitions,
    `${casePath}.findingDefinitions`,
  );
  if (findingDefinitions !== null) {
    context.check(
      findingDefinitions.length > 0,
      "AUDIT_CASE_WITHOUT_FINDINGS",
      `${casePath}.findingDefinitions`,
      "must contain at least one authored true finding",
    );
    findingDefinitions.forEach((value, index) => {
      const findingPath =
        `${casePath}.findingDefinitions[${String(index)}]`;
      const finding = context.object(value, findingPath);
      if (finding === null) return;
      context.allowedKeys(
        finding,
        [
          "findingDefinitionId",
          "categoryId",
          "entityId",
          "title",
          "explanation",
          "requiredEvidenceIds",
          "applicablePolicyIds",
          "expectedSeverity",
          "expectedMateriality",
          "acceptableRootCauseCodes",
          "acceptableRecommendationCodes",
          "competencyIndicatorIds",
        ],
        findingPath,
      );
      const findingDefinitionId = context.string(
        finding.findingDefinitionId,
        `${findingPath}.findingDefinitionId`,
        { identifier: true },
      );
      if (findingDefinitionId !== null) {
        context.check(
          !findingDefinitionIds.has(findingDefinitionId),
          "DUPLICATE_AUDIT_FINDING_ID",
          `${findingPath}.findingDefinitionId`,
          "must be unique within the Audit case",
        );
        findingDefinitionIds.add(findingDefinitionId);
      }
      const categoryId = context.string(
        finding.categoryId,
        `${findingPath}.categoryId`,
        { identifier: true },
      );
      const entityId = context.string(
        finding.entityId,
        `${findingPath}.entityId`,
        { identifier: true },
      );
      context.check(
        categoryId !== null &&
          (choiceIdsByField.get("categories")?.has(categoryId) ??
            false),
        "UNKNOWN_AUDIT_CATEGORY",
        `${findingPath}.categoryId`,
        "must reference an authored audit category",
      );
      context.check(
        entityId !== null &&
          (choiceIdsByField.get("entities")?.has(entityId) ?? false),
        "UNKNOWN_AUDIT_ENTITY",
        `${findingPath}.entityId`,
        "must reference an authored audit entity",
      );
      if (categoryId !== null && entityId !== null) {
        const key = `${categoryId}\u0000${entityId}`;
        context.check(
          !findingKeys.has(key),
          "AMBIGUOUS_AUDIT_FINDING",
          findingPath,
          "must use a unique category and entity pair",
        );
        findingKeys.add(key);
      }
      validateLocalizedText(
        context,
        finding.title,
        `${findingPath}.title`,
        supportedLocales,
      );
      validateLocalizedText(
        context,
        finding.explanation,
        `${findingPath}.explanation`,
        supportedLocales,
      );
      validateUniqueStrings(
        context,
        finding.requiredEvidenceIds,
        `${findingPath}.requiredEvidenceIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((evidenceId, evidenceIndex) => {
        context.check(
          authoredEvidenceIds.has(evidenceId),
          "INSUFFICIENT_AUDIT_FINDING_EVIDENCE",
          `${findingPath}.requiredEvidenceIds[${String(evidenceIndex)}]`,
          "must reference evidence included in the audit case",
        );
      });
      validateUniqueStrings(
        context,
        finding.applicablePolicyIds,
        `${findingPath}.applicablePolicyIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((policyId, policyIndex) => {
        context.check(
          authoredPolicyIds.has(policyId),
          "UNKNOWN_POLICY_REFERENCE",
          `${findingPath}.applicablePolicyIds[${String(policyIndex)}]`,
          "must reference a policy included in the audit case",
        );
      });
      context.check(
        typeof finding.expectedSeverity === "string" &&
          AUDIT_SEVERITIES.has(finding.expectedSeverity),
        "INVALID_AUDIT_SEVERITY",
        `${findingPath}.expectedSeverity`,
        "must be a supported audit severity",
      );
      context.check(
        typeof finding.expectedMateriality === "string" &&
          AUDIT_MATERIALITIES.has(finding.expectedMateriality),
        "INVALID_AUDIT_MATERIALITY",
        `${findingPath}.expectedMateriality`,
        "must be a supported audit materiality",
      );
      validateUniqueStrings(
        context,
        finding.acceptableRootCauseCodes,
        `${findingPath}.acceptableRootCauseCodes`,
        { minimumItems: 1, identifiers: true },
      ).forEach((choiceId, choiceIndex) => {
        context.check(
          choiceIdsByField.get("rootCauses")?.has(choiceId) ?? false,
          "UNKNOWN_AUDIT_ROOT_CAUSE",
          `${findingPath}.acceptableRootCauseCodes[${String(choiceIndex)}]`,
          "must reference an authored root cause",
        );
      });
      validateUniqueStrings(
        context,
        finding.acceptableRecommendationCodes,
        `${findingPath}.acceptableRecommendationCodes`,
        { minimumItems: 1, identifiers: true },
      ).forEach((choiceId, choiceIndex) => {
        context.check(
          choiceIdsByField.get("recommendations")?.has(choiceId) ??
            false,
          "UNKNOWN_AUDIT_RECOMMENDATION",
          `${findingPath}.acceptableRecommendationCodes[${String(choiceIndex)}]`,
          "must reference an authored recommendation",
        );
      });
      validateUniqueStrings(
        context,
        finding.competencyIndicatorIds,
        `${findingPath}.competencyIndicatorIds`,
        { minimumItems: 1, identifiers: true },
      ).forEach((indicatorId, indicatorIndex) => {
        context.check(
          indicatorIds.has(indicatorId),
          "UNKNOWN_INDICATOR_REFERENCE",
          `${findingPath}.competencyIndicatorIds[${String(indicatorIndex)}]`,
          "must reference an indicator defined by this pack",
        );
      });
    });
  }

  const decoyDefinitionIds = new Set<string>();
  const decoyDefinitions = context.array(
    auditCase.decoyDefinitions,
    `${casePath}.decoyDefinitions`,
  );
  if (decoyDefinitions !== null) {
    context.check(
      decoyDefinitions.length > 0,
      "AUDIT_CASE_WITHOUT_DECOYS",
      `${casePath}.decoyDefinitions`,
      "must include at least one defensible legitimate exception",
    );
    decoyDefinitions.forEach((value, index) => {
      const decoyPath =
        `${casePath}.decoyDefinitions[${String(index)}]`;
      const decoy = context.object(value, decoyPath);
      if (decoy === null) return;
      context.allowedKeys(
        decoy,
        [
          "decoyDefinitionId",
          "categoryId",
          "entityId",
          "explanation",
        ],
        decoyPath,
      );
      const decoyDefinitionId = context.string(
        decoy.decoyDefinitionId,
        `${decoyPath}.decoyDefinitionId`,
        { identifier: true },
      );
      if (decoyDefinitionId !== null) {
        context.check(
          !decoyDefinitionIds.has(decoyDefinitionId),
          "DUPLICATE_AUDIT_DECOY_ID",
          `${decoyPath}.decoyDefinitionId`,
          "must be unique within the Audit case",
        );
        decoyDefinitionIds.add(decoyDefinitionId);
      }
      const categoryId = context.string(
        decoy.categoryId,
        `${decoyPath}.categoryId`,
        { identifier: true },
      );
      const entityId = context.string(
        decoy.entityId,
        `${decoyPath}.entityId`,
        { identifier: true },
      );
      context.check(
        categoryId !== null &&
          (choiceIdsByField.get("categories")?.has(categoryId) ??
            false),
        "UNKNOWN_AUDIT_CATEGORY",
        `${decoyPath}.categoryId`,
        "must reference an authored audit category",
      );
      context.check(
        entityId !== null &&
          (choiceIdsByField.get("entities")?.has(entityId) ?? false),
        "UNKNOWN_AUDIT_ENTITY",
        `${decoyPath}.entityId`,
        "must reference an authored audit entity",
      );
      if (categoryId !== null && entityId !== null) {
        const key = `${categoryId}\u0000${entityId}`;
        context.check(
          !findingKeys.has(key),
          "AMBIGUOUS_AUDIT_FINDING",
          decoyPath,
          "must not overlap a true finding",
        );
        findingKeys.add(key);
      }
      validateLocalizedText(
        context,
        decoy.explanation,
        `${decoyPath}.explanation`,
        supportedLocales,
      );
    });
  }

  const scoring = context.object(
    auditCase.scoringBlueprint,
    `${casePath}.scoringBlueprint`,
  );
  if (scoring !== null) {
    context.allowedKeys(
      scoring,
      [
        "scoringBlueprintId",
        "version",
        "maximumScore",
        "passScore",
        "items",
      ],
      `${casePath}.scoringBlueprint`,
    );
    context.string(
      scoring.scoringBlueprintId,
      `${casePath}.scoringBlueprint.scoringBlueprintId`,
      { identifier: true },
    );
    context.string(
      scoring.version,
      `${casePath}.scoringBlueprint.version`,
      { semanticVersion: true },
    );
    context.check(
      scoring.maximumScore === 100,
      "INVALID_AUDIT_SCORE_TOTAL",
      `${casePath}.scoringBlueprint.maximumScore`,
      "must equal 100",
    );
    context.number(
      scoring.passScore,
      `${casePath}.scoringBlueprint.passScore`,
      { minimum: 0, maximum: 100 },
    );
    const items = context.array(
      scoring.items,
      `${casePath}.scoringBlueprint.items`,
    );
    const itemIds = new Set<string>();
    let maximumTotal = 0;
    if (items !== null) {
      items.forEach((value, index) => {
        const itemPath =
          `${casePath}.scoringBlueprint.items[${String(index)}]`;
        const item = context.object(value, itemPath);
        if (item === null) return;
        context.allowedKeys(
          item,
          ["scorableItemId", "maximumScore"],
          itemPath,
        );
        const itemId = context.string(
          item.scorableItemId,
          `${itemPath}.scorableItemId`,
          { identifier: true },
        );
        const maximum = context.number(
          item.maximumScore,
          `${itemPath}.maximumScore`,
          { integer: true, minimum: 0, maximum: 100 },
        );
        if (itemId !== null) {
          context.check(
            AUDIT_SCORABLE_ITEMS.has(itemId),
            "UNKNOWN_AUDIT_SCORABLE_ITEM",
            `${itemPath}.scorableItemId`,
            "must use the canonical Guided Audit scoring contract",
          );
          context.check(
            !itemIds.has(itemId),
            "DUPLICATE_AUDIT_SCORABLE_ITEM",
            `${itemPath}.scorableItemId`,
            "must be unique",
          );
          itemIds.add(itemId);
          context.check(
            maximum !== null &&
              AUDIT_SCORABLE_ITEMS.get(itemId) === maximum,
            "INVALID_AUDIT_SCORABLE_MAXIMUM",
            `${itemPath}.maximumScore`,
            "must match the canonical Guided Audit allocation",
          );
        }
        if (maximum !== null) maximumTotal += maximum;
      });
    }
    context.check(
      itemIds.size === AUDIT_SCORABLE_ITEMS.size &&
        maximumTotal === 100,
      "INVALID_AUDIT_SCORE_TOTAL",
      `${casePath}.scoringBlueprint.items`,
      "must contain every canonical item exactly once and total 100",
    );
  }

  const supportProfiles = validateUniqueStrings(
    context,
    auditCase.supportProfiles,
    `${casePath}.supportProfiles`,
    { minimumItems: 1 },
  );
  context.check(
    supportProfiles.length === 1 &&
      (supportProfiles[0] === "GUIDED" ||
        supportProfiles[0] === "PRACTICE" ||
        supportProfiles[0] === "CHALLENGE"),
    "INVALID_AUDIT_SUPPORT_PROFILE",
    `${casePath}.supportProfiles`,
    "must contain exactly one Guided, Practice, or Challenge Audit profile",
  );
  const inputLimits = context.object(
    auditCase.inputLimits,
    `${casePath}.inputLimits`,
  );
  if (inputLimits !== null) {
    context.allowedKeys(
      inputLimits,
      [
        "maximumDrafts",
        "maximumDraftRecords",
        "maximumFindingRecords",
        "findingTitleUtf8Bytes",
        "findingObservationUtf8Bytes",
        "findingRecommendationUtf8Bytes",
        "conclusionFieldUtf8Bytes",
        "maximumEvidenceCitationsPerFinding",
        "maximumPolicyCitationsPerFinding",
      ],
      `${casePath}.inputLimits`,
    );
    context.check(
      inputLimits.maximumDrafts === 1,
      "INVALID_AUDIT_INPUT_LIMIT",
      `${casePath}.inputLimits.maximumDrafts`,
      "must equal one compact active draft",
    );
    context.check(
      inputLimits.maximumDraftRecords === 1,
      "INVALID_AUDIT_INPUT_LIMIT",
      `${casePath}.inputLimits.maximumDraftRecords`,
      "must equal one bounded persisted draft record",
    );
    for (const key of [
      "maximumFindingRecords",
      "findingTitleUtf8Bytes",
      "findingObservationUtf8Bytes",
      "findingRecommendationUtf8Bytes",
      "conclusionFieldUtf8Bytes",
      "maximumEvidenceCitationsPerFinding",
      "maximumPolicyCitationsPerFinding",
    ] as const) {
      context.number(
        inputLimits[key],
        `${casePath}.inputLimits.${key}`,
        {
          integer: true,
          minimum:
            key === "maximumFindingRecords" ||
            key.startsWith("maximum")
              ? 1
              : 16,
          maximum:
            key === "maximumFindingRecords"
              ? 12
              : key.startsWith("maximum")
                ? 8
                : 500,
        },
      );
    }
  }
  const completion = context.object(
    auditCase.completionDefinition,
    `${casePath}.completionDefinition`,
  );
  if (completion !== null) {
    context.allowedKeys(
      completion,
      ["maximumSubmittedFindings", "conclusionRequired"],
      `${casePath}.completionDefinition`,
    );
    context.number(
      completion.maximumSubmittedFindings,
      `${casePath}.completionDefinition.maximumSubmittedFindings`,
      { integer: true, minimum: 1, maximum: 12 },
    );
    context.check(
      completion.conclusionRequired === true,
      "INVALID_AUDIT_COMPLETION",
      `${casePath}.completionDefinition.conclusionRequired`,
      "must require an audit conclusion",
    );
  }
}

function validateHostedRuntime(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
  schemaVersion: unknown,
): void {
  if (scenario.hostedRuntime === undefined) return;
  context.check(
    schemaVersion === "2.0.0",
    "HOSTED_RUNTIME_REQUIRES_CURRENT_SCHEMA",
    `${path}.hostedRuntime`,
    "requires scenario-pack schema version 2.0.0",
  );
  const runtime = context.object(
    scenario.hostedRuntime,
    `${path}.hostedRuntime`,
  );
  if (runtime === null) return;
  if (runtime.runtimeId === "tracechain-audit-v1") {
    context.allowedKeys(
      runtime,
      ["runtimeId", "auditCaseId"],
      `${path}.hostedRuntime`,
    );
    const auditCase = context.object(
      scenario.auditCase,
      `${path}.auditCase`,
    );
    const auditCaseId = context.string(
      runtime.auditCaseId,
      `${path}.hostedRuntime.auditCaseId`,
      { identifier: true },
    );
    context.check(
      auditCase !== null &&
        auditCaseId !== null &&
        auditCase.auditCaseId === auditCaseId,
      "AUDIT_RUNTIME_CASE_MISMATCH",
      `${path}.hostedRuntime.auditCaseId`,
      "must reference the scenario's exact audit case",
    );
    return;
  }
  context.allowedKeys(
    runtime,
    [
      "runtimeId",
      "domainScenarioId",
      "domainScenarioVersion",
      "entryStageId",
      "actionBindings",
    ],
    `${path}.hostedRuntime`,
  );
  context.check(
    runtime.runtimeId === "tracechain-coffee-v2",
    "UNKNOWN_HOSTED_RUNTIME",
    `${path}.hostedRuntime.runtimeId`,
    "must name a registered native runtime",
  );
  context.string(
    runtime.domainScenarioId,
    `${path}.hostedRuntime.domainScenarioId`,
    { identifier: true },
  );
  context.string(
    runtime.domainScenarioVersion,
    `${path}.hostedRuntime.domainScenarioVersion`,
    { semanticVersion: true },
  );
  context.string(
    runtime.entryStageId,
    `${path}.hostedRuntime.entryStageId`,
    { identifier: true },
  );
  const nodes = Array.isArray(scenario.nodes)
    ? scenario.nodes.filter(isJsonObject)
    : [];
  const nodeIds = new Set(
    nodes.flatMap((node) =>
      typeof node.nodeId === "string" ? [node.nodeId] : [],
    ),
  );
  const proposalBindingIds = new Set(
    nodes.flatMap((node) =>
      node.nodeType === "TRANSACTION_PROPOSAL" &&
      typeof node.runtimeActionBindingId === "string"
        ? [node.runtimeActionBindingId]
        : [],
    ),
  );
  const bindings = context.array(
    runtime.actionBindings,
    `${path}.hostedRuntime.actionBindings`,
  );
  if (bindings === null) return;
  const bindingIds = new Set<string>();
  bindings.forEach((bindingValue, bindingIndex) => {
    const bindingPath =
      `${path}.hostedRuntime.actionBindings[${String(bindingIndex)}]`;
    const binding = context.object(bindingValue, bindingPath);
    if (binding === null) return;
    context.allowedKeys(
      binding,
      ["bindingId", "nodeId", "commandType", "domainActionId"],
      bindingPath,
    );
    const bindingId = context.string(
      binding.bindingId,
      `${bindingPath}.bindingId`,
      { identifier: true },
    );
    if (bindingId !== null) {
      context.check(
        !bindingIds.has(bindingId),
        "DUPLICATE_RUNTIME_BINDING",
        `${bindingPath}.bindingId`,
        "must be unique",
      );
      bindingIds.add(bindingId);
    }
    const nodeId = context.string(
      binding.nodeId,
      `${bindingPath}.nodeId`,
      { identifier: true },
    );
    if (nodeId !== null) {
      context.check(
        nodeIds.has(nodeId),
        "UNKNOWN_NODE_REFERENCE",
        `${bindingPath}.nodeId`,
        "must reference a node in this scenario",
      );
    }
    context.string(binding.commandType, `${bindingPath}.commandType`, {
      identifier: true,
    });
    context.string(
      binding.domainActionId,
      `${bindingPath}.domainActionId`,
      { identifier: true },
    );
  });
  for (const proposalBindingId of proposalBindingIds) {
    context.check(
      bindingIds.has(proposalBindingId),
      "UNKNOWN_RUNTIME_BINDING",
      `${path}.nodes`,
      `references missing runtime binding ${proposalBindingId}`,
    );
  }
}

function validatePublication(
  context: ValidationContext,
  pack: Readonly<Record<string, unknown>>,
): void {
  const status = pack.status;
  const requiresPublication = status === "published" || status === "retired";
  if (!requiresPublication) {
    context.check(
      pack.publication === undefined,
      "UNEXPECTED_PUBLICATION",
      "$.publication",
      "is only permitted for published or retired packs",
    );
    return;
  }
  const publication = context.object(pack.publication, "$.publication");
  if (publication === null) return;
  context.allowedKeys(
    publication,
    ["contentHash", "publishedAt", "publishedBy"],
    "$.publication",
  );
  const contentHash = context.string(
    publication.contentHash,
    "$.publication.contentHash",
  );
  if (contentHash !== null) {
    context.check(
      SHA256.test(contentHash),
      "INVALID_CONTENT_HASH",
      "$.publication.contentHash",
      "must be a lowercase SHA-256 digest",
    );
  }
  const publishedAt = context.string(
    publication.publishedAt,
    "$.publication.publishedAt",
  );
  if (publishedAt !== null) {
    context.check(
      ISO_TIMESTAMP.test(publishedAt) &&
        Number.isFinite(Date.parse(publishedAt)),
      "INVALID_TIMESTAMP",
      "$.publication.publishedAt",
      "must be an ISO 8601 UTC timestamp",
    );
  }
  context.string(publication.publishedBy, "$.publication.publishedBy", {
    identifier: true,
  });
}

function validateAuditVariantBanks(
  context: ValidationContext,
  value: unknown,
  supportedLocales: readonly string[],
  pack: Readonly<Record<string, unknown>>,
): void {
  const banks = context.array(value, "$.auditVariantBanks");
  if (banks === null) return;
  const bankKeys = new Set<string>();
  banks.forEach((bankValue, bankIndex) => {
    const path = `$.auditVariantBanks[${String(bankIndex)}]`;
    const bank = context.object(bankValue, path);
    if (bank === null) return;
    context.allowedKeys(
      bank,
      [
        "bankId",
        "bankVersion",
        "status",
        "title",
        "description",
        "supportedPurposes",
        "blueprint",
        "variants",
      ],
      path,
    );
    const bankId = context.string(bank.bankId, `${path}.bankId`, {
      identifier: true,
    });
    const bankVersion = context.string(
      bank.bankVersion,
      `${path}.bankVersion`,
      { semanticVersion: true },
    );
    if (bankId !== null && bankVersion !== null) {
      const key = `${bankId}@${bankVersion}`;
      context.check(
        !bankKeys.has(key),
        "DUPLICATE_AUDIT_VARIANT_BANK",
        path,
        "must use a unique Audit variant-bank ID and version",
      );
      bankKeys.add(key);
    }
    context.check(
      bank.status === "DRAFT" ||
        bank.status === "EXPERT_REVIEWED" ||
        bank.status === "PILOT_CALIBRATED" ||
        bank.status === "RETIRED",
      "INVALID_AUDIT_VARIANT_BANK_STATUS",
      `${path}.status`,
      "must use a supported Audit variant-bank status",
    );
    validateLocalizedText(
      context,
      bank.title,
      `${path}.title`,
      supportedLocales,
    );
    validateLocalizedText(
      context,
      bank.description,
      `${path}.description`,
      supportedLocales,
    );
    const purposes = validateUniqueStrings(
      context,
      bank.supportedPurposes,
      `${path}.supportedPurposes`,
      { minimumItems: 1 },
    );
    purposes.forEach((purpose, purposeIndex) => {
      context.check(
        purpose === "CHALLENGE_FORMATIVE" ||
          purpose === "ASSESSMENT",
        "INVALID_AUDIT_VARIANT_PURPOSE",
        `${path}.supportedPurposes[${String(purposeIndex)}]`,
        "must be Challenge Formative or Assessment",
      );
    });
    const blueprint = context.object(
      bank.blueprint,
      `${path}.blueprint`,
    );
    if (blueprint !== null) {
      context.allowedKeys(
        blueprint,
        [
          "blueprintId",
          "version",
          "targetCompetencyIndicatorIds",
          "scorableItemRoles",
          "maximumScore",
          "passScore",
          "evidenceRoles",
          "materialFindingCount",
          "decoyCount",
          "evidenceItemCount",
          "policyCount",
          "estimatedMinutes",
          "complexityBand",
          "reportBurden",
        ],
        `${path}.blueprint`,
      );
      context.string(
        blueprint.blueprintId,
        `${path}.blueprint.blueprintId`,
        { identifier: true },
      );
      context.string(
        blueprint.version,
        `${path}.blueprint.version`,
        { semanticVersion: true },
      );
      validateUniqueStrings(
        context,
        blueprint.targetCompetencyIndicatorIds,
        `${path}.blueprint.targetCompetencyIndicatorIds`,
        { minimumItems: 1, identifiers: true },
      );
      validateUniqueStrings(
        context,
        blueprint.evidenceRoles,
        `${path}.blueprint.evidenceRoles`,
        { minimumItems: 1, identifiers: true },
      );
      context.check(
        blueprint.maximumScore === 100,
        "INVALID_AUDIT_VARIANT_SCORE_TOTAL",
        `${path}.blueprint.maximumScore`,
        "must equal 100",
      );
      context.number(
        blueprint.passScore,
        `${path}.blueprint.passScore`,
        { minimum: 0, maximum: 100 },
      );
      const roles = context.array(
        blueprint.scorableItemRoles,
        `${path}.blueprint.scorableItemRoles`,
      );
      if (roles !== null) {
        context.check(
          roles.length === AUDIT_SCORABLE_ITEMS.size,
          "INVALID_AUDIT_VARIANT_SCORE_ROLES",
          `${path}.blueprint.scorableItemRoles`,
          "must contain every canonical Audit score role",
        );
        const seen = new Set<string>();
        roles.forEach((roleValue, roleIndex) => {
          const rolePath =
            `${path}.blueprint.scorableItemRoles[${String(roleIndex)}]`;
          const role = context.object(roleValue, rolePath);
          if (role === null) return;
          context.allowedKeys(
            role,
            ["scorableItemId", "maximumScore"],
            rolePath,
          );
          const itemId = context.string(
            role.scorableItemId,
            `${rolePath}.scorableItemId`,
          );
          const maximum = context.number(
            role.maximumScore,
            `${rolePath}.maximumScore`,
            { integer: true, minimum: 0, maximum: 100 },
          );
          if (itemId !== null) {
            context.check(
              !seen.has(itemId) &&
                maximum !== null &&
                AUDIT_SCORABLE_ITEMS.get(itemId) === maximum,
              "INVALID_AUDIT_VARIANT_SCORE_ROLE",
              rolePath,
              "must match one unique canonical Audit score role",
            );
            seen.add(itemId);
          }
        });
      }
      for (const rangeKey of [
        "materialFindingCount",
        "decoyCount",
        "evidenceItemCount",
        "policyCount",
        "estimatedMinutes",
      ] as const) {
        const rangePath = `${path}.blueprint.${rangeKey}`;
        const range = context.object(blueprint[rangeKey], rangePath);
        if (range === null) continue;
        context.allowedKeys(range, ["minimum", "maximum"], rangePath);
        const minimum = context.number(
          range.minimum,
          `${rangePath}.minimum`,
          { integer: true, minimum: 0, maximum: 100 },
        );
        const maximum = context.number(
          range.maximum,
          `${rangePath}.maximum`,
          { integer: true, minimum: 0, maximum: 100 },
        );
        context.check(
          minimum !== null &&
            maximum !== null &&
            minimum <= maximum,
          "INVALID_AUDIT_VARIANT_RANGE",
          rangePath,
          "must have a minimum no greater than its maximum",
        );
      }
      context.check(
        blueprint.complexityBand === "INTERMEDIATE",
        "INVALID_AUDIT_VARIANT_COMPLEXITY",
        `${path}.blueprint.complexityBand`,
        "must equal INTERMEDIATE",
      );
      context.check(
        blueprint.reportBurden ===
          "COMPLETE_AUDIT_CONCLUSION",
        "INVALID_AUDIT_VARIANT_REPORT_BURDEN",
        `${path}.blueprint.reportBurden`,
        "must require a complete Audit conclusion",
      );
    }
    const variants = context.array(bank.variants, `${path}.variants`);
    if (variants !== null) {
      context.check(
        variants.length >= 3,
        "TOO_FEW_AUDIT_VARIANTS",
        `${path}.variants`,
        "must contain at least three complete cases",
      );
      variants.forEach((variantValue, variantIndex) => {
        const variantPath =
          `${path}.variants[${String(variantIndex)}]`;
        const variant = context.object(variantValue, variantPath);
        if (variant === null) return;
        context.allowedKeys(
          variant,
          [
            "variantId",
            "variantVersion",
            "caseReference",
            "scenarioId",
            "scenarioVersion",
            "auditCaseId",
            "auditCaseVersion",
            "contentHash",
            "answerPatternHash",
            "estimatedMinutes",
            "complexityBand",
          ],
          variantPath,
        );
        for (const key of [
          "variantId",
          "caseReference",
          "scenarioId",
          "auditCaseId",
        ] as const) {
          context.string(
            variant[key],
            `${variantPath}.${key}`,
            { identifier: true },
          );
        }
        for (const key of [
          "variantVersion",
          "scenarioVersion",
          "auditCaseVersion",
        ] as const) {
          context.string(
            variant[key],
            `${variantPath}.${key}`,
            { semanticVersion: true },
          );
        }
        for (const key of [
          "contentHash",
          "answerPatternHash",
        ] as const) {
          context.check(
            typeof variant[key] === "string" &&
              SHA256.test(variant[key] as string),
            "INVALID_AUDIT_VARIANT_HASH",
            `${variantPath}.${key}`,
            "must be a lowercase SHA-256 digest",
          );
        }
        context.number(
          variant.estimatedMinutes,
          `${variantPath}.estimatedMinutes`,
          { integer: true, minimum: 1, maximum: 240 },
        );
        context.check(
          variant.complexityBand === "INTERMEDIATE",
          "INVALID_AUDIT_VARIANT_COMPLEXITY",
          `${variantPath}.complexityBand`,
          "must equal INTERMEDIATE",
        );
      });
    }
  });

  if (
    Array.isArray(pack.scenarios) &&
    banks.every((bank) => isJsonObject(bank))
  ) {
    for (const [bankIndex, bank] of banks.entries()) {
      try {
        const result = validateAuditVariantBank({
          pack: pack as unknown as ScenarioPackV2,
          bank: bank as unknown as AuditVariantBankDefinitionV1,
        });
        for (const issue of result.issues) {
          context.check(
            false,
            "INVALID_AUDIT_VARIANT_BANK",
            `$.auditVariantBanks[${String(bankIndex)}].${issue.path}`,
            issue.message,
          );
        }
      } catch {
        context.check(
          false,
          "INVALID_AUDIT_VARIANT_BANK",
          `$.auditVariantBanks[${String(bankIndex)}]`,
          "could not be resolved against the complete authored scenarios",
        );
      }
    }
  }
}

export function validateScenarioPack(
  value: unknown,
  options: ScenarioPackValidationOptions = {},
): ScenarioPackValidationResult {
  const context = new ValidationContext(options);
  const pack = context.object(value, "$");
  if (pack !== null) {
    context.allowedKeys(pack, ROOT_KEYS, "$");
    if (pack.$schema !== undefined) {
      context.string(pack.$schema, "$.$schema");
    }
    context.check(
      pack.schemaVersion === "2.0.0",
      "UNSUPPORTED_SCHEMA_VERSION",
      "$.schemaVersion",
      "must equal 2.0.0",
    );
    context.string(pack.packId, "$.packId", { identifier: true });
    context.string(pack.version, "$.version", { semanticVersion: true });
    context.check(
      typeof pack.status === "string" &&
        LIFECYCLE_STATUSES.has(pack.status),
      "INVALID_LIFECYCLE_STATUS",
      "$.status",
      "must be draft, validated, published, or retired",
    );
    const supportedLocales = validateUniqueStrings(
      context,
      pack.supportedLocales,
      "$.supportedLocales",
      { minimumItems: 1 },
    );
    supportedLocales.forEach((locale, localeIndex) => {
      context.check(
        /^[a-z]{2}(?:-[A-Z]{2})?$/u.test(locale),
        "INVALID_LOCALE",
        `$.supportedLocales[${String(localeIndex)}]`,
        "must use a supported BCP 47 language form",
      );
    });
    validatePackLocalizationCatalogs(
      context,
      pack.localizationCatalogs,
      "$.localizationCatalogs",
      supportedLocales,
    );

    const manifest = context.object(pack.manifest, "$.manifest");
    if (manifest !== null) {
      context.allowedKeys(
        manifest,
        ["title", "description", "domain", "educationalPurpose"],
        "$.manifest",
      );
      validateLocalizedText(
        context,
        manifest.title,
        "$.manifest.title",
        supportedLocales,
      );
      validateLocalizedText(
        context,
        manifest.description,
        "$.manifest.description",
        supportedLocales,
      );
      context.string(manifest.domain, "$.manifest.domain", {
        identifier: true,
      });
      validateLocalizedText(
        context,
        manifest.educationalPurpose,
        "$.manifest.educationalPurpose",
        supportedLocales,
      );
    }

    const competencyIds = new Set<string>();
    const indicatorIds = new Set<string>();
    const frameworks = context.array(
      pack.competencyFrameworks,
      "$.competencyFrameworks",
    );
    if (frameworks !== null) {
      context.check(
        frameworks.length > 0,
        "PACK_WITHOUT_COMPETENCY_FRAMEWORK",
        "$.competencyFrameworks",
        "must contain at least one competency framework",
      );
      frameworks.forEach((framework, frameworkIndex) => {
        validateCompetencyFramework(
          context,
          framework,
          `$.competencyFrameworks[${String(frameworkIndex)}]`,
          supportedLocales,
          competencyIds,
          indicatorIds,
        );
      });
    }
    const rubricIds = validateRubrics(
      context,
      pack.rubrics,
      "$.rubrics",
      supportedLocales,
      indicatorIds,
    );
    const evidenceRuleIds = validateEvidenceRules(
      context,
      pack.evidenceRules,
      "$.evidenceRules",
      indicatorIds,
    );
    const imagePurposesByAssetId = new Map<string, string>();
    const imageAssetHashes = new Map<string, string>();
    const imageAssetPaths = new Set<string>();
    let totalImageBytes = 0;
    const imageAssets = context.array(
      pack.imageAssets,
      "$.imageAssets",
    );
    if (imageAssets !== null) {
      context.check(
        imageAssets.length <= 60,
        "TOO_MANY_IMAGE_ASSETS",
        "$.imageAssets",
        "must contain no more than 60 images",
      );
      imageAssets.forEach((assetValue, assetIndex) => {
        const assetPath = `$.imageAssets[${String(assetIndex)}]`;
        const asset = context.object(assetValue, assetPath);
        if (asset === null) return;
        context.allowedKeys(
          asset,
          [
            "assetId",
            "purpose",
            "sourceType",
            "licenseOrApprovalReference",
            "rightsDeclaration",
            "originalFileName",
            "filePath",
            "sha256",
            "byteLength",
            "width",
            "height",
            "mimeType",
            "defaultAlt",
            "caption",
          ],
          assetPath,
        );
        const assetId = context.string(
          asset.assetId,
          `${assetPath}.assetId`,
          { identifier: true },
        );
        if (assetId !== null) {
          context.check(
            !imagePurposesByAssetId.has(assetId),
            "DUPLICATE_IMAGE_ASSET_ID",
            `${assetPath}.assetId`,
            "must be unique within the pack",
          );
          if (typeof asset.purpose === "string") {
            imagePurposesByAssetId.set(assetId, asset.purpose);
          }
        }
        context.check(
          typeof asset.purpose === "string" &&
            IMAGE_PURPOSES.has(asset.purpose),
          "INVALID_IMAGE_PURPOSE",
          `${assetPath}.purpose`,
          "must be STAFF_PORTRAIT, SCENE_ILLUSTRATION, or EVIDENCE_IMAGE",
        );
        context.check(
          asset.sourceType === "AI_GENERATED" ||
            asset.sourceType === "LICENSED_STOCK" ||
            asset.sourceType === "ORIGINAL_WITH_RELEASE" ||
            asset.sourceType === "CREATIVE_COMMONS" ||
            asset.sourceType === "PUBLIC_DOMAIN",
          "INVALID_IMAGE_SOURCE",
          `${assetPath}.sourceType`,
          "must use an approved image source type",
        );
        context.string(
          asset.licenseOrApprovalReference,
          `${assetPath}.licenseOrApprovalReference`,
        );
        context.check(
          asset.rightsDeclaration === "NO_IDENTIFIABLE_PEOPLE" ||
            asset.rightsDeclaration === "FICTIONAL_PEOPLE" ||
            asset.rightsDeclaration === "RELEASED_PEOPLE",
          "INVALID_IMAGE_RIGHTS_DECLARATION",
          `${assetPath}.rightsDeclaration`,
          "must declare how identifiable people are handled",
        );
        const originalFileName = context.string(
          asset.originalFileName,
          `${assetPath}.originalFileName`,
        );
        context.check(
          originalFileName !== null &&
            originalFileName.length <= 180 &&
            !originalFileName.includes("/") &&
            !originalFileName.includes("\\"),
          "INVALID_IMAGE_FILE_NAME",
          `${assetPath}.originalFileName`,
          "must be a bounded base file name",
        );
        const filePath = context.string(
          asset.filePath,
          `${assetPath}.filePath`,
        );
        const expectedDirectory =
          asset.purpose === "STAFF_PORTRAIT"
            ? "media/staff/"
            : asset.purpose === "SCENE_ILLUSTRATION"
              ? "media/scenes/"
              : asset.purpose === "EVIDENCE_IMAGE"
                ? "media/evidence/"
                : "";
        context.check(
          filePath !== null &&
            filePath.startsWith(expectedDirectory) &&
            !filePath.split("/").includes("..") &&
            !filePath.includes("\\") &&
            !/^[a-z][a-z0-9+.-]*:/iu.test(filePath) &&
            /\.(?:webp|png|jpe?g)$/iu.test(filePath),
          "INVALID_IMAGE_PATH",
          `${assetPath}.filePath`,
          "must be a safe path in the directory for its image purpose",
        );
        if (filePath !== null) {
          context.check(
            !imageAssetPaths.has(filePath),
            "DUPLICATE_IMAGE_PATH",
            `${assetPath}.filePath`,
            "must be unique within the pack",
          );
          imageAssetPaths.add(filePath);
        }
        const hash = context.string(asset.sha256, `${assetPath}.sha256`);
        context.check(
          hash !== null && SHA256.test(hash),
          "INVALID_IMAGE_HASH",
          `${assetPath}.sha256`,
          "must be a lowercase SHA-256 digest",
        );
        if (filePath !== null && hash !== null) {
          imageAssetHashes.set(filePath, hash);
        }
        const byteLength = context.number(
          asset.byteLength,
          `${assetPath}.byteLength`,
          { integer: true, minimum: 1, maximum: 5 * 1024 * 1024 },
        );
        totalImageBytes += byteLength ?? 0;
        context.number(asset.width, `${assetPath}.width`, {
          integer: true,
          minimum: 64,
          maximum: 8192,
        });
        context.number(asset.height, `${assetPath}.height`, {
          integer: true,
          minimum: 64,
          maximum: 8192,
        });
        context.check(
          typeof asset.mimeType === "string" &&
            IMAGE_MIME_TYPES.has(asset.mimeType),
          "INVALID_IMAGE_MIME_TYPE",
          `${assetPath}.mimeType`,
          "must be image/webp, image/png, or image/jpeg",
        );
        context.check(
          filePath === null ||
            (asset.mimeType === "image/webp" && /\.webp$/iu.test(filePath)) ||
            (asset.mimeType === "image/png" && /\.png$/iu.test(filePath)) ||
            (asset.mimeType === "image/jpeg" && /\.jpe?g$/iu.test(filePath)),
          "IMAGE_EXTENSION_MISMATCH",
          `${assetPath}.mimeType`,
          "must match the image file extension",
        );
        validateLocalizedText(
          context,
          asset.defaultAlt,
          `${assetPath}.defaultAlt`,
          supportedLocales,
        );
        if (asset.caption !== undefined) {
          validateLocalizedText(
            context,
            asset.caption,
            `${assetPath}.caption`,
            supportedLocales,
          );
        }
      });
      context.check(
        totalImageBytes <= 25 * 1024 * 1024,
        "IMAGE_ASSET_BUDGET_EXCEEDED",
        "$.imageAssets",
        "must remain within the 25 MiB image budget",
      );
    }
    const scenarios = context.array(pack.scenarios, "$.scenarios");
    if (scenarios !== null) {
      context.check(
        scenarios.length > 0,
        "PACK_WITHOUT_SCENARIOS",
        "$.scenarios",
        "must contain at least one scenario",
      );
      const scenarioVersionKeys = new Set<string>();
      scenarios.forEach((scenarioValue, scenarioIndex) => {
        validateScenario(
          context,
          scenarioValue,
          `$.scenarios[${String(scenarioIndex)}]`,
          pack.schemaVersion,
          supportedLocales,
          competencyIds,
          indicatorIds,
          rubricIds,
          evidenceRuleIds,
          imagePurposesByAssetId,
        );
        if (isJsonObject(scenarioValue)) {
          const scenarioId =
            typeof scenarioValue.scenarioId === "string"
              ? scenarioValue.scenarioId
              : "";
          const version =
            typeof scenarioValue.version === "string"
              ? scenarioValue.version
              : "";
          const key = `${scenarioId}@${version}`;
          context.check(
            !scenarioVersionKeys.has(key),
            "DUPLICATE_SCENARIO_VERSION",
            `$.scenarios[${String(scenarioIndex)}]`,
            "must use a unique scenario ID and version",
          );
          scenarioVersionKeys.add(key);
        }
      });
    }
    validateAuditVariantBanks(
      context,
      pack.auditVariantBanks,
      supportedLocales,
      pack,
    );

    const assetHashes = context.object(pack.assetHashes, "$.assetHashes");
    if (assetHashes !== null) {
      for (const [assetPath, hash] of Object.entries(assetHashes)) {
        context.check(
          assetPath.length > 0 &&
            !assetPath.startsWith("/") &&
            !assetPath.split("/").includes(".."),
          "INVALID_ASSET_PATH",
          `$.assetHashes.${assetPath}`,
          "must be a relative path without parent traversal",
        );
        context.check(
          typeof hash === "string" && SHA256.test(hash),
          "INVALID_ASSET_HASH",
          `$.assetHashes.${assetPath}`,
          "must be a lowercase SHA-256 digest",
        );
        context.check(
          imageAssetHashes.has(assetPath),
          "UNDECLARED_ASSET_HASH",
          `$.assetHashes.${assetPath}`,
          "must belong to an image declared in imageAssets",
        );
      }
      for (const [imagePath, imageHash] of imageAssetHashes) {
        context.check(
          assetHashes[imagePath] === imageHash,
          "IMAGE_ASSET_HASH_MISMATCH",
          `$.assetHashes.${imagePath}`,
          "must contain the exact hash declared by the image asset",
        );
      }
    }
    validatePublication(context, pack);
  }

  if (context.issues.length > 0 || pack === null) {
    return {
      isValid: false,
      issues: context.issues,
      checkedCount: context.checkedCount,
    };
  }
  return {
    isValid: true,
    pack: value as ScenarioPackV2,
    issues: [],
    checkedCount: context.checkedCount,
  };
}

export function isScenarioPackV2(value: unknown): value is ScenarioPackV2 {
  return validateScenarioPack(value).isValid;
}

export function collectCompetencyDefinitions(
  pack: ScenarioPackV2,
): readonly CompetencyFrameworkV1[] {
  return pack.competencyFrameworks;
}

export function collectScenarioDefinitions(
  pack: ScenarioPackV2,
): readonly ScenarioDefinitionV1[] {
  return pack.scenarios;
}

export function collectScenarioNodes(
  scenario: ScenarioDefinitionV1,
): readonly ScenarioNodeV1[] {
  return scenario.nodes;
}

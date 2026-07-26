import type {
  CurriculumCrosswalkOverlayV2,
} from "../contracts/curriculum-crosswalk";
import { isJsonObject } from "../contracts/json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";

export interface CurriculumOverlayValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type CurriculumOverlayValidationResult =
  | {
      readonly isValid: true;
      readonly overlay: CurriculumCrosswalkOverlayV2;
      readonly issues: readonly [];
      readonly checkedCount: number;
    }
  | {
      readonly isValid: false;
      readonly issues: readonly CurriculumOverlayValidationIssue[];
      readonly checkedCount: number;
    };

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const STATUSES = new Set(["DRAFT", "ADOPTED", "RETIRED"]);
const OWNER_TYPES = new Set(["INSTITUTION", "PROGRAM", "COURSE"]);
const OUTCOME_TYPES = new Set([
  "COURSE_LEARNING_OUTCOME",
  "PROGRAM_LEARNING_OUTCOME",
  "PERFORMANCE_INDICATOR",
  "GRADUATE_ATTRIBUTE",
  "QUALIFICATION_FRAMEWORK_OUTCOME",
  "DACUM_TASK",
  "ACCREDITATION_OUTCOME",
  "OTHER",
]);
const ALIGNMENTS = new Set(["PRIMARY", "SUPPORTING", "CONTEXTUAL"]);

class Context {
  readonly issues: CurriculumOverlayValidationIssue[] = [];
  checkedCount = 0;

  check(
    condition: boolean,
    code: string,
    path: string,
    message: string,
  ): condition is true {
    this.checkedCount += 1;
    if (!condition) this.issues.push({ code, path, message });
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
    pattern?: RegExp,
  ): string | null {
    if (
      !this.check(
        typeof value === "string" && value.length > 0,
        "EXPECTED_STRING",
        path,
        "must be a non-empty string",
      )
    ) {
      return null;
    }
    const parsed = value as string;
    if (pattern !== undefined) {
      this.check(
        pattern.test(parsed),
        "INVALID_STRING_FORMAT",
        path,
        "uses an invalid format",
      );
    }
    return parsed;
  }

  allowedKeys(
    value: Readonly<Record<string, unknown>>,
    keys: readonly string[],
    path: string,
  ): void {
    const allowed = new Set(keys);
    for (const key of Object.keys(value)) {
      this.check(
        allowed.has(key),
        "UNKNOWN_PROPERTY",
        `${path}.${key}`,
        "is not supported by curriculum-overlay schema 2.0.0",
      );
    }
  }
}

function uniqueStrings(
  context: Context,
  value: unknown,
  path: string,
  pattern: RegExp,
): readonly string[] {
  const values = context.array(value, path);
  if (values === null) return [];
  context.check(
    values.length > 0,
    "EMPTY_COLLECTION",
    path,
    "must contain at least one value",
  );
  const result = values.flatMap((entry, index) => {
    const parsed = context.string(entry, `${path}[${String(index)}]`, pattern);
    return parsed === null ? [] : [parsed];
  });
  context.check(
    new Set(result).size === result.length,
    "DUPLICATE_VALUE",
    path,
    "must not contain duplicate values",
  );
  return result;
}

function localizedValues(
  context: Context,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
): void {
  const wrapper = context.object(value, path);
  if (wrapper === null) return;
  context.allowedKeys(wrapper, ["valuesByLocale"], path);
  const values = context.object(
    wrapper.valuesByLocale,
    `${path}.valuesByLocale`,
  );
  if (values === null) return;
  for (const locale of supportedLocales) {
    context.string(
      values[locale],
      `${path}.valuesByLocale.${locale}`,
    );
  }
  for (const locale of Object.keys(values)) {
    context.check(
      supportedLocales.includes(locale),
      "UNSUPPORTED_LOCALIZED_VALUE",
      `${path}.valuesByLocale.${locale}`,
      "must use a locale declared by the overlay",
    );
  }
}

function validDate(value: string): boolean {
  return (
    DATE.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
  );
}

function validateOverlay(value: unknown, context: Context): void {
  const overlay = context.object(value, "$");
  if (overlay === null) return;
  context.allowedKeys(
    overlay,
    [
      "$schema",
      "schemaVersion",
      "overlayId",
      "version",
      "status",
      "owner",
      "educationalDemoOnly",
      "effectiveFrom",
      "adoptedAt",
      "adoptedBy",
      "supportedLocales",
      "title",
      "traceChainFrameworks",
      "externalFramework",
      "mappings",
    ],
    "$",
  );
  if (overlay.$schema !== undefined) {
    context.string(overlay.$schema, "$.$schema");
  }
  context.check(
    overlay.schemaVersion === "2.0.0",
    "UNSUPPORTED_SCHEMA_VERSION",
    "$.schemaVersion",
    "must equal 2.0.0",
  );
  context.string(overlay.overlayId, "$.overlayId", IDENTIFIER);
  context.string(overlay.version, "$.version", VERSION);
  context.check(
    typeof overlay.status === "string" && STATUSES.has(overlay.status),
    "INVALID_OVERLAY_STATUS",
    "$.status",
    "must be DRAFT, ADOPTED, or RETIRED",
  );
  context.check(
    typeof overlay.educationalDemoOnly === "boolean",
    "EXPECTED_BOOLEAN",
    "$.educationalDemoOnly",
    "must be a boolean",
  );
  const effectiveFrom = context.string(
    overlay.effectiveFrom,
    "$.effectiveFrom",
  );
  if (effectiveFrom !== null) {
    context.check(
      validDate(effectiveFrom),
      "INVALID_EFFECTIVE_DATE",
      "$.effectiveFrom",
      "must be a valid YYYY-MM-DD date",
    );
  }
  const adopted = overlay.status === "ADOPTED";
  context.check(
    adopted
      ? typeof overlay.adoptedAt === "string" &&
          TIMESTAMP.test(overlay.adoptedAt) &&
          Number.isFinite(Date.parse(overlay.adoptedAt))
      : overlay.adoptedAt === undefined,
    "INVALID_ADOPTION_TIMESTAMP",
    "$.adoptedAt",
    adopted
      ? "is required for an adopted overlay"
      : "is permitted only for an adopted overlay",
  );
  context.check(
    adopted
      ? typeof overlay.adoptedBy === "string" &&
          IDENTIFIER.test(overlay.adoptedBy)
      : overlay.adoptedBy === undefined,
    "INVALID_ADOPTION_AUTHORITY",
    "$.adoptedBy",
    adopted
      ? "is required for an adopted overlay"
      : "is permitted only for an adopted overlay",
  );

  const supportedLocales = uniqueStrings(
    context,
    overlay.supportedLocales,
    "$.supportedLocales",
    LOCALE,
  );
  localizedValues(context, overlay.title, "$.title", supportedLocales);

  const owner = context.object(overlay.owner, "$.owner");
  if (owner !== null) {
    context.allowedKeys(
      owner,
      ["ownerId", "ownerType", "displayName"],
      "$.owner",
    );
    context.string(owner.ownerId, "$.owner.ownerId", IDENTIFIER);
    context.check(
      typeof owner.ownerType === "string" &&
        OWNER_TYPES.has(owner.ownerType),
      "INVALID_OWNER_TYPE",
      "$.owner.ownerType",
      "must be INSTITUTION, PROGRAM, or COURSE",
    );
    localizedValues(
      context,
      owner.displayName,
      "$.owner.displayName",
      supportedLocales,
    );
  }

  const frameworkReferences = context.array(
    overlay.traceChainFrameworks,
    "$.traceChainFrameworks",
  );
  const frameworkKeys: string[] = [];
  if (frameworkReferences !== null) {
    context.check(
      frameworkReferences.length > 0,
      "EMPTY_TRACECHAIN_FRAMEWORKS",
      "$.traceChainFrameworks",
      "must reference at least one TraceChain framework",
    );
    frameworkReferences.forEach((entry, index) => {
      const path = `$.traceChainFrameworks[${String(index)}]`;
      const reference = context.object(entry, path);
      if (reference === null) return;
      context.allowedKeys(
        reference,
        ["frameworkId", "frameworkVersion"],
        path,
      );
      const id = context.string(
        reference.frameworkId,
        `${path}.frameworkId`,
        IDENTIFIER,
      );
      const version = context.string(
        reference.frameworkVersion,
        `${path}.frameworkVersion`,
        VERSION,
      );
      if (id !== null && version !== null) {
        frameworkKeys.push(`${id}@${version}`);
      }
    });
    context.check(
      new Set(frameworkKeys).size === frameworkKeys.length,
      "DUPLICATE_TRACECHAIN_FRAMEWORK",
      "$.traceChainFrameworks",
      "must not repeat a framework version",
    );
  }

  const external = context.object(
    overlay.externalFramework,
    "$.externalFramework",
  );
  const outcomeIds = new Set<string>();
  if (external !== null) {
    context.allowedKeys(
      external,
      ["frameworkId", "version", "title", "outcomes"],
      "$.externalFramework",
    );
    context.string(
      external.frameworkId,
      "$.externalFramework.frameworkId",
      IDENTIFIER,
    );
    context.string(
      external.version,
      "$.externalFramework.version",
      VERSION,
    );
    localizedValues(
      context,
      external.title,
      "$.externalFramework.title",
      supportedLocales,
    );
    const outcomes = context.array(
      external.outcomes,
      "$.externalFramework.outcomes",
    );
    if (outcomes !== null) {
      context.check(
        outcomes.length > 0,
        "EMPTY_EXTERNAL_FRAMEWORK",
        "$.externalFramework.outcomes",
        "must contain at least one outcome",
      );
      outcomes.forEach((entry, index) => {
        const path = `$.externalFramework.outcomes[${String(index)}]`;
        const outcome = context.object(entry, path);
        if (outcome === null) return;
        context.allowedKeys(
          outcome,
          ["outcomeId", "outcomeType", "title"],
          path,
        );
        const outcomeId = context.string(
          outcome.outcomeId,
          `${path}.outcomeId`,
          IDENTIFIER,
        );
        if (outcomeId !== null) {
          context.check(
            !outcomeIds.has(outcomeId),
            "DUPLICATE_EXTERNAL_OUTCOME",
            `${path}.outcomeId`,
            "must be unique within the external framework",
          );
          outcomeIds.add(outcomeId);
        }
        context.check(
          typeof outcome.outcomeType === "string" &&
            OUTCOME_TYPES.has(outcome.outcomeType),
          "INVALID_OUTCOME_TYPE",
          `${path}.outcomeType`,
          "must use a supported outcome type",
        );
        localizedValues(
          context,
          outcome.title,
          `${path}.title`,
          supportedLocales,
        );
      });
    }
  }

  const mappings = context.array(overlay.mappings, "$.mappings");
  const mappedOutcomes = new Set<string>();
  const relationshipKeys: string[] = [];
  if (mappings !== null) {
    context.check(
      mappings.length > 0,
      "EMPTY_CURRICULUM_OVERLAY",
      "$.mappings",
      "must contain at least one mapping",
    );
    mappings.forEach((entry, index) => {
      const path = `$.mappings[${String(index)}]`;
      const mapping = context.object(entry, path);
      if (mapping === null) return;
      context.allowedKeys(
        mapping,
        ["indicatorId", "outcomeIds", "alignment", "rationale"],
        path,
      );
      const indicatorId = context.string(
        mapping.indicatorId,
        `${path}.indicatorId`,
        IDENTIFIER,
      );
      const outcomeReferences = uniqueStrings(
        context,
        mapping.outcomeIds,
        `${path}.outcomeIds`,
        IDENTIFIER,
      );
      for (const outcomeId of outcomeReferences) {
        context.check(
          outcomeIds.has(outcomeId),
          "UNKNOWN_EXTERNAL_OUTCOME",
          `${path}.outcomeIds`,
          `references unknown outcome ${outcomeId}`,
        );
        mappedOutcomes.add(outcomeId);
      }
      context.check(
        typeof mapping.alignment === "string" &&
          ALIGNMENTS.has(mapping.alignment),
        "INVALID_ALIGNMENT",
        `${path}.alignment`,
        "must be PRIMARY, SUPPORTING, or CONTEXTUAL",
      );
      if (
        indicatorId !== null &&
        typeof mapping.alignment === "string"
      ) {
        relationshipKeys.push(
          `${indicatorId}\u0000${mapping.alignment}\u0000${[...outcomeReferences].sort().join("\u0000")}`,
        );
      }
      if (mapping.rationale !== undefined) {
        localizedValues(
          context,
          mapping.rationale,
          `${path}.rationale`,
          supportedLocales,
        );
      }
    });
    context.check(
      new Set(relationshipKeys).size === relationshipKeys.length,
      "DUPLICATE_CURRICULUM_MAPPING",
      "$.mappings",
      "must not repeat an identical indicator relationship",
    );
  }
  for (const outcomeId of outcomeIds) {
    context.check(
      mappedOutcomes.has(outcomeId),
      "UNMAPPED_EXTERNAL_OUTCOME",
      "$.externalFramework.outcomes",
      `must map outcome ${outcomeId} to at least one indicator`,
    );
  }
}

export function validateCurriculumOverlay(
  value: unknown,
): CurriculumOverlayValidationResult {
  const context = new Context();
  validateOverlay(value, context);
  if (context.issues.length > 0) {
    return {
      isValid: false,
      issues: context.issues,
      checkedCount: context.checkedCount,
    };
  }
  return {
    isValid: true,
    overlay: value as CurriculumCrosswalkOverlayV2,
    issues: [],
    checkedCount: context.checkedCount,
  };
}

export function curriculumOverlayCompatibilityIssues(
  overlay: CurriculumCrosswalkOverlayV2,
  pack: ScenarioPackV1,
): readonly CurriculumOverlayValidationIssue[] {
  const issues: CurriculumOverlayValidationIssue[] = [];
  const referencedFrameworkKeys = new Set(
    overlay.traceChainFrameworks.map(
      (reference) =>
        `${reference.frameworkId}@${reference.frameworkVersion}`,
    ),
  );
  const matchingFrameworks = pack.competencyFrameworks.filter((framework) =>
    referencedFrameworkKeys.has(
      `${framework.frameworkId}@${framework.version}`,
    ),
  );
  if (matchingFrameworks.length !== referencedFrameworkKeys.size) {
    issues.push({
      code: "TRACECHAIN_FRAMEWORK_VERSION_MISMATCH",
      path: "$.traceChainFrameworks",
      message:
        "overlay does not match every referenced TraceChain framework version",
    });
  }
  const indicatorIds = new Set(
    matchingFrameworks.flatMap((framework) =>
      framework.competencies.flatMap((competency) =>
        competency.indicators.map((indicator) => indicator.indicatorId),
      ),
    ),
  );
  overlay.mappings.forEach((mapping, index) => {
    if (!indicatorIds.has(mapping.indicatorId)) {
      issues.push({
        code: "UNKNOWN_TRACECHAIN_INDICATOR",
        path: `$.mappings[${String(index)}].indicatorId`,
        message:
          "must reference an indicator in an exact supported TraceChain framework version",
      });
    }
  });
  return issues;
}

export function adoptedCurriculumOverlaysForPack(
  overlays: readonly CurriculumCrosswalkOverlayV2[],
  pack: ScenarioPackV1,
): readonly CurriculumCrosswalkOverlayV2[] {
  return overlays
    .filter(
      (overlay) =>
        overlay.status === "ADOPTED" &&
        curriculumOverlayCompatibilityIssues(overlay, pack).length === 0,
    )
    .sort((left, right) =>
      left.overlayId < right.overlayId
        ? -1
        : left.overlayId > right.overlayId
          ? 1
          : left.version < right.version
            ? -1
            : left.version > right.version
              ? 1
              : 0,
    );
}

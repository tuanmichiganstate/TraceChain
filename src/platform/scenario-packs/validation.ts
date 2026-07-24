import type { CompetencyFrameworkV1 } from "../contracts/competency";
import { isJsonObject } from "../contracts/json";
import type {
  ScenarioDefinitionV1,
  ScenarioNodeV1,
  ScenarioPackV1,
} from "../contracts/scenario-pack";

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
      readonly pack: ScenarioPackV1;
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
const SHA256 = /^[a-f0-9]{64}$/u;
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

const ROOT_KEYS = [
  "$schema",
  "schemaVersion",
  "packId",
  "version",
  "status",
  "supportedLocales",
  "manifest",
  "competencyFrameworks",
  "rubrics",
  "evidenceRules",
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

const LIFECYCLE_STATUSES = new Set([
  "draft",
  "validated",
  "published",
  "retired",
]);

class ValidationContext {
  readonly issues: ScenarioPackValidationIssue[] = [];
  checkedCount = 0;

  constructor(
    readonly options: ScenarioPackValidationOptions = {},
  ) {}

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
    const catalog = context.options.localizationCatalogs?.[locale];
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
      context.string(rule.fieldPath, `${rulePath}.fieldPath`);
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
): void {
  const nodeType = node.nodeType;
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
    case "DECISION":
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
                  ["optionId", "label", "authoredValue"],
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
              });
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
      break;
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
          "legacyActionBindingId",
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
      if (node.legacyActionBindingId !== undefined) {
        context.string(
          node.legacyActionBindingId,
          `${path}.legacyActionBindingId`,
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
      context.string(node.randomStreamId, `${path}.randomStreamId`, {
        identifier: true,
      });
      {
        const outcomes = context.array(node.outcomes, `${path}.outcomes`);
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
              ["outcomeId", "weight", "resultCode"],
              outcomePath,
            );
            context.string(outcome.outcomeId, `${outcomePath}.outcomeId`, {
              identifier: true,
            });
            context.number(outcome.weight, `${outcomePath}.weight`, {
              minimum: Number.EPSILON,
            });
            context.string(outcome.resultCode, `${outcomePath}.resultCode`, {
              identifier: true,
            });
          });
        }
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

function validateScenarioNodes(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
  supportedLocales: readonly string[],
  evidenceIds: ReadonlySet<string>,
  policyIds: ReadonlySet<string>,
  roleIds: ReadonlySet<string>,
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

function validateScenario(
  context: ValidationContext,
  value: unknown,
  path: string,
  supportedLocales: readonly string[],
  competencyIds: ReadonlySet<string>,
  indicatorIds: ReadonlySet<string>,
  rubricIds: ReadonlySet<string>,
  evidenceRuleIds: ReadonlySet<string>,
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
      "competencyTargets",
      "organizations",
      "roles",
      "assetTypes",
      "initialState",
      "policies",
      "evidenceItems",
      "entryNodeId",
      "nodes",
      "rubricIds",
      "evidenceRuleIds",
      "legacyCompatibility",
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
        ["policyId", "policyType", "title", "configuration"],
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
          policy.policyType === "LEGACY_POLICY",
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
          "visibleToRoleIds",
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

  validateScenarioNodes(
    context,
    scenario,
    path,
    supportedLocales,
    evidenceIds,
    policyIds,
    roleIds,
  );
  validateLegacyCompatibility(context, scenario, path);
}

function validateLegacyCompatibility(
  context: ValidationContext,
  scenario: Readonly<Record<string, unknown>>,
  path: string,
): void {
  if (scenario.legacyCompatibility === undefined) return;
  const compatibility = context.object(
    scenario.legacyCompatibility,
    `${path}.legacyCompatibility`,
  );
  if (compatibility === null) return;
  context.allowedKeys(
    compatibility,
    [
      "adapterId",
      "scenarioId",
      "scenarioVersion",
      "stageId",
      "actionBindings",
    ],
    `${path}.legacyCompatibility`,
  );
  context.check(
    compatibility.adapterId === "tracechain-coffee-v2",
    "UNKNOWN_LEGACY_ADAPTER",
    `${path}.legacyCompatibility.adapterId`,
    "must name a registered compatibility adapter",
  );
  context.string(
    compatibility.scenarioId,
    `${path}.legacyCompatibility.scenarioId`,
    { identifier: true },
  );
  context.string(
    compatibility.scenarioVersion,
    `${path}.legacyCompatibility.scenarioVersion`,
    { semanticVersion: true },
  );
  context.string(
    compatibility.stageId,
    `${path}.legacyCompatibility.stageId`,
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
      typeof node.legacyActionBindingId === "string"
        ? [node.legacyActionBindingId]
        : [],
    ),
  );
  const bindings = context.array(
    compatibility.actionBindings,
    `${path}.legacyCompatibility.actionBindings`,
  );
  if (bindings === null) return;
  const bindingIds = new Set<string>();
  bindings.forEach((bindingValue, bindingIndex) => {
    const bindingPath =
      `${path}.legacyCompatibility.actionBindings[${String(bindingIndex)}]`;
    const binding = context.object(bindingValue, bindingPath);
    if (binding === null) return;
    context.allowedKeys(
      binding,
      [
        "bindingId",
        "nodeId",
        "commandType",
        "legacyActionId",
      ],
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
        "DUPLICATE_LEGACY_BINDING",
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
    context.string(binding.legacyActionId, `${bindingPath}.legacyActionId`, {
      identifier: true,
    });
  });
  for (const proposalBindingId of proposalBindingIds) {
    context.check(
      bindingIds.has(proposalBindingId),
      "UNKNOWN_LEGACY_BINDING",
      `${path}.nodes`,
      `references missing legacy binding ${proposalBindingId}`,
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
      pack.schemaVersion === "1.0.0",
      "UNSUPPORTED_SCHEMA_VERSION",
      "$.schemaVersion",
      "must equal 1.0.0",
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
          supportedLocales,
          competencyIds,
          indicatorIds,
          rubricIds,
          evidenceRuleIds,
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
    pack: value as ScenarioPackV1,
    issues: [],
    checkedCount: context.checkedCount,
  };
}

export function isScenarioPackV1(value: unknown): value is ScenarioPackV1 {
  return validateScenarioPack(value).isValid;
}

export function collectCompetencyDefinitions(
  pack: ScenarioPackV1,
): readonly CompetencyFrameworkV1[] {
  return pack.competencyFrameworks;
}

export function collectScenarioDefinitions(
  pack: ScenarioPackV1,
): readonly ScenarioDefinitionV1[] {
  return pack.scenarios;
}

export function collectScenarioNodes(
  scenario: ScenarioDefinitionV1,
): readonly ScenarioNodeV1[] {
  return scenario.nodes;
}

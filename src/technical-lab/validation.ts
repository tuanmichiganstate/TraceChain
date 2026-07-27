import type { TechnicalLabConfiguration } from "../config/types";
import {
  FIRST_TECHNICAL_LAB_MODULE_IDS,
  GENUINE_TECHNICAL_MECHANISM_IDS,
  SIMULATED_TECHNICAL_MECHANISM_IDS,
  TECHNICAL_EXPERIMENT_ACTION_TYPES,
  TECHNICAL_LAB_EVIDENCE_SCHEMA_VERSION,
  TECHNICAL_LAB_PACK_SCHEMA_VERSION,
  TECHNICAL_LAB_RENDERER_IDS,
  type TechnicalLabModuleDefinition,
  type TechnicalLabPackBundle,
} from "./contracts";
import { rendererPermitsAction } from "./renderer-registry";

export const TECHNICAL_LAB_MAX_MODULES = 7;
export const TECHNICAL_LAB_MAX_EXPERIMENTS_PER_MODULE = 4;
export const TECHNICAL_LAB_MAX_STEPS_PER_EXPERIMENT = 16;
export const TECHNICAL_LAB_MAX_STEP_OCCURRENCES = 4;
export const TECHNICAL_LAB_MAX_JOURNAL_ENTRIES = 128;
export const TECHNICAL_LAB_MAX_EDIT_INPUT_BYTES = 512;
export const TECHNICAL_LAB_MAX_EDIT_MUTATIONS = 4;

export interface TechnicalLabValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type TechnicalLabValidationResult =
  | {
      readonly isValid: true;
      readonly bundle: TechnicalLabPackBundle;
      readonly issues: readonly [];
      readonly checkedCount: number;
    }
  | {
      readonly isValid: false;
      readonly issues: readonly TechnicalLabValidationIssue[];
      readonly checkedCount: number;
    };

const SEMANTIC_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,95}$/u;
const LOCALIZATION_KEY =
  /^[A-Za-z][A-Za-z0-9._:-]{0,159}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const FORBIDDEN_EXECUTABLE_OR_SECRET_KEYS = new Set([
  "eval",
  "function",
  "javascript",
  "privatekey",
  "privatekeypkcs8base64url",
  "script",
  "sourcecode",
]);
const EXPECTED_MODULE_POINTS = {
  TL1: [4, 4, 2],
  TL2: [4, 4, 2],
  TL3: [6, 6, 3],
  TL4: [6, 6, 3],
  TL5: [6, 6, 3],
  TL6: [6, 6, 3],
  TL7: [8, 8, 4],
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function sameValues(
  first: readonly string[],
  second: readonly string[],
): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

class ValidationContext {
  readonly issues: TechnicalLabValidationIssue[] = [];
  checkedCount = 0;
  readonly localizationKeys = new Set<string>();

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

  identifier(value: unknown, path: string): value is string {
    return this.check(
      typeof value === "string" && IDENTIFIER.test(value),
      "INVALID_IDENTIFIER",
      path,
      "must be a bounded portable identifier",
    );
  }

  semanticVersion(value: unknown, path: string): value is string {
    return this.check(
      typeof value === "string" && SEMANTIC_VERSION.test(value),
      "INVALID_VERSION",
      path,
      "must be a semantic version",
    );
  }

  localizedText(value: unknown, path: string): void {
    if (!isObject(value)) {
      this.check(
        false,
        "INVALID_LOCALIZED_TEXT",
        path,
        "must contain one localizationKey",
      );
      return;
    }
    const keys = Object.keys(value);
    this.check(
      keys.length === 1 && keys[0] === "localizationKey",
      "INVALID_LOCALIZED_TEXT",
      path,
      "must contain only localizationKey",
    );
    if (
      this.check(
        typeof value.localizationKey === "string" &&
          LOCALIZATION_KEY.test(value.localizationKey),
        "INVALID_LOCALIZATION_KEY",
        `${path}.localizationKey`,
        "must be a bounded localization key",
      )
    ) {
      this.localizationKeys.add(value.localizationKey as string);
    }
  }

  uniqueStrings(
    value: unknown,
    path: string,
    options: { readonly minimum?: number; readonly maximum?: number } = {},
  ): readonly string[] {
    if (
      !this.check(
        stringArray(value),
        "INVALID_STRING_LIST",
        path,
        "must be an array of strings",
      )
    ) {
      return [];
    }
    const values = value as readonly string[];
    const minimum = options.minimum ?? 0;
    const maximum = options.maximum ?? Number.POSITIVE_INFINITY;
    this.check(
      values.length >= minimum && values.length <= maximum,
      "INVALID_LIST_LENGTH",
      path,
      `must contain ${minimum} to ${maximum} entries`,
    );
    const seen = new Set<string>();
    values.forEach((entry, index) => {
      this.identifier(entry, `${path}.${index}`);
      this.check(
        !seen.has(entry),
        "DUPLICATE_IDENTIFIER",
        `${path}.${index}`,
        "must not duplicate another identifier",
      );
      seen.add(entry);
    });
    return values;
  }
}

function scanForbiddenKeys(
  value: unknown,
  context: ValidationContext,
  path = "$",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanForbiddenKeys(entry, context, `${path}.${index}`),
    );
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    context.check(
      !FORBIDDEN_EXECUTABLE_OR_SECRET_KEYS.has(key.toLowerCase()),
      "FORBIDDEN_CONTENT",
      `${path}.${key}`,
      "must not contain executable content or private-key material",
    );
    scanForbiddenKeys(child, context, `${path}.${key}`);
  }
}

function validatePack(
  value: unknown,
  context: ValidationContext,
): Record<string, unknown> | null {
  if (
    !context.check(
      isObject(value),
      "INVALID_PACK",
      "pack",
      "must be an object",
    )
  ) {
    return null;
  }
  const pack = value as Record<string, unknown>;
  context.check(
    pack.schemaVersion === TECHNICAL_LAB_PACK_SCHEMA_VERSION,
    "UNSUPPORTED_SCHEMA",
    "pack.schemaVersion",
    "must use the active Technical Laboratory schema",
  );
  context.check(
    pack.evidenceSchemaVersion ===
      TECHNICAL_LAB_EVIDENCE_SCHEMA_VERSION,
    "UNSUPPORTED_EVIDENCE_SCHEMA",
    "pack.evidenceSchemaVersion",
    "must use the active technical-evidence schema",
  );
  context.identifier(pack.labPackId, "pack.labPackId");
  context.semanticVersion(pack.labPackVersion, "pack.labPackVersion");
  context.check(
    pack.presetId === "permissioned-blockchain-foundations",
    "UNSUPPORTED_PRESET",
    "pack.presetId",
    "must use the accepted first-release preset",
  );
  context.localizedText(pack.title, "pack.title");
  context.localizedText(pack.description, "pack.description");
  context.localizedText(
    pack.authenticityDisclosure,
    "pack.authenticityDisclosure",
  );
  const locales = context.uniqueStrings(
    pack.supportedLocales,
    "pack.supportedLocales",
    { minimum: 2, maximum: 2 },
  );
  context.check(
    sameValues([...locales].sort(), ["en", "vi"]),
    "LOCALE_PARITY_REQUIRED",
    "pack.supportedLocales",
    "must publish Vietnamese and English content together",
  );
  const moduleIds = context.uniqueStrings(
    pack.moduleIds,
    "pack.moduleIds",
    {
      minimum: TECHNICAL_LAB_MAX_MODULES,
      maximum: TECHNICAL_LAB_MAX_MODULES,
    },
  );
  context.check(
    sameValues(moduleIds, FIRST_TECHNICAL_LAB_MODULE_IDS),
    "FIRST_RELEASE_MODULE_SET",
    "pack.moduleIds",
    "must contain TL1 through TL7 in the approved order",
  );
  context.check(
    ["draft", "validated", "published", "retired"].includes(
      String(pack.status),
    ),
    "INVALID_LIFECYCLE_STATUS",
    "pack.status",
    "must use a supported lifecycle status",
  );
  if (pack.status === "published" || pack.status === "retired") {
    if (
      context.check(
        isObject(pack.publication),
        "MISSING_PUBLICATION",
        "pack.publication",
        "published or retired content requires publication metadata",
      )
    ) {
      const publication = pack.publication as Record<string, unknown>;
      context.check(
        typeof publication.contentHash === "string" &&
          SHA256.test(publication.contentHash),
        "INVALID_CONTENT_HASH",
        "pack.publication.contentHash",
        "must be a SHA-256 digest",
      );
      context.check(
        typeof publication.publishedAt === "string" &&
          ISO_TIMESTAMP.test(publication.publishedAt),
        "INVALID_PUBLICATION_TIME",
        "pack.publication.publishedAt",
        "must be an ISO timestamp",
      );
      context.identifier(
        publication.publishedBy,
        "pack.publication.publishedBy",
      );
    }
  } else {
    context.check(
      pack.publication === undefined,
      "DRAFT_HAS_PUBLICATION",
      "pack.publication",
      "draft or validated content must not claim publication metadata",
    );
  }
  return pack;
}

function validateFixture(
  value: unknown,
  index: number,
  context: ValidationContext,
): string | null {
  const path = `fixtures.${index}`;
  if (
    !context.check(
      isObject(value),
      "INVALID_FIXTURE",
      path,
      "must be an object",
    )
  ) {
    return null;
  }
  const fixture = value as Record<string, unknown>;
  const fixtureId = context.identifier(
    fixture.fixtureId,
    `${path}.fixtureId`,
  )
    ? (fixture.fixtureId as string)
    : null;
  context.semanticVersion(
    fixture.fixtureVersion,
    `${path}.fixtureVersion`,
  );
  context.check(
    fixture.educationalOnly === true,
    "FIXTURE_NOT_EDUCATIONAL",
    `${path}.educationalOnly`,
    "must be true",
  );
  context.check(
    isObject(fixture.initialInput),
    "INVALID_FIXTURE_INPUT",
    `${path}.initialInput`,
    "must be a JSON object",
  );
  for (const field of ["identityIds", "keyIds", "policyIds"] as const) {
    context.uniqueStrings(fixture[field], `${path}.${field}`);
  }
  return fixtureId;
}

function validateModule(
  value: unknown,
  index: number,
  fixtureIds: ReadonlySet<string>,
  context: ValidationContext,
): TechnicalLabModuleDefinition | null {
  const path = `modules.${index}`;
  if (
    !context.check(
      isObject(value),
      "INVALID_MODULE",
      path,
      "must be an object",
    )
  ) {
    return null;
  }
  const module = value as unknown as TechnicalLabModuleDefinition;
  context.check(
    module.moduleId === FIRST_TECHNICAL_LAB_MODULE_IDS[index],
    "MODULE_ORDER_MISMATCH",
    `${path}.moduleId`,
    "must match the approved TL1 through TL7 order",
  );
  context.semanticVersion(module.moduleVersion, `${path}.moduleVersion`);
  context.localizedText(module.title, `${path}.title`);
  context.localizedText(module.summary, `${path}.summary`);
  if (
    context.check(
      Array.isArray(module.learningOutcomes) &&
        module.learningOutcomes.length > 0,
      "MISSING_LEARNING_OUTCOME",
      `${path}.learningOutcomes`,
      "must contain at least one localized learning outcome",
    )
  ) {
    module.learningOutcomes.forEach((outcome, outcomeIndex) =>
      context.localizedText(
        outcome,
        `${path}.learningOutcomes.${outcomeIndex}`,
      ),
    );
  }
  const prerequisites = context.uniqueStrings(
    module.prerequisiteModuleIds,
    `${path}.prerequisiteModuleIds`,
    { maximum: TECHNICAL_LAB_MAX_MODULES - 1 },
  );
  prerequisites.forEach((prerequisite, prerequisiteIndex) => {
    const prerequisitePosition =
      FIRST_TECHNICAL_LAB_MODULE_IDS.indexOf(
        prerequisite as (typeof FIRST_TECHNICAL_LAB_MODULE_IDS)[number],
      );
    context.check(
      prerequisitePosition >= 0 && prerequisitePosition < index,
      "INVALID_PREREQUISITE",
      `${path}.prerequisiteModuleIds.${prerequisiteIndex}`,
      "must refer to an earlier module in this pack",
    );
  });
  context.check(
    Number.isInteger(module.estimatedMinutes) &&
      module.estimatedMinutes >= 1 &&
      module.estimatedMinutes <= 30,
    "INVALID_ESTIMATED_TIME",
    `${path}.estimatedMinutes`,
    "must be 1 to 30 minutes",
  );
  const rendererKnown = context.check(
    (TECHNICAL_LAB_RENDERER_IDS as readonly string[]).includes(
      module.rendererId,
    ),
    "UNKNOWN_RENDERER",
    `${path}.rendererId`,
    "must select a reviewed Technical Laboratory renderer",
  );
  const experiments = module.experimentDefinitions;
  if (
    context.check(
      Array.isArray(experiments) &&
        experiments.length >= 1 &&
        experiments.length <=
          TECHNICAL_LAB_MAX_EXPERIMENTS_PER_MODULE,
      "INVALID_EXPERIMENT_COUNT",
      `${path}.experimentDefinitions`,
      "must contain one to four experiments",
    )
  ) {
    const experimentIds = new Set<string>();
    experiments.forEach((experiment, experimentIndex) => {
      const experimentPath =
        `${path}.experimentDefinitions.${experimentIndex}`;
      if (
        context.identifier(
          experiment.experimentId,
          `${experimentPath}.experimentId`,
        )
      ) {
        context.check(
          !experimentIds.has(experiment.experimentId),
          "DUPLICATE_EXPERIMENT",
          `${experimentPath}.experimentId`,
          "must be unique within the module",
        );
        experimentIds.add(experiment.experimentId);
      }
      if (
        context.identifier(
          experiment.fixtureId,
          `${experimentPath}.fixtureId`,
        )
      ) {
        context.check(
          fixtureIds.has(experiment.fixtureId),
          "UNKNOWN_FIXTURE",
          `${experimentPath}.fixtureId`,
          "must reference a bundled educational fixture",
        );
      }
      const steps = experiment.steps;
      if (
        context.check(
          Array.isArray(steps) &&
            steps.length >= 1 &&
            steps.length <= TECHNICAL_LAB_MAX_STEPS_PER_EXPERIMENT,
          "INVALID_STEP_COUNT",
          `${experimentPath}.steps`,
          "must contain one to sixteen bounded steps",
        )
      ) {
        const stepIds = new Set<string>();
        steps.forEach((step, stepIndex) => {
          const stepPath = `${experimentPath}.steps.${stepIndex}`;
          if (context.identifier(step.stepId, `${stepPath}.stepId`)) {
            context.check(
              !stepIds.has(step.stepId),
              "DUPLICATE_STEP",
              `${stepPath}.stepId`,
              "must be unique within the experiment",
            );
            stepIds.add(step.stepId);
          }
          const actionKnown = context.check(
            (
              TECHNICAL_EXPERIMENT_ACTION_TYPES as readonly string[]
            ).includes(step.actionType),
            "UNKNOWN_ACTION",
            `${stepPath}.actionType`,
            "must select a reviewed experiment action",
          );
          context.check(
            Number.isInteger(step.maximumOccurrences) &&
              step.maximumOccurrences >= 1 &&
              step.maximumOccurrences <=
                TECHNICAL_LAB_MAX_STEP_OCCURRENCES,
            "UNBOUNDED_ACTION",
            `${stepPath}.maximumOccurrences`,
            "must be 1 to 4",
          );
          if (rendererKnown && actionKnown) {
            context.check(
              rendererPermitsAction(
                module.rendererId,
                step.actionType,
              ),
              "ACTION_NOT_PERMITTED",
              `${stepPath}.actionType`,
              "is not permitted by the selected renderer",
            );
          }
          if (step.actionType === "EDIT_INPUT") {
            const editConstraint = step.editConstraint;
            if (!isObject(editConstraint)) {
              context.check(
                false,
                "MISSING_EDIT_BOUND",
                `${stepPath}.editConstraint`,
                "EDIT_INPUT requires explicit input and mutation limits",
              );
            } else {
              context.check(
                Number.isInteger(
                  editConstraint.maximumInputUtf8Bytes,
                ) &&
                  (editConstraint.maximumInputUtf8Bytes as number) >= 1 &&
                  (editConstraint.maximumInputUtf8Bytes as number) <=
                    TECHNICAL_LAB_MAX_EDIT_INPUT_BYTES,
                "UNBOUNDED_EDIT_INPUT",
                `${stepPath}.editConstraint.maximumInputUtf8Bytes`,
                "must be 1 to 512 bytes",
              );
              context.check(
                Number.isInteger(
                  editConstraint.maximumMutations,
                ) &&
                  (editConstraint.maximumMutations as number) >= 1 &&
                  (editConstraint.maximumMutations as number) <=
                    TECHNICAL_LAB_MAX_EDIT_MUTATIONS,
                "UNBOUNDED_EDIT_MUTATIONS",
                `${stepPath}.editConstraint.maximumMutations`,
                "must be 1 to 4",
              );
            }
          } else {
            context.check(
              step.editConstraint === undefined,
              "UNEXPECTED_EDIT_BOUND",
              `${stepPath}.editConstraint`,
              "is permitted only for EDIT_INPUT",
            );
          }
        });
      }
      for (const field of [
        "expectedObservationIds",
        "interpretationItemIds",
        "applicationItemIds",
        "evidencePanelIds",
      ] as const) {
        context.uniqueStrings(
          experiment[field],
          `${experimentPath}.${field}`,
          { minimum: 1, maximum: 16 },
        );
      }
    });
  }
  for (const field of [
    "scorableItemIds",
    "hintIds",
    "glossaryTermIds",
    "realMechanismIds",
    "simulatedMechanismIds",
  ] as const) {
    const values = context.uniqueStrings(
      module[field],
      `${path}.${field}`,
      {
        minimum:
          field === "realMechanismIds" ||
          field === "scorableItemIds"
            ? 1
            : 0,
        maximum: 32,
      },
    );
    if (field === "realMechanismIds") {
      values.forEach((mechanismId, mechanismIndex) => {
        context.check(
          (
            GENUINE_TECHNICAL_MECHANISM_IDS as readonly string[]
          ).includes(mechanismId),
          "UNKNOWN_REAL_MECHANISM",
          `${path}.${field}.${mechanismIndex}`,
          "must identify a genuinely computed TraceChain mechanism",
        );
      });
    }
    if (field === "simulatedMechanismIds") {
      values.forEach((mechanismId, mechanismIndex) => {
        context.check(
          (
            SIMULATED_TECHNICAL_MECHANISM_IDS as readonly string[]
          ).includes(mechanismId),
          "UNKNOWN_SIMULATED_MECHANISM",
          `${path}.${field}.${mechanismIndex}`,
          "must identify an explicitly simulated mechanism",
        );
      });
    }
  }
  return module;
}

function validateScoring(
  value: unknown,
  context: ValidationContext,
): void {
  const path = "pack.scoringContract";
  if (
    !context.check(
      isObject(value),
      "INVALID_SCORING_CONTRACT",
      path,
      "must be an object",
    )
  ) {
    return;
  }
  const scoring = value as Record<string, unknown>;
  context.identifier(
    scoring.scoringContractId,
    `${path}.scoringContractId`,
  );
  context.check(
    scoring.maximumScore === 100,
    "INVALID_MAXIMUM_SCORE",
    `${path}.maximumScore`,
    "must equal 100",
  );
  context.check(
    scoring.passScore === 70,
    "INVALID_PASS_SCORE",
    `${path}.passScore`,
    "must equal the accepted preset value of 70",
  );
  const allocations = scoring.moduleAllocations;
  if (
    !Array.isArray(allocations) ||
    allocations.length !== FIRST_TECHNICAL_LAB_MODULE_IDS.length
  ) {
    context.check(
      false,
      "INVALID_SCORE_ALLOCATIONS",
      `${path}.moduleAllocations`,
      "must contain one allocation for each module",
    );
    return;
  }
  let maximumScore = 0;
  allocations.forEach((allocation: unknown, index: number) => {
    const allocationPath = `${path}.moduleAllocations.${index}`;
    if (!isObject(allocation)) {
      context.check(
        false,
        "INVALID_SCORE_ALLOCATION",
        allocationPath,
        "must be an object",
      );
      return;
    }
    const moduleId = FIRST_TECHNICAL_LAB_MODULE_IDS[index];
    if (moduleId === undefined) return;
    context.check(
      allocation.moduleId === moduleId,
      "SCORE_MODULE_ORDER_MISMATCH",
      `${allocationPath}.moduleId`,
      "must follow the approved module order",
    );
    const expected = EXPECTED_MODULE_POINTS[moduleId];
    const actual = [
      allocation.experimentPoints,
      allocation.interpretationPoints,
      allocation.applicationPoints,
    ];
    context.check(
      expected.every((points, pointIndex) => points === actual[pointIndex]),
      "SCORE_ALLOCATION_MISMATCH",
      allocationPath,
      "must preserve the approved experiment, interpretation, and application points",
    );
    for (const points of actual) {
      if (typeof points === "number") maximumScore += points;
    }
  });
  context.check(
    maximumScore === 100,
    "SCORE_TOTAL_MISMATCH",
    `${path}.moduleAllocations`,
    "must total exactly 100 points",
  );
}

function validateLocalizationCatalogs(
  value: unknown,
  locales: readonly string[],
  context: ValidationContext,
): void {
  if (!isObject(value)) {
    context.check(
      false,
      "INVALID_LOCALIZATION_CATALOGS",
      "localizationCatalogs",
      "must be an object",
    );
    return;
  }
  for (const locale of locales) {
    const catalog = value[locale];
    if (!isObject(catalog)) {
      context.check(
        false,
        "MISSING_LOCALE_CATALOG",
        `localizationCatalogs.${locale}`,
        "must exist for every supported locale",
      );
      continue;
    }
    for (const key of context.localizationKeys) {
      context.check(
        typeof catalog[key] === "string" &&
          (catalog[key] as string).trim().length > 0,
        "MISSING_LOCALIZATION",
        `localizationCatalogs.${locale}.${key}`,
        "must provide non-empty learner-facing text",
      );
    }
  }
}

function maximumJournalEntries(
  modules: readonly TechnicalLabModuleDefinition[],
): number {
  return modules.reduce(
    (moduleTotal, module) =>
      moduleTotal +
      module.experimentDefinitions.reduce(
        (experimentTotal, experiment) =>
          experimentTotal +
          experiment.steps.reduce(
            (stepTotal, step) =>
              stepTotal + step.maximumOccurrences,
            0,
          ),
        0,
      ),
    0,
  );
}

export function validateTechnicalLabPackBundle(
  value: unknown,
): TechnicalLabValidationResult {
  const context = new ValidationContext();
  scanForbiddenKeys(value, context);
  if (
    !context.check(
      isObject(value),
      "INVALID_BUNDLE",
      "$",
      "must be an object",
    )
  ) {
    return {
      isValid: false,
      issues: context.issues,
      checkedCount: context.checkedCount,
    };
  }
  const bundle = value as Record<string, unknown>;
  const pack = validatePack(bundle.pack, context);
  const fixtureValues = Array.isArray(bundle.fixtures)
    ? bundle.fixtures
    : [];
  context.check(
    Array.isArray(bundle.fixtures) && fixtureValues.length > 0,
    "MISSING_FIXTURES",
    "fixtures",
    "must contain educational fixtures",
  );
  const fixtureIds = new Set<string>();
  fixtureValues.forEach((fixture, index) => {
    const fixtureId = validateFixture(fixture, index, context);
    if (fixtureId !== null) {
      context.check(
        !fixtureIds.has(fixtureId),
        "DUPLICATE_FIXTURE",
        `fixtures.${index}.fixtureId`,
        "must be unique",
      );
      fixtureIds.add(fixtureId);
    }
  });
  const moduleValues = Array.isArray(bundle.modules)
    ? bundle.modules
    : [];
  context.check(
    Array.isArray(bundle.modules) &&
      moduleValues.length === TECHNICAL_LAB_MAX_MODULES,
    "INVALID_MODULE_COUNT",
    "modules",
    "must contain all seven first-release modules",
  );
  const modules = moduleValues
    .map((module, index) =>
      validateModule(module, index, fixtureIds, context),
    )
    .filter(
      (module): module is TechnicalLabModuleDefinition =>
        module !== null,
    );
  context.check(
    maximumJournalEntries(modules) <=
      TECHNICAL_LAB_MAX_JOURNAL_ENTRIES,
    "JOURNAL_RECORD_LIMIT_EXCEEDED",
    "modules",
    "authored maximum actions must fit the compact journal record budget",
  );
  if (pack !== null) {
    validateScoring(pack.scoringContract, context);
    const locales = stringArray(pack.supportedLocales)
      ? pack.supportedLocales
      : [];
    validateLocalizationCatalogs(
      bundle.localizationCatalogs,
      locales,
      context,
    );
  }
  if (context.issues.length > 0) {
    return {
      isValid: false,
      issues: context.issues,
      checkedCount: context.checkedCount,
    };
  }
  return {
    isValid: true,
    bundle: structuredClone(
      value as unknown as TechnicalLabPackBundle,
    ),
    issues: [],
    checkedCount: context.checkedCount,
  };
}

export function validateTechnicalLabConfigurationAgainstPack(
  configuration: TechnicalLabConfiguration,
  bundle: TechnicalLabPackBundle,
): readonly TechnicalLabValidationIssue[] {
  const issues: TechnicalLabValidationIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({
      code: "CONFIGURATION_PACK_MISMATCH",
      path,
      message,
    });
  };
  if (configuration.labPackId !== bundle.pack.labPackId) {
    add("labPackId", "must match the exact bundled laboratory pack");
  }
  if (
    configuration.labPackVersion !== bundle.pack.labPackVersion
  ) {
    add(
      "labPackVersion",
      "must match the exact bundled laboratory pack version",
    );
  }
  if (configuration.laboratoryPresetId !== bundle.pack.presetId) {
    add(
      "laboratoryPresetId",
      "must match the bundled laboratory preset",
    );
  }
  if (
    !sameValues(
      configuration.includedModuleIds,
      bundle.pack.moduleIds,
    )
  ) {
    add(
      "includedModuleIds",
      "must contain the complete authored first-release module set",
    );
  }
  if (
    configuration.scoring.maximumScore !==
      bundle.pack.scoringContract.maximumScore ||
    configuration.scoring.passScore !==
      bundle.pack.scoringContract.passScore
  ) {
    add("scoring", "must match the published laboratory scoring contract");
  }
  return issues;
}

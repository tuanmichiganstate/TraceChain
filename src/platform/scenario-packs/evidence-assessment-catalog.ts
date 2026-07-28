import type { HostedAssignmentV1 } from "../contracts/assessment";
import type {
  AssignmentEvidenceAssessmentCatalogV1,
  ScenarioEvidenceAssessmentCatalogV1,
} from "../contracts/evidence-assessment";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";

export class EvidenceAssessmentCatalogError extends Error {
  constructor(
    readonly code: "EVIDENCE_CATALOG_CONTENT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "EvidenceAssessmentCatalogError";
  }
}

function exactScenario(
  pack: ScenarioPackV1,
  scenarioId: string,
  scenarioVersion: string,
) {
  const scenario = pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === scenarioId &&
      candidate.version === scenarioVersion,
  );
  if (scenario === undefined) {
    throw new EvidenceAssessmentCatalogError(
      "EVIDENCE_CATALOG_CONTENT_MISMATCH",
      "The evidence catalog requires one exact scenario version.",
    );
  }
  return scenario;
}

function localizedValues(
  pack: ScenarioPackV1,
  localizationKey: string,
  bundledCatalogs: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    pack.supportedLocales.map((locale) => {
      const value =
        pack.localizationCatalogs?.[locale]?.[localizationKey] ??
        bundledCatalogs[locale]?.[localizationKey];
      if (typeof value !== "string" || value.length === 0) {
        throw new EvidenceAssessmentCatalogError(
          "EVIDENCE_CATALOG_CONTENT_MISMATCH",
          `Evidence localization ${localizationKey} is missing for ${locale}.`,
        );
      }
      return [locale, value];
    }),
  );
}

export function createScenarioEvidenceAssessmentCatalog(options: {
  readonly pack: ScenarioPackV1;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly localizationCatalogs: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
  readonly visibleToRoleId?: string;
}): ScenarioEvidenceAssessmentCatalogV1 {
  const scenario = exactScenario(
    options.pack,
    options.scenarioId,
    options.scenarioVersion,
  );
  if (
    options.visibleToRoleId !== undefined &&
    !scenario.roles.some(
      (role) => role.roleId === options.visibleToRoleId,
    )
  ) {
    throw new EvidenceAssessmentCatalogError(
      "EVIDENCE_CATALOG_CONTENT_MISMATCH",
      "The evidence catalog role is not defined by the scenario.",
    );
  }

  return {
    schemaVersion: "1.0.0",
    packId: options.pack.packId,
    packVersion: options.pack.version,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.version,
    evidenceDefinitions: scenario.evidenceItems
      .filter(
        (evidence) =>
          options.visibleToRoleId === undefined ||
          evidence.visibleToRoleIds.includes(
            options.visibleToRoleId,
          ),
      )
      .map((evidence) => ({
        evidenceId: evidence.evidenceId,
        evidenceType: evidence.evidenceType,
        title: {
          localizationKey: evidence.title.localizationKey,
          valuesByLocale: localizedValues(
            options.pack,
            evidence.title.localizationKey,
            options.localizationCatalogs,
          ),
        },
        sourceOrganizationId: evidence.sourceOrganizationId,
        ...(evidence.staffProfileId === undefined
          ? {}
          : { staffProfileId: evidence.staffProfileId }),
        visibleToRoleIds: evidence.visibleToRoleIds,
        learnerMetadata: evidence.learnerMetadata,
        assessmentMetadata: evidence.assessmentMetadata,
      })),
  };
}

export function createAssignmentEvidenceAssessmentCatalog(options: {
  readonly assignment: HostedAssignmentV1;
  readonly pack: ScenarioPackV1;
  readonly localizationCatalogs: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}): AssignmentEvidenceAssessmentCatalogV1 {
  if (
    options.assignment.packId !== options.pack.packId ||
    options.assignment.packVersion !== options.pack.version
  ) {
    throw new EvidenceAssessmentCatalogError(
      "EVIDENCE_CATALOG_CONTENT_MISMATCH",
      "The assignment and evidence catalog pack versions do not match.",
    );
  }
  return {
    ...createScenarioEvidenceAssessmentCatalog({
      pack: options.pack,
      scenarioId: options.assignment.scenarioId,
      scenarioVersion: options.assignment.scenarioVersion,
      localizationCatalogs: options.localizationCatalogs,
    }),
    assignmentId: options.assignment.assignmentId,
  };
}

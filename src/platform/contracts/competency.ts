import type {
  LocalizedText,
  VersionLifecycleStatus,
} from "./content";

export type CompetencyTargetType = "primary" | "supporting" | "contextual";

export interface PerformanceIndicatorV1 {
  readonly indicatorId: string;
  readonly version: string;
  readonly statement: LocalizedText;
}

export interface CompetencyDefinitionV1 {
  readonly competencyId: string;
  readonly version: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly indicators: readonly PerformanceIndicatorV1[];
}

export interface CompetencyFrameworkV1 {
  readonly schemaVersion: "1.0.0";
  readonly frameworkId: string;
  readonly version: string;
  readonly status: VersionLifecycleStatus;
  readonly title: LocalizedText;
  readonly competencies: readonly CompetencyDefinitionV1[];
}

export interface CompetencyTargetV1 {
  readonly competencyId: string;
  readonly indicatorIds: readonly string[];
  readonly targetType: CompetencyTargetType;
}

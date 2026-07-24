import type { LocalizedText } from "./content";

export interface RubricLevelV1 {
  readonly value: number;
  readonly label: LocalizedText;
}

export interface RubricCriterionV1 {
  readonly criterionId: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly indicatorIds: readonly string[];
  readonly evidenceRuleIds: readonly string[];
}

export interface RubricDefinitionV1 {
  readonly rubricId: string;
  readonly version: string;
  readonly title: LocalizedText;
  readonly levels: readonly RubricLevelV1[];
  readonly criteria: readonly RubricCriterionV1[];
}

export type EvidenceRuleOperator =
  | "EVENT_OCCURRED"
  | "FIELD_EQUALS"
  | "FIELD_IN";

export interface AutomatedEvidenceRuleV1 {
  readonly evidenceRuleId: string;
  readonly version: string;
  readonly indicatorIds: readonly string[];
  readonly operator: EvidenceRuleOperator;
  readonly eventType: string;
  readonly fieldPath?: string;
  readonly expectedValue?: string | number | boolean;
  readonly expectedValues?: readonly (string | number | boolean)[];
}

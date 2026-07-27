export type ScormPackagePresetId =
  | "guided"
  | "practice"
  | "challenge"
  | "assessment"
  | "audit-guided"
  | "audit-practice";

export interface HostedScormPackageArtifactV1 {
  readonly presetId: ScormPackagePresetId;
  readonly configurationSchemaVersion: "2";
  readonly activityType: "OPERATIONS" | "AUDIT" | "TECHNICAL_LAB";
  readonly supportProfile: "GUIDED" | "PRACTICE" | "CHALLENGE";
  readonly deliveryPurpose: "FORMATIVE" | "ASSESSMENT" | "SANDBOX";
  readonly outcomeStrategy:
    | "FIXED"
    | "CURATED_VARIANT"
    | "SEEDED_STOCHASTIC"
    | "FORCED_CONDITION";
  readonly contentPackId: string;
  readonly contentPackVersion: string;
  readonly scoringBlueprintId: string;
  readonly scoringBlueprintVersion: string;
  readonly title: string;
  readonly filename: string;
  readonly downloadPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly release: boolean;
  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly applicationBuildHash: string;
  readonly sourceCommit: string;
  readonly generatedAt: string;
  readonly cryptographicEvidenceSchemaVersion: string | null;
}

export interface HostedScormPackageCatalogV1 {
  readonly schemaVersion: "2.0.0";
  readonly generatedAt: string;
  readonly sourceCommit: string;
  readonly applicationBuildHash: string;
  readonly release: boolean;
  readonly packages: readonly HostedScormPackageArtifactV1[];
}

export interface ScormPackageJobV1 {
  readonly schemaVersion: "2.0.0";
  readonly jobId: string;
  readonly presetId: ScormPackagePresetId;
  readonly configurationSchemaVersion: "2";
  readonly activityType: "OPERATIONS" | "AUDIT" | "TECHNICAL_LAB";
  readonly supportProfile: "GUIDED" | "PRACTICE" | "CHALLENGE";
  readonly deliveryPurpose: "FORMATIVE" | "ASSESSMENT" | "SANDBOX";
  readonly outcomeStrategy:
    | "FIXED"
    | "CURATED_VARIANT"
    | "SEEDED_STOCHASTIC"
    | "FORCED_CONDITION";
  readonly contentPackId: string;
  readonly contentPackVersion: string;
  readonly scoringBlueprintId: string;
  readonly scoringBlueprintVersion: string;
  readonly status: "completed";
  readonly title: string;
  readonly filename: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly release: boolean;
  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly applicationBuildHash: string;
  readonly sourceCommit: string;
  readonly artifactKey: string;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly requestedByUserId: string;
}

export interface CreateScormPackageJobRequest {
  readonly commandId: string;
  readonly jobId: string;
  readonly presetId: ScormPackagePresetId;
}

export interface CreateScormPackageJobResult {
  readonly job: ScormPackageJobV1;
  readonly wasIdempotentReplay: boolean;
}

import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import type {
  CounterfactualComparisonExportV1,
  CounterfactualComparisonV1,
  CounterfactualReflectionV1,
  CounterfactualRunMetadataV1,
} from "../contracts/counterfactual";

export class CounterfactualExportError extends Error {
  constructor(
    readonly code: "COUNTERFACTUAL_EXPORT_SOURCE_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "CounterfactualExportError";
  }
}

export function createCounterfactualComparisonExport(options: {
  readonly metadata: CounterfactualRunMetadataV1;
  readonly comparison: CounterfactualComparisonV1;
  readonly reflection: CounterfactualReflectionV1 | null;
  readonly generatedAt: string;
}): CounterfactualComparisonExportV1 {
  if (
    options.metadata.branchRunId !==
      options.comparison.counterfactualId ||
    options.metadata.sourceRunId !==
      options.comparison.sourceRunId ||
    options.metadata.forkNodeId !==
      options.comparison.forkNodeId ||
    (options.reflection !== null &&
      options.reflection.branchRunId !==
        options.metadata.branchRunId)
  ) {
    throw new CounterfactualExportError(
      "COUNTERFACTUAL_EXPORT_SOURCE_MISMATCH",
      "Counterfactual metadata, comparison, and reflection must describe one branch.",
    );
  }
  return {
    schemaVersion: "1.0.0",
    exportType: "TRACECHAIN_COUNTERFACTUAL_COMPARISON",
    generatedAt: options.generatedAt,
    metadata: structuredClone(options.metadata),
    comparison: structuredClone(options.comparison),
    reflection:
      options.reflection === null
        ? null
        : structuredClone(options.reflection),
  };
}

export function serializeCounterfactualComparisonJson(
  exported: CounterfactualComparisonExportV1,
): string {
  return `${JSON.stringify(exported, null, 2)}\n`;
}

const CSV_COLUMNS = [
  "export_schema_version",
  "record_type",
  "counterfactual_id",
  "source_run_id",
  "fork_sequence_number",
  "fork_node_id",
  "decision_id",
  "classification",
  "created_by_user_id",
  "recorded_at",
  "sequence_number",
  "event_id",
  "event_type",
  "dimension_id",
  "evaluation_status",
  "source_pack_id",
  "source_pack_version",
  "source_scenario_id",
  "source_scenario_version",
  "reflection_id",
  "payload_json",
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];
type CsvValue = string | number | undefined;
type CsvRow = Readonly<Partial<Record<CsvColumn, CsvValue>>>;

function csvCell(value: CsvValue): string {
  if (value === undefined) return "";
  let text = String(value);
  if (
    typeof value === "string" &&
    /^[=+\-@\t\r]/u.test(text)
  ) {
    text = `'${text}`;
  }
  if (/[",\r\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvRows(
  exported: CounterfactualComparisonExportV1,
): readonly CsvRow[] {
  const metadata = exported.metadata;
  const comparison = exported.comparison;
  const common = {
    export_schema_version: exported.schemaVersion,
    counterfactual_id: metadata.branchRunId,
    source_run_id: metadata.sourceRunId,
    fork_sequence_number: metadata.forkSequenceNumber,
    fork_node_id: metadata.forkNodeId,
    decision_id: comparison.decisionId,
    classification: comparison.classification,
    source_pack_id: metadata.sourcePackId,
    source_pack_version: metadata.sourcePackVersion,
    source_scenario_id: metadata.sourceScenarioId,
    source_scenario_version: metadata.sourceScenarioVersion,
  } as const;
  return [
    {
      ...common,
      record_type: "counterfactual",
      created_by_user_id: metadata.createdByUserId,
      recorded_at: metadata.createdAt,
      payload_json: canonicalize({
        generatedAt: exported.generatedAt,
        interpretation: comparison.interpretation,
        hindsightLimitation: comparison.hindsightLimitation,
        sourceConfigurationHash:
          metadata.sourceConfigurationHash,
        sourceSeed: metadata.sourceSeed,
        sourceStateHash: metadata.sourceStateHash,
        sourceInformationStateHash:
          metadata.sourceInformationStateHash,
        originalAssessedResult:
          comparison.originalAssessedResult,
        alternativeExploratoryResult:
          comparison.alternativeExploratoryResult,
        differences: comparison.differences,
        informationAvailableWhenDecisionWasMade:
          comparison.informationAvailableWhenDecisionWasMade,
        informationRevealedLaterRecordIds:
          comparison.informationRevealedLaterRecordIds,
      }),
    },
    ...comparison.timelines.original.map(
      (item): CsvRow => ({
        ...common,
        record_type: "original_timeline_event",
        recorded_at: item.occurredAt,
        sequence_number: item.sequenceNumber,
        event_id: item.eventId,
        event_type: item.eventType,
        payload_json: canonicalize({
          causationId: item.causationId,
        }),
      }),
    ),
    ...comparison.timelines.alternative.map(
      (item): CsvRow => ({
        ...common,
        record_type: "alternative_timeline_event",
        recorded_at: item.occurredAt,
        sequence_number: item.sequenceNumber,
        event_id: item.eventId,
        event_type: item.eventType,
        payload_json: canonicalize({
          causationId: item.causationId,
        }),
      }),
    ),
    ...comparison.dimensions.map(
      (dimension): CsvRow => ({
        ...common,
        record_type: "comparison_dimension",
        dimension_id: dimension.dimensionId,
        evaluation_status: dimension.evaluationStatus,
        payload_json: canonicalize(dimension),
      }),
    ),
    ...(exported.reflection === null
      ? []
      : [
          {
            ...common,
            record_type: "reflection",
            created_by_user_id:
              exported.reflection.submittedByUserId,
            recorded_at: exported.reflection.submittedAt,
            reflection_id:
              exported.reflection.reflectionId,
            payload_json: canonicalize(
              exported.reflection.response,
            ),
          } satisfies CsvRow,
        ]),
  ];
}

export function serializeCounterfactualComparisonCsv(
  exported: CounterfactualComparisonExportV1,
): string {
  const lines = [
    CSV_COLUMNS.join(","),
    ...csvRows(exported).map((row) =>
      CSV_COLUMNS.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function counterfactualComparisonFilename(
  branchRunId: string,
  extension: "json" | "csv",
): string {
  const safeBranchRunId = branchRunId.replaceAll(
    /[^A-Za-z0-9._-]/gu,
    "_",
  );
  return `TraceChain_${safeBranchRunId}_counterfactual_v1.${extension}`;
}

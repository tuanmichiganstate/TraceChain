import { describe, expect, it } from "vitest";
import guidedPackJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import practicePackJson from "../../../scenario-packs/practice-coffee-audit/tracechain.pack.json";
import type { AuditCaseDefinitionV1 } from "../../platform/contracts/audit";
import type { ScenarioPackV1 } from "../../platform/contracts/scenario-pack";
import {
  decodeTa1AuditSnapshot,
  emptyTa1AuditSnapshot,
  encodeTa1AuditSnapshot,
  TA1_SUSPEND_DATA_CEILING,
  type Ta1AuditCodecSchema,
  type Ta1AuditSnapshot,
} from "./ta1-audit-codec";

const guidedPack = guidedPackJson as ScenarioPackV1;
const guidedScenario = guidedPack.scenarios[0]!;
const guidedAuditCase = guidedScenario.auditCase!;
const practicePack = practicePackJson as ScenarioPackV1;
const practiceScenario = practicePack.scenarios[0]!;
const practiceAuditCase = practiceScenario.auditCase!;

const schema: Ta1AuditCodecSchema = {
  configurationHash: "a".repeat(64),
  packContentHash: "b".repeat(64),
  scenarioId: guidedScenario.scenarioId,
  scenarioVersion: guidedScenario.version,
  auditCase: guidedAuditCase,
};
const TA1_AUTHORED_WORST_CASE_BUDGET = 3_300;

function randomAscii(length: number, seed: number): string {
  let state = seed >>> 0;
  return Array.from({ length }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return String.fromCharCode(33 + (state % 90));
  }).join("");
}

function finding(
  auditCase: AuditCaseDefinitionV1,
  findingId: string,
  seed = 1,
) {
  return {
    findingId,
    categoryId: auditCase.categories[0]!.choiceId,
    entityId: auditCase.entities[0]!.choiceId,
    title: randomAscii(
      auditCase.inputLimits.findingTitleUtf8Bytes,
      seed,
    ),
    observation: randomAscii(
      auditCase.inputLimits.findingObservationUtf8Bytes,
      seed + 100,
    ),
    severity: "HIGH" as const,
    materiality: "MATERIAL" as const,
    confidence: 87,
    evidenceIds: auditCase.evidenceItemIds.slice(
      0,
      auditCase.inputLimits.maximumEvidenceCitationsPerFinding,
    ),
    policyIds: auditCase.policyIds.slice(
      0,
      auditCase.inputLimits.maximumPolicyCitationsPerFinding,
    ),
    rootCauseCode: auditCase.rootCauses[0]!.choiceId,
    recommendationCode: auditCase.recommendations[0]!.choiceId,
    recommendation: randomAscii(
      auditCase.inputLimits.findingRecommendationUtf8Bytes,
      seed + 200,
    ),
  };
}

describe("TA1 compact Audit persistence", () => {
  it("round-trips compact replay inputs across the exact case boundary", () => {
    const snapshot: Ta1AuditSnapshot = {
      ...emptyTa1AuditSnapshot(),
      commandJournal: [
        { operation: "VIEW_SCOPE" },
        ...guidedAuditCase.evidenceItemIds.slice(0, 2).map((evidenceId) => ({
          operation: "INSPECT_EVIDENCE" as const,
          evidenceId,
        })),
        {
          operation: "BOOKMARK_EVIDENCE",
          evidenceId: guidedAuditCase.evidenceItemIds[1]!,
        },
        {
          operation: "INSPECT_SOURCE_RECORD",
          sourceRecordId:
            guidedAuditCase.sourceRecords[0]!.sourceRecordId,
        },
        {
          operation: "VIEW_HINT",
          hintId: guidedAuditCase.hints[0]!.hintId,
        },
        {
          operation: "SAVE_DRAFT",
          finding: finding(guidedAuditCase, "F2", 2),
        },
        {
          operation: "SUBMIT_FINDING",
          finding: finding(guidedAuditCase, "F1"),
        },
        {
          operation: "AMEND_FINDING",
          finding: {
            ...finding(guidedAuditCase, "F1"),
            confidence: 95,
          },
        },
      ],
    };

    const encoded = encodeTa1AuditSnapshot(snapshot, schema);
    expect(encoded.startsWith("TA1.")).toBe(true);
    expect(encoded.length).toBeLessThanOrEqual(
      TA1_SUSPEND_DATA_CEILING,
    );
    expect(decodeTa1AuditSnapshot(encoded, schema)).toEqual(snapshot);
  });

  it("rejects progress from another exact configuration", () => {
    const encoded = encodeTa1AuditSnapshot(
      emptyTa1AuditSnapshot(),
      schema,
    );
    expect(() =>
      decodeTa1AuditSnapshot(encoded, {
        ...schema,
        configurationHash: "c".repeat(64),
      }),
    ).toThrow(/incompatible/iu);
  });

  it.each([
    {
      label: "Guided Audit",
      auditCase: guidedAuditCase,
      codecSchema: schema,
    },
    {
      label: "Practice Audit",
      auditCase: practiceAuditCase,
      codecSchema: {
        ...schema,
        configurationHash: "c".repeat(64),
        packContentHash: "d".repeat(64),
        scenarioId: practiceScenario.scenarioId,
        scenarioVersion: practiceScenario.version,
        auditCase: practiceAuditCase,
      },
    },
  ])(
    "fits the actual $label authored worst case below the internal ceiling",
    ({ auditCase, codecSchema }) => {
      const maximumRecords =
        auditCase.inputLimits.maximumFindingRecords;
      const snapshot: Ta1AuditSnapshot = {
        commandJournal: [
          { operation: "VIEW_SCOPE" },
          ...auditCase.evidenceItemIds.flatMap((evidenceId) => [
            {
              operation: "INSPECT_EVIDENCE" as const,
              evidenceId,
            },
            {
              operation: "BOOKMARK_EVIDENCE" as const,
              evidenceId,
            },
          ]),
          ...auditCase.sourceRecords.map((record) => ({
            operation: "INSPECT_SOURCE_RECORD" as const,
            sourceRecordId: record.sourceRecordId,
          })),
          ...auditCase.hints.map((hint) => ({
            operation: "VIEW_HINT" as const,
            hintId: hint.hintId,
          })),
          {
            operation: "SAVE_DRAFT",
            finding: finding(auditCase, "F9", 900),
          },
          ...Array.from(
            { length: maximumRecords },
            (_, index) => ({
              operation:
                index <
                auditCase.completionDefinition
                  .maximumSubmittedFindings
                  ? ("SUBMIT_FINDING" as const)
                  : ("AMEND_FINDING" as const),
              finding: finding(
                auditCase,
                `F${String((index % 4) + 1)}`,
                10 + index,
              ),
            }),
          ),
          {
            operation: "SUBMIT_CONCLUSION",
            conclusion: {
              conclusionCategory:
                auditCase.conclusionCategories[0]!.conclusionCategory,
              scopeSummary: randomAscii(
                auditCase.inputLimits.conclusionFieldUtf8Bytes,
                1_001,
              ),
              materialFindingsSummary: randomAscii(
                auditCase.inputLimits.conclusionFieldUtf8Bytes,
                1_002,
              ),
              nonMaterialFindingsSummary: randomAscii(
                auditCase.inputLimits.conclusionFieldUtf8Bytes,
                1_003,
              ),
              limitations: randomAscii(
                auditCase.inputLimits.conclusionFieldUtf8Bytes,
                1_004,
              ),
              uncertainty: randomAscii(
                auditCase.inputLimits.conclusionFieldUtf8Bytes,
                1_005,
              ),
              recommendations: randomAscii(
                auditCase.inputLimits.conclusionFieldUtf8Bytes,
                1_006,
              ),
              confidence: 100,
            },
          },
        ],
      };
      const encoded = encodeTa1AuditSnapshot(
        snapshot,
        codecSchema,
      );

      expect(encoded.length).toBeLessThanOrEqual(
        TA1_AUTHORED_WORST_CASE_BUDGET,
      );
      expect(encoded.length).toBeLessThanOrEqual(
        TA1_SUSPEND_DATA_CEILING,
      );
      expect(
        decodeTa1AuditSnapshot(encoded, codecSchema),
      ).toEqual(snapshot);
    },
  );
});

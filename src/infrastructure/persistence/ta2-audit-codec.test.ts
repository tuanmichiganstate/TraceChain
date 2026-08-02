import { describe, expect, it } from "vitest";
import guidedPackJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import practicePackJson from "../../../scenario-packs/practice-coffee-audit/tracechain.pack.json";
import challengePackJson from "../../../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
import type { AuditCaseDefinitionV1 } from "../../platform/contracts/audit";
import type { ScenarioPackV2 } from "../../platform/contracts/scenario-pack";
import { auditVariantAssignmentForIndex } from "../../platform/audit/audit-variant-bank";
import {
  decodeTa2AuditSnapshot,
  emptyTa2AuditSnapshot,
  encodeTa2AuditSnapshot,
  TA2_SUSPEND_DATA_CEILING,
  type Ta2AuditCodecSchema,
  type Ta2AuditSnapshot,
} from "./ta2-audit-codec";

const guidedPack = guidedPackJson as ScenarioPackV2;
const guidedScenario = guidedPack.scenarios[0]!;
const guidedAuditCase = guidedScenario.auditCase!;
const practicePack = practicePackJson as ScenarioPackV2;
const practiceScenario = practicePack.scenarios[0]!;
const practiceAuditCase = practiceScenario.auditCase!;
const challengePack = challengePackJson as ScenarioPackV2;
const challengeBank = challengePack.auditVariantBanks[0]!;

const schema: Ta2AuditCodecSchema = {
  configurationHash: "a".repeat(64),
  packContentHash: "b".repeat(64),
  scenarioId: guidedScenario.scenarioId,
  scenarioVersion: guidedScenario.version,
  auditCase: guidedAuditCase,
};
const TA2_AUTHORED_WORST_CASE_BUDGET = 3_300;

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

describe("TA2 compact Audit persistence", () => {
  it("round-trips compact replay inputs across the exact case boundary", () => {
    const snapshot: Ta2AuditSnapshot = {
      ...emptyTa2AuditSnapshot(),
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

    const encoded = encodeTa2AuditSnapshot(snapshot, schema);
    expect(encoded.startsWith("TA2.")).toBe(true);
    expect(encoded.length).toBeLessThanOrEqual(
      TA2_SUSPEND_DATA_CEILING,
    );
    expect(decodeTa2AuditSnapshot(encoded, schema)).toEqual(snapshot);
  });

  it("rejects progress from another exact configuration", () => {
    const encoded = encodeTa2AuditSnapshot(
      emptyTa2AuditSnapshot(),
      schema,
    );
    expect(() =>
      decodeTa2AuditSnapshot(encoded, {
        ...schema,
        configurationHash: "c".repeat(64),
      }),
    ).toThrow(/incompatible/iu);
  });

  it.each(challengeBank.variants.map((variant, variantIndex) => ({
    variant,
    variantIndex,
  })))(
    "round-trips the persisted assignment for $variant.caseReference before reveal",
    ({ variant, variantIndex }) => {
      const selectedScenario = challengePack.scenarios.find(
        (candidate) =>
          candidate.scenarioId === variant.scenarioId &&
          candidate.version === variant.scenarioVersion,
      )!;
      const selectedCase = selectedScenario.auditCase!;
      const selectedSchema: Ta2AuditCodecSchema = {
        ...schema,
        scenarioId: selectedScenario.scenarioId,
        scenarioVersion: selectedScenario.version,
        auditCase: selectedCase,
        variantBank: challengeBank,
      };
      const assignment = auditVariantAssignmentForIndex({
        bank: challengeBank,
        variantIndex,
        attemptSeed: `CCCCCCCCCCCCCCCCCCCCC${String(variantIndex)}`,
        assignmentSource: "SCORM_ATTEMPT",
      });
      const snapshot = emptyTa2AuditSnapshot(assignment);
      const encoded = encodeTa2AuditSnapshot(
        snapshot,
        selectedSchema,
      );

      expect(
        decodeTa2AuditSnapshot(encoded, selectedSchema),
      ).toEqual(snapshot);
      expect(encoded.length).toBeLessThan(
        TA2_SUSPEND_DATA_CEILING,
      );
    },
  );

  it.each([
    {
      label: "Guided Audit",
      auditCase: guidedAuditCase,
      codecSchema: schema,
      variantAssignment: null,
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
      variantAssignment: null,
    },
    ...challengeBank.variants.map((variant, variantIndex) => {
      const scenario = challengePack.scenarios.find(
        (candidate) =>
          candidate.scenarioId === variant.scenarioId &&
          candidate.version === variant.scenarioVersion,
      )!;
      return {
        label: `Audit Challenge ${variant.caseReference}`,
        auditCase: scenario.auditCase!,
        codecSchema: {
          ...schema,
          configurationHash: "e".repeat(64),
          packContentHash: "f".repeat(64),
          scenarioId: scenario.scenarioId,
          scenarioVersion: scenario.version,
          auditCase: scenario.auditCase!,
          variantBank: challengeBank,
        },
        variantAssignment: auditVariantAssignmentForIndex({
          bank: challengeBank,
          variantIndex,
          attemptSeed: `DDDDDDDDDDDDDDDDDDDDD${String(variantIndex)}`,
          assignmentSource: "SCORM_ATTEMPT",
        }),
      };
    }),
  ])(
    "fits the actual $label authored worst case below the internal ceiling",
    ({ auditCase, codecSchema, variantAssignment }) => {
      const maximumRecords =
        auditCase.inputLimits.maximumFindingRecords;
      const snapshot: Ta2AuditSnapshot = {
        variantAssignment,
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
      const encoded = encodeTa2AuditSnapshot(
        snapshot,
        codecSchema,
      );

      expect(encoded.length).toBeLessThanOrEqual(
        TA2_AUTHORED_WORST_CASE_BUDGET,
      );
      expect(encoded.length).toBeLessThanOrEqual(
        TA2_SUSPEND_DATA_CEILING,
      );
      expect(
        decodeTa2AuditSnapshot(encoded, codecSchema),
      ).toEqual(snapshot);
    },
  );
});

import { describe, expect, it } from "vitest";
import {
  SCENARIO_STAGE_ORDER,
  ScenarioStageId,
} from "../../domain/types/enums";
import {
  IncompatibleAttemptError,
  PersistenceError,
  UnsupportedStateVersionError,
} from "../../domain/errors";
import { KnowledgeCheckType } from "../../domain/types/scenario";
import type { ScenarioDefinition } from "../../domain/types/scenario";
import { hashConfiguration } from "../../config/hash";
import {
  CHALLENGE_PRESET,
  GUIDED_PRESET,
  PRACTICE_PRESET,
} from "../../config/presets";
import type { BusinessSimulationConfiguration } from "../../config/types";
import {
  commandJournalDefinitions,
  JournalOpcode,
  tc3CodecSchema,
} from "../../domain/simulation/command-journal";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { challengeAScenario } from "../../scenarios/challenge-a/scenario";
import { challengeVariantBank } from "../../scenarios/challenge-a/variant-bank";
import { practiceAScenario } from "../../scenarios/practice-a/scenario";
import { practiceVariantBank } from "../../scenarios/practice-a/variant-bank";
import { selectVariantAssignment } from "../../domain/scenario/variant-bank";
import {
  TC3_AUTHORED_PAYLOAD_LIMIT,
  TC3_INTERNAL_CHARACTER_LIMIT,
  TC3_SECTION_BUDGET,
  decodeTc3Attempt,
  encodeTc3Attempt,
  measureTc3Attempt,
  type CompactCommandJournalEntry,
  type Tc3AttemptSnapshot,
  type Tc3CodecSchema,
} from "./tc3-codec";
import {
  MAX_ATTEMPT_COUNT,
  type DecisionRecord,
} from "./attempt-state";

const schema: Tc3CodecSchema = {
  configurationHash: "a".repeat(64),
  scenarioId: "SCN_COFFEE_001",
  scenarioVersion: "2",
  scenarioSeed: "guided-standard-v1",
  decisionIds: ["DEC_1", "DEC_2"],
  hintIds: ["HINT_1"],
  opcodes: [
    { opcode: 1, section: "baseline", maxOccurrences: 4 },
    { opcode: 30, section: "stage3", maxOccurrences: 4 },
    {
      opcode: 50,
      section: "stage5",
      maxOccurrences: 1,
      textValueByteLimits: { 1: 240 },
    },
    { opcode: 51, section: "stage5", maxOccurrences: 2 },
    { opcode: 90, section: "stage9", maxOccurrences: 4 },
  ],
};

function snapshot(overrides: Partial<Tc3AttemptSnapshot> = {}): Tc3AttemptSnapshot {
  return {
    sessionId: "SES_000001",
    currentStageId: ScenarioStageId.RECEIVE_AND_CORRECT,
    completedStageIds: [
      ScenarioStageId.ORIENTATION,
      ScenarioStageId.CREATE_BATCH,
      ScenarioStageId.ANCHOR_CERTIFICATE,
      ScenarioStageId.SHIP_AND_MONITOR,
    ],
    decisions: {
      DEC_1: { encodedValue: 3, attemptCount: 1 },
    },
    hintsUsed: ["HINT_1"],
    journal: [
      { commandSequence: 1, opcode: 1, contextIndex: 0, values: [2] },
      { commandSequence: 2, opcode: 50, contextIndex: 3, values: [1, "append correction"] },
    ],
    isCompleted: false,
    isPassed: false,
    ...overrides,
  };
}

function maximumEncodedDecisionValues(
  scenario: ScenarioDefinition,
): Readonly<Record<string, DecisionRecord>> {
  const checks = new Map(
    scenario.stages.flatMap((stage) =>
      stage.knowledgeChecks.map((check) => [check.knowledgeCheckId, check] as const),
    ),
  );
  return Object.fromEntries(
    scenario.decisionIds.map((decisionId) => {
      const check = checks.get(decisionId);
      let encodedValue = 1;
      if (check?.checkType === KnowledgeCheckType.SINGLE_CHOICE) {
        encodedValue = Math.max(0, check.options.length - 1);
      } else if (check?.checkType === KnowledgeCheckType.MULTIPLE_CHOICE) {
        encodedValue = 2 ** check.options.length - 1;
      } else if (check?.checkType === KnowledgeCheckType.CLASSIFICATION) {
        const maximumCategory = Math.max(
          0,
          (check.categories?.length ?? 1) - 1,
        );
        encodedValue = check.options.reduce(
          (total, _option, index) =>
            total + maximumCategory * 4 ** index,
          0,
        );
      }
      return [
        decisionId,
        { encodedValue, attemptCount: MAX_ATTEMPT_COUNT },
      ];
    }),
  );
}

function maximumJournal(
  scenario: ScenarioDefinition,
  configuration: BusinessSimulationConfiguration,
): readonly CompactCommandJournalEntry[] {
  const recallOptions =
    scenario.stages
      .flatMap((stage) => stage.knowledgeChecks)
      .find((check) => check.knowledgeCheckId === "INT_RECALL_SCOPE")
      ?.options.map((_option, index) => index) ?? [];
  const maximumContext = Math.max(
    0,
    scenario.runtime.trustedContexts.length - 1,
  );
  const maximumHandoff = Math.max(
    0,
    scenario.runtime.roleHandoffs.length - 1,
  );
  let sequence = 1;
  return commandJournalDefinitions(
    scenario,
    configuration.technicalFeatures.endorsementPolicies,
  ).flatMap((definition) =>
    Array.from({ length: definition.maxOccurrences }, () => {
      let values: readonly (number | readonly number[] | string)[] = [];
      const textLimits = Object.entries(
        definition.textValueByteLimits ?? {},
      ).map(([index, limit]) => [
        Number.parseInt(index, 10),
        limit,
      ] as const);
      if (textLimits.length > 0) {
        const maximumTextIndex = Math.max(
          ...textLimits.map(([index]) => index),
        );
        const boundedValues: Array<number | string> = Array.from(
          { length: maximumTextIndex + 1 },
          () => 0,
        );
        if (
          definition.opcode ===
          JournalOpcode.CREATE_ENDORSED_CORRECTION_PROPOSAL
        ) {
          boundedValues[0] =
            JournalOpcode.RECORD_CORRECTION;
        }
        for (const [index, limit] of textLimits) {
          boundedValues[index] = "a".repeat(limit);
        }
        values = boundedValues;
      } else if (definition.opcode === JournalOpcode.TRANSFER_CUSTODY) {
        values = [1];
      } else if (
        definition.opcode ===
        JournalOpcode.CREATE_ENDORSED_PROPOSAL
      ) {
        values = [
          JournalOpcode.TRANSFER_CUSTODY,
          1,
        ];
      } else if (
        definition.opcode ===
          JournalOpcode.ENDORSE_TRANSACTION_PROPOSAL ||
        definition.opcode ===
          JournalOpcode.DECLINE_TRANSACTION_PROPOSAL ||
        definition.opcode ===
          JournalOpcode.COMMIT_ENDORSED_TRANSACTION
      ) {
        values = [99];
      } else if (
        definition.opcode === JournalOpcode.SUBMIT_CERTIFICATE_DECISION
      ) {
        values = [2, 2, 1, 1];
      } else if (
        definition.opcode === JournalOpcode.SUBMIT_DISCREPANCY_DECISION
      ) {
        values = [4, 4];
      } else if (definition.opcode === JournalOpcode.RECALL_BATCH) {
        values = [recallOptions];
      } else if (definition.opcode === JournalOpcode.ROLE_HANDOFF) {
        values = [maximumHandoff];
      }
      const entry = {
        commandSequence: sequence,
        opcode: definition.opcode,
        contextIndex: maximumContext,
        values,
      };
      sequence += 1;
      return entry;
    }),
  );
}

describe("TC3 attempt codec", () => {
  it("round-trips compact commands without storing outcomes", () => {
    const encoded = encodeTc3Attempt(snapshot(), schema);
    expect(encoded.startsWith("TC3.")).toBe(true);
    expect(decodeTc3Attempt(encoded, schema)).toEqual(snapshot());
    expect(encoded).not.toContain("COMMAND_REJECTED");
    expect(encoded).not.toContain("isAccepted");
  });

  it("uses exact configuration and scenario identity boundaries", () => {
    const encoded = encodeTc3Attempt(snapshot(), schema);
    expect(() =>
      decodeTc3Attempt(encoded, { ...schema, configurationHash: "b".repeat(64) }),
    ).toThrow(IncompatibleAttemptError);
    expect(() =>
      decodeTc3Attempt(encoded, { ...schema, scenarioVersion: "3" }),
    ).toThrow(IncompatibleAttemptError);
  });

  it("rejects obsolete attempt formats", () => {
    expect(() => decodeTc3Attempt("TC2.000....", schema)).toThrow(
      UnsupportedStateVersionError,
    );
  });

  it("rejects duplicate command identifiers", () => {
    expect(() =>
      encodeTc3Attempt(
        snapshot({
          journal: [
            { commandSequence: 1, opcode: 1, contextIndex: 0, values: [] },
            { commandSequence: 1, opcode: 1, contextIndex: 0, values: [] },
          ],
        }),
        schema,
      ),
    ).toThrow(/Duplicate or invalid command sequence/);
  });

  it("rejects strings unless the scenario gives them an explicit byte limit", () => {
    expect(() =>
      encodeTc3Attempt(
        snapshot({
          journal: [
            { commandSequence: 1, opcode: 1, contextIndex: 0, values: ["unbounded"] },
          ],
        }),
        schema,
      ),
    ).toThrow(/unbounded string/);
  });

  it("rejects rather than truncates oversized UTF-8 text", () => {
    expect(() =>
      encodeTc3Attempt(
        snapshot({
          journal: [
            {
              commandSequence: 1,
              opcode: 50,
              contextIndex: 3,
              values: [1, "ộ".repeat(121)],
            },
          ],
        }),
        schema,
      ),
    ).toThrow(/exceeds 240 UTF-8 bytes/);
  });

  it("keeps the authored worst case below the internal ceiling", () => {
    const maximumText = "a".repeat(240);
    const journal = [
      ...Array.from({ length: 4 }, (_, index) => ({
        commandSequence: index + 1,
        opcode: 30,
        contextIndex: 1,
        values: [3, 2, 1, 0] as const,
      })),
      {
        commandSequence: 5,
        opcode: 50,
        contextIndex: 3,
        values: [2, maximumText] as const,
      },
      ...Array.from({ length: 2 }, (_, index) => ({
        commandSequence: index + 6,
        opcode: 51,
        contextIndex: 3,
        values: [index] as const,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        commandSequence: index + 8,
        opcode: 90,
        contextIndex: index % 2,
        values: [[0, 1, 2, 3], 2] as const,
      })),
    ];
    const maximum = snapshot({ journal });
    const size = measureTc3Attempt(maximum, schema);
    expect(size.total).toBeLessThanOrEqual(TC3_INTERNAL_CHARACTER_LIMIT);
    expect(encodeTc3Attempt(maximum, schema)).toHaveLength(size.total);
  });

  it("enforces authored occurrence bounds", () => {
    expect(() =>
      encodeTc3Attempt(
        snapshot({
          journal: Array.from({ length: 5 }, (_, index) => ({
            commandSequence: index + 1,
            opcode: 90,
            contextIndex: 0,
            values: [],
          })),
        }),
        schema,
      ),
    ).toThrow(PersistenceError);
  });

  it("allows one bounded transport retry after an earlier rejected submission", () => {
    const signatureOnlyChallenge = {
      ...CHALLENGE_PRESET,
      technicalFeatures: {
        ...CHALLENGE_PRESET.technicalFeatures,
        endorsementPolicies: false,
      },
    };
    const variantAssignment = selectVariantAssignment({
      bank: challengeVariantBank,
      attemptSeed: "STAGE4RETRYSEED0001",
      assignmentSource: "SCORM_ATTEMPT",
    });
    const challengeSchema = tc3CodecSchema({
      configuration: signatureOnlyChallenge,
      configurationHash: hashConfiguration(
        signatureOnlyChallenge,
      ),
      scenario: challengeAScenario,
      variantBank: challengeVariantBank,
    });
    const retryAttempt: Tc3AttemptSnapshot = {
      sessionId: "SES_STAGE4_RETRY",
      currentStageId: ScenarioStageId.SHIP_AND_MONITOR,
      completedStageIds: [
        ScenarioStageId.ORIENTATION,
        ScenarioStageId.CREATE_BATCH,
        ScenarioStageId.ANCHOR_CERTIFICATE,
      ],
      decisions: {},
      hintsUsed: [],
      journal: [
        {
          commandSequence: 1,
          opcode: JournalOpcode.RECORD_TRANSPORT,
          contextIndex: 2,
          values: [],
        },
        {
          commandSequence: 2,
          opcode: JournalOpcode.TRANSFER_CUSTODY,
          contextIndex: 0,
          values: [0],
        },
        {
          commandSequence: 3,
          opcode: JournalOpcode.SEAL_PENDING_BLOCK,
          contextIndex: 0,
          values: [],
        },
        {
          commandSequence: 4,
          opcode: JournalOpcode.RECORD_TRANSPORT,
          contextIndex: 2,
          values: [],
        },
      ],
      isCompleted: false,
      isPassed: false,
      variantAssignment,
    };

    expect(() =>
      encodeTc3Attempt(retryAttempt, challengeSchema),
    ).not.toThrow();
  });

  it.each([
    ["guided", GUIDED_PRESET, coffeeScenario],
    ["practice", PRACTICE_PRESET, practiceAScenario],
    ["challenge", CHALLENGE_PRESET, challengeAScenario],
  ] as const)(
    "keeps the actual %s authored worst case within every documented budget",
    (
      _name,
      configuration: BusinessSimulationConfiguration,
      scenario: ScenarioDefinition,
    ) => {
      const variantBank =
        configuration.presetId === "practice"
          ? practiceVariantBank
          : challengeVariantBank;
      const variantAssignment =
        configuration.scenarioVariation.strategy ===
        "SEEDED_VARIANT_BANK"
          ? selectVariantAssignment({
              bank: variantBank,
              attemptSeed: "WORSTCASEATTEMPTSEED01",
              assignmentSource: "SCORM_ATTEMPT",
            })
          : undefined;
      const activeScenario =
        variantAssignment === undefined
          ? scenario
          : (variantBank.variants[
              variantAssignment.variantIndex
            ]?.scenario ?? scenario);
      const actualSchema = tc3CodecSchema({
        configuration,
        configurationHash: hashConfiguration(configuration),
        scenario: activeScenario,
        ...(variantAssignment === undefined
          ? {}
          : { variantBank }),
      });
      const maximum: Tc3AttemptSnapshot = {
        sessionId: "SES_000001",
        currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
        completedStageIds: SCENARIO_STAGE_ORDER,
        decisions: maximumEncodedDecisionValues(activeScenario),
        hintsUsed: activeScenario.hintIds,
        journal: maximumJournal(activeScenario, configuration),
        isCompleted: true,
        isPassed: true,
        ...(variantAssignment === undefined
          ? {}
          : { variantAssignment }),
      };
      const size = measureTc3Attempt(maximum, actualSchema);

      for (const section of Object.keys(TC3_SECTION_BUDGET) as Array<
        keyof typeof TC3_SECTION_BUDGET
      >) {
        expect(size[section], section).toBeLessThanOrEqual(
          TC3_SECTION_BUDGET[section],
        );
      }
      expect(size.authoredPayload).toBeLessThanOrEqual(
        TC3_AUTHORED_PAYLOAD_LIMIT,
      );
      expect(size.total).toBeLessThanOrEqual(
        TC3_INTERNAL_CHARACTER_LIMIT,
      );
      expect(encodeTc3Attempt(maximum, actualSchema)).toHaveLength(
        size.total,
      );
    },
  );

  it("retains the existing compact attempt-count saturation contract", () => {
    const encoded = encodeTc3Attempt(
      snapshot({
        decisions: {
          DEC_1: {
            encodedValue: 1,
            attemptCount: MAX_ATTEMPT_COUNT + 20,
          },
        },
      }),
      schema,
    );
    expect(decodeTc3Attempt(encoded, schema).decisions.DEC_1).toEqual({
      encodedValue: 1,
      attemptCount: MAX_ATTEMPT_COUNT,
    });
  });
});

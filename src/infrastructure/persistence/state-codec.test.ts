import { describe, expect, it } from "vitest";
import { sha256Hex } from "../hashing/sha256";
import { SCENARIO_STAGE_ORDER, ScenarioStageId } from "../../domain/types/enums";
import { PersistenceError, UnsupportedStateVersionError } from "../../domain/errors";
import {
  type AttemptSnapshot,
  type CodecSchema,
  decodeAttemptState,
  encodeAttemptState,
  MAX_ATTEMPT_COUNT,
  MAX_DECISION_VALUE,
} from "./state-codec";

/**
 * SCORM 1.2 types cmi.suspend_data as CMIString4096. The budget is checked
 * against a deliberately pessimistic margin rather than the hard limit, so that
 * later content growth is caught here rather than in Moodle.
 */
const SUSPEND_DATA_BUDGET_CHARACTERS = 3800;
const SCORM_HARD_LIMIT_CHARACTERS = 4096;

function makeSchema(decisionCount: number, hintCount: number): CodecSchema {
  return {
    decisionIds: Array.from({ length: decisionCount }, (_, i) => `INT_DECISION_${i}`),
    hintIds: Array.from({ length: hintCount }, (_, i) => `HINT_${i}`),
  };
}

const smallSchema = makeSchema(4, 3);

const baseSnapshot: AttemptSnapshot = {
  currentStageId: ScenarioStageId.TRANSFORM_BATCH,
  completedStageIds: [
    ScenarioStageId.ORIENTATION,
    ScenarioStageId.CREATE_BATCH,
    ScenarioStageId.ANCHOR_CERTIFICATE,
    ScenarioStageId.SHIP_AND_MONITOR,
    ScenarioStageId.RECEIVE_AND_CORRECT,
  ],
  decisions: {
    INT_DECISION_0: { encodedValue: 2, attemptCount: 1 },
    INT_DECISION_2: { encodedValue: 0, attemptCount: 3 },
  },
  hintsUsed: ["HINT_1"],
  isCompleted: false,
  isPassed: false,
};

describe("state codec", () => {
  describe("suspend data budget", () => {
    /**
     * The reason this codec exists. A pessimistic full attempt -- every stage
     * complete, every decision answered at the maximum recorded attempt count
     * and the maximum encodable value, every hint used -- must fit with room to
     * spare. The decision and hint counts here are far above what the coffee
     * scenario actually defines.
     */
    it("encodes a pessimistic full attempt well inside the 4096-character limit", () => {
      const schema = makeSchema(60, 30);
      const worstCase: AttemptSnapshot = {
        currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
        completedStageIds: [...SCENARIO_STAGE_ORDER],
        decisions: Object.fromEntries(
          schema.decisionIds.map((id) => [
            id,
            { encodedValue: MAX_DECISION_VALUE, attemptCount: MAX_ATTEMPT_COUNT },
          ]),
        ),
        hintsUsed: [...schema.hintIds],
        isCompleted: true,
        isPassed: true,
      };

      const encoded = encodeAttemptState(worstCase, schema);

      expect(encoded.length).toBeLessThan(SUSPEND_DATA_BUDGET_CHARACTERS);
      expect(encoded.length).toBeLessThan(SCORM_HARD_LIMIT_CHARACTERS);
      // Round-trips at full size, so the margin is real rather than achieved by
      // dropping data.
      expect(decodeAttemptState(encoded, schema)).toEqual(worstCase);
    });

    it("stays compact for the realistic scenario shape", () => {
      const schema = makeSchema(40, 20);
      const encoded = encodeAttemptState(
        {
          currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
          completedStageIds: [...SCENARIO_STAGE_ORDER],
          decisions: Object.fromEntries(
            schema.decisionIds.map((id) => [id, { encodedValue: 3, attemptCount: 2 }]),
          ),
          hintsUsed: schema.hintIds.slice(0, 5),
          isCompleted: true,
          isPassed: true,
        },
        schema,
      );
      // Ample headroom for the content to grow.
      expect(encoded.length).toBeLessThan(400);
    });

    it("uses only characters an LMS will round-trip safely", () => {
      const encoded = encodeAttemptState(baseSnapshot, smallSchema);
      expect(encoded).toMatch(/^[0-9a-zA-Z.]+$/);
    });
  });

  describe("round trip", () => {
    it("restores an in-progress attempt exactly", () => {
      const encoded = encodeAttemptState(baseSnapshot, smallSchema);
      expect(decodeAttemptState(encoded, smallSchema)).toEqual(baseSnapshot);
    });

    it("preserves the UTF-8 correction reason needed for deterministic replay", () => {
      const snapshot: AttemptSnapshot = {
        ...baseSnapshot,
        replayData: {
          correctionReason: "Cân lại tại nhà máy: 100 kg, không phải 1000 kg.",
        },
      };
      expect(decodeAttemptState(encodeAttemptState(snapshot, smallSchema), smallSchema)).toEqual(
        snapshot,
      );
    });

    it("reads legacy TC1 data and treats appended decisions as unanswered", () => {
      const parts = encodeAttemptState(baseSnapshot, smallSchema).split(".");
      const legacyBody = ["TC1", parts[1], parts[2], parts[3], parts[4]].join(".");
      const legacy = `${legacyBody}.${sha256Prefix(legacyBody)}`;
      const restored = decodeAttemptState(legacy, makeSchema(9, 3));

      expect(restored).toEqual(baseSnapshot);
      expect(restored.decisions["INT_DECISION_8"]).toBeUndefined();
    });

    it("restores a completed and passed attempt", () => {
      const snapshot: AttemptSnapshot = {
        ...baseSnapshot,
        currentStageId: ScenarioStageId.RECALL_AND_DEBRIEF,
        completedStageIds: [...SCENARIO_STAGE_ORDER],
        isCompleted: true,
        isPassed: true,
      };
      expect(decodeAttemptState(encodeAttemptState(snapshot, smallSchema), smallSchema)).toEqual(
        snapshot,
      );
    });

    it("restores a completed but failed attempt, which is a valid outcome", () => {
      const snapshot: AttemptSnapshot = { ...baseSnapshot, isCompleted: true, isPassed: false };
      const restored = decodeAttemptState(encodeAttemptState(snapshot, smallSchema), smallSchema);
      expect(restored.isCompleted).toBe(true);
      expect(restored.isPassed).toBe(false);
    });

    it("restores a fresh attempt with no decisions and no hints", () => {
      const snapshot: AttemptSnapshot = {
        currentStageId: ScenarioStageId.ORIENTATION,
        completedStageIds: [],
        decisions: {},
        hintsUsed: [],
        isCompleted: false,
        isPassed: false,
      };
      expect(decodeAttemptState(encodeAttemptState(snapshot, smallSchema), smallSchema)).toEqual(
        snapshot,
      );
    });

    it("distinguishes an unanswered decision from an answer of option zero", () => {
      // Option index 0 is a legitimate answer, so absence cannot be encoded as
      // a zero value. It is encoded as a zero attempt count instead.
      const snapshot: AttemptSnapshot = {
        ...baseSnapshot,
        decisions: { INT_DECISION_1: { encodedValue: 0, attemptCount: 1 } },
      };
      const restored = decodeAttemptState(encodeAttemptState(snapshot, smallSchema), smallSchema);
      expect(restored.decisions["INT_DECISION_1"]).toEqual({ encodedValue: 0, attemptCount: 1 });
      expect(restored.decisions["INT_DECISION_0"]).toBeUndefined();
    });

    it("preserves every stage in the completed bitmap", () => {
      for (const stageId of SCENARIO_STAGE_ORDER) {
        const snapshot: AttemptSnapshot = { ...baseSnapshot, completedStageIds: [stageId] };
        const restored = decodeAttemptState(
          encodeAttemptState(snapshot, smallSchema),
          smallSchema,
        );
        expect(restored.completedStageIds).toEqual([stageId]);
      }
    });

    it("preserves hint selection across the full hint list", () => {
      const schema = makeSchema(2, 40);
      const hintsUsed = ["HINT_0", "HINT_17", "HINT_39"];
      const snapshot: AttemptSnapshot = { ...baseSnapshot, hintsUsed };
      expect(decodeAttemptState(encodeAttemptState(snapshot, schema), schema).hintsUsed).toEqual(
        hintsUsed,
      );
    });

    it("caps an implausibly high attempt count rather than failing the save", () => {
      const snapshot: AttemptSnapshot = {
        ...baseSnapshot,
        decisions: { INT_DECISION_0: { encodedValue: 1, attemptCount: 9999 } },
      };
      const restored = decodeAttemptState(encodeAttemptState(snapshot, smallSchema), smallSchema);
      expect(restored.decisions["INT_DECISION_0"]?.attemptCount).toBe(MAX_ATTEMPT_COUNT);
    });
  });

  describe("treating stored state as untrusted input", () => {
    it("rejects empty suspend data", () => {
      expect(() => decodeAttemptState("", smallSchema)).toThrow(PersistenceError);
    });

    it("rejects data truncated by the LMS", () => {
      const encoded = encodeAttemptState(baseSnapshot, smallSchema);
      expect(() => decodeAttemptState(encoded.slice(0, encoded.length - 4), smallSchema)).toThrow(
        PersistenceError,
      );
    });

    it("detects a single flipped character through the checksum", () => {
      const encoded = encodeAttemptState(baseSnapshot, smallSchema);
      const flippedIndex = 6;
      const original = encoded[flippedIndex] as string;
      const tampered =
        encoded.slice(0, flippedIndex) +
        (original === "1" ? "2" : "1") +
        encoded.slice(flippedIndex + 1);
      expect(tampered).not.toBe(encoded);
      expect(() => decodeAttemptState(tampered, smallSchema)).toThrow(/checksum/);
    });

    it("reports an unsupported schema version distinctly, so a migration can be offered", () => {
      const encoded = encodeAttemptState(baseSnapshot, smallSchema);
      const foreign = `TC9${encoded.slice(3)}`;
      expect(() => decodeAttemptState(foreign, smallSchema)).toThrow(UnsupportedStateVersionError);
    });

    it("accepts appended decision keys but rejects a schema that removed old keys", () => {
      const encoded = encodeAttemptState(baseSnapshot, smallSchema);
      expect(() => decodeAttemptState(encoded, makeSchema(9, 3))).not.toThrow();
      expect(() => decodeAttemptState(encoded, makeSchema(2, 3))).toThrow(/incompatible/);
    });

    it("rejects a stage index beyond the known stages", () => {
      // Stage index "z" is 35, far past the nine defined stages.
      const parts = encodeAttemptState(baseSnapshot, smallSchema).split(".");
      parts[1] = `z${(parts[1] as string).slice(1)}`;
      const body = parts.slice(0, 6).join(".");
      // Re-checksum so the stage check is what fails, not the checksum.
      const rebuilt = `${body}.${sha256Prefix(body)}`;
      expect(() => decodeAttemptState(rebuilt, smallSchema)).toThrow(/out of range/);
    });

    it("rejects non-base36 characters", () => {
      expect(() => decodeAttemptState("TC1.!!!.0000.0.0.deadbeef", smallSchema)).toThrow(
        PersistenceError,
      );
    });

    it("rejects a field count that does not match the format", () => {
      expect(() => decodeAttemptState("TC1.000.0", smallSchema)).toThrow(/6 fields/);
    });
  });

  describe("encoding guards", () => {
    it("refuses a decision value beyond the encodable range", () => {
      expect(() =>
        encodeAttemptState(
          {
            ...baseSnapshot,
            decisions: { INT_DECISION_0: { encodedValue: MAX_DECISION_VALUE + 1, attemptCount: 1 } },
          },
          smallSchema,
        ),
      ).toThrow(/exceeds the encodable range/);
    });

    it("refuses an unknown hint identifier rather than silently dropping it", () => {
      expect(() =>
        encodeAttemptState({ ...baseSnapshot, hintsUsed: ["HINT_NOT_DEFINED"] }, smallSchema),
      ).toThrow(/Unknown hint/);
    });
  });
});

/** Mirrors the codec's internal checksum so a test can rebuild a valid envelope. */
function sha256Prefix(body: string): string {
  return sha256Hex(body).slice(0, 8);
}

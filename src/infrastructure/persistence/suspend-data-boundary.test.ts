import { describe, expect, it } from "vitest";
import { MockScorm12Api } from "../../../test/scorm-mock/mock-scorm-api";
import { StandalonePersistenceAdapter } from "./standalone-adapter";
import { decodeAttemptState, encodeAttemptState, MAX_ATTEMPT_COUNT } from "./state-codec";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { SCENARIO_STAGE_ORDER } from "../../domain/types/enums";
import type { DecisionRecord } from "./state-codec";
import { readFileSync } from "node:fs";

/**
 * THE SUSPEND-DATA CONTRACT.
 *
 * `cmi.suspend_data` is CMIString4096: 4096 characters accepted, 4097 refused.
 * Measured against a real Moodle 5.2.1 instance, which refused 4097 with error
 * 405 -- the observation that retired this project's largest deployment risk.
 *
 * Three separate implementations encode that limit -- the unit mock, the
 * standalone adapter, and the e2e harness -- and until now every assertion
 * about it was of the form `expect(length).toBeLessThan(4096)`. Nothing pinned
 * the boundary itself, so the exact off-by-one was unverified and the three
 * copies could drift apart without a single test failing.
 *
 * Note the two distinct concerns kept separate below:
 *   - the boundary: what SCORM accepts (<= 4096)
 *   - the budget:   how much headroom this product deliberately keeps
 */
const SCORM_LIMIT = 4096;
const PRODUCT_BUDGET = 4000;
const SCORM_ERROR_INCORRECT_DATA_TYPE = "405";

const characters = (count: number): string => "x".repeat(count);

describe("the SCORM 1.2 suspend_data boundary", () => {
  it("accepts 4095 characters", () => {
    const api = new MockScorm12Api();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.suspend_data", characters(SCORM_LIMIT - 1))).toBe("true");
    expect(api.LMSGetLastError()).toBe("0");
  });

  it("accepts exactly 4096 characters", () => {
    const api = new MockScorm12Api();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.suspend_data", characters(SCORM_LIMIT))).toBe("true");
    expect(api.LMSGetLastError()).toBe("0");
    expect(api.peek("cmi.suspend_data")).toHaveLength(SCORM_LIMIT);
  });

  it("refuses 4097 characters with error 405", () => {
    const api = new MockScorm12Api();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.suspend_data", characters(SCORM_LIMIT + 1))).toBe("false");
    expect(api.LMSGetLastError()).toBe(SCORM_ERROR_INCORRECT_DATA_TYPE);
    // Nothing was stored: a refused write must not truncate.
    expect(api.peek("cmi.suspend_data")).toBe("");
  });
});

describe("the standalone adapter reports the boundary rather than enforcing it", () => {
  /**
   * Deliberately NOT the same behaviour as the SCORM implementations. localStorage
   * has no such limit, so an oversized payload is stored and loudly diagnosed
   * rather than refused: losing a standalone learner's progress to a limit that
   * does not apply to them would be the worse failure. What the three
   * implementations share is recognition of the same 4096-character SCORM
   * portability boundary, not identical behaviour at it.
   */
  const makeAdapter = (): StandalonePersistenceAdapter =>
    new StandalonePersistenceAdapter({ appVersion: "test", scenarioId: "SCN_TEST" });

  it("stores a payload at the limit", async () => {
    const adapter = makeAdapter();
    await adapter.initialize();
    await adapter.saveAttemptState(characters(SCORM_LIMIT));
    expect(await adapter.loadAttemptState()).toHaveLength(SCORM_LIMIT);
  });

  it("stores an oversized payload and says it would be rejected by a real LMS", async () => {
    const adapter = makeAdapter();
    await adapter.initialize();
    await adapter.saveAttemptState(characters(SCORM_LIMIT + 1));
    // Stored, not refused -- and the diagnostic is what makes that safe.
    expect(await adapter.loadAttemptState()).toHaveLength(SCORM_LIMIT + 1);
    expect(adapter.getDiagnostics().join(" ")).toMatch(/over the 4096.*rejected by a real LMS/s);
  });
});

describe("the encoded payload keeps the budget claim true", () => {
  const schema = { decisionIds: coffeeScenario.decisionIds, hintIds: coffeeScenario.hintIds };

  const worstCase = (): string => {
    const decisions: Record<string, DecisionRecord> = {};
    coffeeScenario.decisionIds.forEach((id, index) => {
      decisions[id] = { encodedValue: (index % 7) + 1, attemptCount: 3 };
    });
    return encodeAttemptState(
      {
        currentStageId: SCENARIO_STAGE_ORDER[SCENARIO_STAGE_ORDER.length - 1] as never,
        completedStageIds: [...SCENARIO_STAGE_ORDER],
        decisions,
        hintsUsed: [...coffeeScenario.hintIds],
        isCompleted: true,
        isPassed: true,
      },
      schema,
    );
  };

  /**
   * "Worst case" is bounded by construction rather than by assumption: the codec
   * saturates attemptCount at MAX_ATTEMPT_COUNT when encoding, so no learner can
   * grow the payload by retrying. The claim is scoped to this scenario -- a
   * future scenario with more decisions would need its own budget check.
   */
  it("keeps the coffee scenario's maximum encoded state inside the product budget", () => {
    expect(worstCase().length).toBeLessThanOrEqual(PRODUCT_BUDGET);
  });

  it("saturates attempt counts, so retrying cannot grow the payload", () => {
    const schemaLocal = schema;
    const build = (attempts: number): string => {
      const decisions: Record<string, DecisionRecord> = {};
      coffeeScenario.decisionIds.forEach((id) => {
        decisions[id] = { encodedValue: 1, attemptCount: attempts };
      });
      return encodeAttemptState(
        {
          currentStageId: SCENARIO_STAGE_ORDER[0] as never,
          completedStageIds: [],
          decisions,
          hintsUsed: [],
          isCompleted: false,
          isPassed: false,
        },
        schemaLocal,
      );
    };
    // Against the exported limit, not a hardcoded guess at it.
    expect(build(MAX_ATTEMPT_COUNT).length).toBe(build(MAX_ATTEMPT_COUNT + 1).length);

    // Semantic saturation, not merely equal encoded length: the decoded value
    // is clamped, so an over-limit count cannot round-trip back out.
    const decoded = decodeAttemptState(build(MAX_ATTEMPT_COUNT + 100), schema);
    const firstDecision = coffeeScenario.decisionIds[0] as string;
    expect(decoded.decisions[firstDecision]?.attemptCount).toBe(MAX_ATTEMPT_COUNT);
  });

  /**
   * ASCII is what makes `.length` mean the same thing to us and to the LMS.
   * It holds only because nothing learner-authored is ever persisted -- the
   * codec stores enum indices and counts. Persist a free-text field and the
   * payload becomes multi-byte, at which point character counting and whatever
   * the LMS counts stop agreeing.
   */
  it("encodes as printable ASCII, and to the codec's own grammar", () => {
    const encoded = worstCase();
    expect(encoded).toMatch(/^[\x20-\x7E]+$/);
    expect(encoded).toMatch(/^TC1\.[0-9a-z]+\.[0-9a-z]*\.[0-9a-z]*\.[0-9a-z]*\.[0-9a-f]{8}$/);
  });
});

describe("the three implementations agree on the limit", () => {
  /**
   * The mock, the standalone adapter and the e2e harness each encode 4096
   * independently. The harness's copy is deliberately not imported from
   * production -- a harness that imports the production constant cannot detect
   * a wrong production constant -- so the copies are reconciled here instead.
   */
  const sources = {
    "unit mock": "test/scorm-mock/mock-scorm-api.ts",
    "standalone adapter": "src/infrastructure/persistence/standalone-adapter.ts",
    "e2e harness": "e2e/scorm-harness.ts",
  } as const;

  it("states 4096 in every implementation", () => {
    const disagreeing = Object.entries(sources).filter(
      ([, path]) => !readFileSync(path, "utf8").includes(String(SCORM_LIMIT)),
    );
    expect(disagreeing.map(([name]) => name)).toEqual([]);
  });

  it("finds no other four-digit ceiling hiding in them", () => {
    const strays = Object.entries(sources).flatMap(([name, path]) => {
      const found = readFileSync(path, "utf8").match(/\b4\d{3}\b/g) ?? [];
      return found.filter((n) => n !== String(SCORM_LIMIT)).map((n) => `${name}: ${n}`);
    });
    expect(strays, strays.join(", ")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import {
  buildCanonicalCoffeeContractFixture,
  validateCoffeeScenarioContracts,
} from "../../scenarios/coffee-traceability/scenario-contract";

const REQUIRED_CONTRACT_FAMILIES = [
  "script.",
  "timeline.",
  "fact-date.",
  "correction.",
  "score.",
  "milestone.",
  "display.",
  "stage5.",
  "rejected-attempt.",
  "completion.",
  "effective.",
  "lineage.",
  "recall.",
] as const;

describe("coffee scenario cross-layer contract", () => {
  it("executes every contract family successfully", () => {
    const result = validateCoffeeScenarioContracts();

    expect(result.failures, result.failures.map((failure) => failure.checkId).join(", ")).toEqual(
      [],
    );
    expect(result.isValid).toBe(true);
    expect(result.checkedCount).toBe(result.checks.length);
    expect(result.checkedCount).toBeGreaterThan(50);

    for (const family of REQUIRED_CONTRACT_FAMILIES) {
      expect(
        result.checks.some((check) => check.checkId.startsWith(family)),
        `missing ${family}`,
      ).toBe(true);
    }
  });

  it("assigns a stable unique identifier to every executable check", () => {
    const checkIds = validateCoffeeScenarioContracts().checks.map((check) => check.checkId);
    expect(new Set(checkIds).size).toBe(checkIds.length);
    expect(validateCoffeeScenarioContracts().checks.map((check) => check.checkId)).toEqual(
      checkIds,
    );
  });

  it("reconstructs the canonical live ledger exactly from persisted evidence", () => {
    const fixture = buildCanonicalCoffeeContractFixture();
    expect(canonicalize(fixture.replayedState)).toBe(canonicalize(fixture.liveState));
  });
});

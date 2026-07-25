import { describe, expect, it } from "vitest";
import type {
  BernoulliOutcomeModelV1,
  WeightedCategoricalOutcomeModelV1,
} from "../contracts/scenario-pack";
import {
  resolveStochasticOutcome,
  StochasticOutcomeError,
} from "./stochastic-outcomes";

const weighted: WeightedCategoricalOutcomeModelV1 = {
  outcomeModelId: "CERTIFICATE_CASE",
  distribution: "weighted-categorical",
  randomStreamId: "certificate-case",
  outcomes: [
    { outcomeCode: "authorized-certifier", weight: 3 },
    { outcomeCode: "unauthorized-transporter", weight: 1 },
  ],
};

const bernoulli: BernoulliOutcomeModelV1 = {
  outcomeModelId: "QUALITY_INCIDENT",
  distribution: "bernoulli",
  randomStreamId: "quality-events",
  probability: 0.2,
  onTrue: "contamination-confirmed",
  onFalse: "shipment-safe",
};

describe("controlled stochastic outcome engine", () => {
  it("reproduces one weighted result and draw from the same seed and stream", () => {
    const first = resolveStochasticOutcome({
      model: weighted,
      scenarioVersion: "1.0.0",
      scenarioSeed: "cohort-seed-001",
      occurrenceKey: "INITIAL_CERTIFICATE_CASE",
      relevantEntityId: "ASSIGNMENT_001",
      strategy: "probabilistic",
    });
    const replay = resolveStochasticOutcome({
      model: weighted,
      scenarioVersion: "1.0.0",
      scenarioSeed: "cohort-seed-001",
      occurrenceKey: "INITIAL_CERTIFICATE_CASE",
      relevantEntityId: "ASSIGNMENT_001",
      strategy: "probabilistic",
    });

    expect(replay).toEqual(first);
    expect(first.draw).toBeGreaterThanOrEqual(0);
    expect(first.draw).toBeLessThan(1);
    expect(
      weighted.outcomes.map((outcome) => outcome.outcomeCode),
    ).toContain(first.outcomeCode);
  });

  it("records Bernoulli parameters separately from the realized outcome", () => {
    const result = resolveStochasticOutcome({
      model: bernoulli,
      scenarioVersion: "1.0.0",
      scenarioSeed: "quality-seed-001",
      occurrenceKey: "QUALITY_INCIDENT_001",
      relevantEntityId: "BATCH_001",
      strategy: "probabilistic",
    });

    expect(result.probabilityParameters).toEqual({
      probability: 0.2,
      onTrue: "contamination-confirmed",
      onFalse: "shipment-safe",
    });
    expect([
      "contamination-confirmed",
      "shipment-safe",
    ]).toContain(result.outcomeCode);
  });

  it("aligns the same named event and isolates branch-only events", () => {
    const shared = resolveStochasticOutcome({
      model: bernoulli,
      scenarioVersion: "1.0.0",
      scenarioSeed: "aligned-seed",
      occurrenceKey: "QUALITY_INCIDENT_001",
      relevantEntityId: "BATCH_001",
      strategy: "probabilistic",
    });
    const replayedAfterAnotherDraw = resolveStochasticOutcome({
      model: bernoulli,
      scenarioVersion: "1.0.0",
      scenarioSeed: "aligned-seed",
      occurrenceKey: "QUALITY_INCIDENT_001",
      relevantEntityId: "BATCH_001",
      strategy: "probabilistic",
    });
    const branchOnly = resolveStochasticOutcome({
      model: bernoulli,
      scenarioVersion: "1.0.0",
      scenarioSeed: "aligned-seed",
      occurrenceKey: "BRANCH_ONLY_INSPECTION_001",
      relevantEntityId: "BATCH_001",
      strategy: "probabilistic",
    });

    expect(replayedAfterAnotherDraw).toEqual(shared);
    expect(branchOnly.drawKey).not.toBe(shared.drawKey);
  });

  it("forces an authored result without consuming or recording a draw", () => {
    const result = resolveStochasticOutcome({
      model: weighted,
      scenarioVersion: "1.0.0",
      scenarioSeed: "unused-but-versioned-seed",
      occurrenceKey: "INITIAL_CERTIFICATE_CASE",
      relevantEntityId: "ASSIGNMENT_001",
      strategy: "forced",
      forcedOutcomeCode: "unauthorized-transporter",
    });

    expect(result).not.toHaveProperty("draw");
    expect(result.strategy).toBe("forced");
    expect(result.outcomeCode).toBe("unauthorized-transporter");
  });

  it("rejects a forced result outside the authored model", () => {
    expect(() =>
      resolveStochasticOutcome({
        model: weighted,
        scenarioVersion: "1.0.0",
        scenarioSeed: "seed",
        occurrenceKey: "INITIAL_CERTIFICATE_CASE",
        relevantEntityId: "ASSIGNMENT_001",
        strategy: "forced",
        forcedOutcomeCode: "invented-outcome",
      }),
    ).toThrow(StochasticOutcomeError);
  });
});

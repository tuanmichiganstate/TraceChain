import { SeededRandomSource } from "../../domain/simulation/environment";
import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type {
  HostedOutcomeStrategy,
  StochasticOutcomeModelV1,
} from "../contracts/scenario-pack";

export interface StochasticOutcomeResolutionV1 {
  readonly schemaVersion: "1.0.0";
  readonly outcomeModelId: string;
  readonly distribution: StochasticOutcomeModelV1["distribution"];
  readonly randomStreamId: string;
  readonly drawKey: string;
  readonly strategy: HostedOutcomeStrategy;
  readonly probabilityParameters: Readonly<Record<string, unknown>>;
  readonly draw?: number;
  readonly outcomeCode: string;
}

export class StochasticOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StochasticOutcomeError";
  }
}

function possibleOutcomeCodes(
  model: StochasticOutcomeModelV1,
): readonly string[] {
  return model.distribution === "bernoulli"
    ? [model.onTrue, model.onFalse]
    : model.outcomes.map((outcome) => outcome.outcomeCode);
}

function probabilityParameters(
  model: StochasticOutcomeModelV1,
): Readonly<Record<string, unknown>> {
  return model.distribution === "bernoulli"
    ? {
        probability: model.probability,
        onTrue: model.onTrue,
        onFalse: model.onFalse,
      }
    : {
        outcomes: model.outcomes.map((outcome) => ({
          outcomeCode: outcome.outcomeCode,
          weight: outcome.weight,
        })),
      };
}

function validateModel(model: StochasticOutcomeModelV1): void {
  if (
    model.outcomeModelId.length === 0 ||
    model.randomStreamId.length === 0
  ) {
    throw new StochasticOutcomeError(
      "Outcome model and random stream identifiers are required.",
    );
  }
  if (model.distribution === "bernoulli") {
    if (
      !Number.isFinite(model.probability) ||
      model.probability < 0 ||
      model.probability > 1 ||
      model.onTrue.length === 0 ||
      model.onFalse.length === 0 ||
      model.onTrue === model.onFalse
    ) {
      throw new StochasticOutcomeError(
        "Bernoulli outcomes require a probability from 0 to 1 and two distinct result codes.",
      );
    }
    return;
  }
  if (
    model.outcomes.length < 2 ||
    model.outcomes.some(
      (outcome) =>
        outcome.outcomeCode.length === 0 ||
        !Number.isFinite(outcome.weight) ||
        outcome.weight <= 0,
    ) ||
    new Set(
      model.outcomes.map((outcome) => outcome.outcomeCode),
    ).size !== model.outcomes.length
  ) {
    throw new StochasticOutcomeError(
      "Weighted outcomes require at least two unique positive-weight results.",
    );
  }
}

export function resolveStochasticOutcome(options: {
  readonly model: StochasticOutcomeModelV1;
  readonly scenarioVersion: string;
  readonly scenarioSeed: string;
  readonly occurrenceKey: string;
  readonly relevantEntityId: string;
  readonly strategy: HostedOutcomeStrategy;
  readonly forcedOutcomeCode?: string;
}): StochasticOutcomeResolutionV1 {
  const { model } = options;
  validateModel(model);
  if (options.scenarioSeed.length === 0) {
    throw new StochasticOutcomeError("A scenario seed is required.");
  }
  if (
    options.scenarioVersion.length === 0 ||
    options.occurrenceKey.length === 0 ||
    options.relevantEntityId.length === 0
  ) {
    throw new StochasticOutcomeError(
      "A named stochastic event requires scenario, occurrence, and entity identifiers.",
    );
  }
  const drawKey = sha256Hex(
    canonicalize({
      domain: "TRACECHAIN_STOCHASTIC_DRAW_V1",
      scenarioVersion: options.scenarioVersion,
      scenarioSeed: options.scenarioSeed,
      outcomeModelId: model.outcomeModelId,
      randomStreamId: model.randomStreamId,
      occurrenceKey: options.occurrenceKey,
      relevantEntityId: options.relevantEntityId,
    }),
  );
  const parameters = probabilityParameters(model);
  if (options.strategy === "forced") {
    if (
      options.forcedOutcomeCode === undefined ||
      !possibleOutcomeCodes(model).includes(options.forcedOutcomeCode)
    ) {
      throw new StochasticOutcomeError(
        "A forced outcome must be one of the authored result codes.",
      );
    }
    return {
      schemaVersion: "1.0.0",
      outcomeModelId: model.outcomeModelId,
      distribution: model.distribution,
      randomStreamId: model.randomStreamId,
      drawKey,
      strategy: "forced",
      probabilityParameters: parameters,
      outcomeCode: options.forcedOutcomeCode,
    };
  }

  const random = new SeededRandomSource(drawKey);
  const draw = random.next();
  let outcomeCode: string;
  if (model.distribution === "bernoulli") {
    outcomeCode =
      draw < model.probability ? model.onTrue : model.onFalse;
  } else {
    const totalWeight = model.outcomes.reduce(
      (total, outcome) => total + outcome.weight,
      0,
    );
    const target = draw * totalWeight;
    let cumulative = 0;
    outcomeCode =
      model.outcomes.at(-1)?.outcomeCode ??
      (() => {
        throw new StochasticOutcomeError(
          "Weighted outcome model has no results.",
        );
      })();
    for (const outcome of model.outcomes) {
      cumulative += outcome.weight;
      if (target < cumulative) {
        outcomeCode = outcome.outcomeCode;
        break;
      }
    }
  }
  return {
    schemaVersion: "1.0.0",
    outcomeModelId: model.outcomeModelId,
    distribution: model.distribution,
    randomStreamId: model.randomStreamId,
    drawKey,
    strategy: "probabilistic",
    probabilityParameters: parameters,
    draw,
    outcomeCode,
  };
}

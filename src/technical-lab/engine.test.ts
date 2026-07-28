import { describe, expect, it } from "vitest";
import { hashConfiguration } from "../config/hash";
import { TECHNICAL_LAB_PRESET } from "../config/presets";
import {
  advanceTechnicalLabModule,
  appendTechnicalLabAction,
  appendTechnicalLabResponse,
  emptyTechnicalLabSnapshot,
  openTechnicalLabHint,
  replayTechnicalLab,
  type TechnicalLabEngineRuntime,
  type TechnicalLabReplay,
  type TechnicalLabSnapshot,
} from "./engine";
import { permissionedFoundationsLabBundle } from "./permissioned-foundations-pack";
import { technicalLabCryptographicRuntime } from "./cryptographic-runtime";

const runtime: TechnicalLabEngineRuntime = {
  configurationHash: hashConfiguration(TECHNICAL_LAB_PRESET),
  bundle: permissionedFoundationsLabBundle,
  cryptographicRuntime: technicalLabCryptographicRuntime,
};

async function completeCurrentModule(
  snapshot: TechnicalLabSnapshot,
): Promise<{
  readonly snapshot: TechnicalLabSnapshot;
  readonly replay: TechnicalLabReplay;
}> {
  let current = snapshot;
  let replay = await replayTechnicalLab(runtime, current);
  while (replay.expectedAction !== null) {
    current = appendTechnicalLabAction({
      snapshot: current,
      bundle: runtime.bundle,
      actionType: replay.expectedAction.actionType,
      ...(replay.expectedAction.actionType === "EDIT_INPUT"
        ? { operandA: 1, operandB: 88 }
        : {}),
    });
    replay = await replayTechnicalLab(runtime, current);
  }
  current = appendTechnicalLabResponse({
    snapshot: current,
    bundle: runtime.bundle,
    kind: "INTERPRETATION",
    optionId: "A",
  });
  current = appendTechnicalLabResponse({
    snapshot: current,
    bundle: runtime.bundle,
    kind: "APPLICATION",
    optionId: "A",
  });
  replay = await replayTechnicalLab(runtime, current);
  return { snapshot: current, replay };
}

function value(
  replay: TechnicalLabReplay,
  moduleIndex: number,
  fieldId: string,
): unknown {
  return replay.modules[moduleIndex]?.evidence?.fields.find(
    (field) => field.fieldId === fieldId,
  )?.value;
}

describe("Technical Laboratory headless engine", () => {
  it("runs all seven genuine experiments and preserves the independent 100-point contract", async () => {
    let snapshot = emptyTechnicalLabSnapshot();
    let replay = await replayTechnicalLab(runtime, snapshot);
    for (
      let moduleIndex = 0;
      moduleIndex < runtime.bundle.modules.length;
      moduleIndex += 1
    ) {
      const completed = await completeCurrentModule(snapshot);
      snapshot = completed.snapshot;
      replay = completed.replay;
      expect(replay.modules[moduleIndex]?.complete).toBe(true);
      if (!replay.complete) {
        snapshot = advanceTechnicalLabModule({ replay });
      }
    }
    replay = await replayTechnicalLab(runtime, snapshot);

    expect(value(replay, 0, "digestMatch")).toBe(false);
    expect(value(replay, 0, "originalIntegrity")).toBe(true);
    expect(value(replay, 1, "canonicalEqual")).toBe(true);
    expect(value(replay, 1, "unsupportedRejected")).toBe(true);
    expect(value(replay, 2, "signatureValid")).toBe(true);
    expect(value(replay, 2, "tamperedSignatureValid")).toBe(false);
    expect(value(replay, 2, "wrongKeyValid")).toBe(false);
    expect(value(replay, 3, "authorized")).toBe(false);
    expect(value(replay, 3, "ledgerMutation")).toBe(false);
    expect(value(replay, 4, "allOfSatisfied")).toBe(true);
    expect(value(replay, 4, "thresholdSatisfied")).toBe(true);
    expect(value(replay, 5, "sameProposal")).toBe(false);
    expect(value(replay, 5, "mismatchPolicySatisfied")).toBe(false);
    expect(value(replay, 5, "revisedPolicySatisfied")).toBe(true);
    expect(value(replay, 6, "staleState")).toBe(true);
    expect(value(replay, 6, "ledgerMutation")).toBe(false);
    expect(value(replay, 6, "finalCommitResult")).toBe("COMMITTED");
    expect(replay.score).toMatchObject({
      experimentScore: 40,
      interpretationScore: 40,
      applicationScore: 20,
      totalScore: 100,
      maximumScore: 100,
      passScore: 70,
      passed: true,
    });
    expect(replay.complete).toBe(true);
  });

  /*
   * The projection reports a fixed 100-point maximum. If a bundle's module
   * allocations ever stop summing to it, the laboratory must say so rather
   * than report a score out of a total it does not actually award.
   */
  it("refuses a bundle whose module allocations do not reach its maximum", async () => {
    const [first, ...rest] =
      permissionedFoundationsLabBundle.pack.scoringContract.moduleAllocations;
    const driftedRuntime: TechnicalLabEngineRuntime = {
      ...runtime,
      bundle: {
        ...permissionedFoundationsLabBundle,
        pack: {
          ...permissionedFoundationsLabBundle.pack,
          scoringContract: {
            ...permissionedFoundationsLabBundle.pack.scoringContract,
            moduleAllocations: [
              {
                ...first!,
                interpretationPoints: first!.interpretationPoints - 1,
              },
              ...rest,
            ],
          },
        },
      },
    };
    await expect(
      replayTechnicalLab(driftedRuntime, emptyTechnicalLabSnapshot()),
    ).rejects.toThrow(/allocations/u);
  });

  it("applies the hint ceiling only to its interpretation item", async () => {
    let snapshot = emptyTechnicalLabSnapshot();
    let replay = await replayTechnicalLab(runtime, snapshot);
    while (replay.expectedAction !== null) {
      snapshot = appendTechnicalLabAction({
        snapshot,
        bundle: runtime.bundle,
        actionType: replay.expectedAction.actionType,
        ...(replay.expectedAction.actionType === "EDIT_INPUT"
          ? { operandA: 1, operandB: 88 }
          : {}),
      });
      replay = await replayTechnicalLab(runtime, snapshot);
    }
    snapshot = openTechnicalLabHint({
      snapshot,
      bundle: runtime.bundle,
    });
    snapshot = appendTechnicalLabResponse({
      snapshot,
      bundle: runtime.bundle,
      kind: "INTERPRETATION",
      optionId: "A",
    });
    snapshot = appendTechnicalLabResponse({
      snapshot,
      bundle: runtime.bundle,
      kind: "APPLICATION",
      optionId: "A",
    });
    replay = await replayTechnicalLab(runtime, snapshot);

    expect(replay.modules[0]?.interpretation).toMatchObject({
      earnedPoints: 2,
      maximumPoints: 4,
      hintCeilingApplied: true,
    });
    expect(replay.modules[0]?.application).toMatchObject({
      earnedPoints: 2,
      maximumPoints: 2,
      hintCeilingApplied: false,
    });
    expect(replay.modules[0]?.score).toBe(8);
  });

  it("rejects out-of-order actions and answers before the experiment", async () => {
    const snapshot = emptyTechnicalLabSnapshot();
    expect(() =>
      appendTechnicalLabAction({
        snapshot,
        bundle: runtime.bundle,
        actionType: "HASH",
      }),
    ).toThrow("Expected VIEW_INPUT");
    expect(() =>
      appendTechnicalLabResponse({
        snapshot,
        bundle: runtime.bundle,
        kind: "INTERPRETATION",
        optionId: "A",
      }),
    ).toThrow("Complete the genuine experiment");
  });

  it("rejects malformed progress, operands, and responses after a correct answer", async () => {
    await expect(
      replayTechnicalLab(runtime, {
        ...emptyTechnicalLabSnapshot(),
        currentModuleIndex: 1,
      }),
    ).rejects.toThrow("skipped an incomplete prerequisite");

    await expect(
      replayTechnicalLab(runtime, {
        ...emptyTechnicalLabSnapshot(),
        actionJournal: [
          {
            moduleIndex: 0,
            experimentIndex: 0,
            stepIndex: 0,
            occurrenceIndex: 0,
            operandA: 1,
            operandB: 0,
          },
        ],
      }),
    ).rejects.toThrow(
      "Only a bounded edit action may carry laboratory operands",
    );

    let snapshot = emptyTechnicalLabSnapshot();
    let replay = await replayTechnicalLab(runtime, snapshot);
    while (replay.expectedAction !== null) {
      snapshot = appendTechnicalLabAction({
        snapshot,
        bundle: runtime.bundle,
        actionType: replay.expectedAction.actionType,
        ...(replay.expectedAction.actionType === "EDIT_INPUT"
          ? { operandA: 1, operandB: 88 }
          : {}),
      });
      replay = await replayTechnicalLab(runtime, snapshot);
    }
    snapshot = appendTechnicalLabResponse({
      snapshot,
      bundle: runtime.bundle,
      kind: "INTERPRETATION",
      optionId: "A",
    });
    await expect(
      replayTechnicalLab(runtime, {
        ...snapshot,
        responseJournal: [
          ...snapshot.responseJournal,
          {
            moduleIndex: 0,
            kind: "INTERPRETATION",
            optionIndex: 1,
            attemptNumber: 2,
          },
        ],
      }),
    ).rejects.toThrow("checkpoint history is not replayable");
  });

  it("replays the same journal to byte-identical signature evidence", async () => {
    let snapshot = emptyTechnicalLabSnapshot();
    let replay = await replayTechnicalLab(runtime, snapshot);
    for (let moduleIndex = 0; moduleIndex < 3; moduleIndex += 1) {
      const completed = await completeCurrentModule(snapshot);
      snapshot = completed.snapshot;
      replay = completed.replay;
      if (moduleIndex < 2) {
        snapshot = advanceTechnicalLabModule({ replay });
      }
    }
    const first = await replayTechnicalLab(runtime, snapshot);
    const second = await replayTechnicalLab(
      runtime,
      structuredClone(snapshot),
    );
    expect(value(first, 2, "signature")).toBe(
      value(second, 2, "signature"),
    );
    expect(value(first, 2, "proposalDigest")).toBe(
      value(second, 2, "proposalDigest"),
    );
  });
});

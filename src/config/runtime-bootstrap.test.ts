import { describe, expect, it } from "vitest";
import {
  CompletionStatus,
  CreditMode,
  LessonMode,
  PlatformMode,
  type LearnerContext,
  type LearningPlatformAdapter,
  type PlatformInitializationResult,
  type PlatformInteraction,
} from "../infrastructure/scorm/learning-platform-adapter";
import { decodeSl1Attempt } from "../infrastructure/persistence/sl1-codec";
import { sl1CodecSchema } from "../domain/simulation/command-journal";
import { challengeAScenario } from "../scenarios/challenge-a/scenario";
import { challengeVariantBank } from "../scenarios/challenge-a/variant-bank";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { hashConfiguration } from "./hash";
import {
  CHALLENGE_PRESET,
  GUIDED_PRESET,
} from "./presets";
import {
  initializeRuntimeAttempt,
} from "./runtime-bootstrap";
import type { RuntimePackage } from "./runtime-loader";

class TestPlatformAdapter implements LearningPlatformAdapter {
  stored: string | null = null;
  saveCount = 0;
  commitCount = 0;

  async initialize(): Promise<PlatformInitializationResult> {
    return {
      mode: PlatformMode.SCORM_1_2,
      isConnected: true,
      isReadOnly: false,
      diagnostics: [],
    };
  }

  async getLearnerContext(): Promise<LearnerContext> {
    return {
      learnerId: "LEARNER_1",
      learnerName: "Learner",
      lessonMode: LessonMode.NORMAL,
      credit: CreditMode.CREDIT,
      isResumed: this.stored !== null,
      previousStatus: CompletionStatus.INCOMPLETE,
    };
  }

  async loadAttemptState(): Promise<string | null> {
    return this.stored;
  }

  async saveAttemptState(encodedState: string): Promise<void> {
    this.stored = encodedState;
    this.saveCount += 1;
  }

  async setLocation(_location: string): Promise<void> {}
  async setScore(_score: number): Promise<void> {}
  async setCompletion(_status: CompletionStatus): Promise<void> {}
  async recordInteraction(_interaction: PlatformInteraction): Promise<void> {}

  async commit(): Promise<void> {
    this.commitCount += 1;
  }

  async finish(): Promise<void> {}
}

function challengeRuntime(): RuntimePackage {
  return {
    configuration: CHALLENGE_PRESET,
    configurationHash: hashConfiguration(CHALLENGE_PRESET),
    scenario: challengeAScenario,
    cryptographicRuntime: null,
    variantBank: challengeVariantBank,
  };
}

describe("runtime attempt initialization", () => {
  it("persists a deterministic Challenge assignment before revealing its case", async () => {
    const adapter = new TestPlatformAdapter();
    const initialized = await initializeRuntimeAttempt(
      challengeRuntime(),
      {
        scormAdapter: adapter,
        seedGenerator: {
          nextSeed: () => "AAAAAAAAAAAAAAAAAAAAAA",
        },
      },
    );

    expect(adapter.saveCount).toBe(1);
    expect(adapter.commitCount).toBe(1);
    expect(initialized.platformBootstrap.assignmentOnly).toBe(true);
    expect(initialized.variantAssignment).toBeDefined();
    expect(initialized.scenario).toEqual(
      challengeVariantBank.variants[
        initialized.variantAssignment?.variantIndex ?? -1
      ]?.scenario,
    );

    const snapshot = decodeSl1Attempt(
      adapter.stored as string,
      sl1CodecSchema({
        configuration: CHALLENGE_PRESET,
        configurationHash: hashConfiguration(CHALLENGE_PRESET),
        scenario: initialized.scenario,
        variantBank: challengeVariantBank,
      }),
    );
    expect(snapshot.variantAssignment).toEqual(
      initialized.variantAssignment,
    );
    expect(snapshot.journal).toEqual([]);
  });

  it("reconstructs the same Challenge case without drawing or writing again", async () => {
    const adapter = new TestPlatformAdapter();
    const first = await initializeRuntimeAttempt(challengeRuntime(), {
      scormAdapter: adapter,
      seedGenerator: {
        nextSeed: () => "BBBBBBBBBBBBBBBBBBBBBB",
      },
    });
    const second = await initializeRuntimeAttempt(challengeRuntime(), {
      scormAdapter: adapter,
      seedGenerator: {
        nextSeed: () => {
          throw new Error("A resumed attempt must not draw another seed");
        },
      },
    });

    expect(adapter.saveCount).toBe(1);
    expect(second.variantAssignment).toEqual(first.variantAssignment);
    expect(second.scenario).toEqual(first.scenario);
    expect(second.platformBootstrap.assignmentOnly).toBe(true);
  });

  it("does not create assignment persistence for a fixed Guided package", async () => {
    const adapter = new TestPlatformAdapter();
    const runtime: RuntimePackage = {
      configuration: GUIDED_PRESET,
      configurationHash: hashConfiguration(GUIDED_PRESET),
      scenario: coffeeScenario,
      cryptographicRuntime: null,
      variantBank: null,
    };
    const initialized = await initializeRuntimeAttempt(runtime, {
      scormAdapter: adapter,
    });

    expect(initialized.variantAssignment).toBeUndefined();
    expect(initialized.scenario).toEqual(coffeeScenario);
    expect(adapter.saveCount).toBe(0);
  });
});

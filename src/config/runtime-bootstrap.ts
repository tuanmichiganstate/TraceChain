import { ScenarioStageId } from "../domain/types/enums";
import {
  assignmentForVariant,
  BrowserAttemptSeedGenerator,
  selectVariantAssignment,
  type AttemptSeedGenerator,
  type ScenarioVariantAssignment,
} from "../domain/scenario/variant-bank";
import { IncompatibleAttemptError } from "../domain/errors";
import { sl1CodecSchema } from "../domain/simulation/command-journal";
import {
  decodeSl1Attempt,
  encodeSl1Attempt,
  peekSl1VariantAssignment,
  type Sl1AttemptSnapshot,
} from "../infrastructure/persistence/sl1-codec";
import {
  LearningPlatformPersistenceBridge,
  type SimulationPersistence,
} from "../infrastructure/persistence/simulation-persistence";
import { StandalonePersistenceAdapter } from "../infrastructure/persistence/standalone-adapter";
import { Scorm12Adapter } from "../infrastructure/scorm/scorm12-adapter";
import {
  PlatformMode,
  type LearningPlatformAdapter,
} from "../infrastructure/scorm/learning-platform-adapter";
import { APP_VERSION } from "../app/configuration";
import type { RuntimePackage } from "./runtime-loader";

export interface RuntimePlatformBootstrap {
  readonly adapter: LearningPlatformAdapter;
  readonly persistence: SimulationPersistence;
  readonly mode: PlatformMode;
  readonly isReadOnly: boolean;
  readonly diagnostics: readonly string[];
  readonly storedAttempt: string | null;
  readonly assignmentOnly: boolean;
}

export interface InitializedRuntimePackage
  extends Omit<RuntimePackage, "scenario"> {
  readonly scenario: RuntimePackage["scenario"];
  readonly variantAssignment?: ScenarioVariantAssignment;
  readonly platformBootstrap: RuntimePlatformBootstrap;
}

function emptySnapshot(
  assignment: ScenarioVariantAssignment,
): Sl1AttemptSnapshot {
  return {
    sessionId: "SES_000001",
    currentStageId: ScenarioStageId.ORIENTATION,
    completedStageIds: [],
    decisions: {},
    hintsUsed: [],
    journal: [],
    isCompleted: false,
    isPassed: false,
    variantAssignment: assignment,
  };
}

function containsLearnerProgress(
  snapshot: Sl1AttemptSnapshot,
): boolean {
  return (
    snapshot.journal.length > 0 ||
    snapshot.completedStageIds.length > 0 ||
    Object.keys(snapshot.decisions).length > 0 ||
    snapshot.hintsUsed.length > 0 ||
    snapshot.isCompleted
  );
}

export async function initializeRuntimeAttempt(
  runtime: RuntimePackage,
  options: {
    readonly scormAdapter?: LearningPlatformAdapter;
    readonly standaloneAdapter?: LearningPlatformAdapter;
    readonly seedGenerator?: AttemptSeedGenerator;
  } = {},
): Promise<InitializedRuntimePackage> {
  const scormAdapter =
    options.scormAdapter ?? new Scorm12Adapter();
  const scormResult = await scormAdapter.initialize();
  let adapter = scormAdapter;
  let mode = PlatformMode.SCORM_1_2;
  let isReadOnly = scormResult.isReadOnly;
  const diagnostics = [...scormResult.diagnostics];

  if (!scormResult.isConnected) {
    const standalone =
      options.standaloneAdapter ??
      new StandalonePersistenceAdapter({
        appVersion: APP_VERSION,
        scenarioId: runtime.configuration.scenarioId,
      });
    const standaloneResult = await standalone.initialize();
    adapter = standalone;
    mode = PlatformMode.STANDALONE;
    isReadOnly = standaloneResult.isReadOnly;
    diagnostics.push(...standaloneResult.diagnostics);
  }

  const persistence = new LearningPlatformPersistenceBridge(adapter);
  let storedAttempt = await persistence.load();
  if (runtime.variantBank === null) {
    return {
      ...runtime,
      platformBootstrap: {
        adapter,
        persistence,
        mode,
        isReadOnly,
        diagnostics,
        storedAttempt,
        assignmentOnly: false,
      },
    };
  }

  let assignment: ScenarioVariantAssignment;
  let scenario: RuntimePackage["scenario"];
  let isAssignmentOnly = false;

  if (storedAttempt === null || storedAttempt.trim().length === 0) {
    if (isReadOnly) {
      throw new IncompatibleAttemptError(
        "A read-only launch has no persisted Challenge variant assignment",
      );
    }
    const generated =
      options.seedGenerator ?? new BrowserAttemptSeedGenerator();
    assignment = selectVariantAssignment({
      bank: runtime.variantBank,
      attemptSeed: generated.nextSeed(),
      assignmentSource:
        mode === PlatformMode.SCORM_1_2
          ? "SCORM_ATTEMPT"
          : "STANDALONE_ATTEMPT",
    });
    const selected =
      runtime.variantBank.variants[assignment.variantIndex];
    if (selected === undefined) {
      throw new IncompatibleAttemptError(
        "The selected Challenge variant is absent from its bank",
      );
    }
    scenario = selected.scenario;
    const schema = sl1CodecSchema({
      configuration: runtime.configuration,
      configurationHash: runtime.configurationHash,
      scenario,
      variantBank: runtime.variantBank,
    });
    storedAttempt = encodeSl1Attempt(
      emptySnapshot(assignment),
      schema,
    );
    await persistence.persistAndCommit(storedAttempt);
    isAssignmentOnly = true;
  } else {
    const compact = peekSl1VariantAssignment(storedAttempt);
    if (compact === null) {
      throw new IncompatibleAttemptError(
        "Stored progress has no Challenge variant assignment",
      );
    }
    assignment = assignmentForVariant({
      bank: runtime.variantBank,
      variantIndex: compact.variantIndex,
      attemptSeed: compact.attemptSeed,
      assignmentSource: compact.assignmentSource,
    });
    const selected =
      runtime.variantBank.variants[assignment.variantIndex];
    if (selected === undefined) {
      throw new IncompatibleAttemptError(
        "Stored progress references a missing Challenge variant",
      );
    }
    scenario = selected.scenario;
    const restored = decodeSl1Attempt(
      storedAttempt,
      sl1CodecSchema({
        configuration: runtime.configuration,
        configurationHash: runtime.configurationHash,
        scenario,
        variantBank: runtime.variantBank,
      }),
    );
    isAssignmentOnly = !containsLearnerProgress(restored);
    if (
      restored.variantAssignment?.variantId !==
      assignment.variantId
    ) {
      throw new IncompatibleAttemptError(
        "Stored progress does not match its selected Challenge variant",
      );
    }
  }

  return {
    ...runtime,
    scenario,
    variantAssignment: assignment,
    platformBootstrap: {
      adapter,
      persistence,
      mode,
      isReadOnly,
      diagnostics,
      storedAttempt,
      assignmentOnly: isAssignmentOnly,
    },
  };
}

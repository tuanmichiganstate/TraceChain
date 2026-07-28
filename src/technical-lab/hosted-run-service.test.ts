import { describe, expect, it } from "vitest";
import type {
  Clock,
  IdGenerator,
} from "../domain/simulation/environment";
import {
  createHostedRuntimeService,
} from "../platform/hosted/hosted-runtime-service";
import { MemoryRunEventStore } from "../platform/runs/event-store";
import { permissionedFoundationsLabBundle } from "./permissioned-foundations-pack";
import {
  technicalLabHostedPackAdapter,
  TECHNICAL_LAB_HOSTED_MODE_CONFIGURATION,
  TECHNICAL_LAB_HOSTED_SCENARIO_ID,
  TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
} from "./hosted-pack-adapter";

class FixedClock implements Clock {
  now(): string {
    return "2026-07-27T12:00:00.000Z";
  }
}

class SequentialIds implements IdGenerator {
  private next = 0;

  nextId(prefix: string): string {
    this.next += 1;
    return `${prefix}_${String(this.next).padStart(4, "0")}`;
  }
}

const learner = {
  userId: "LEARNER_LAB_001",
  roles: ["learner"] as const,
};

describe("hosted Technical Laboratory runtime", () => {
  it("runs the shared seven-module engine through append-only hosted events", async () => {
    const store = new MemoryRunEventStore();
    const service = createHostedRuntimeService({
      pack: technicalLabHostedPackAdapter,
      scenarioId: TECHNICAL_LAB_HOSTED_SCENARIO_ID,
      scenarioVersion: TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
      eventStore: store,
      clock: new FixedClock(),
      ids: new SequentialIds(),
    });
    expect(service.runtimeKind).toBe("technical-lab-v1");
    await service.createRun(learner, {
      commandId: "COMMAND_START_LAB",
      runId: "RUN_LAB_001",
      assignmentId: "ASSIGNMENT_LAB_001",
      learnerUserId: learner.userId,
      mode: "tutorial",
      modeConfiguration:
        TECHNICAL_LAB_HOSTED_MODE_CONFIGURATION,
    });
    const initial = await service.learnerProjection(
      learner,
      "RUN_LAB_001",
    );
    expect(
      initial.technicalLab?.replay.modules[0]?.interpretation
        .definition.correctOptionId,
    ).not.toBe(
      permissionedFoundationsLabBundle.modules[0]
        ?.interpretationItem.correctOptionId,
    );

    let commandSequence = 0;
    const submit = async (
      command: Readonly<Record<string, unknown>>,
    ) => {
      commandSequence += 1;
      const projection = await service.learnerProjection(
        learner,
        "RUN_LAB_001",
      );
      await service.submit(learner, {
        ...command,
        commandId: `COMMAND_LAB_${String(commandSequence)}`,
        runId: "RUN_LAB_001",
        expectedRunVersion: projection.version,
      } as never);
    };

    for (
      let moduleIndex = 0;
      moduleIndex <
      permissionedFoundationsLabBundle.modules.length;
      moduleIndex += 1
    ) {
      let projection = await service.learnerProjection(
        learner,
        "RUN_LAB_001",
      );
      while (
        projection.technicalLab?.replay.expectedAction !== null
      ) {
        const expected =
          projection.technicalLab!.replay.expectedAction!;
        await submit({
          commandType: "PERFORM_TECHNICAL_LAB_ACTION",
          actionType: expected.actionType,
          ...(expected.actionType === "EDIT_INPUT"
            ? { operandA: 1, operandB: 88 }
            : {}),
        });
        projection = await service.learnerProjection(
          learner,
          "RUN_LAB_001",
        );
      }
      const module =
        permissionedFoundationsLabBundle.modules[moduleIndex]!;
      await submit({
        commandType: "SUBMIT_TECHNICAL_LAB_RESPONSE",
        kind: "INTERPRETATION",
        optionId: module.interpretationItem.correctOptionId,
      });
      const afterInterpretation =
        await service.learnerProjection(
          learner,
          "RUN_LAB_001",
        );
      expect(
        afterInterpretation.technicalLab?.replay.modules[
          moduleIndex
        ]?.interpretation.definition.correctOptionId,
      ).toBe(module.interpretationItem.correctOptionId);
      expect(
        afterInterpretation.technicalLab?.replay.modules[
          moduleIndex
        ]?.application.definition.correctOptionId,
      ).not.toBe(module.applicationItem.correctOptionId);
      await submit({
        commandType: "SUBMIT_TECHNICAL_LAB_RESPONSE",
        kind: "APPLICATION",
        optionId: module.applicationItem.correctOptionId,
      });
      if (
        moduleIndex <
        permissionedFoundationsLabBundle.modules.length - 1
      ) {
        await submit({
          commandType: "ADVANCE_TECHNICAL_LAB_MODULE",
        });
      }
    }

    const completed = await service.learnerProjection(
      learner,
      "RUN_LAB_001",
    );
    expect(completed.workflowState.permittedActionIds).toEqual([]);
    expect(completed.technicalLab?.replay.complete).toBe(true);
    expect(completed.technicalLab?.replay.score).toMatchObject({
      experimentScore: 40,
      interpretationScore: 40,
      applicationScore: 20,
      totalScore: 100,
      passed: true,
    });
    expect(await service.officialGrade("RUN_LAB_001")).toEqual({
      gradingProgress: "FullyGraded",
      scoreGiven: 100,
      scoreMaximum: 100,
    });
    const events = await store.load("RUN_LAB_001");
    expect(events.at(-1)?.eventType).toBe("RUN_COMPLETED");
    expect(
      events.filter(
        (event) => event.eventType === "RUN_COMPLETED",
      ),
    ).toHaveLength(1);
    expect(
      await service.instructorReplay(
        {
          userId: "INSTRUCTOR_001",
          roles: ["instructor"],
        },
        "RUN_LAB_001",
      ),
    ).toMatchObject({
      runId: "RUN_LAB_001",
      projection: {
        technicalLab: {
          replay: {
            complete: true,
            score: { totalScore: 100 },
          },
        },
      },
    });
  }, 20_000);

  it("rejects stale delivery and replays an identical command idempotently", async () => {
    const service = createHostedRuntimeService({
      pack: technicalLabHostedPackAdapter,
      scenarioId: TECHNICAL_LAB_HOSTED_SCENARIO_ID,
      scenarioVersion: TECHNICAL_LAB_HOSTED_SCENARIO_VERSION,
      eventStore: new MemoryRunEventStore(),
      clock: new FixedClock(),
      ids: new SequentialIds(),
    });
    await service.createRun(learner, {
      commandId: "COMMAND_START_LAB_2",
      runId: "RUN_LAB_002",
      assignmentId: "ASSIGNMENT_LAB_002",
      learnerUserId: learner.userId,
      mode: "tutorial",
      modeConfiguration:
        TECHNICAL_LAB_HOSTED_MODE_CONFIGURATION,
    });
    const command = {
      commandId: "COMMAND_VIEW_INPUT",
      runId: "RUN_LAB_002",
      expectedRunVersion: 1,
      commandType: "PERFORM_TECHNICAL_LAB_ACTION",
      actionType: "VIEW_INPUT",
    } as const;
    const first = await service.submit(learner, command);
    const repeated = await service.submit(learner, command);
    expect(first.wasIdempotentReplay).toBe(false);
    expect(repeated.wasIdempotentReplay).toBe(true);
    await expect(
      service.submit(learner, {
        commandId: "COMMAND_STALE",
        runId: "RUN_LAB_002",
        expectedRunVersion: 1,
        commandType: "PERFORM_TECHNICAL_LAB_ACTION",
        actionType: "HASH",
      }),
    ).rejects.toMatchObject({
      code: "RUN_VERSION_CONFLICT",
    });
  });
});

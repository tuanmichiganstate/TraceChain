import packJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import { describe, expect, it } from "vitest";
import {
  FixedClock,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { MemoryRunEventStore } from "../runs/event-store";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import type { ApplicationPrincipal } from "./access";
import { createHostedRuntimeService } from "./hosted-runtime-service";

const NOW = "2026-07-27T03:00:00.000Z";

const instructor: ApplicationPrincipal = {
  userId: "USER_INSTRUCTOR_AUDIT",
  roles: ["instructor"],
};

const learner: ApplicationPrincipal = {
  userId: "USER_LEARNER_AUDIT",
  roles: ["learner"],
};

function fixture() {
  const result = validateScenarioPack(structuredClone(packJson));
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  const pack = publishScenarioPack(result.pack, {
    publishedAt: NOW,
    publishedBy: instructor.userId,
  }) as ScenarioPackV1;
  const store = new MemoryRunEventStore();
  return {
    store,
    service: createHostedRuntimeService({
      pack,
      scenarioId: "SCN_GUIDED_COFFEE_AUDIT",
      scenarioVersion: "1.0.0",
      eventStore: store,
      clock: new FixedClock(NOW),
      ids: new SequenceIdGenerator(1),
    }),
  };
}

describe("hosted runtime registry for Guided Audit", () => {
  it("runs Audit through the shared hosted service boundary", async () => {
    const { service, store } = fixture();
    expect(service.runtimeKind).toBe("audit-v1");

    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_GUIDED_AUDIT",
      runId: "RUN_GUIDED_AUDIT_FACTORY",
      assignmentId: "ASSIGNMENT_GUIDED_AUDIT",
      learnerUserId: learner.userId,
      mode: "tutorial",
    });
    const inspected = await service.submit(learner, {
      commandType: "INSPECT_AUDIT_EVIDENCE",
      commandId: "COMMAND_INSPECT_AUDIT_EVIDENCE",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
      evidenceId: "EVID_AUD_CERTIFICATE",
    });
    const projection = await service.learnerProjection(
      learner,
      inspected.state.runId,
    );
    const replay = await service.instructorReplay(
      instructor,
      inspected.state.runId,
    );

    expect(projection.audit).toMatchObject({
      auditCaseId: "AUDIT_COFFEE_CONTROLS_001",
      sourceProcessId: "COFFEE_PROCESS_COMPLETED_001",
    });
    expect(
      projection.audit?.evidence.find(
        (evidence) =>
          evidence.evidenceId === "EVID_AUD_CERTIFICATE",
      )?.inspected,
    ).toBe(true);
    expect(replay.projection).toEqual(projection);
    expect(
      (await store.load(inspected.state.runId)).map(
        (event) => event.eventType,
      ),
    ).toEqual([
      "RUN_CREATED",
      "AUDIT_CASE_OPENED",
      "AUDIT_EVIDENCE_INSPECTED",
    ]);
  });
});

import packJson from "../../../scenario-packs/guided-coffee-audit/simuledger.pack.json";
import practicePackJson from "../../../scenario-packs/practice-coffee-audit/simuledger.pack.json";
import { describe, expect, it } from "vitest";
import {
  FixedClock,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
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

function fixture(
  sourcePack: unknown = packJson,
  scenarioId = "SCN_GUIDED_COFFEE_AUDIT",
) {
  const result = validateScenarioPack(structuredClone(sourcePack));
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
  }) as ScenarioPackV2;
  const store = new MemoryRunEventStore();
  return {
    store,
    service: createHostedRuntimeService({
      pack,
      scenarioId,
      scenarioVersion:
        pack.scenarios.find(
          (scenario) => scenario.scenarioId === scenarioId,
        )?.version ?? "",
      eventStore: store,
      clock: new FixedClock(NOW),
      ids: new SequenceIdGenerator(1),
    }),
  };
}

describe("hosted runtime registry for Audit", () => {
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

  it("runs Practice Audit with on-request hints and reduced support", async () => {
    const { service, store } = fixture(
      practicePackJson,
      "SCN_PRACTICE_COFFEE_AUDIT",
    );
    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_PRACTICE_AUDIT",
      runId: "RUN_PRACTICE_AUDIT_FACTORY",
      assignmentId: "ASSIGNMENT_PRACTICE_AUDIT",
      learnerUserId: learner.userId,
      mode: "standard",
    });
    const hinted = await service.submit(learner, {
      commandType: "VIEW_AUDIT_HINT",
      commandId: "COMMAND_VIEW_PRACTICE_HINT",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
      hintId: "HINT_AUTHORIZATION_COMPARISON",
    });
    const projection = await service.learnerProjection(
      learner,
      hinted.state.runId,
    );

    expect(projection.audit).toMatchObject({
      auditCaseId: "AUDIT_COFFEE_CONTROLS_PRACTICE_001",
      supportProfile: "PRACTICE",
      hints: [
        {
          hintId: "HINT_AUTHORIZATION_COMPARISON",
          viewed: true,
        },
        {
          hintId: "HINT_CUSTODY_ENDORSEMENT",
          viewed: false,
        },
        {
          hintId: "HINT_PROPOSAL_DIGEST",
          viewed: false,
        },
      ],
    });
    expect(
      (await store.load(hinted.state.runId)).map(
        (event) => event.eventType,
      ),
    ).toEqual([
      "RUN_CREATED",
      "AUDIT_CASE_OPENED",
      "AUDIT_HINT_VIEWED",
    ]);
  });
});

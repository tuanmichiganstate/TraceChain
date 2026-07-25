import packJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import {
  FixedClock,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { CounterfactualBranchEngine } from "../runs/counterfactual-branch";
import { MemoryCounterfactualRunRepository } from "../runs/counterfactual-repository";
import { MemoryRunEventStore } from "../runs/event-store";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import type { ApplicationPrincipal } from "./access";
import { GenericHostedRunService } from "./generic-run-service";
import { hostedRuntimeKindFor } from "./runtime-registry";

const NOW = "2026-07-25T03:00:00.000Z";

const instructor: ApplicationPrincipal = {
  userId: "USER_INSTRUCTOR_001",
  email: "instructor@example.edu",
  roles: ["instructor"],
};

const learner: ApplicationPrincipal = {
  userId: "USER_LEARNER_001",
  email: "learner@example.edu",
  roles: ["learner"],
};

function publishedPack(): ScenarioPackV1 {
  const result = validateScenarioPack(structuredClone(packJson));
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return publishScenarioPack(result.pack, {
    publishedAt: NOW,
    publishedBy: instructor.userId,
  });
}

function createService(store = new MemoryRunEventStore()) {
  const pack = publishedPack();
  return {
    pack,
    store,
    service: new GenericHostedRunService(
      pack,
      "SCN_PHARMA_COLD_CHAIN_STARTER",
      "1.2.0",
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
    ),
  };
}

function createTransferService(store = new MemoryRunEventStore()) {
  const pack = publishedPack();
  return {
    pack,
    store,
    service: new GenericHostedRunService(
      pack,
      "SCN_PHARMA_COLD_CHAIN_TRANSFER",
      "1.0.0",
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
    ),
  };
}

describe("GenericHostedRunService", () => {
  it("runs an alternative decision from a copy-on-write fork through the normal command engine", async () => {
    const store = new MemoryRunEventStore();
    const branches = new MemoryCounterfactualRunRepository();
    const pack = publishedPack();
    const service = new GenericHostedRunService(
      pack,
      "SCN_PHARMA_COLD_CHAIN_STARTER",
      "1.2.0",
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
      new CounterfactualBranchEngine(store, branches),
    );
    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_PHARMA_COUNTERFACTUAL",
      runId: "RUN_PHARMA_COUNTERFACTUAL_SOURCE",
      assignmentId: "ASSIGNMENT_PHARMA_001",
      learnerUserId: learner.userId,
      mode: "sandbox",
    });
    const advanced = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_ADVANCE_PHARMA_COUNTERFACTUAL",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
    });
    const inspected = await service.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_INSPECT_PHARMA_COUNTERFACTUAL",
      runId: advanced.state.runId,
      expectedRunVersion: advanced.state.version,
      evidenceId: "EVID_PHARMA_SENSOR_SUMMARY",
    });
    const original = await service.submit(learner, {
      commandType: "SUBMIT_STRUCTURED_DECISION",
      commandId: "COMMAND_ORIGINAL_PHARMA_COUNTERFACTUAL",
      runId: inspected.state.runId,
      expectedRunVersion: inspected.state.version,
      decisionId: "DECISION_PHARMA_RELEASE",
      responses: {
        shipmentAction: ["HOLD_AND_INVESTIGATE"],
      },
      justification: "Hold the shipment while the excursion is reviewed.",
    });
    await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_COMPLETE_PHARMA_COUNTERFACTUAL",
      runId: original.state.runId,
      expectedRunVersion: original.state.version,
    });
    const sourceEvents = await store.load(created.state.runId);
    const originalDecision = sourceEvents.find(
      (event) =>
        event.causationId ===
          "COMMAND_ORIGINAL_PHARMA_COUNTERFACTUAL" &&
        event.eventType === "DECISION_SUBMITTED",
    );
    if (originalDecision === undefined) {
      throw new Error("Expected the original decision event.");
    }
    expect(originalDecision.payload.submittedCommand).toEqual({
      commandType: "SUBMIT_STRUCTURED_DECISION",
      decisionId: "DECISION_PHARMA_RELEASE",
      justification:
        "Hold the shipment while the excursion is reviewed.",
      responses: {
        shipmentAction: ["HOLD_AND_INVESTIGATE"],
      },
    });

    await service.createCounterfactualBranch(learner, {
      branchRunId: "RUN_PHARMA_COUNTERFACTUAL_ALTERNATIVE",
      sourceRunId: created.state.runId,
      forkSequenceNumber: originalDecision.sequenceNumber - 1,
      forkNodeId: "NODE_PHARMA_DECISION",
      interventionId: "COMMAND_ALTERNATIVE_PHARMA_COUNTERFACTUAL",
      comparisonMode: "SINGLE_INTERVENTION",
      createdByUserId: learner.userId,
      createdAt: NOW,
    });
    const alternative = await service.submitCounterfactual(learner, {
      commandType: "SUBMIT_STRUCTURED_DECISION",
      commandId: "COMMAND_ALTERNATIVE_PHARMA_COUNTERFACTUAL",
      runId: "RUN_PHARMA_COUNTERFACTUAL_ALTERNATIVE",
      expectedRunVersion: 0,
      decisionId: "DECISION_PHARMA_RELEASE",
      responses: {
        shipmentAction: ["RELEASE_WITHOUT_REVIEW"],
      },
      justification: "Explore the consequence of releasing immediately.",
    });

    expect(alternative.state.runId).toBe(
      "RUN_PHARMA_COUNTERFACTUAL_ALTERNATIVE",
    );
    expect(alternative.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_CONSEQUENCE_RELEASE",
    );
    expect((await store.load(created.state.runId)).length).toBe(
      sourceEvents.length,
    );
    expect(
      await store.load("RUN_PHARMA_COUNTERFACTUAL_ALTERNATIVE"),
    ).toHaveLength(alternative.state.version);
  });

  it("registers only the node and transition subset it can execute", () => {
    const scenario = publishedPack().scenarios[0];
    const firstNode = scenario?.nodes[0];
    const firstTransition = firstNode?.transitions[0];
    if (
      scenario === undefined ||
      firstNode === undefined ||
      firstTransition === undefined
    ) {
      throw new Error("Expected the pharmaceutical starter workflow.");
    }
    expect(hostedRuntimeKindFor(scenario)).toBe("generic-v1");

    const unsupported = {
      ...scenario,
      nodes: [
        {
          ...firstNode,
          transitions: [
            {
              ...firstTransition,
              when: {
                kind: "EVENT_OCCURRED" as const,
                eventType: "EXTERNAL_REVIEW_COMPLETED",
              },
            },
          ],
        },
        ...scenario.nodes.slice(1),
      ],
    };
    expect(hostedRuntimeKindFor(unsupported)).toBeNull();
  });

  it("runs a second discipline from authored nodes without a scenario adapter", async () => {
    const { service } = createService();
    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_PHARMA_001",
      runId: "RUN_PHARMA_001",
      assignmentId: "ASSIGNMENT_PHARMA_001",
      learnerUserId: learner.userId,
      mode: "tutorial",
    });

    expect(created.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_BRIEFING",
    );
    expect(
      created.state.workflowState.permittedActionIdsByRole.QUALITY_MANAGER,
    ).toEqual(["ADVANCE_WORKFLOW"]);

    const advanced = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_ADVANCE_PHARMA_001",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
    });
    expect(advanced.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_DECISION",
    );
    expect(advanced.state.releasedEvidenceIds).toEqual([
      "EVID_PHARMA_SENSOR_SUMMARY",
    ]);

    const inspected = await service.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_INSPECT_PHARMA_001",
      runId: advanced.state.runId,
      expectedRunVersion: advanced.state.version,
      evidenceId: "EVID_PHARMA_SENSOR_SUMMARY",
    });
    const decided = await service.submit(learner, {
      commandType: "SUBMIT_STRUCTURED_DECISION",
      commandId: "COMMAND_DECIDE_PHARMA_001",
      runId: inspected.state.runId,
      expectedRunVersion: inspected.state.version,
      decisionId: "DECISION_PHARMA_RELEASE",
      responses: {
        shipmentAction: ["HOLD_AND_INVESTIGATE"],
      },
      justification:
        "The shipment should remain on hold while the temperature excursion is investigated.",
    });

    expect(decided.state.status).toBe("active");
    expect(decided.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_CONSEQUENCE_HOLD",
    );
    const consequenceProjection = await service.learnerProjection(
      learner,
      decided.state.runId,
    );
    expect(consequenceProjection.presentation?.currentNode).toEqual(
      expect.objectContaining({
        nodeType: "CONSEQUENCE",
        consequenceCode: "SHIPMENT_HELD_FOR_INVESTIGATION",
        message: expect.objectContaining({
          valuesByLocale: expect.objectContaining({
            en: expect.stringContaining("protects patients"),
            vi: expect.stringContaining("bảo vệ người bệnh"),
          }),
        }),
      }),
    );

    const completed = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_CONTINUE_PHARMA_001",
      runId: decided.state.runId,
      expectedRunVersion: decided.state.version,
    });
    expect(completed.state.status).toBe("completed");
    expect(completed.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_COMPLETE",
    );
    expect(completed.state.competencyEvidence).toHaveLength(1);

    const projection = await service.learnerProjection(
      learner,
      completed.state.runId,
    );
    expect(projection.workflowState.permittedActionIds).toEqual([]);
    expect(projection.informationState).toEqual([
      expect.objectContaining({
        recordId: "EVID_PHARMA_SENSOR_SUMMARY",
      }),
    ]);
    expect(Object.hasOwn(projection, "actualState")).toBe(false);
    expect(projection.presentation?.currentNode.nodeType).toBe(
      "COMPLETION",
    );
    expect(
      await service.learnerAuthoredFeedback(
        learner,
        completed.state.runId,
      ),
    ).toEqual([
      expect.objectContaining({
        feedbackCode:
          "INTEGRITY_DOES_NOT_PROVE_STORAGE_CONDITIONS",
        message: expect.objectContaining({
          valuesByLocale: expect.objectContaining({
            en: expect.stringContaining(
              "does not prove that storage conditions were acceptable",
            ),
          }),
        }),
      }),
    ]);

    const timeline = await service.instructorTimeline(
      instructor,
      completed.state.runId,
    );
    expect(timeline.map((event) => event.eventType)).toEqual([
      "RUN_CREATED",
      "WORKFLOW_ADVANCED",
      "EVIDENCE_RELEASED",
      "WORKFLOW_ADVANCED",
      "EVIDENCE_INSPECTED",
      "DECISION_SUBMITTED",
      "COMPETENCY_EVIDENCE_RECORDED",
      "WORKFLOW_ADVANCED",
      "WORKFLOW_ADVANCED",
      "WORKFLOW_ADVANCED",
      "RUN_COMPLETED",
    ]);
  });

  it("runs the richer pharmaceutical transfer case through evidence, two decisions, and proportional disposition", async () => {
    const { service } = createTransferService();
    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_PHARMA_TRANSFER",
      runId: "RUN_PHARMA_TRANSFER",
      assignmentId: "ASSIGNMENT_PHARMA_TRANSFER",
      learnerUserId: learner.userId,
      mode: "tutorial",
    });
    const triage = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_ADVANCE_PHARMA_TRANSFER",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
    });

    expect(triage.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_TRANSFER_TRIAGE",
    );
    expect(triage.state.releasedEvidenceIds).toEqual([
      "EVID_PHARMA_TRANSFER_SENSOR",
      "EVID_PHARMA_TRANSFER_CUSTODY",
    ]);

    const sensorInspected = await service.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_INSPECT_TRANSFER_SENSOR",
      runId: triage.state.runId,
      expectedRunVersion: triage.state.version,
      evidenceId: "EVID_PHARMA_TRANSFER_SENSOR",
    });
    const custodyInspected = await service.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_INSPECT_TRANSFER_CUSTODY",
      runId: sensorInspected.state.runId,
      expectedRunVersion: sensorInspected.state.version,
      evidenceId: "EVID_PHARMA_TRANSFER_CUSTODY",
    });
    const held = await service.submit(learner, {
      commandType: "SUBMIT_STRUCTURED_DECISION",
      commandId: "COMMAND_DECIDE_TRANSFER_TRIAGE",
      runId: custodyInspected.state.runId,
      expectedRunVersion: custodyInspected.state.version,
      decisionId: "DECISION_PHARMA_TRANSFER_TRIAGE",
      responses: {
        triageAction: ["HOLD_AND_INVESTIGATE"],
      },
      justification:
        "The signed custody record establishes integrity, but the temperature evidence still requires investigation.",
      citedEvidenceIds: [
        "EVID_PHARMA_TRANSFER_SENSOR",
        "EVID_PHARMA_TRANSFER_CUSTODY",
      ],
      citedPolicyIds: [
        "POLICY_PHARMA_TRANSFER_INVESTIGATION",
      ],
      confidenceRating: 4,
      adverseEventProbabilityPercent: 35,
    });

    expect(held.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_TRANSFER_HOLD",
    );
    expect(held.state.competencyEvidence).toEqual([
      expect.objectContaining({
        evidenceRuleId: "EVIDENCE_RULE_PHARMA_TRANSFER_TRIAGE",
        indicatorIds: [
          "PHARMA.COLD_CHAIN.PI1",
          "PHARMA.COLD_CHAIN.PI3",
        ],
      }),
    ]);

    const disposition = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_ADVANCE_TRANSFER_INVESTIGATION",
      runId: held.state.runId,
      expectedRunVersion: held.state.version,
    });
    expect(disposition.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_TRANSFER_DISPOSITION",
    );
    expect(disposition.state.releasedEvidenceIds).toEqual([
      "EVID_PHARMA_TRANSFER_SENSOR",
      "EVID_PHARMA_TRANSFER_CUSTODY",
      "EVID_PHARMA_TRANSFER_CALIBRATION",
      "EVID_PHARMA_TRANSFER_STABILITY",
    ]);

    const calibrationInspected = await service.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_INSPECT_TRANSFER_CALIBRATION",
      runId: disposition.state.runId,
      expectedRunVersion: disposition.state.version,
      evidenceId: "EVID_PHARMA_TRANSFER_CALIBRATION",
    });
    const stabilityInspected = await service.submit(learner, {
      commandType: "INSPECT_EVIDENCE",
      commandId: "COMMAND_INSPECT_TRANSFER_STABILITY",
      runId: calibrationInspected.state.runId,
      expectedRunVersion: calibrationInspected.state.version,
      evidenceId: "EVID_PHARMA_TRANSFER_STABILITY",
    });
    const quarantined = await service.submit(learner, {
      commandType: "SUBMIT_STRUCTURED_DECISION",
      commandId: "COMMAND_DECIDE_TRANSFER_DISPOSITION",
      runId: stabilityInspected.state.runId,
      expectedRunVersion: stabilityInspected.state.version,
      decisionId: "DECISION_PHARMA_TRANSFER_DISPOSITION",
      responses: {
        dispositionAction: ["QUARANTINE_AFFECTED_SHIPMENT"],
      },
      justification:
        "The stability assessment does not support release, while the evidence limits the known scope to this shipment.",
      citedEvidenceIds: [
        "EVID_PHARMA_TRANSFER_CALIBRATION",
        "EVID_PHARMA_TRANSFER_STABILITY",
      ],
      citedPolicyIds: [
        "POLICY_PHARMA_TRANSFER_DISPOSITION",
      ],
      confidenceRating: 4,
      adverseEventProbabilityPercent: 20,
    });

    expect(quarantined.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_TRANSFER_QUARANTINE",
    );
    expect(quarantined.state.competencyEvidence).toHaveLength(2);
    expect(quarantined.state.competencyEvidence[1]).toEqual(
      expect.objectContaining({
        evidenceRuleId:
          "EVIDENCE_RULE_PHARMA_TRANSFER_DISPOSITION",
        indicatorIds: [
          "PHARMA.COLD_CHAIN.PI2",
          "PHARMA.COLD_CHAIN.PI3",
        ],
      }),
    );

    const completed = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_COMPLETE_PHARMA_TRANSFER",
      runId: quarantined.state.runId,
      expectedRunVersion: quarantined.state.version,
    });
    expect(completed.state.status).toBe("completed");
    expect(completed.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_TRANSFER_COMPLETE",
    );
    expect(Object.keys(completed.state.decisions).sort()).toEqual([
      "DECISION_PHARMA_TRANSFER_DISPOSITION",
      "DECISION_PHARMA_TRANSFER_TRIAGE",
    ]);

    const projection = await service.learnerProjection(
      learner,
      completed.state.runId,
    );
    expect(projection.informationState).toHaveLength(4);
    expect(Object.hasOwn(projection, "actualState")).toBe(false);
    expect(
      await service.learnerAuthoredFeedback(
        learner,
        completed.state.runId,
      ),
    ).toEqual([
      expect.objectContaining({
        feedbackCode:
          "PHARMA_TRANSFER_INTEGRITY_AND_PROPORTIONALITY",
      }),
    ]);
  });

  it("replays idempotently and rejects learner-entered identity", async () => {
    const { service } = createService();
    const request = {
      commandId: "COMMAND_CREATE_PHARMA_002",
      runId: "RUN_PHARMA_002",
      assignmentId: "ASSIGNMENT_PHARMA_001",
      learnerUserId: learner.userId,
      mode: "standard" as const,
      scenarioSeed: "pharma-standard-seed",
    };
    const created = await service.createRun(instructor, request);
    const replayed = await service.createRun(instructor, request);
    expect(replayed.wasIdempotentReplay).toBe(true);
    expect(replayed.state).toEqual(created.state);

    await expect(
      service.submit(learner, {
        commandType: "ADVANCE_WORKFLOW",
        commandId: "COMMAND_IDENTITY_PHARMA_002",
        runId: created.state.runId,
        expectedRunVersion: created.state.version,
        roleId: "DISTRIBUTION_PHARMACIST",
      } as never),
    ).rejects.toMatchObject({
      code: "INVALID_COMMAND",
    });
  });

  it("keeps submitted decisions idempotent and rejects malformed input without appending", async () => {
    const { service, store } = createService();
    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_PHARMA_003",
      runId: "RUN_PHARMA_003",
      assignmentId: "ASSIGNMENT_PHARMA_003",
      learnerUserId: learner.userId,
      mode: "tutorial",
    });
    const advanced = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_ADVANCE_PHARMA_003",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
    });

    await expect(
      service.submit(learner, {
        commandType: "SUBMIT_STRUCTURED_DECISION",
        commandId: "COMMAND_MALFORMED_PHARMA_003",
        runId: advanced.state.runId,
        expectedRunVersion: advanced.state.version,
        decisionId: "DECISION_PHARMA_RELEASE",
        responses: {
          shipmentAction: "HOLD_AND_INVESTIGATE",
        },
        justification: "Investigate the excursion.",
      } as never),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(await store.load(created.state.runId)).toHaveLength(4);

    const command = {
      commandType: "SUBMIT_STRUCTURED_DECISION" as const,
      commandId: "COMMAND_DECIDE_PHARMA_003",
      runId: advanced.state.runId,
      expectedRunVersion: advanced.state.version,
      decisionId: "DECISION_PHARMA_RELEASE",
      responses: {
        shipmentAction: ["HOLD_AND_INVESTIGATE"],
      },
      justification: "Investigate the excursion.",
    };
    const decided = await service.submit(learner, command);
    const replayed = await service.submit(learner, command);

    expect(replayed.wasIdempotentReplay).toBe(true);
    expect(replayed.state).toEqual(decided.state);
    expect(await store.load(created.state.runId)).toHaveLength(7);
  });

  it("routes each authored decision option to its own consequence", async () => {
    const { service } = createService();
    const created = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_PHARMA_RELEASE",
      runId: "RUN_PHARMA_RELEASE",
      assignmentId: "ASSIGNMENT_PHARMA_RELEASE",
      learnerUserId: learner.userId,
      mode: "tutorial",
    });
    const advanced = await service.submit(learner, {
      commandType: "ADVANCE_WORKFLOW",
      commandId: "COMMAND_ADVANCE_PHARMA_RELEASE",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
    });
    const decided = await service.submit(learner, {
      commandType: "SUBMIT_STRUCTURED_DECISION",
      commandId: "COMMAND_DECIDE_PHARMA_RELEASE",
      runId: advanced.state.runId,
      expectedRunVersion: advanced.state.version,
      decisionId: "DECISION_PHARMA_RELEASE",
      responses: {
        shipmentAction: ["RELEASE_WITHOUT_REVIEW"],
      },
      justification: "Release the shipment without further review.",
    });

    expect(decided.state.workflowState.currentNodeId).toBe(
      "NODE_PHARMA_CONSEQUENCE_RELEASE",
    );
    expect(
      (
        await service.learnerProjection(
          learner,
          decided.state.runId,
        )
      ).presentation?.currentNode,
    ).toEqual(
      expect.objectContaining({
        consequenceCode:
          "SHIPMENT_RELEASED_WITH_UNRESOLVED_EXCURSION",
      }),
    );
    expect(
      await service.learnerAuthoredFeedback(
        learner,
        decided.state.runId,
      ),
    ).toEqual([]);
  });

  it("reproduces generated seeds, random draws, outcomes, and event hashes", async () => {
    const first = createService();
    const second = createService();
    const request = {
      commandId: "COMMAND_CREATE_PHARMA_004",
      runId: "RUN_PHARMA_004",
      assignmentId: "ASSIGNMENT_PHARMA_004",
      learnerUserId: learner.userId,
      mode: "sandbox" as const,
    };

    const firstResult = await first.service.createRun(
      instructor,
      request,
    );
    const secondResult = await second.service.createRun(
      instructor,
      request,
    );
    const firstEvents = await first.store.load(request.runId);
    const secondEvents = await second.store.load(request.runId);

    expect(firstResult.state.scenarioSeed).toMatch(/^generated:/);
    expect(firstResult.state.rngState).toEqual({
      seed: firstResult.state.scenarioSeed,
      streamPosition: 1,
      recordedDraws: [
        firstResult.state.outcomeResolution?.draw,
      ],
    });
    expect(firstResult.state).toEqual(secondResult.state);
    expect(firstEvents).toEqual(secondEvents);
    expect(firstEvents.map((event) => event.eventType)).toEqual([
      "RUN_CREATED",
      "RANDOM_DRAW_MADE",
      "OUTCOME_REALIZED",
    ]);
  });
});

import packJson from "../../../scenario-packs/guided-coffee-audit/simuledger.pack.json";
import challengePackJson from "../../../scenario-packs/challenge-coffee-audit/simuledger.pack.json";
import {
  FixedClock,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import type { ApplicationPrincipal } from "../hosted/access";
import { MemoryRunEventStore } from "../runs/event-store";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import { AuditHostedRunService } from "./audit-run-service";
import type { AuditFindingInputV1 } from "./audit-run-types";

const NOW = "2026-07-27T03:00:00.000Z";

const instructor: ApplicationPrincipal = {
  userId: "USER_INSTRUCTOR_AUDIT",
  roles: ["instructor"],
};

const learner: ApplicationPrincipal = {
  userId: "USER_LEARNER_AUDIT",
  roles: ["learner"],
};

function publishedPack(): ScenarioPackV2 {
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

function fixture() {
  const pack = publishedPack();
  const store = new MemoryRunEventStore();
  return {
    pack,
    store,
    service: new AuditHostedRunService(
      pack,
      "SCN_GUIDED_COFFEE_AUDIT",
      "2.0.0",
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
    ),
  };
}

function assessmentFixture() {
  const validation = validateScenarioPack(
    structuredClone(challengePackJson),
  );
  if (!validation.isValid) {
    throw new Error(
      validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: NOW,
    publishedBy: instructor.userId,
  });
  const scenario = pack.scenarios[0]!;
  return {
    scenario,
    service: new AuditHostedRunService(
      pack,
      scenario.scenarioId,
      scenario.version,
      new MemoryRunEventStore(),
      new FixedClock(NOW),
      new SequenceIdGenerator(1),
    ),
  };
}

async function create(service: AuditHostedRunService) {
  return service.createRun(instructor, {
    commandId: "COMMAND_CREATE_AUDIT",
    runId: "RUN_GUIDED_AUDIT",
    assignmentId: "ASSIGNMENT_GUIDED_AUDIT",
    learnerUserId: learner.userId,
    mode: "tutorial",
  });
}

function finding(
  findingId: string,
  overrides: Partial<AuditFindingInputV1> = {},
): AuditFindingInputV1 {
  return {
    findingId,
    categoryId: "CATEGORY_CERTIFICATE_CONTROL",
    entityId: "ENTITY_LOT_CERTIFICATE",
    title: "Expired certificate accepted",
    observation:
      "The document expired before review and the lot continued.",
    severity: "HIGH",
    materiality: "MATERIAL",
    confidence: 90,
    evidenceIds: [
      "EVID_AUD_CERTIFICATE",
      "EVID_AUD_CERTIFIER_REGISTRY",
    ],
    policyIds: ["POL_CERTIFICATE_ACCEPTANCE"],
    rootCauseCode: "ROOT_EXPIRY_REVIEW",
    recommendationCode: "REC_HOLD_FOR_VALIDATION",
    recommendation:
      "Hold the lot until a current certificate is verified.",
    ...overrides,
  };
}

async function submitFinding(
  service: AuditHostedRunService,
  state: { readonly runId: string; readonly version: number },
  input: AuditFindingInputV1,
  commandId: string,
) {
  return service.submit(learner, {
    commandType: "SUBMIT_AUDIT_FINDING",
    commandId,
    runId: state.runId,
    expectedRunVersion: state.version,
    finding: input,
  });
}

describe("AuditHostedRunService", () => {
  it("withholds Assessment feedback until completion and enforces one-shot findings", async () => {
    const { scenario, service } = assessmentFixture();
    const auditCase = scenario.auditCase!;
    const definition = auditCase.findingDefinitions[0]!;
    let result = await service.createRun(instructor, {
      commandId: "COMMAND_CREATE_AUDIT_ASSESSMENT",
      runId: "RUN_AUDIT_ASSESSMENT",
      assignmentId: "ASSIGNMENT_AUDIT_ASSESSMENT",
      learnerUserId: learner.userId,
      mode: "standard",
    });
    const input: AuditFindingInputV1 = {
      findingId: "F1",
      categoryId: definition.categoryId,
      entityId: definition.entityId,
      title: "Evidence-linked assessment finding",
      observation:
        "The evidence and policy support this submitted finding.",
      severity: definition.expectedSeverity,
      materiality: definition.expectedMateriality,
      confidence: 85,
      evidenceIds: definition.requiredEvidenceIds,
      policyIds: definition.applicablePolicyIds,
      rootCauseCode: definition.acceptableRootCauseCodes[0]!,
      recommendationCode:
        definition.acceptableRecommendationCodes[0]!,
      recommendation:
        "Apply the authored control response and retain evidence.",
    };
    result = await submitFinding(
      service,
      result.state,
      input,
      "COMMAND_ASSESSMENT_FINDING",
    );
    const beforeCompletion = await service.learnerProjection(
      learner,
      result.state.runId,
    );

    expect(beforeCompletion.audit?.findings[0]?.feedback).toBeUndefined();
    expect(beforeCompletion.audit?.report).toBeUndefined();
    expect(
      beforeCompletion.workflowState.permittedActionIds,
    ).not.toContain("VIEW_AUDIT_HINT");
    expect(
      beforeCompletion.workflowState.permittedActionIds,
    ).not.toContain("AMEND_AUDIT_FINDING");
    await expect(
      service.submit(learner, {
        commandType: "AMEND_AUDIT_FINDING",
        commandId: "COMMAND_ASSESSMENT_AMEND",
        runId: result.state.runId,
        expectedRunVersion: result.state.version,
        finding: input,
      }),
    ).rejects.toThrow(/one-shot|not permitted/iu);

    result = await service.submit(learner, {
      commandType: "SUBMIT_AUDIT_CONCLUSION",
      commandId: "COMMAND_ASSESSMENT_CONCLUSION",
      runId: result.state.runId,
      expectedRunVersion: result.state.version,
      conclusion: {
        conclusionCategory:
          auditCase.conclusionCategories[0]!.conclusionCategory,
        scopeSummary: "Reviewed the authored process scope.",
        materialFindingsSummary:
          "Recorded the supported material findings.",
        nonMaterialFindingsSummary:
          "Recorded no unsupported non-material findings.",
        limitations: "The conclusion is limited to authored evidence.",
        uncertainty: "No inference extends beyond the review period.",
        recommendations: "Apply the documented control response.",
        confidence: 85,
      },
    });
    const completed = await service.learnerProjection(
      learner,
      result.state.runId,
    );

    expect(result.state.status).toBe("completed");
    expect(completed.audit?.findings[0]?.feedback).toBeDefined();
    expect(completed.audit?.report).toBeDefined();
    expect(
      await service.officialGrade(result.state.runId),
    ).toEqual({
      gradingProgress: "FullyGraded",
      scoreGiven: completed.audit?.report?.score,
      scoreMaximum: 100,
    });
  });

  it("keeps the source process immutable and separates attempt records from ledger projection", async () => {
    const { service, store } = fixture();
    const created = await create(service);
    const originalSource = structuredClone(
      created.state.immutableSourceState,
    );
    const submitted = await submitFinding(
      service,
      created.state,
      finding("AUD_FINDING_CERTIFICATE"),
      "COMMAND_FINDING_CERTIFICATE",
    );

    expect(submitted.state.immutableSourceState).toEqual(originalSource);
    expect(submitted.state.sourceStateHash).toBe(
      created.state.sourceStateHash,
    );
    const projection = await service.learnerProjection(
      learner,
      submitted.state.runId,
    );
    const transactions = projection.ledgerState.transactions as
      | readonly Readonly<Record<string, unknown>>[]
      | undefined;
    expect(
      transactions?.some(
        (transaction) =>
          transaction.transactionId === "ATTEMPT_RECALL_001",
      ),
    ).toBe(false);
    expect(
      projection.audit?.sourceRecords.find(
        (record) =>
          record.sourceRecordId === "ATTEMPT_RECALL_001",
      )?.recordKind,
    ).toBe("ATTEMPT_AUDIT");
    expect(projection.audit?.evidence[0]?.learnerMetadata).toEqual(
      expect.objectContaining({
        signatureStatus: "NOT_APPLICABLE",
        ledgerStatus: "OFF_CHAIN",
        completeness: "COMPLETE",
      }),
    );
    expect(JSON.stringify(projection)).not.toContain(
      "assessmentMetadata",
    );
    expect(JSON.stringify(projection)).not.toContain(
      "CERTIFICATE_CONTENT_REQUIRES_POLICY_REVIEW",
    );
    expect(
      (await store.load(submitted.state.runId)).map(
        (event) => event.eventType,
      ),
    ).toContain("COMPETENCY_EVIDENCE_RECORDED");
  });

  it("replays idempotently and retains amendments instead of replacing event history", async () => {
    const { service, store } = fixture();
    const created = await create(service);
    const input = finding("AUD_FINDING_CERTIFICATE");
    const submitted = await submitFinding(
      service,
      created.state,
      input,
      "COMMAND_FINDING_CERTIFICATE",
    );
    const retry = await service.submit(learner, {
      commandType: "SUBMIT_AUDIT_FINDING",
      commandId: "COMMAND_FINDING_CERTIFICATE",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
      finding: input,
    });
    expect(retry.wasIdempotentReplay).toBe(true);
    expect(retry.state).toEqual(submitted.state);

    const amended = await service.submit(learner, {
      commandType: "AMEND_AUDIT_FINDING",
      commandId: "COMMAND_AMEND_CERTIFICATE",
      runId: submitted.state.runId,
      expectedRunVersion: submitted.state.version,
      finding: {
        ...input,
        confidence: 95,
      },
    });
    expect(amended.state.findings[0]).toMatchObject({
      findingId: input.findingId,
      revision: 2,
      confidence: 95,
    });
    expect(
      (await store.load(created.state.runId)).filter(
        (event) =>
          event.eventType === "AUDIT_FINDING_SUBMITTED" ||
          event.eventType === "AUDIT_FINDING_AMENDED",
      ),
    ).toHaveLength(2);
  });

  it("persists an incomplete bounded workpaper draft and restores it through replay", async () => {
    const { pack, service, store } = fixture();
    const created = await create(service);
    const saved = await service.submit(learner, {
      commandType: "SAVE_AUDIT_FINDING_DRAFT",
      commandId: "COMMAND_SAVE_INCOMPLETE_DRAFT",
      runId: created.state.runId,
      expectedRunVersion: created.state.version,
      finding: finding("AUD_FINDING_DRAFT", {
        title: "",
        observation: "",
        evidenceIds: [],
        policyIds: [],
        recommendation: "",
      }),
    });
    const replayedService = new AuditHostedRunService(
      pack,
      "SCN_GUIDED_COFFEE_AUDIT",
      "2.0.0",
      store,
      new FixedClock(NOW),
      new SequenceIdGenerator(500),
    );
    const projection = await replayedService.learnerProjection(
      learner,
      saved.state.runId,
    );

    expect(projection.audit?.drafts).toEqual([
      expect.objectContaining({
        findingId: "AUD_FINDING_DRAFT",
        title: "",
        observation: "",
        evidenceIds: [],
        policyIds: [],
        recommendation: "",
      }),
    ]);
    expect(
      (await store.load(saved.state.runId)).map(
        (event) => event.eventType,
      ),
    ).toContain("AUDIT_FINDING_DRAFT_SAVED");
  });

  it("scores the exact seven-item 100-point contract and produces an evidence-linked report", async () => {
    const { service } = fixture();
    let result = await create(service);
    result = await submitFinding(
      service,
      result.state,
      finding("AUD_FINDING_CERTIFICATE"),
      "COMMAND_FINDING_CERTIFICATE",
    );
    result = await submitFinding(
      service,
      result.state,
      finding("AUD_FINDING_DOCUMENTATION", {
        categoryId: "CATEGORY_DOCUMENTATION_CONTROL",
        entityId: "ENTITY_QUANTITY_RECEIPT",
        title: "Investigation not documented",
        observation:
          "The receiving report has no investigation reference.",
        severity: "MODERATE",
        materiality: "MATERIAL",
        evidenceIds: [
          "EVID_AUD_RECEIPT",
          "EVID_AUD_CORRECTION",
        ],
        policyIds: ["POL_QUANTITY_CORRECTION"],
        rootCauseCode: "ROOT_DOCUMENTATION_GAP",
        recommendationCode: "REC_REQUIRE_INVESTIGATION",
        recommendation:
          "Require investigation evidence before correction.",
      }),
      "COMMAND_FINDING_DOCUMENTATION",
    );
    result = await submitFinding(
      service,
      result.state,
      finding("AUD_FINDING_RECALL", {
        categoryId: "CATEGORY_AUTHORIZATION_CONTROL",
        entityId: "ENTITY_RECALL_PROCESS",
        title: "Unauthorized recall attempt",
        observation:
          "The initial recall attempt preceded the regulator handoff.",
        severity: "MODERATE",
        materiality: "NON_MATERIAL",
        evidenceIds: [
          "EVID_AUD_RECALL_ATTEMPT",
          "EVID_AUD_RECALL_COMMIT",
        ],
        policyIds: ["POL_RECALL_AUTHORIZATION"],
        rootCauseCode: "ROOT_ROLE_CONTROL",
        recommendationCode: "REC_REQUIRE_ROLE_HANDOFF",
        recommendation:
          "Require regulator handoff before recall commitment.",
      }),
      "COMMAND_FINDING_RECALL",
    );
    const completed = await service.submit(learner, {
      commandType: "SUBMIT_AUDIT_CONCLUSION",
      commandId: "COMMAND_AUDIT_CONCLUSION",
      runId: result.state.runId,
      expectedRunVersion: result.state.version,
      conclusion: {
        conclusionCategory: "QUALIFIED",
        scopeSummary: "Certificate, correction, and recall controls.",
        materialFindingsSummary:
          "Certificate and documentation exceptions were material.",
        nonMaterialFindingsSummary:
          "The rejected recall attempt was remediated.",
        limitations:
          "The transit delay had no corroborating loss evidence.",
        uncertainty:
          "No conclusion is drawn about conditions outside the period.",
        recommendations:
          "Strengthen validity review, documentation, and handoff.",
        confidence: 90,
      },
    });
    const projection = await service.learnerProjection(
      learner,
      completed.state.runId,
    );
    expect(completed.state.status).toBe("completed");
    expect(projection.audit?.report).toMatchObject({
      score: 100,
      maximumScore: 100,
      passScore: 70,
      passed: true,
      unsupportedFindingIds: [],
      missedFindingDefinitionIds: [],
    });
    expect(
      projection.audit?.report?.scoreLines.map(
        (line) => [line.scorableItemId, line.maximumScore],
      ),
    ).toEqual([
      ["AUD_DETECTION", 25],
      ["AUD_FALSE_POSITIVE_AVOIDANCE", 15],
      ["AUD_EVIDENCE", 15],
      ["AUD_POLICY", 10],
      ["AUD_CLASSIFICATION", 10],
      ["AUD_RECOMMENDATION", 10],
      ["AUD_CONCLUSION", 15],
    ]);
    expect(
      completed.state.competencyEvidence.some(
        (evidence) =>
          evidence.evidenceRuleId ===
            "EVIDENCE_RULE_GUIDED_AUDIT_CONCLUSION" &&
          evidence.indicatorIds.includes(
            "AUDIT_JUDGMENT.CONCLUSION",
          ),
      ),
    ).toBe(true);
  });

  it("treats a defensible unusual transaction as a false positive without changing source state", async () => {
    const { service } = fixture();
    const created = await create(service);
    const submitted = await submitFinding(
      service,
      created.state,
      finding("AUD_FINDING_DECOY", {
        categoryId: "CATEGORY_LEDGER_INTEGRITY",
        entityId: "ENTITY_QUANTITY_CORRECTION",
        title: "Correction changed the quantity",
        observation:
          "The corrected quantity differs from the original value.",
        severity: "HIGH",
        materiality: "MATERIAL",
        evidenceIds: ["EVID_AUD_CORRECTION"],
        policyIds: ["POL_QUANTITY_CORRECTION"],
        rootCauseCode: "ROOT_NO_EXCEPTION",
        recommendationCode: "REC_NO_FINDING",
        recommendation: "Retain as reviewed.",
      }),
      "COMMAND_FINDING_DECOY",
    );
    const projection = await service.learnerProjection(
      learner,
      submitted.state.runId,
    );
    expect(
      projection.audit?.findings[0]?.feedback?.classification,
    ).toBe("LEGITIMATE_EXCEPTION");
    expect(submitted.state.immutableSourceState).toEqual(
      created.state.immutableSourceState,
    );
  });
});

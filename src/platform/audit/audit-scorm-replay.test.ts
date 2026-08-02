import { describe, expect, it } from "vitest";
import packJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import { AUDIT_GUIDED_PRESET } from "../../config/presets";
import { hashConfiguration } from "../../config/hash";
import type { AuditRuntimePackage } from "../../config/audit-runtime-loader";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import type { Ta2AuditSnapshot } from "../../infrastructure/persistence/ta2-audit-codec";
import { replayTa2AuditAttempt } from "./audit-scorm-replay";

function runtime(): AuditRuntimePackage {
  const validation = validateScenarioPack(structuredClone(packJson));
  if (!validation.isValid) {
    throw new Error("Guided Audit fixture is invalid.");
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "TRACECHAIN_PACKAGE_GENERATOR",
  }) as ScenarioPackV2;
  const scenario = pack.scenarios[0]!;
  return {
    configuration: AUDIT_GUIDED_PRESET,
    configurationHash: hashConfiguration(AUDIT_GUIDED_PRESET),
    pack,
    scenario,
    auditCase: scenario.auditCase!,
    variantBank: null,
  };
}

describe("TA2 Audit replay through the shared command service", () => {
  it("reconstructs the same events, state, score, and report from compact inputs", async () => {
    const configured = runtime();
    const snapshot: Ta2AuditSnapshot = {
      variantAssignment: null,
      commandJournal: [
        { operation: "VIEW_SCOPE" },
        {
          operation: "INSPECT_EVIDENCE",
          evidenceId: "EVID_AUD_CERTIFICATE",
        },
        {
          operation: "INSPECT_EVIDENCE",
          evidenceId: "EVID_AUD_CERTIFIER_REGISTRY",
        },
        {
          operation: "SUBMIT_FINDING",
          finding: {
            findingId: "F1",
            categoryId: "CATEGORY_CERTIFICATE_CONTROL",
            entityId: "ENTITY_LOT_CERTIFICATE",
            title: "Expired certificate accepted",
            observation:
              "The certificate expired before the review date.",
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
          },
        },
        {
          operation: "SUBMIT_CONCLUSION",
          conclusion: {
            conclusionCategory: "QUALIFIED",
            scopeSummary: "Certificate controls were reviewed.",
            materialFindingsSummary:
              "One material certificate exception was identified.",
            nonMaterialFindingsSummary:
              "No non-material exception was identified.",
            limitations:
              "The audit used the evidence in the authored scope.",
            uncertainty:
              "No unresolved certificate uncertainty remains.",
            recommendations:
              "Require validity review before lot continuation.",
            confidence: 90,
          },
        },
      ],
    };

    const first = await replayTa2AuditAttempt(configured, snapshot);
    const second = await replayTa2AuditAttempt(configured, snapshot);

    expect(second).toEqual(first);
    expect(first.state.status).toBe("completed");
    expect(first.projection.audit?.report).toEqual(
      expect.objectContaining({
        maximumScore: 100,
        passScore: 70,
      }),
    );
    expect(
      (
        first.projection.ledgerState.transactions as readonly {
          readonly transactionId: string;
        }[]
      ).some(
        (transaction) =>
          transaction.transactionId === "ATTEMPT_RECALL_001",
      ),
    ).toBe(false);
  });
});

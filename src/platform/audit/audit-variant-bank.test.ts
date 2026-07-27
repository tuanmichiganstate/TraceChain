import { describe, expect, it } from "vitest";
import packJson from "../../../scenario-packs/challenge-coffee-audit/tracechain.pack.json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import {
  allocateHostedAuditVariant,
  auditVariantAssignmentForIndex,
  resolveAuditVariant,
  selectAuditVariantAssignment,
  validateAuditVariantBank,
} from "./audit-variant-bank";

const pack = packJson as ScenarioPackV1;
const bank = pack.auditVariantBanks[0]!;

describe("Audit curated variant bank", () => {
  it("validates complete cases against one explicit equivalence blueprint", () => {
    const result = validateAuditVariantBank({ pack, bank });

    expect(result).toEqual({ isValid: true, issues: [] });
    expect(bank.status).toBe("DRAFT");
    expect(bank.variants).toHaveLength(3);
  });

  it("selects deterministically and resolves the exact immutable case", () => {
    const first = selectAuditVariantAssignment({
      bank,
      attemptSeed: "AAAAAAAAAAAAAAAAAAAAAA",
      assignmentSource: "HOSTED_ASSIGNMENT",
    });
    const replay = selectAuditVariantAssignment({
      bank,
      attemptSeed: "AAAAAAAAAAAAAAAAAAAAAA",
      assignmentSource: "HOSTED_ASSIGNMENT",
    });

    expect(replay).toEqual(first);
    const resolved = resolveAuditVariant({
      pack,
      bank,
      assignment: first,
    });
    expect(resolved.scenario.scenarioId).toBe(
      bank.variants[first.variantIndex]!.scenarioId,
    );
    expect(resolved.auditCase.auditCaseId).toBe(
      first.variantId.replace(
        "AUDIT_CHALLENGE_",
        "AUDIT_COFFEE_CHALLENGE_",
      ),
    );
  });

  it("reconstructs every exact assignment from its compact replay inputs", () => {
    for (const [variantIndex, variant] of bank.variants.entries()) {
      const assignment = auditVariantAssignmentForIndex({
        bank,
        variantIndex,
        attemptSeed: `BBBBBBBBBBBBBBBBBBBBB${String(variantIndex)}`,
        assignmentSource: "SCORM_ATTEMPT",
      });

      expect(assignment.variantId).toBe(variant.variantId);
      expect(
        resolveAuditVariant({ pack, bank, assignment }).auditCase
          .auditCaseId,
      ).toBe(variant.auditCaseId);
    }
  });

  it("uses the shared balanced hosted allocator and records the decision", () => {
    const result = allocateHostedAuditVariant({
      bank,
      request: {
        allocationRequestId: "ALLOCATE_AUDIT_001",
        strategy: "BALANCED",
        attemptSeed: "CCCCCCCCCCCCCCCCCCCCCC",
        assignmentCounts: {
          AUDIT_CHALLENGE_A: 4,
          AUDIT_CHALLENGE_B: 2,
          AUDIT_CHALLENGE_C: 2,
        },
      },
    });

    expect(result.assignment.assignmentSource).toBe(
      "HOSTED_ASSIGNMENT",
    );
    expect(result.assignment.variantId).not.toBe(
      "AUDIT_CHALLENGE_A",
    );
    expect(result.audit.bankId).toBe(bank.bankId);
  });
});

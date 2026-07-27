import { describe, expect, it } from "vitest";
import { challengeVariantBank } from "../../scenarios/challenge-a/variant-bank";
import { allocateHostedVariant } from "./hosted-variant-allocation";

const seed = "AAAAAAAAAAAAAAAAAAAAAA";

describe("hosted curated-variant allocation", () => {
  it("balances across the least-used variants with deterministic tie breaking", () => {
    const request = {
      allocationRequestId: "ALLOCATE_BALANCED_001",
      strategy: "BALANCED" as const,
      attemptSeed: seed,
      assignmentCounts: {
        CHALLENGE_A: 3,
        CHALLENGE_B: 1,
        CHALLENGE_C: 1,
      },
    };
    const first = allocateHostedVariant(
      challengeVariantBank,
      request,
    );
    const replay = allocateHostedVariant(
      challengeVariantBank,
      request,
    );

    expect(replay).toEqual(first);
    expect([...first.audit.candidateVariantIds].sort()).toEqual([
      "CHALLENGE_B",
      "CHALLENGE_C",
    ]);
    expect(first.assignment.assignmentSource).toBe(
      "HOSTED_ASSIGNMENT",
    );
  });

  it("allocates without replacement and starts a declared new cycle only after exhaustion", () => {
    const available = allocateHostedVariant(
      challengeVariantBank,
      {
        allocationRequestId: "ALLOCATE_WITHOUT_REPLACEMENT_001",
        strategy: "WITHOUT_REPLACEMENT",
        attemptSeed: seed,
        previouslyAssignedVariantIds: [
          "CHALLENGE_A",
          "CHALLENGE_B",
        ],
      },
    );
    expect(available.assignment.variantId).toBe("CHALLENGE_C");
    expect(available.audit.withoutReplacementCycleReset).toBe(
      false,
    );

    const reset = allocateHostedVariant(challengeVariantBank, {
      allocationRequestId: "ALLOCATE_WITHOUT_REPLACEMENT_002",
      strategy: "WITHOUT_REPLACEMENT",
      attemptSeed: seed,
      previouslyAssignedVariantIds: [
        "CHALLENGE_A",
        "CHALLENGE_B",
        "CHALLENGE_C",
      ],
    });
    expect(reset.audit.withoutReplacementCycleReset).toBe(true);
  });

  it("supports manual and same-as-previous assignments without trusting an unknown variant", () => {
    const manual = allocateHostedVariant(challengeVariantBank, {
      allocationRequestId: "ALLOCATE_MANUAL_001",
      strategy: "MANUAL",
      attemptSeed: seed,
      manualVariantId: "CHALLENGE_B",
    });
    const repeated = allocateHostedVariant(challengeVariantBank, {
      allocationRequestId: "ALLOCATE_REPEAT_001",
      strategy: "SAME_AS_PREVIOUS",
      attemptSeed: "BBBBBBBBBBBBBBBBBBBBBB",
      previousAssignment: manual.assignment,
    });

    expect(manual.assignment.variantId).toBe("CHALLENGE_B");
    expect(repeated.assignment.variantId).toBe("CHALLENGE_B");
    expect(() =>
      allocateHostedVariant(challengeVariantBank, {
        allocationRequestId: "ALLOCATE_MANUAL_UNKNOWN",
        strategy: "MANUAL",
        attemptSeed: seed,
        manualVariantId: "UNKNOWN",
      }),
    ).toThrow(/not a member/iu);
  });
});

import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  assignmentForVariant,
  selectVariantIndex,
  validateAttemptSeed,
  type CuratedVariantSelectionBank,
  type ScenarioVariantAssignment,
} from "./variant-bank";

export type HostedVariantAllocationStrategy =
  | "BALANCED"
  | "WITHOUT_REPLACEMENT"
  | "MANUAL"
  | "SAME_AS_PREVIOUS";

export interface HostedVariantAllocationRequest {
  readonly allocationRequestId: string;
  readonly strategy: HostedVariantAllocationStrategy;
  readonly attemptSeed: string;
  readonly assignmentCounts?: Readonly<Record<string, number>>;
  readonly previouslyAssignedVariantIds?: readonly string[];
  readonly manualVariantId?: string;
  readonly previousAssignment?: ScenarioVariantAssignment;
}

export interface HostedVariantAllocationAuditV1 {
  readonly schemaVersion: "1";
  readonly allocationRequestId: string;
  readonly bankId: string;
  readonly bankVersion: string;
  readonly strategy: HostedVariantAllocationStrategy;
  readonly selectedVariantId: string;
  readonly selectedVariantIndex: number;
  readonly attemptSeed: string;
  readonly candidateVariantIds: readonly string[];
  readonly priorAssignmentCountsHash: string;
  readonly withoutReplacementCycleReset: boolean;
}

export interface HostedVariantAllocationResult {
  readonly assignment: ScenarioVariantAssignment;
  readonly audit: HostedVariantAllocationAuditV1;
}

function variantIndex(
  bank: CuratedVariantSelectionBank,
  variantId: string,
): number {
  const index = bank.variants.findIndex(
    (variant) => variant.metadata.variantId === variantId,
  );
  if (index < 0) {
    throw new Error(
      `Variant ${variantId} is not a member of the immutable bank.`,
    );
  }
  return index;
}

function deterministicCandidateIndex(options: {
  readonly bank: CuratedVariantSelectionBank;
  readonly candidateIndexes: readonly number[];
  readonly attemptSeed: string;
}): number {
  const candidateBank: CuratedVariantSelectionBank = {
    bankId: options.bank.bankId,
    bankVersion: options.bank.bankVersion,
    variants: options.candidateIndexes.map(
      (index) => options.bank.variants[index]!,
    ),
  };
  const candidateIndex = selectVariantIndex({
    bank: candidateBank,
    attemptSeed: options.attemptSeed,
    selectionAlgorithmVersion: "1",
  });
  return options.candidateIndexes[candidateIndex]!;
}

export function allocateHostedVariant(
  bank: CuratedVariantSelectionBank,
  request: HostedVariantAllocationRequest,
): HostedVariantAllocationResult {
  validateAttemptSeed(request.attemptSeed);
  if (bank.variants.length === 0) {
    throw new Error("Cannot allocate from an empty variant bank.");
  }
  if (
    request.allocationRequestId.trim().length === 0 ||
    request.allocationRequestId.length > 128
  ) {
    throw new Error(
      "Hosted allocation requires a bounded request identifier.",
    );
  }
  const counts = request.assignmentCounts ?? {};
  for (const [variantId, count] of Object.entries(counts)) {
    variantIndex(bank, variantId);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(
        "Hosted variant assignment counts must be non-negative integers.",
      );
    }
  }

  let candidates = bank.variants.map((_, index) => index);
  let selectedIndex: number;
  let cycleReset = false;
  if (request.strategy === "MANUAL") {
    if (request.manualVariantId === undefined) {
      throw new Error("Manual allocation requires one variant ID.");
    }
    selectedIndex = variantIndex(bank, request.manualVariantId);
    candidates = [selectedIndex];
  } else if (request.strategy === "SAME_AS_PREVIOUS") {
    const previous = request.previousAssignment;
    if (
      previous === undefined ||
      previous.bankId !== bank.bankId ||
      previous.bankVersion !== bank.bankVersion
    ) {
      throw new Error(
        "Same-as-previous allocation requires an assignment from this exact bank.",
      );
    }
    selectedIndex = variantIndex(bank, previous.variantId);
    candidates = [selectedIndex];
  } else if (request.strategy === "WITHOUT_REPLACEMENT") {
    const used = new Set(
      request.previouslyAssignedVariantIds ?? [],
    );
    for (const variantId of used) variantIndex(bank, variantId);
    candidates = candidates.filter(
      (index) =>
        !used.has(bank.variants[index]!.metadata.variantId),
    );
    if (candidates.length === 0) {
      candidates = bank.variants.map((_, index) => index);
      cycleReset = true;
    }
    selectedIndex = deterministicCandidateIndex({
      bank,
      candidateIndexes: candidates,
      attemptSeed: request.attemptSeed,
    });
  } else {
    const minimum = Math.min(
      ...bank.variants.map(
        (variant) => counts[variant.metadata.variantId] ?? 0,
      ),
    );
    candidates = candidates.filter(
      (index) =>
        (counts[bank.variants[index]!.metadata.variantId] ?? 0) ===
        minimum,
    );
    selectedIndex = deterministicCandidateIndex({
      bank,
      candidateIndexes: candidates,
      attemptSeed: request.attemptSeed,
    });
  }

  const assignment = assignmentForVariant({
    bank,
    variantIndex: selectedIndex,
    attemptSeed: request.attemptSeed,
    assignmentSource: "HOSTED_ASSIGNMENT",
  });
  return {
    assignment,
    audit: {
      schemaVersion: "1",
      allocationRequestId: request.allocationRequestId,
      bankId: bank.bankId,
      bankVersion: bank.bankVersion,
      strategy: request.strategy,
      selectedVariantId: assignment.variantId,
      selectedVariantIndex: selectedIndex,
      attemptSeed: request.attemptSeed,
      candidateVariantIds: candidates.map(
        (index) => bank.variants[index]!.metadata.variantId,
      ),
      priorAssignmentCountsHash: sha256Hex(
        canonicalize(counts),
      ),
      withoutReplacementCycleReset: cycleReset,
    },
  };
}

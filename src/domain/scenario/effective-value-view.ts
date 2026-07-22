/** Shared presentation model for original and effective corrected values. */

import type { DomainState } from "../ledger/domain-state";
import { resolveEffectiveValue } from "../ledger/effective-value";
import type { CorrectionTarget, CorrectionValue } from "../types/correction";

export interface EffectiveValueView {
  readonly target: CorrectionTarget;
  readonly originalTransactionId: string;
  readonly originalValue: CorrectionValue;
  readonly effectiveValue: CorrectionValue;
  readonly correctionTransactionIds: readonly string[];
}

export function buildEffectiveValueView(
  state: DomainState,
  target: CorrectionTarget,
): EffectiveValueView | null {
  const resolution = resolveEffectiveValue(state, target);
  if (resolution === null) return null;
  return {
    target: resolution.target,
    originalTransactionId: resolution.originalTransactionId,
    originalValue: resolution.originalValue,
    effectiveValue: resolution.effectiveValue,
    correctionTransactionIds: resolution.appliedCorrectionTransactionIds,
  };
}

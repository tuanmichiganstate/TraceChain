/** Reusable matching for immutable transaction evidence and resolved scoring evidence. */

import type { RecordCorrectionCommand } from "../commands/commands";
import type { DomainState } from "../ledger/domain-state";
import { resolveEffectiveValue } from "../ledger/effective-value";
import {
  correctionTargetKey,
  correctionValuesEqual,
} from "../types/correction";
import { TransactionStatus, TransactionType } from "../types/enums";
import type { LedgerTransaction } from "../types/models";
import type {
  CommittedTransactionEvidence,
  ScoringEvidence,
} from "../types/scenario";

export function transactionMatchesEvidence(
  transaction: LedgerTransaction,
  evidence: CommittedTransactionEvidence | undefined,
): boolean {
  if (transaction.transactionStatus !== TransactionStatus.COMMITTED) return false;
  if (evidence === undefined) return true;

  if (
    evidence.kind === "CORRECTION_RECORDED" &&
    transaction.transactionType === TransactionType.RECORD_CORRECTION
  ) {
    const command = transaction.commandPayload as RecordCorrectionCommand;
    return (
      correctionTargetKey(command.target) === correctionTargetKey(evidence.target) &&
      correctionValuesEqual(command.correctedValue, evidence.correctedValue)
    );
  }

  return false;
}

export function scoringEvidenceSatisfied(
  state: DomainState,
  evidence: ScoringEvidence,
): boolean {
  switch (evidence.kind) {
    case "EFFECTIVE_VALUE": {
      const resolution = resolveEffectiveValue(state, evidence.target);
      return (
        resolution !== null &&
        correctionValuesEqual(resolution.effectiveValue, evidence.expectedValue)
      );
    }
  }
}

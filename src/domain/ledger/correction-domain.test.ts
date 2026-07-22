import { describe, expect, it } from "vitest";
import { applyCorrectionChain, effectiveValueOf } from "./effective-value";
import {
  correctionValuesEqual,
  correctionTargetKey,
  type CorrectionValue,
} from "../types/correction";
import { QuantityUnit } from "../types/enums";
import { SimulatedLedger } from "./ledger-engine";
import { createEmptyDomainState } from "./domain-state";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import {
  makeCreateBatchCommand,
  makeValidationContext,
  organizations,
  ORG_PRODUCER_COOP,
} from "../../../test/support/domain-fixtures";
import { ValidationRuleId } from "../types/rule-ids";
import type { CommandContext, RecordCorrectionCommand } from "../commands/commands";
import { TransactionType } from "../types/enums";
import type { LedgerConfiguration } from "./ledger-engine";

const config: LedgerConfiguration = {
  maxTransactionsPerBlock: 2,
  blockCommitMode: "IMMEDIATE",
  orderingServiceId: "ORDERER_SIMULATED_001",
};
const producer: CommandContext = { actorId: "ACT_PRODUCER_MANAGER", organizationId: "ORG_PRODUCER_COOP" };
const q = (amount: number): CorrectionValue => ({ kind: "QUANTITY", amount, unit: QuantityUnit.KG });

/**
 * A validation context whose acting organisation is permitted to record
 * corrections. The shared fixtures' producer is not -- authorising it is a
 * one-line override here rather than a change to fixtures other tests rely on.
 */
function correctionContext() {
  const producer = organizations[ORG_PRODUCER_COOP];
  return makeValidationContext({
    organizationsById: {
      ...organizations,
      [ORG_PRODUCER_COOP]: {
        ...(producer as NonNullable<typeof producer>),
        authorizedActions: [
          ...(producer as NonNullable<typeof producer>).authorizedActions,
          TransactionType.RECORD_CORRECTION,
        ],
      },
    },
  });
}

describe("typed correction values", () => {
  it("treats the same number in different units as different values", () => {
    expect(correctionValuesEqual(q(1000), { kind: "QUANTITY", amount: 1000, unit: QuantityUnit.UNIT })).toBe(false);
    expect(correctionValuesEqual(q(100), q(100))).toBe(true);
  });

  it("keys a target so corrections to it can be grouped", () => {
    expect(
      correctionTargetKey({ kind: "ASSET_FIELD", assetId: "BAT_1", field: "quantity" }),
    ).not.toBe(
      correctionTargetKey({ kind: "DOCUMENT_METADATA_FIELD", documentAnchorId: "DOC_1", field: "declaredQuantity" }),
    );
  });
});

describe("the effective-value resolver applies corrections in order", () => {
  it("returns the base value when nothing has corrected it", () => {
    expect(applyCorrectionChain(q(1000), [])).toEqual({ effectiveValue: q(1000), appliedCount: 0 });
  });

  it("returns the value the latest correction left, not the base", () => {
    // 1000 -> 100 -> 98: the effective value is the last link, and every
    // earlier one is still part of the chain.
    const result = applyCorrectionChain(q(1000), [q(100), q(98)]);
    expect(result.effectiveValue).toEqual(q(98));
    expect(result.appliedCount).toBe(2);
  });
});

describe("a correction must match the current effective value", () => {
  function ledgerWithBatch(quantity: number): { ledger: SimulatedLedger; state: ReturnType<typeof createEmptyDomainState> } {
    const ledger = new SimulatedLedger(sha256Hex, config);
    const created = ledger.submitCommand(
      createEmptyDomainState(),
      makeCreateBatchCommand({ quantity }),
      producer,
      makeValidationContext(),
    );
    expect(created.isAccepted).toBe(true);
    return { ledger, state: created.state };
  }

  const correction = (overrides: Partial<RecordCorrectionCommand>): RecordCorrectionCommand => ({
    commandType: TransactionType.RECORD_CORRECTION,
    assetId: "BAT_GREEN_COFFEE_001",
    correctionOfTransactionId: "TX_000001",
    target: { kind: "ASSET_FIELD", assetId: "BAT_GREEN_COFFEE_001", field: "quantity" },
    incorrectValue: q(100),
    correctedValue: q(90),
    reason: "Can lai cho ket qua khac",
    initiatedByActorId: "ACT_PRODUCER_MANAGER",
    scenarioTimestamp: "2026-06-17T03:00:00.000Z",
    ...overrides,
  });

  it("accepts a correction whose incorrect value matches the live asset value", () => {
    const { ledger, state } = ledgerWithBatch(100);
    const result = ledger.submitCommand(state, correction({}), producer, correctionContext());
    expect(result.isAccepted).toBe(true);
    expect(result.state.assetsById["BAT_GREEN_COFFEE_001"]?.quantity).toBe(90);
  });

  it("rejects a correction that misstates the current value", () => {
    const { ledger, state } = ledgerWithBatch(100);
    // Claims the record reads 1000 when it reads 100.
    const result = ledger.submitCommand(
      state,
      correction({ incorrectValue: q(1000) }),
      producer,
      correctionContext(),
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE,
    );
  });

  it("reports the effective value of an asset field as its live quantity", () => {
    const { state } = ledgerWithBatch(100);
    expect(
      effectiveValueOf(state, { kind: "ASSET_FIELD", assetId: "BAT_GREEN_COFFEE_001", field: "quantity" }),
    ).toEqual(q(100));
  });
});

describe("the fieldName-quantity shortcut is closed", () => {
  /**
   * The old reducer keyed on `fieldName === "quantity"` and would move
   * asset.quantity for any correction that used that name -- including a
   * document correction that must not touch the asset. A DOCUMENT_METADATA_FIELD
   * correction now changes no asset state, which is the property stage 5 needs.
   */
  it("leaves asset state untouched for a document-metadata correction", () => {
    const ledger = new SimulatedLedger(sha256Hex, config);
    const created = ledger.submitCommand(
      createEmptyDomainState(),
      makeCreateBatchCommand({ quantity: 100 }),
      producer,
      makeValidationContext(),
    );
    const before = created.state.assetsById["BAT_GREEN_COFFEE_001"];

    // A document-metadata correction whose effective base is another correction
    // (no manifest yet); it commits but must not move the asset.
    const docCorrection: RecordCorrectionCommand = {
      commandType: TransactionType.RECORD_CORRECTION,
      assetId: "BAT_GREEN_COFFEE_001",
      correctionOfTransactionId: created.transaction.transactionId,
      target: { kind: "DOCUMENT_METADATA_FIELD", documentAnchorId: "DOC_MANIFEST_1", field: "declaredQuantity" },
      // With no declared base and no prior correction, effective is null and the
      // rule rejects it -- proving the asset path is not silently taken.
      incorrectValue: { kind: "QUANTITY", amount: 1000, unit: QuantityUnit.KG },
      correctedValue: { kind: "QUANTITY", amount: 100, unit: QuantityUnit.KG },
      reason: "Sua khai bao tren manifest",
      initiatedByActorId: "ACT_PRODUCER_MANAGER",
      scenarioTimestamp: "2026-06-17T03:00:00.000Z",
    };
    const result = ledger.submitCommand(created.state, docCorrection, producer, correctionContext());

    // Rejected for lack of an effective base -- crucially NOT by silently
    // editing asset.quantity, which the old shortcut would have done.
    expect(result.isAccepted).toBe(false);
    expect(result.state.assetsById["BAT_GREEN_COFFEE_001"]?.quantity).toBe(before?.quantity);
    expect(result.state.assetsById["BAT_GREEN_COFFEE_001"]?.quantity).toBe(100);
  });
});

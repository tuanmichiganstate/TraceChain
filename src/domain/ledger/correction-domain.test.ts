import { describe, expect, it } from "vitest";
import type {
  AnchorDocumentCommand,
  CommandContext,
  RecordCorrectionCommand,
} from "../commands/commands";
import type { ValidationRegistries } from "../rules/types";
import {
  correctionTargetKey,
  correctionValuesEqual,
  type CorrectionTarget,
  type CorrectionValue,
} from "../types/correction";
import {
  DocumentType,
  QuantityUnit,
  TransactionStatus,
  TransactionType,
} from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import {
  actors,
  makeCreateBatchCommand,
  organizations,
  ORG_PRODUCER_COOP,
} from "../../../test/support/domain-fixtures";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { verifyIntegrity } from "./integrity";
import { createEmptyDomainState, type DomainState } from "./domain-state";
import {
  applyCorrectionChain,
  effectiveValueOf,
  resolveEffectiveValue,
} from "./effective-value";
import { SimulatedLedger, type LedgerConfiguration } from "./ledger-engine";
import { replayCommandJournal } from "./replay";

const immediate: LedgerConfiguration = {
  maxTransactionsPerBlock: 2,
  blockCommitMode: "IMMEDIATE",
  orderingServiceId: "ORDERER_SIMULATED_001",
};
const producer: CommandContext = {
  actorId: "ACT_PRODUCER_MANAGER",
  organizationId: ORG_PRODUCER_COOP,
};
const registries: ValidationRegistries = {
  organizationsById: {
    ...organizations,
    [ORG_PRODUCER_COOP]: {
      ...organizations[ORG_PRODUCER_COOP]!,
      authorizedActions: [
        ...organizations[ORG_PRODUCER_COOP]!.authorizedActions,
        TransactionType.ANCHOR_DOCUMENT,
        TransactionType.RECORD_CORRECTION,
      ],
    },
  },
  actorsById: actors,
};

const q = (
  amount: number,
  unit = QuantityUnit.KG,
): Extract<CorrectionValue, { kind: "QUANTITY" }> => ({
  kind: "QUANTITY",
  amount,
  unit,
});
const assetTarget: CorrectionTarget = {
  kind: "ASSET_FIELD",
  assetId: "BAT_GREEN_COFFEE_001",
  field: "quantity",
};
const documentTarget: CorrectionTarget = {
  kind: "DOCUMENT_METADATA_FIELD",
  documentAnchorId: "DOC_MANIFEST_TEST_001",
  field: "declaredQuantity",
};

function manifestCommand(amount = 1000): AnchorDocumentCommand {
  return {
    commandType: TransactionType.ANCHOR_DOCUMENT,
    assetId: "BAT_GREEN_COFFEE_001",
    documentAnchorId: "DOC_MANIFEST_TEST_001",
    documentType: DocumentType.SHIPPING_MANIFEST,
    fileName: "shipping-manifest-test.pdf",
    contentHash: sha256Hex("shipping manifest test content"),
    metadata: {
      kind: DocumentType.SHIPPING_MANIFEST,
      declaredQuantity: q(amount),
    },
    issuerOrganizationId: ORG_PRODUCER_COOP,
    issuedAt: "2026-06-15T10:00:00.000Z",
    initiatedByActorId: producer.actorId,
    scenarioTimestamp: "2026-06-15T10:00:00.000Z",
  };
}

function correctionCommand(
  incorrectValue: CorrectionValue,
  correctedValue: CorrectionValue,
  overrides: Partial<RecordCorrectionCommand> = {},
): RecordCorrectionCommand {
  return {
    commandType: TransactionType.RECORD_CORRECTION,
    assetId: "BAT_GREEN_COFFEE_001",
    correctionOfTransactionId: "TX_000002",
    target: documentTarget,
    incorrectValue,
    correctedValue,
    reason: "Physical reweigh confirmed the declared quantity",
    initiatedByActorId: producer.actorId,
    scenarioTimestamp: "2026-06-17T03:00:00.000Z",
    ...overrides,
  };
}

function submitAccepted(
  ledger: SimulatedLedger,
  state: DomainState,
  command: Parameters<SimulatedLedger["submitCommand"]>[1],
): DomainState {
  const result = ledger.submitCommand(state, command, producer, registries);
  expect(result.validation.failures).toEqual([]);
  expect(result.isAccepted).toBe(true);
  return result.state;
}

function manifestState(): { ledger: SimulatedLedger; state: DomainState } {
  const ledger = new SimulatedLedger(sha256Hex, immediate);
  let state = submitAccepted(ledger, createEmptyDomainState(), makeCreateBatchCommand());
  state = submitAccepted(ledger, state, manifestCommand());
  return { ledger, state };
}

describe("typed correction values and targets", () => {
  it("includes quantity units in equality", () => {
    expect(correctionValuesEqual(q(1000), q(1000, QuantityUnit.UNIT))).toBe(false);
    expect(correctionValuesEqual(q(100), q(100))).toBe(true);
  });

  it("keeps asset fields and document metadata structurally distinct", () => {
    expect(correctionTargetKey(assetTarget)).not.toBe(correctionTargetKey(documentTarget));
    expect(documentTarget).not.toHaveProperty("assetId");
  });

  it("folds successive values in the exact order supplied", () => {
    expect(applyCorrectionChain(q(1000), [q(100), q(105)])).toEqual({
      effectiveValue: q(105),
      appliedCount: 2,
    });
  });
});

describe("generic correction validation", () => {
  it("requires a committed reference", () => {
    const staged: LedgerConfiguration = {
      ...immediate,
      blockCommitMode: "STAGE_BOUNDARY",
      maxTransactionsPerBlock: 10,
    };
    const ledger = new SimulatedLedger(sha256Hex, staged);
    const created = ledger.submitCommand(
      createEmptyDomainState(),
      makeCreateBatchCommand(),
      producer,
      registries,
    );
    expect(created.transaction.transactionStatus).toBe(TransactionStatus.ORDERED);

    const result = ledger.submitCommand(
      created.state,
      correctionCommand(q(100), q(90), {
        correctionOfTransactionId: created.transaction.transactionId,
        target: assetTarget,
      }),
      producer,
      registries,
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((failure) => failure.ruleId)).toContain(
      ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
    );
  });

  it("requires the target to belong to the referenced transaction", () => {
    const { ledger, state } = manifestState();
    const result = ledger.submitCommand(
      state,
      correctionCommand(q(1000), q(100), { correctionOfTransactionId: "TX_000001" }),
      producer,
      registries,
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((failure) => failure.ruleId)).toContain(
      ValidationRuleId.CORRECTION_TARGET_VALID,
    );
  });

  it("rejects a corrected quantity whose unit differs from the target", () => {
    const { ledger, state } = manifestState();
    const result = ledger.submitCommand(
      state,
      correctionCommand(q(1000), q(100_000, QuantityUnit.GRAM)),
      producer,
      registries,
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((failure) => failure.ruleId)).toContain(
      ValidationRuleId.CORRECTION_VALUE_VALID,
    );
  });

  it("rejects non-positive and non-finite corrected quantities", () => {
    for (const amount of [0, -1, Number.NaN]) {
      const { ledger, state } = manifestState();
      const result = ledger.submitCommand(
        state,
        correctionCommand(q(1000), q(amount)),
        producer,
        registries,
      );
      expect(result.isAccepted).toBe(false);
      expect(result.validation.failures.map((failure) => failure.ruleId)).toContain(
        ValidationRuleId.CORRECTION_VALUE_VALID,
      );
    }
  });

  it("requires a later correction to state the immediately preceding value", () => {
    const { ledger, state: original } = manifestState();
    const afterFirst = submitAccepted(ledger, original, correctionCommand(q(1000), q(100)));

    const stale = ledger.submitCommand(
      afterFirst,
      correctionCommand(q(1000), q(105), { scenarioTimestamp: "2026-06-17T04:00:00.000Z" }),
      producer,
      registries,
    );
    expect(stale.isAccepted).toBe(false);
    expect(stale.validation.failures.map((failure) => failure.ruleId)).toContain(
      ValidationRuleId.CORRECTION_INCORRECT_VALUE_MATCHES_EFFECTIVE,
    );

    const valid = ledger.submitCommand(
      stale.state,
      correctionCommand(q(100), q(105), { scenarioTimestamp: "2026-06-17T05:00:00.000Z" }),
      producer,
      registries,
    );
    expect(valid.isAccepted).toBe(true);
    expect(resolveEffectiveValue(valid.state, documentTarget)).toMatchObject({
      originalValue: q(1000),
      effectiveValue: q(105),
      appliedCorrectionTransactionIds: ["TX_000003", "TX_000005"],
    });

    // Each correction carries the value it established, not the final one.
    // Anything rendering the chain needs the intermediate 100: reporting only
    // the identifiers invites showing 105 against both steps, which is right by
    // accident for one correction and wrong for two.
    expect(resolveEffectiveValue(valid.state, documentTarget)?.appliedCorrections).toEqual([
      { transactionId: "TX_000003", value: q(100) },
      { transactionId: "TX_000005", value: q(105) },
    ]);
  });

  it("ignores rejected corrections when resolving the effective value", () => {
    const { ledger, state } = manifestState();
    const rejected = ledger.submitCommand(
      state,
      correctionCommand(q(999), q(100)),
      producer,
      registries,
    );
    expect(rejected.transaction.transactionStatus).toBe(TransactionStatus.REJECTED);
    expect(effectiveValueOf(rejected.state, documentTarget)).toEqual(q(1000));
  });
});

describe("append-only correction semantics", () => {
  it("does not let a document correction mutate asset quantity", () => {
    const { ledger, state } = manifestState();
    const beforeAsset = state.assetsById["BAT_GREEN_COFFEE_001"];
    const corrected = submitAccepted(ledger, state, correctionCommand(q(1000), q(100)));

    expect(corrected.assetsById["BAT_GREEN_COFFEE_001"]?.quantity).toBe(100);
    expect(corrected.assetsById["BAT_GREEN_COFFEE_001"]).toEqual(beforeAsset);
    expect(correctionCommand(q(1000), q(100))).not.toHaveProperty("fieldName");
  });

  it("allows an asset quantity correction only against its creating transaction", () => {
    const ledger = new SimulatedLedger(sha256Hex, immediate);
    const created = submitAccepted(ledger, createEmptyDomainState(), makeCreateBatchCommand());
    const corrected = submitAccepted(
      ledger,
      created,
      correctionCommand(q(100), q(90), {
        correctionOfTransactionId: "TX_000001",
        target: assetTarget,
      }),
    );
    expect(corrected.assetsById["BAT_GREEN_COFFEE_001"]?.quantity).toBe(90);
    expect(effectiveValueOf(corrected, assetTarget)).toEqual(q(90));
  });

  it("preserves the original transaction byte-for-byte", () => {
    const { ledger, state } = manifestState();
    const originalBefore = structuredClone(state.transactionsById["TX_000002"]);
    const corrected = submitAccepted(ledger, state, correctionCommand(q(1000), q(100)));

    expect(corrected.transactionsById["TX_000002"]).toEqual(originalBefore);
    expect(corrected.transactionOrder).toEqual(["TX_000001", "TX_000002", "TX_000003"]);
  });
});

describe("hashing, integrity, and replay", () => {
  it("makes correctedValue part of the canonical transaction hash", () => {
    const first = manifestState();
    const firstResult = first.ledger.submitCommand(
      first.state,
      correctionCommand(q(1000), q(100)),
      producer,
      registries,
    );
    const second = manifestState();
    const secondResult = second.ledger.submitCommand(
      second.state,
      correctionCommand(q(1000), q(101)),
      producer,
      registries,
    );
    expect(firstResult.transaction.transactionHash).not.toBe(secondResult.transaction.transactionHash);
  });

  it("detects tampering with the original declared quantity", () => {
    const { state } = manifestState();
    const tampered = structuredClone(state);
    const command = tampered.transactionsById["TX_000002"]!
      .commandPayload as AnchorDocumentCommand;
    (command.metadata as { declaredQuantity: { amount: number } }).declaredQuantity.amount = 999;

    const result = verifyIntegrity(tampered, sha256Hex);
    expect(result.isValid).toBe(false);
    expect(result.invalidTransactionIds).toContain("TX_000002");
  });

  it("detects tampering with a correction's corrected value", () => {
    const { ledger, state } = manifestState();
    const corrected = submitAccepted(ledger, state, correctionCommand(q(1000), q(100)));
    const tampered = structuredClone(corrected);
    const command = tampered.transactionsById["TX_000003"]!
      .commandPayload as RecordCorrectionCommand;
    (command.correctedValue as { amount: number }).amount = 99;

    const result = verifyIntegrity(tampered, sha256Hex);
    expect(result.isValid).toBe(false);
    expect(result.invalidTransactionIds).toContain("TX_000003");
  });

  it("replays to the same hashes and effective value as live execution", () => {
    const create = makeCreateBatchCommand();
    const manifest = manifestCommand();
    const first = correctionCommand(q(1000), q(100));
    const second = correctionCommand(q(100), q(105), {
      scenarioTimestamp: "2026-06-17T04:00:00.000Z",
    });

    const ledger = new SimulatedLedger(sha256Hex, immediate);
    let live = submitAccepted(ledger, createEmptyDomainState(), create);
    live = submitAccepted(ledger, live, manifest);
    live = submitAccepted(ledger, live, first);
    live = submitAccepted(ledger, live, second);

    const replayed = replayCommandJournal({
      entries: [create, manifest, first, second].map((command) => ({ command, context: producer })),
      registries,
      hash: sha256Hex,
      configuration: immediate,
    });

    expect(resolveEffectiveValue(replayed, documentTarget)).toEqual(
      resolveEffectiveValue(live, documentTarget),
    );
    expect(replayed.blockOrder.map((id) => replayed.blocksById[id]?.blockHash)).toEqual(
      live.blockOrder.map((id) => live.blocksById[id]?.blockHash),
    );
  });
});

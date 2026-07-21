import { describe, expect, it } from "vitest";
import {
  ACT_LOGISTICS_COORDINATOR,
  ORG_LOGISTICS_PROVIDER,
  ORG_PRODUCER_COOP,
  createEmptyDomainState,
  makeCreateBatchCommand,
  makeValidationContext,
} from "../../../test/support/domain-fixtures";
import {
  AssetLifecycleStatus,
  ComplianceStatus,
  QuantityUnit,
  TransactionStatus,
} from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import type { CommandContext } from "../commands/commands";
import type { LedgerTransaction } from "../types/models";
import {
  chainFingerprint,
  cloneForTamperDemonstration,
  demonstrateTamper,
  verifyIntegrity,
} from "./integrity";
import { SimulatedLedger, type LedgerConfiguration } from "./ledger-engine";

const immediateConfiguration: LedgerConfiguration = {
  maxTransactionsPerBlock: 2,
  blockCommitMode: "IMMEDIATE",
  orderingServiceId: "ORDERER_SIMULATED_001",
};

const stageBoundaryConfiguration: LedgerConfiguration = {
  maxTransactionsPerBlock: 2,
  blockCommitMode: "STAGE_BOUNDARY",
  orderingServiceId: "ORDERER_SIMULATED_001",
};

const producerContext: CommandContext = {
  actorId: "ACT_PRODUCER_MANAGER",
  organizationId: ORG_PRODUCER_COOP,
};

function makeLedger(configuration = immediateConfiguration): SimulatedLedger {
  return new SimulatedLedger(sha256Hex, configuration);
}

describe("SimulatedLedger", () => {
  describe("valid batch creation", () => {
    it("creates the asset with the expected world state", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );

      expect(result.isAccepted).toBe(true);
      const asset = result.state.assetsById["BAT_GREEN_COFFEE_001"];
      expect(asset).toMatchObject({
        assetId: "BAT_GREEN_COFFEE_001",
        productName: "Arabica green coffee",
        originLocation: "Lam Dong",
        quantity: 100,
        quantityUnit: QuantityUnit.KG,
        currentOwnerId: ORG_PRODUCER_COOP,
        currentCustodianId: ORG_PRODUCER_COOP,
        lifecycleStatus: AssetLifecycleStatus.CREATED,
        complianceStatus: ComplianceStatus.PENDING_CERTIFICATION,
        stateVersion: 1,
      });
    });

    it("drives the transaction to COMMITTED and seals the first block", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );

      expect(result.transaction.transactionId).toBe("TX_000001");
      expect(result.transaction.transactionStatus).toBe(TransactionStatus.COMMITTED);
      expect(result.transaction.blockId).toBe("BLK_000001");
      expect(result.state.blockOrder).toEqual(["BLK_000001"]);
    });

    it("records the full lifecycle timeline", () => {
      const { transaction } = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );

      // DRAFT -> SIGNED -> SUBMITTED -> VALIDATED -> ENDORSED -> ORDERED -> COMMITTED
      expect(transaction.submittedAt).toBeDefined();
      expect(transaction.validatedAt).toBeDefined();
      expect(transaction.endorsedAt).toBeDefined();
      expect(transaction.orderedAt).toBeDefined();
      expect(transaction.committedAt).toBeDefined();
      expect(transaction.simulatedSignature.signatureType).toBe("EDUCATIONAL_SIMULATION");
      expect(transaction.endorsementResults).toHaveLength(1);
    });

    it("gives the genesis block a null previous hash", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );
      const block = result.state.blocksById["BLK_000001"];
      expect(block?.previousBlockHash).toBeNull();
      expect(block?.blockNumber).toBe(1);
      expect(block?.blockHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("uses deterministic identifiers rather than random ones", () => {
      const first = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );
      const second = makeLedger().submitCommand(
        first.state,
        makeCreateBatchCommand({ assetId: "BAT_GREEN_COFFEE_002" }),
        producerContext,
        makeValidationContext(),
      );
      expect(second.transaction.transactionId).toBe("TX_000002");
      expect(second.state.blockOrder).toEqual(["BLK_000001", "BLK_000002"]);
    });

    it("links each block to its predecessor's digest", () => {
      const first = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );
      const second = makeLedger().submitCommand(
        first.state,
        makeCreateBatchCommand({ assetId: "BAT_GREEN_COFFEE_002" }),
        producerContext,
        makeValidationContext(),
      );

      const blockOne = second.state.blocksById["BLK_000001"];
      const blockTwo = second.state.blocksById["BLK_000002"];
      expect(blockTwo?.previousBlockHash).toBe(blockOne?.blockHash);
    });
  });

  describe("rejected transactions", () => {
    it("rejects a duplicate batch identifier", () => {
      const ledger = makeLedger();
      const first = ledger.submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );
      const duplicate = ledger.submitCommand(
        first.state,
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );

      expect(duplicate.isAccepted).toBe(false);
      expect(duplicate.transaction.transactionStatus).toBe(TransactionStatus.REJECTED);
      expect(duplicate.validation.failures.map((f) => f.ruleId)).toContain(
        ValidationRuleId.ASSET_ID_UNIQUE,
      );
    });

    it("rejects an organization not authorized to create batches", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({ producerOrganizationId: ORG_LOGISTICS_PROVIDER }),
        { actorId: ACT_LOGISTICS_COORDINATOR, organizationId: ORG_LOGISTICS_PROVIDER },
        makeValidationContext({
          actorId: ACT_LOGISTICS_COORDINATOR,
          organizationId: ORG_LOGISTICS_PROVIDER,
        }),
      );

      expect(result.isAccepted).toBe(false);
      expect(result.validation.failures.map((f) => f.ruleId)).toContain(
        ValidationRuleId.ACTOR_AUTHORIZED,
      );
    });

    it("rejects zero quantity", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({ quantity: 0 }),
        producerContext,
        makeValidationContext(),
      );
      expect(result.isAccepted).toBe(false);
      expect(result.validation.failures.map((f) => f.ruleId)).toContain(
        ValidationRuleId.VALID_QUANTITY,
      );
    });

    it("rejects negative quantity", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({ quantity: -5 }),
        producerContext,
        makeValidationContext(),
      );
      expect(result.isAccepted).toBe(false);
    });

    it("rejects a UNIT quantity with no declared package size", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({ quantityUnit: QuantityUnit.UNIT, packageSizeGrams: null }),
        producerContext,
        makeValidationContext(),
      );
      expect(result.validation.failures.map((f) => f.ruleId)).toContain(
        ValidationRuleId.UNIT_COMPATIBLE,
      );
    });

    /** Specification section 31.1: rejected transactions must not corrupt state. */
    it("leaves world state untouched when a transaction is rejected", () => {
      const before = createEmptyDomainState();
      const result = makeLedger().submitCommand(
        before,
        makeCreateBatchCommand({ quantity: -1 }),
        producerContext,
        makeValidationContext(),
      );

      expect(result.state.assetsById).toEqual({});
      expect(result.state.blockOrder).toEqual([]);
      expect(result.state.pendingTransactionIds).toEqual([]);
    });

    it("still records the rejected transaction so the learner can see why", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({ quantity: -1 }),
        producerContext,
        makeValidationContext(),
      );
      expect(result.state.transactionsById["TX_000001"]).toBeDefined();
      expect(result.state.transactionOrder).toEqual(["TX_000001"]);
    });

    /** Specification section 13.4: every failing rule must be visible at once. */
    it("reports every failing rule rather than stopping at the first", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({
          quantity: -5,
          quantityUnit: QuantityUnit.UNIT,
          packageSizeGrams: null,
          producerOrganizationId: ORG_LOGISTICS_PROVIDER,
        }),
        producerContext,
        makeValidationContext(),
      );

      const failedRules = result.validation.failures.map((f) => f.ruleId);
      expect(failedRules).toContain(ValidationRuleId.VALID_QUANTITY);
      expect(failedRules).toContain(ValidationRuleId.UNIT_COMPATIBLE);
      expect(failedRules).toContain(ValidationRuleId.ACTOR_AUTHORIZED);
      expect(failedRules.length).toBeGreaterThanOrEqual(3);
    });

    it("gives every failure a localization key, never a bare message", () => {
      const result = makeLedger().submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand({ quantity: 0 }),
        producerContext,
        makeValidationContext(),
      );
      for (const failure of result.validation.failures) {
        expect(failure.messageKey).toMatch(/^validation\./);
      }
    });
  });

  describe("ordering versus commitment", () => {
    it("holds transactions in the pending queue until a stage boundary", () => {
      const ledger = makeLedger(stageBoundaryConfiguration);
      const result = ledger.submitCommand(
        createEmptyDomainState(),
        makeCreateBatchCommand(),
        producerContext,
        makeValidationContext(),
      );

      expect(result.transaction.transactionStatus).toBe(TransactionStatus.ORDERED);
      expect(result.state.pendingTransactionIds).toEqual(["TX_000001"]);
      expect(result.state.blockOrder).toEqual([]);
      // The outcome is already determined, so world state reflects it.
      expect(result.state.assetsById["BAT_GREEN_COFFEE_001"]).toBeDefined();
    });

    it("drains the queue into blocks of at most maxTransactionsPerBlock", () => {
      const ledger = makeLedger(stageBoundaryConfiguration);
      let state = createEmptyDomainState();

      // Three transactions in one stage, with a block size of two.
      for (const assetId of ["BAT_A", "BAT_B", "BAT_C"]) {
        state = ledger.submitCommand(
          state,
          makeCreateBatchCommand({ assetId }),
          producerContext,
          makeValidationContext(),
        ).state;
      }

      const sealed = ledger.sealPendingTransactions(state, "2025-12-10T03:00:00.000Z");

      expect(sealed.pendingTransactionIds).toEqual([]);
      expect(sealed.blocksById["BLK_000001"]?.transactionIds).toHaveLength(2);
      expect(sealed.blocksById["BLK_000002"]?.transactionIds).toHaveLength(1);
      for (const transactionId of ["TX_000001", "TX_000002", "TX_000003"]) {
        expect(sealed.transactionsById[transactionId]?.transactionStatus).toBe(
          TransactionStatus.COMMITTED,
        );
      }
    });

    it("seals automatically once a block fills, even before the stage ends", () => {
      const ledger = makeLedger(stageBoundaryConfiguration);
      let state = createEmptyDomainState();
      state = ledger.submitCommand(
        state,
        makeCreateBatchCommand({ assetId: "BAT_A" }),
        producerContext,
        makeValidationContext(),
      ).state;
      state = ledger.submitCommand(
        state,
        makeCreateBatchCommand({ assetId: "BAT_B" }),
        producerContext,
        makeValidationContext(),
      ).state;

      expect(state.blockOrder).toEqual(["BLK_000001"]);
      expect(state.pendingTransactionIds).toEqual([]);
    });
  });

  describe("determinism", () => {
    it("produces identical hashes for identical inputs", () => {
      const runOnce = (): string => {
        const result = makeLedger().submitCommand(
          createEmptyDomainState(),
          makeCreateBatchCommand(),
          producerContext,
          makeValidationContext(),
        );
        return result.state.blocksById["BLK_000001"]?.blockHash ?? "";
      };
      expect(runOnce()).toBe(runOnce());
      expect(runOnce()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces a different hash when any input changes", () => {
      const hashFor = (quantity: number): string =>
        makeLedger().submitCommand(
          createEmptyDomainState(),
          makeCreateBatchCommand({ quantity }),
          producerContext,
          makeValidationContext(),
        ).transaction.transactionHash ?? "";

      expect(hashFor(100)).not.toBe(hashFor(101));
    });
  });
});

describe("integrity verification", () => {
  function buildChain() {
    const ledger = makeLedger();
    let state = createEmptyDomainState();
    for (const assetId of ["BAT_A", "BAT_B", "BAT_C"]) {
      state = ledger.submitCommand(
        state,
        makeCreateBatchCommand({ assetId }),
        producerContext,
        makeValidationContext(),
      ).state;
    }
    return state;
  }

  it("verifies an untampered chain", () => {
    const result = verifyIntegrity(buildChain(), sha256Hex);
    expect(result.isValid).toBe(true);
    expect(result.verifiedBlockCount).toBe(3);
    expect(result.invalidBlockIds).toEqual([]);
    expect(result.firstInvalidBlockId).toBeNull();
  });

  it("verifies an empty chain", () => {
    expect(verifyIntegrity(createEmptyDomainState(), sha256Hex).isValid).toBe(true);
  });

  /**
   * The stage 8 demonstration: alter a historical quantity and watch the chain
   * refuse to agree with itself.
   */
  it("detects an altered historical transaction", () => {
    const state = cloneForTamperDemonstration(buildChain());
    const transaction = state.transactionsById["TX_000001"] as LedgerTransaction;
    const payload = transaction.commandPayload as { quantity: number };
    payload.quantity = 999;

    const result = verifyIntegrity(state, sha256Hex);

    expect(result.isValid).toBe(false);
    expect(result.invalidTransactionIds).toContain("TX_000001");
    expect(result.firstInvalidBlockId).toBe("BLK_000001");
    expect(result.findings.join(" ")).toMatch(/altered since it was committed/);
  });

  it("flags a forged block digest and the successor link it breaks", () => {
    const state = cloneForTamperDemonstration(buildChain());
    const block = state.blocksById["BLK_000001"];
    if (block !== undefined) {
      (block as { blockHash: string }).blockHash = "0".repeat(64);
    }

    const result = verifyIntegrity(state, sha256Hex);

    expect(result.isValid).toBe(false);
    // Block 1's digest no longer matches, and block 2 no longer links to it.
    expect(result.invalidBlockIds).toContain("BLK_000001");
    expect(result.invalidBlockIds).toContain("BLK_000002");
    expect(result.findings.join(" ")).toMatch(/does not link to the previous block/);
  });

  it("detects a transaction claimed by two blocks", () => {
    const state = cloneForTamperDemonstration(buildChain());
    const block = state.blocksById["BLK_000002"];
    if (block !== undefined) {
      (block as unknown as { transactionIds: string[] }).transactionIds = ["TX_000001"];
    }
    const result = verifyIntegrity(state, sha256Hex);
    expect(result.isValid).toBe(false);
    expect(result.findings.join(" ")).toMatch(/more than one block/);
  });

  /**
   * Stage 8 needs this as one operation: the tests above tamper by hand, but a
   * learner presses a button, and the interface must not be the thing that
   * decides what "tampering" means.
   */
  it("packages a tamper demonstration, leaving the real ledger untouched", () => {
    const real = buildChain();
    const fingerprintBefore = chainFingerprint(real, sha256Hex);
    const original = (real.transactionsById["TX_000001"] as LedgerTransaction)
      .commandPayload as { quantity: number };
    const originalQuantity = original.quantity;

    const demonstration = demonstrateTamper(real, sha256Hex, {
      transactionId: "TX_000001",
      quantity: 999,
    });

    expect(demonstration.before.isValid).toBe(true);
    expect(demonstration.originalQuantity).toBe(originalQuantity);
    expect(demonstration.tamperedQuantity).toBe(999);

    // Step one: the edited record fails its own digest, but the chain still
    // links -- a block commits to transaction digests, not their contents.
    expect(demonstration.afterEdit.isValid).toBe(false);
    expect(demonstration.afterEdit.invalidTransactionIds).toContain("TX_000001");
    expect(demonstration.afterEdit.invalidBlockIds).not.toContain("BLK_000002");

    // Step two: forging that digest clears the record but breaks its block,
    // because a block commits to the digests of the transactions in it.
    expect(demonstration.afterForgingTransaction.isValid).toBe(false);
    expect(demonstration.afterForgingTransaction.invalidTransactionIds).not.toContain("TX_000001");
    expect(demonstration.afterForgingTransaction.invalidBlockIds).toContain("BLK_000001");
    expect(demonstration.editedBlockId).toBe("BLK_000001");

    // Step three: forging the block digest is what finally breaks the links,
    // because the next block recorded the digest this one used to have.
    expect(demonstration.afterForgingBlock.isValid).toBe(false);
    expect(demonstration.afterForgingBlock.invalidBlockIds).toContain("BLK_000002");
    expect(demonstration.cascadingBlockIds).toContain("BLK_000002");

    // The learner carries on with an intact attempt.
    expect(verifyIntegrity(real, sha256Hex).isValid).toBe(true);
    expect(chainFingerprint(real, sha256Hex)).toBe(fingerprintBefore);
    expect(
      (real.transactionsById["TX_000001"] as LedgerTransaction).commandPayload,
    ).toHaveProperty("quantity", originalQuantity);
  });

  /**
   * WHY BLOCKS LINK BY THEIR STORED DIGEST RATHER THAN A RECOMPUTED ONE.
   *
   * Each block is checked twice and independently: its recorded digest must
   * match a recomputation of its contents, and the next block's recorded link
   * must match its digest. Those two together leave nothing uncovered, which is
   * what makes the choice of linking value a question of how *many* blocks get
   * flagged rather than whether tampering is caught at all.
   *
   * The two tests below are the cases that decide it. Linking against the
   * recomputed digest would flag strictly fewer blocks in the second one and
   * nothing extra in the first, so the stored digest stays.
   */
  it("catches a block whose contents and digest were both forged", () => {
    // The forger repairs the block so it verifies against itself. All that is
    // left to catch them is the successor's recorded link.
    const real = buildChain();
    const demonstration = demonstrateTamper(real, sha256Hex, {
      transactionId: "TX_000001",
      quantity: 999,
    });

    expect(demonstration.afterForgingBlock.invalidBlockIds).not.toContain("BLK_000001");
    expect(demonstration.afterForgingBlock.invalidBlockIds).toContain("BLK_000002");
    expect(demonstration.afterForgingBlock.isValid).toBe(false);
  });

  it("catches a forged block digest, and the link it breaks, in one pass", () => {
    // Contents untouched, digest replaced. The block fails its own check, and
    // its successor fails the link -- two findings from one edit. Linking
    // against the recomputed digest would report only the first.
    const state = cloneForTamperDemonstration(buildChain());
    (state.blocksById["BLK_000001"] as { blockHash: string }).blockHash = "0".repeat(64);

    const result = verifyIntegrity(state, sha256Hex);

    expect(result.invalidBlockIds).toContain("BLK_000001");
    expect(result.invalidBlockIds).toContain("BLK_000002");
  });

  /**
   * A learner must be able to break the chain in the demonstration and then
   * carry on with an intact attempt.
   */
  it("leaves the real ledger byte-identical after a tamper demonstration", () => {
    const real = buildChain();
    const fingerprintBefore = chainFingerprint(real, sha256Hex);

    const clone = cloneForTamperDemonstration(real);
    const cloned = clone.transactionsById["TX_000001"] as LedgerTransaction;
    (cloned.commandPayload as { quantity: number }).quantity = 999;
    (clone.blocksById["BLK_000002"] as { blockHash: string }).blockHash = "deadbeef";

    expect(verifyIntegrity(clone, sha256Hex).isValid).toBe(false);
    expect(verifyIntegrity(real, sha256Hex).isValid).toBe(true);
    expect(chainFingerprint(real, sha256Hex)).toBe(fingerprintBefore);
  });
});

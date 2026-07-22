import { describe, expect, it } from "vitest";
import {
  ActorId,
  GREEN_COFFEE_BATCH_ID,
  OrganizationId,
  PACKAGED_COFFEE_LOT_ID,
  ROASTED_COFFEE_BATCH_ID,
  SCENARIO_TIMELINE,
  commands,
  contextFor,
  createDriver,
  runUpTo,
} from "../../../test/support/scenario-driver";
import {
  AssetLifecycleStatus,
  ComplianceStatus,
  QuantityUnit,
  SaleEligibility,
  TransactionStatus,
} from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import { assessRecallSelection } from "../provenance/recall-scope";
import {
  DISTRACTOR_PACKAGED_LOT_ID,
  UNRELATED_PACKAGED_LOT_ID,
} from "../../scenarios/coffee-traceability/seed-assets";

/**
 * THE MILESTONE 2 EXIT CONDITION.
 *
 * A scripted sequence creates, certifies, transfers, transports, receives,
 * corrects, transforms, packages, distributes and recalls an asset with no
 * interface involved at all. If this passes, the domain is complete
 * independently of any screen.
 */
describe("the full scenario, headless", () => {
  it("carries a batch from harvest to recall", async () => {
    const ledger = await runUpTo("sold", { withSeed: true });

    // Ownership and custody both reached the retailer.
    const packaged = await ledger.getAsset(PACKAGED_COFFEE_LOT_ID);
    expect(packaged).toMatchObject({
      currentOwnerId: OrganizationId.RETAILER,
      currentCustodianId: OrganizationId.RETAILER,
      lifecycleStatus: AssetLifecycleStatus.AVAILABLE_FOR_SALE,
      saleEligibility: SaleEligibility.ELIGIBLE,
      quantity: 820,
      quantityUnit: QuantityUnit.UNIT,
      packageSizeGrams: 100,
    });

    // The inputs were consumed, not duplicated.
    expect((await ledger.getAsset(GREEN_COFFEE_BATCH_ID))?.lifecycleStatus).toBe(
      AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    );
    expect((await ledger.getAsset(ROASTED_COFFEE_BATCH_ID))?.lifecycleStatus).toBe(
      AssetLifecycleStatus.CONSUMED_IN_TRANSFORMATION,
    );

    // Mass was conserved end to end: 100 kg green -> 82 kg roasted -> 82 000 g.
    expect(820 * 100).toBe(82_000);

    const recall = await ledger.submitCommand(
      commands.recallBatch(),
      contextFor(ActorId.REGULATORY_AUDITOR),
    );
    expect(recall.isAccepted).toBe(true);

    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.laboratoryResult);

    // The whole affected lineage is frozen.
    for (const assetId of [
      GREEN_COFFEE_BATCH_ID,
      ROASTED_COFFEE_BATCH_ID,
      PACKAGED_COFFEE_LOT_ID,
    ]) {
      const asset = await ledger.getAsset(assetId);
      expect(asset?.complianceStatus, assetId).toBe(ComplianceStatus.RECALLED);
      expect(asset?.saleEligibility, assetId).toBe(SaleEligibility.PROHIBITED);
    }

    // And the lookalike lot on the same shelf is untouched.
    const distractor = await ledger.getAsset(DISTRACTOR_PACKAGED_LOT_ID);
    expect(distractor?.saleEligibility).toBe(SaleEligibility.ELIGIBLE);

    expect((await ledger.verifyIntegrity()).isValid).toBe(true);
  });

  it("keeps the chain intact through every block", async () => {
    const ledger = await runUpTo("sold");
    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.batchDispatched);

    const blocks = await ledger.getBlocks();
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[0]?.previousBlockHash).toBeNull();

    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i]?.previousBlockHash).toBe(blocks[i - 1]?.blockHash);
      expect(blocks[i]?.blockNumber).toBe((blocks[i - 1]?.blockNumber ?? 0) + 1);
    }

    expect((await ledger.verifyIntegrity()).isValid).toBe(true);
  });

  it("produces identical hashes on a second identical run", async () => {
    // Determinism is what makes attempt replay possible at all.
    const fingerprint = async (): Promise<string> => {
      const ledger = await runUpTo("sold");
      await ledger.sealPendingTransactions(SCENARIO_TIMELINE.batchDispatched);
      return (await ledger.getBlocks()).map((block) => block.blockHash).join("|");
    };
    expect(await fingerprint()).toBe(await fingerprint());
  });
});

describe("ownership and custody move independently", () => {
  it("moves custody to the carrier while ownership stays with the co-operative", async () => {
    const ledger = await runUpTo("inTransit");
    const asset = await ledger.getAsset(GREEN_COFFEE_BATCH_ID);

    expect(asset?.currentCustodianId).toBe(OrganizationId.LOGISTICS_PROVIDER);
    expect(asset?.currentOwnerId).toBe(OrganizationId.PRODUCER_COOP);
    expect(asset?.lifecycleStatus).toBe(AssetLifecycleStatus.IN_TRANSIT);
  });

  /**
   * The rule the specification required but never defined. This is the single
   * most important assertion in the domain suite.
   */
  it("rejects a custody transfer that also moves ownership", async () => {
    const ledger = await runUpTo("certified");
    const result = await ledger.submitCommand(
      commands.transferCustody({ alsoTransfersOwnership: true }),
      contextFor(ActorId.PRODUCER_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.OWNERSHIP_UNCHANGED_ON_CUSTODY_TRANSFER,
    );
    // Ownership is untouched by the rejected attempt.
    expect((await ledger.getAsset(GREEN_COFFEE_BATCH_ID))?.currentOwnerId).toBe(
      OrganizationId.PRODUCER_COOP,
    );
  });

  it("moves ownership to the distributor while the goods stay at the plant", async () => {
    const ledger = await runUpTo("packaged");
    await ledger.submitCommand(
      commands.transferOwnership(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    const asset = await ledger.getAsset(PACKAGED_COFFEE_LOT_ID);
    // The exact mirror of the custody transfer four stages earlier.
    expect(asset?.currentOwnerId).toBe(OrganizationId.DISTRIBUTOR);
    expect(asset?.currentCustodianId).toBe(OrganizationId.COFFEE_PROCESSOR);
  });

  it("refuses a custody transfer from an organization that is not holding the goods", async () => {
    const ledger = await runUpTo("inTransit");
    // The producer already handed over; it cannot hand over again.
    const result = await ledger.submitCommand(
      commands.transferCustody({
        toOrganizationId: OrganizationId.COFFEE_PROCESSOR,
        scenarioTimestamp: SCENARIO_TIMELINE.batchReceived,
      }),
      contextFor(ActorId.PRODUCER_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.CURRENT_CUSTODIAN_REQUIRED,
    );
  });

  it("refuses an ownership transfer from an organization that does not own the goods", async () => {
    const ledger = await runUpTo("packaged");
    const result = await ledger.submitCommand(
      commands.transferOwnership({ fromOrganizationId: OrganizationId.DISTRIBUTOR }),
      contextFor(ActorId.DISTRIBUTION_MANAGER),
    );
    expect(result.isAccepted).toBe(false);
  });
});

describe("transformation", () => {
  it("roasts 100 kg of green coffee into 82 kg", async () => {
    const ledger = await runUpTo("roasted");
    const roasted = await ledger.getAsset(ROASTED_COFFEE_BATCH_ID);

    expect(roasted).toMatchObject({
      quantity: 82,
      quantityUnit: QuantityUnit.KG,
      lifecycleStatus: AssetLifecycleStatus.PROCESSED,
      parentAssetIds: [GREEN_COFFEE_BATCH_ID],
    });
    // Origin survives transformation; without it provenance would be useless.
    expect(roasted?.originLocation).toBe("Lam Dong");
  });

  /** The blocking defect regression, at the level the learner meets it. */
  it("packages 82 kg into 820 units of 100 g, which a raw numeric check rejects", async () => {
    const ledger = await runUpTo("roasted");
    const result = await ledger.submitCommand(
      commands.packageBatch(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    expect(820 > 82).toBe(true); // What the specification's rule compared.
    expect(result.isAccepted).toBe(true); // What mass normalization allows.
    expect((await ledger.getAsset(PACKAGED_COFFEE_LOT_ID))?.quantity).toBe(820);
  });

  it("still refuses a transformation that creates mass", async () => {
    const ledger = await runUpTo("roasted");
    const result = await ledger.submitCommand(
      commands.packageBatch({ packageCount: 900 }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.TRANSFORMATION_OUTPUT_NOT_GREATER_THAN_INPUT,
    );
  });

  it("records a provenance edge in each direction", async () => {
    const ledger = await runUpTo("packaged");

    const forward = await ledger.traceForward(GREEN_COFFEE_BATCH_ID);
    expect(forward.assetIds).toEqual([ROASTED_COFFEE_BATCH_ID, PACKAGED_COFFEE_LOT_ID]);

    const backward = await ledger.traceBackward(PACKAGED_COFFEE_LOT_ID);
    expect(backward.assetIds).toEqual([ROASTED_COFFEE_BATCH_ID, GREEN_COFFEE_BATCH_ID]);
  });

  it("refuses a transformation whose input does not exist", async () => {
    const ledger = await runUpTo("received");
    const result = await ledger.submitCommand(
      commands.transformBatch({ inputAssetId: "BAT_NO_SUCH_BATCH" }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.TRANSFORMATION_INPUT_EXISTS,
    );
  });

  it("refuses a transformation whose output reuses an existing identifier", async () => {
    const ledger = await runUpTo("received");
    const result = await ledger.submitCommand(
      commands.transformBatch({ outputAssetId: GREEN_COFFEE_BATCH_ID }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.TRANSFORMATION_OUTPUT_UNIQUE,
    );
  });

  it("refuses to transform a batch that has already been consumed", async () => {
    const ledger = await runUpTo("roasted");
    const result = await ledger.submitCommand(
      commands.transformBatch({ outputAssetId: "BAT_ROASTED_COFFEE_099" }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(result.isAccepted).toBe(false);
  });

  it("refuses to transform a recalled batch", async () => {
    const ledger = await runUpTo("received");
    await ledger.submitCommand(commands.recallBatch(), contextFor(ActorId.REGULATORY_AUDITOR));

    const result = await ledger.submitCommand(
      commands.transformBatch(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.BATCH_NOT_RECALLED,
    );
  });
});

describe("correction rather than deletion", () => {
  it("adds a correction without touching the original record", async () => {
    const ledger = await runUpTo("inTransit");

    // A receipt recorded with the manifest's wrong figure.
    const wrong = await ledger.submitCommand(
      commands.receiveBatch({ observedQuantity: 100 }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(wrong.isAccepted).toBe(true);

    const correction = await ledger.submitCommand(
      commands.recordCorrection({
        correctionOfTransactionId: wrong.transaction.transactionId,
        // Typed values: the asset currently reads 100 kg (its created quantity;
        // receiving does not change it), and the correction moves it to 90.
        incorrectValue: { kind: "QUANTITY", amount: 100, unit: QuantityUnit.KG },
        correctedValue: { kind: "QUANTITY", amount: 90, unit: QuantityUnit.KG },
      }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(correction.isAccepted).toBe(true);

    // Current state moved...
    expect((await ledger.getAsset(GREEN_COFFEE_BATCH_ID))?.quantity).toBe(90);

    // ...but the original transaction is byte-for-byte what it always was.
    const original = await ledger.getTransaction(wrong.transaction.transactionId);
    expect(original?.transactionStatus).not.toBe(TransactionStatus.REJECTED);
    expect((original?.commandPayload as { observedQuantity: number }).observedQuantity).toBe(100);

    // Both records are in history.
    const history = await ledger.getAssetHistory(GREEN_COFFEE_BATCH_ID);
    const ids = history.map((transaction) => transaction.transactionId);
    expect(ids).toContain(wrong.transaction.transactionId);
    expect(ids).toContain(correction.transaction.transactionId);
  });

  it("refuses a correction with no reason", async () => {
    const ledger = await runUpTo("received");
    const result = await ledger.submitCommand(
      commands.recordCorrection({ reason: "sai" }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.CORRECTION_REASON_REQUIRED,
    );
  });

  it("refuses a correction referencing a transaction that does not exist", async () => {
    const ledger = await runUpTo("received");
    const result = await ledger.submitCommand(
      commands.recordCorrection({ correctionOfTransactionId: "TX_999999" }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.CORRECTION_REFERENCE_EXISTS,
    );
  });
});

describe("certificates and documents", () => {
  it("anchors a certificate off chain and records its digest on chain", async () => {
    const ledger = await runUpTo("certified");
    const asset = await ledger.getAsset(GREEN_COFFEE_BATCH_ID);

    expect(asset?.documentAnchorIds).toContain("DOC_QUALITY_CERTIFICATE_001");
    expect(asset?.certificateIds).toContain("CERT_QUALITY_001");
    expect(asset?.complianceStatus).toBe(ComplianceStatus.COMPLIANT);
  });

  it("rejects a certificate from an organization that is not recognized", async () => {
    const ledger = await runUpTo("created");
    const result = await ledger.submitCommand(
      commands.anchorCertificate({
        issuerOrganizationId: OrganizationId.UNRECOGNIZED_CERTIFIER,
      }),
      contextFor(ActorId.CERTIFICATION_OFFICER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.CERTIFIER_AUTHORIZED,
    );
  });

  it("rejects anchoring a document with no digest", async () => {
    const ledger = await runUpTo("created");
    const result = await ledger.submitCommand(
      commands.anchorCertificate({ contentHash: "" }),
      contextFor(ActorId.CERTIFICATION_OFFICER),
    );
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.DOCUMENT_HASH_PRESENT,
    );
  });

  it("rejects a certificate that had already expired", async () => {
    const ledger = await runUpTo("created");
    await ledger.submitCommand(
      commands.anchorCertificate({ expiresAt: "2026-01-01T00:00:00.000Z" }),
      contextFor(ActorId.CERTIFICATION_OFFICER),
    );
    const result = await ledger.submitCommand(
      commands.issueCertificate(),
      contextFor(ActorId.CERTIFICATION_OFFICER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.CERTIFICATE_NOT_EXPIRED,
    );
  });
});

describe("transport conditions", () => {
  it("flags a humidity excursion for inspection rather than condemning the batch", async () => {
    const ledger = await runUpTo("monitored");
    const asset = await ledger.getAsset(GREEN_COFFEE_BATCH_ID);

    // 72% against a 70% limit: something a person must now look at.
    expect(asset?.complianceStatus).toBe(ComplianceStatus.INSPECTION_REQUIRED);
  });

  it("leaves compliance alone when the reading is within limits", async () => {
    const ledger = await runUpTo("inTransit");
    await ledger.submitCommand(
      commands.recordTransportCondition({ humidityPercent: 65 }),
      contextFor(ActorId.LOGISTICS_COORDINATOR),
    );
    expect((await ledger.getAsset(GREEN_COFFEE_BATCH_ID))?.complianceStatus).toBe(
      ComplianceStatus.COMPLIANT,
    );
  });

  it("refuses a transport record from an organization not holding the goods", async () => {
    const ledger = await runUpTo("inTransit");
    const result = await ledger.submitCommand(
      commands.recordTransportCondition({ initiatedByActorId: ActorId.PROCESSING_MANAGER }),
      contextFor(ActorId.PROCESSING_MANAGER),
    );
    expect(result.isAccepted).toBe(false);
  });
});

describe("receipt sequencing", () => {
  it("refuses a receipt for goods that were never dispatched", async () => {
    const ledger = await runUpTo("certified");
    const result = await ledger.submitCommand(
      commands.receiveBatch(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.SHIPMENT_BEFORE_RECEIPT,
    );
  });

  it("refuses a duplicate receipt", async () => {
    const ledger = await runUpTo("received");
    const result = await ledger.submitCommand(
      commands.receiveBatch(),
      contextFor(ActorId.PROCESSING_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.RECEIPT_NOT_DUPLICATED,
    );
  });

  it("refuses a transaction dated before the asset's most recent record", async () => {
    const ledger = await runUpTo("inTransit");
    const result = await ledger.submitCommand(
      commands.recordTransportCondition({
        scenarioTimestamp: SCENARIO_TIMELINE.batchCreated,
      }),
      contextFor(ActorId.LOGISTICS_COORDINATOR),
    );
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.TIMESTAMP_SEQUENCE_VALID,
    );
  });
});

describe("recall scope", () => {
  it("recalls the whole affected lineage and nothing else", async () => {
    const ledger = await runUpTo("sold", { withSeed: true });
    const scope = await ledger.calculateRecallScope(GREEN_COFFEE_BATCH_ID);

    expect([...scope.affectedAssetIds].sort()).toEqual(
      [GREEN_COFFEE_BATCH_ID, ROASTED_COFFEE_BATCH_ID, PACKAGED_COFFEE_LOT_ID].sort(),
    );
    expect(scope.unaffectedAssetIds).toContain(DISTRACTOR_PACKAGED_LOT_ID);
    expect(scope.unaffectedAssetIds).toContain(UNRELATED_PACKAGED_LOT_ID);
  });

  it("scores a learner who swept up the lookalike lot as over-selecting", async () => {
    const ledger = await runUpTo("sold", { withSeed: true });
    const scope = await ledger.calculateRecallScope(GREEN_COFFEE_BATCH_ID);

    const overCautious = assessRecallSelection(
      [...scope.affectedAssetIds, DISTRACTOR_PACKAGED_LOT_ID],
      scope,
    );
    expect(overCautious.isExact).toBe(false);
    expect(overCautious.overSelected).toEqual([DISTRACTOR_PACKAGED_LOT_ID]);
    expect(overCautious.missed).toEqual([]);
  });

  it("scores a learner who missed the packaged lot as under-selecting", async () => {
    const ledger = await runUpTo("sold", { withSeed: true });
    const scope = await ledger.calculateRecallScope(GREEN_COFFEE_BATCH_ID);

    const tooNarrow = assessRecallSelection([GREEN_COFFEE_BATCH_ID], scope);
    expect(tooNarrow.missed).toContain(PACKAGED_COFFEE_LOT_ID);
    expect(tooNarrow.overSelected).toEqual([]);
  });

  it("does not recall ancestors of an affected asset", async () => {
    const ledger = await runUpTo("sold");
    // A problem discovered in the roasted batch does not travel back to the
    // green coffee it was made from.
    const scope = await ledger.calculateRecallScope(ROASTED_COFFEE_BATCH_ID);
    expect(scope.affectedAssetIds).not.toContain(GREEN_COFFEE_BATCH_ID);
    expect(scope.affectedAssetIds).toContain(PACKAGED_COFFEE_LOT_ID);
  });

  it("refuses a recall from anyone but the regulator", async () => {
    const ledger = await runUpTo("sold");
    const result = await ledger.submitCommand(
      commands.recallBatch(),
      contextFor(ActorId.RETAIL_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.RECALL_AUTHORIZED,
    );
  });

  it("recalls the true scope even when the learner selected the wrong assets", async () => {
    // The learner's answer is scored, but the ledger records what is actually
    // affected -- a mistake must not leave contaminated stock marked saleable.
    const ledger = await runUpTo("sold", { withSeed: true });
    await ledger.submitCommand(
      commands.recallBatch({ selectedAssetIds: [GREEN_COFFEE_BATCH_ID] }),
      contextFor(ActorId.REGULATORY_AUDITOR),
    );

    expect((await ledger.getAsset(PACKAGED_COFFEE_LOT_ID))?.saleEligibility).toBe(
      SaleEligibility.PROHIBITED,
    );
  });
});

describe("seeded background lots", () => {
  it("loads the distractor chain with its provenance intact", async () => {
    const ledger = createDriver({ withSeed: true });
    const forward = await ledger.traceForward("BAT_GREEN_COFFEE_002");
    expect(forward.assetIds).toContain(DISTRACTOR_PACKAGED_LOT_ID);
  });

  it("leaves the unrelated control lot with no lineage at all", async () => {
    const ledger = createDriver({ withSeed: true });
    expect((await ledger.traceBackward(UNRELATED_PACKAGED_LOT_ID)).assetIds).toEqual([]);
    expect((await ledger.traceForward(UNRELATED_PACKAGED_LOT_ID)).assetIds).toEqual([]);
  });

  it("does not put seeded assets into the block chain", async () => {
    // The learner's first transaction must be in the first block; seeded lots
    // are the world that already existed, not recorded history.
    const ledger = createDriver({ withSeed: true });
    expect(await ledger.getBlocks()).toHaveLength(0);
    expect(await ledger.getAllTransactions()).toHaveLength(0);
    expect((await ledger.getAllAssets()).length).toBeGreaterThan(0);
  });
});

describe("authorization", () => {
  it("refuses a batch created by an organization that does not produce", async () => {
    const ledger = createDriver();
    const result = await ledger.submitCommand(
      commands.createBatch({ producerOrganizationId: OrganizationId.LOGISTICS_PROVIDER }),
      contextFor(ActorId.LOGISTICS_COORDINATOR),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.ACTOR_AUTHORIZED,
    );
  });

  it("refuses an actor acting for an organization they do not belong to", async () => {
    const ledger = createDriver();
    const result = await ledger.submitCommand(commands.createBatch(), {
      actorId: ActorId.RETAIL_MANAGER,
      organizationId: OrganizationId.PRODUCER_COOP,
    });

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.ACTOR_AUTHORIZED,
    );
  });

  it("refuses a transfer to an organization that is not on the network", async () => {
    const ledger = await runUpTo("certified");
    const result = await ledger.submitCommand(
      commands.transferCustody({ toOrganizationId: "ORG_NOT_A_MEMBER" }),
      contextFor(ActorId.PRODUCER_MANAGER),
    );

    expect(result.isAccepted).toBe(false);
    expect(result.validation.failures.map((f) => f.ruleId)).toContain(
      ValidationRuleId.RECEIVER_AUTHORIZED,
    );
  });
});

describe("endorsement", () => {
  it("collects both sides of a custody handover", async () => {
    const ledger = await runUpTo("inTransit");
    const history = await ledger.getAssetHistory(GREEN_COFFEE_BATCH_ID);
    const transfer = history.find(
      (transaction) => transaction.transactionType === "TRANSFER_CUSTODY",
    );

    const endorsers = transfer?.endorsementResults.map((e) => e.endorsingOrganizationId) ?? [];
    expect(endorsers).toContain(OrganizationId.PRODUCER_COOP);
    expect(endorsers).toContain(OrganizationId.LOGISTICS_PROVIDER);
  });

  it("marks the counterparty's approval as simulated, so the interface can say so", async () => {
    const ledger = await runUpTo("inTransit");
    const history = await ledger.getAssetHistory(GREEN_COFFEE_BATCH_ID);
    const transfer = history.find(
      (transaction) => transaction.transactionType === "TRANSFER_CUSTODY",
    );

    const carrier = transfer?.endorsementResults.find(
      (e) => e.endorsingOrganizationId === OrganizationId.LOGISTICS_PROVIDER,
    );
    expect(carrier?.isSimulatedCounterparty).toBe(true);

    const producer = transfer?.endorsementResults.find(
      (e) => e.endorsingOrganizationId === OrganizationId.PRODUCER_COOP,
    );
    expect(producer?.isSimulatedCounterparty).toBe(false);
  });
});

describe("rejected transactions", () => {
  it("never change world state", async () => {
    const ledger = await runUpTo("certified");
    const before = await ledger.getAsset(GREEN_COFFEE_BATCH_ID);

    await ledger.submitCommand(
      commands.transferCustody({ alsoTransfersOwnership: true }),
      contextFor(ActorId.PRODUCER_MANAGER),
    );

    expect(await ledger.getAsset(GREEN_COFFEE_BATCH_ID)).toEqual(before);
  });

  it("are still recorded, so the learner can see why", async () => {
    const ledger = await runUpTo("certified");
    const result = await ledger.submitCommand(
      commands.transferCustody({ alsoTransfersOwnership: true }),
      contextFor(ActorId.PRODUCER_MANAGER),
    );

    const stored = await ledger.getTransaction(result.transaction.transactionId);
    expect(stored?.transactionStatus).toBe(TransactionStatus.REJECTED);
    expect(stored?.validationResults.length).toBeGreaterThan(0);
  });

  it("never enter a block", async () => {
    const ledger = await runUpTo("certified");
    await ledger.submitCommand(
      commands.transferCustody({ alsoTransfersOwnership: true }),
      contextFor(ActorId.PRODUCER_MANAGER),
    );
    await ledger.sealPendingTransactions(SCENARIO_TIMELINE.custodyTransferred);

    const blocks = await ledger.getBlocks();
    const blocked = blocks.flatMap((block) => block.transactionIds);
    for (const transactionId of blocked) {
      const transaction = await ledger.getTransaction(transactionId);
      expect(transaction?.transactionStatus).toBe(TransactionStatus.COMMITTED);
    }
  });
});

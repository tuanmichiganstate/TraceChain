import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDriver, commands, contextFor } from "../../../test/support/scenario-driver";
import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import { ActorId } from "../../scenarios/coffee-traceability/organizations";
import { SCENARIO_TIMELINE } from "../../scenarios/coffee-traceability/timeline";

/**
 * The activity tells a learner, in as many words, that the hashing here is
 * real SHA-256 computed from the records themselves -- and stage 8's whole
 * demonstration rests on it. If that ever stopped being true, the interface
 * would be lying to a class, and the tamper demonstration would be theatre.
 *
 * `sha256.test.ts` proves the vendored primitive is SHA-256, against the
 * FIPS 180-4 vectors and differentially against Node. This proves the separate
 * thing the claim actually needs: that the digests a learner reads off the
 * ledger are that function applied to the record in front of them. Every hash
 * is recomputed with Node's implementation, so a swap of the vendored one for
 * a stub cannot satisfy both sides of the comparison.
 */
const nodeSha256 = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");

/** Two blocks, so the chain link between them is exercised too. */
async function ledgerWithCommittedBlocks() {
  const ledger = createDriver();
  await ledger.submitCommand(commands.createBatch(), contextFor(ActorId.PRODUCER_MANAGER));
  await ledger.sealPendingTransactions(SCENARIO_TIMELINE.batchCreated);
  await ledger.submitCommand(commands.anchorCertificate(), contextFor(ActorId.PRODUCER_MANAGER));
  await ledger.sealPendingTransactions(SCENARIO_TIMELINE.laboratoryResult);
  return ledger;
}

describe("the digests a learner reads are genuine SHA-256", () => {
  it("recomputes every block hash with an independent implementation", async () => {
    const ledger = await ledgerWithCommittedBlocks();
    const state = ledger.getState();
    expect(state.blockOrder.length).toBeGreaterThan(1);

    for (const blockId of state.blockOrder) {
      const block = state.blocksById[blockId];
      expect(block).toBeDefined();
      const independent = nodeSha256(
        canonicalize({
          blockId: block!.blockId,
          blockNumber: block!.blockNumber,
          previousBlockHash: block!.previousBlockHash,
          transactionHashes: block!.transactionIds.map(
            (id) => state.transactionsById[id]?.transactionHash,
          ),
          createdAt: block!.createdAt,
          orderingServiceId: block!.orderingServiceId,
        }),
      );
      expect(block!.blockHash).toBe(independent);
    }
  });

  it("recomputes every committed transaction hash the same way", async () => {
    const ledger = await ledgerWithCommittedBlocks();
    const state = ledger.getState();

    let checked = 0;
    for (const transactionId of state.transactionOrder) {
      const transaction = state.transactionsById[transactionId];
      if (transaction?.transactionHash === undefined) continue;
      checked++;
      const independent = nodeSha256(
        canonicalize({
          transactionId: transaction.transactionId,
          transactionType: transaction.transactionType,
          commandPayload: transaction.commandPayload,
          proposedByOrganizationId: transaction.proposedByOrganizationId,
          // Fixed when the transaction was ordered, which is when its content
          // stopped changing -- not when the block it landed in was sealed.
          committedAt: transaction.orderedAt ?? transaction.createdAt,
          previousAssetStateHash: transaction.previousAssetStateHash ?? null,
          resultingAssetStateHash: transaction.resultingAssetStateHash,
        }),
      );
      expect(transaction.transactionHash).toBe(independent);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("chains each block to the one before it by its actual digest", async () => {
    const ledger = await ledgerWithCommittedBlocks();
    const state = ledger.getState();

    let previous: string | null = null;
    for (const blockId of state.blockOrder) {
      const block = state.blocksById[blockId];
      // The link is the previous block's own hash, not a separate value that
      // merely looks like one -- which is what makes tampering cascade.
      expect(block!.previousBlockHash).toBe(previous);
      previous = block!.blockHash;
    }
  });

  it("writes digests in the shape a learner can compare by eye", async () => {
    const ledger = await ledgerWithCommittedBlocks();
    const state = ledger.getState();

    for (const blockId of state.blockOrder) {
      expect(state.blocksById[blockId]!.blockHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

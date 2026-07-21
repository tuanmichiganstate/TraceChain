/**
 * Chain integrity verification (specification section 15.7).
 *
 * This is what makes the tamper demonstration in stage 8 mean something. A
 * learner alters a historical quantity in a cloned ledger; recomputing the
 * hashes shows the altered block and every block after it failing, because each
 * block commits to its predecessor's digest.
 *
 * What it demonstrates is tamper *evidence*, not tamper prevention. Nothing
 * here stops someone editing a record -- it only makes the edit impossible to
 * hide. The debrief says so explicitly.
 */

import type { LedgerBlock, LedgerTransaction } from "../types/models";
import {
  calculateBlockHash,
  calculateTransactionHash,
} from "../../infrastructure/hashing/hash-payloads";
import type { HashFunction } from "../../infrastructure/hashing/sha256";
import type { DomainState } from "./domain-state";

export interface IntegrityVerificationResult {
  readonly isValid: boolean;
  readonly verifiedBlockCount: number;
  readonly invalidBlockIds: readonly string[];
  readonly invalidTransactionIds: readonly string[];
  readonly firstInvalidBlockId: string | null;
  /** Developer-facing explanations, one per detected problem. */
  readonly findings: readonly string[];
}

export function verifyIntegrity(state: DomainState, hash: HashFunction): IntegrityVerificationResult {
  const invalidBlockIds: string[] = [];
  const invalidTransactionIds: string[] = [];
  const findings: string[] = [];

  const seenTransactionIds = new Set<string>();
  let expectedPreviousHash: string | null = null;
  let expectedBlockNumber = 1;

  for (const blockId of state.blockOrder) {
    const block = state.blocksById[blockId];
    if (block === undefined) {
      invalidBlockIds.push(blockId);
      findings.push(`Block ${blockId} is referenced by the chain but missing.`);
      continue;
    }

    let blockIsValid = true;

    if (block.blockNumber !== expectedBlockNumber) {
      blockIsValid = false;
      findings.push(
        `Block ${blockId} has number ${block.blockNumber}, expected ${expectedBlockNumber}.`,
      );
    }

    if (block.previousBlockHash !== expectedPreviousHash) {
      blockIsValid = false;
      findings.push(
        `Block ${blockId} does not link to the previous block's digest. ` +
          "Editing an earlier record breaks every link that follows it.",
      );
    }

    const transactionHashes: string[] = [];
    for (const transactionId of block.transactionIds) {
      const transaction = state.transactionsById[transactionId];

      if (transaction === undefined) {
        blockIsValid = false;
        invalidTransactionIds.push(transactionId);
        findings.push(`Block ${blockId} references missing transaction ${transactionId}.`);
        continue;
      }

      if (seenTransactionIds.has(transactionId)) {
        blockIsValid = false;
        invalidTransactionIds.push(transactionId);
        findings.push(`Transaction ${transactionId} appears in more than one block.`);
      }
      seenTransactionIds.add(transactionId);

      if (!verifyTransactionHash(transaction, hash)) {
        blockIsValid = false;
        invalidTransactionIds.push(transactionId);
        findings.push(
          `Transaction ${transactionId} no longer matches its recorded digest; ` +
            "its content has been altered since it was committed.",
        );
      }

      transactionHashes.push(transaction.transactionHash ?? "");
    }

    const recomputedBlockHash = calculateBlockHash(
      {
        blockId: block.blockId,
        blockNumber: block.blockNumber,
        previousBlockHash: block.previousBlockHash,
        transactionHashes,
        createdAt: block.createdAt,
        orderingServiceId: block.orderingServiceId,
      },
      hash,
    );

    if (recomputedBlockHash !== block.blockHash) {
      blockIsValid = false;
      findings.push(`Block ${blockId} does not match its recorded digest.`);
    }

    if (!blockIsValid && !invalidBlockIds.includes(blockId)) {
      invalidBlockIds.push(blockId);
    }

    expectedPreviousHash = block.blockHash;
    expectedBlockNumber += 1;
  }

  return {
    isValid: invalidBlockIds.length === 0 && invalidTransactionIds.length === 0,
    verifiedBlockCount: state.blockOrder.length,
    invalidBlockIds,
    invalidTransactionIds,
    firstInvalidBlockId: invalidBlockIds[0] ?? null,
    findings,
  };
}

/** Recompute a transaction's digest from the fields that produced it. */
function verifyTransactionHash(transaction: LedgerTransaction, hash: HashFunction): boolean {
  if (
    transaction.transactionHash === undefined ||
    transaction.resultingAssetStateHash === undefined
  ) {
    // Never committed, so there is no digest to contradict.
    return true;
  }

  const recomputed = calculateTransactionHash(
    {
      transactionId: transaction.transactionId,
      transactionType: transaction.transactionType,
      commandPayload: transaction.commandPayload,
      proposedByOrganizationId: transaction.proposedByOrganizationId,
      committedAt: transaction.orderedAt ?? transaction.createdAt,
      previousAssetStateHash: transaction.previousAssetStateHash ?? null,
      resultingAssetStateHash: transaction.resultingAssetStateHash,
    },
    hash,
  );

  return recomputed === transaction.transactionHash;
}

/**
 * A deep structural clone of ledger state, for the tamper demonstration.
 *
 * The demonstration must never touch the real attempt: a learner who breaks the
 * chain to see what happens has to be able to carry on afterwards. Tests assert
 * that the real ledger's digests are byte-identical before and after.
 */
export function cloneForTamperDemonstration(state: DomainState): DomainState {
  return structuredClone(state) as DomainState;
}

/** Digest of the whole chain, so a test can assert the real ledger is untouched. */
export function chainFingerprint(state: DomainState, hash: HashFunction): string {
  const blockHashes = state.blockOrder.map(
    (blockId) => (state.blocksById[blockId] as LedgerBlock | undefined)?.blockHash ?? "",
  );
  return hash(blockHashes.join("|"));
}

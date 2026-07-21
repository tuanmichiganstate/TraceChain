/**
 * The transaction lifecycle and block formation (specification sections 12,
 * 14 and 15).
 *
 * ORDERED VERSUS COMMITTED
 * ------------------------
 * The specification left these in conflict: `blockCommitMode: "STAGE_BOUNDARY"`
 * means blocks form only when a stage ends, yet section 8.2 says the first
 * transaction's commit creates block 1 immediately. And with
 * `maxTransactionsPerBlock: 2`, a stage emitting three or more transactions had
 * no stated flush algorithm. The semantics are pinned here:
 *
 *   ORDERED    Accepted by the ordering service and sitting in the pending
 *              queue. The event has been applied to world state, because the
 *              outcome is already determined.
 *   COMMITTED  Sealed into a block, hash-linked to its predecessor.
 *
 * At a stage boundary the pending queue drains into blocks of at most
 * `maxTransactionsPerBlock`, in order. Stage 2 is the deliberate exception: it
 * seals immediately, because watching a block form is that stage's entire
 * purpose.
 *
 * The pending queue is not an implementation detail to hide -- it is the
 * teaching device that shows ordering and commitment are separate steps.
 */

import { LedgerEventType, TransactionStatus, TransactionType } from "../types/enums";
import type {
  EndorsementResult,
  LedgerBlock,
  LedgerTransaction,
  SimulatedSignature,
  SupplyChainAsset,
} from "../types/models";
import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import type { LedgerDomainEvent } from "../events/events";
import { canonicalize } from "../../infrastructure/hashing/canonicalize";
import {
  calculateAssetStateHash,
  calculateBlockHash,
  calculateTransactionHash,
} from "../../infrastructure/hashing/hash-payloads";
import type { HashFunction } from "../../infrastructure/hashing/sha256";
import { evaluateRules, type RuleEvaluation } from "../rules/registry";
import type { ValidationContext } from "../rules/types";
import {
  type DomainState,
  formatBlockId,
  formatTransactionId,
  reduce,
} from "./domain-state";

export type BlockCommitMode = "IMMEDIATE" | "STAGE_BOUNDARY";

export interface LedgerConfiguration {
  readonly maxTransactionsPerBlock: number;
  readonly blockCommitMode: BlockCommitMode;
  readonly orderingServiceId: string;
}

export const DEFAULT_LEDGER_CONFIGURATION: LedgerConfiguration = {
  maxTransactionsPerBlock: 2,
  blockCommitMode: "STAGE_BOUNDARY",
  orderingServiceId: "ORDERER_SIMULATED_001",
};

export interface TransactionResult {
  readonly state: DomainState;
  readonly transaction: LedgerTransaction;
  readonly validation: RuleEvaluation;
  readonly isAccepted: boolean;
}

/** Which organizations must endorse each transaction type (section 14.2). */
type EndorsementPolicy = (
  command: SupplyChainCommand,
  context: CommandContext,
  state: DomainState,
) => readonly string[];

const endorsementPolicies: Partial<Record<TransactionType, EndorsementPolicy>> = {
  [TransactionType.CREATE_BATCH]: (_command, context) => [context.organizationId],
};

/**
 * Translate a validated command into the event that records its outcome.
 * Milestone 2 extends this as each stage's command is implemented.
 */
function commandToEvent(
  command: SupplyChainCommand,
  transactionId: string,
): LedgerDomainEvent | null {
  switch (command.commandType) {
    case TransactionType.CREATE_BATCH:
      return {
        eventType: LedgerEventType.BATCH_CREATED,
        transactionId,
        committedAt: command.scenarioTimestamp,
        assetId: command.assetId,
        assetType: command.assetType,
        productName: command.productName,
        originLocation: command.originLocation,
        productionDate: command.productionDate,
        quantity: command.quantity,
        quantityUnit: command.quantityUnit,
        packageSizeGrams: command.packageSizeGrams,
        ownerOrganizationId: command.producerOrganizationId,
        custodianOrganizationId: command.producerOrganizationId,
        locationId: command.locationId,
      };
    default:
      return null;
  }
}

/** The asset a transaction is primarily about, for before/after state hashing. */
function primaryAssetId(command: SupplyChainCommand): string | null {
  if ("assetId" in command) return command.assetId;
  if ("outputAssetId" in command) return command.outputAssetId;
  if ("sourceAssetId" in command) return command.sourceAssetId;
  return null;
}

export class SimulatedLedger {
  constructor(
    private readonly hash: HashFunction,
    private readonly configuration: LedgerConfiguration = DEFAULT_LEDGER_CONFIGURATION,
  ) {}

  /**
   * Drive a command through the full lifecycle:
   * DRAFT -> SIGNED -> SUBMITTED -> VALIDATED -> ENDORSED -> ORDERED,
   * or SUBMITTED -> REJECTED when a rule fails.
   */
  submitCommand(
    state: DomainState,
    command: SupplyChainCommand,
    context: CommandContext,
    validationContext: Omit<ValidationContext, "state">,
  ): TransactionResult {
    const transactionId = formatTransactionId(state.nextTransactionSequence);
    const timestamp = command.scenarioTimestamp;

    const signature: SimulatedSignature = {
      signatureId: `SIG_${transactionId}`,
      signedByActorId: context.actorId,
      signedByOrganizationId: context.organizationId,
      signedAt: timestamp,
      signedPayloadHash: this.hash(canonicalize(command)),
      signatureType: "EDUCATIONAL_SIMULATION",
    };

    const validation = evaluateRules(command, { ...validationContext, state });

    const baseTransaction: LedgerTransaction = {
      transactionId,
      transactionType: command.commandType,
      transactionStatus: TransactionStatus.SUBMITTED,
      commandPayload: command,
      proposedByActorId: context.actorId,
      proposedByOrganizationId: context.organizationId,
      simulatedSignature: signature,
      validationResults: validation.results,
      endorsementResults: [],
      createdAt: timestamp,
      submittedAt: timestamp,
    };

    if (!validation.isValid) {
      // A rejected transaction is recorded -- the learner must be able to see
      // why it failed -- but it must not touch world state.
      const rejected: LedgerTransaction = {
        ...baseTransaction,
        transactionStatus: TransactionStatus.REJECTED,
        validatedAt: timestamp,
      };
      return {
        state: this.recordTransaction(state, rejected),
        transaction: rejected,
        validation,
        isAccepted: false,
      };
    }

    const endorsingOrganizations =
      endorsementPolicies[command.commandType]?.(command, context, state) ?? [
        context.organizationId,
      ];

    const endorsements: EndorsementResult[] = endorsingOrganizations.map((organizationId) => ({
      endorsingOrganizationId: organizationId,
      endorsedAt: timestamp,
      isEndorsed: true,
      // Anything not proposed by this organization was approved on the
      // learner's behalf, and the interface must say so.
      isSimulatedCounterparty: organizationId !== context.organizationId,
    }));

    const event = commandToEvent(command, transactionId);
    if (event === null) {
      throw new Error(`No event mapping for command type ${command.commandType}`);
    }

    const affectedAssetId = primaryAssetId(command);
    const previousAsset =
      affectedAssetId === null ? undefined : state.assetsById[affectedAssetId];
    const previousAssetStateHash =
      previousAsset === undefined ? null : calculateAssetStateHash(previousAsset, this.hash);

    // The reducer runs first and synchronously; hashing is metadata computed
    // from its result.
    const stateAfterEvent = reduce(state, event);

    const resultingAsset =
      affectedAssetId === null ? undefined : stateAfterEvent.assetsById[affectedAssetId];
    const resultingAssetStateHash =
      resultingAsset === undefined
        ? this.hash(canonicalize(null))
        : calculateAssetStateHash(resultingAsset, this.hash);

    const transactionHash = calculateTransactionHash(
      {
        transactionId,
        transactionType: command.commandType,
        commandPayload: command,
        proposedByOrganizationId: context.organizationId,
        committedAt: timestamp,
        previousAssetStateHash,
        resultingAssetStateHash,
      },
      this.hash,
    );

    const ordered: LedgerTransaction = {
      ...baseTransaction,
      transactionStatus: TransactionStatus.ORDERED,
      endorsementResults: endorsements,
      validatedAt: timestamp,
      endorsedAt: timestamp,
      orderedAt: timestamp,
      transactionHash,
      previousAssetStateHash,
      resultingAssetStateHash,
    };

    let nextState: DomainState = {
      ...this.recordTransaction(stateAfterEvent, ordered),
      pendingTransactionIds: [...stateAfterEvent.pendingTransactionIds, transactionId],
    };

    const shouldSealNow =
      this.configuration.blockCommitMode === "IMMEDIATE" ||
      nextState.pendingTransactionIds.length >= this.configuration.maxTransactionsPerBlock;

    if (shouldSealNow) {
      nextState = this.sealPendingTransactions(nextState, timestamp);
    }

    return {
      state: nextState,
      transaction: nextState.transactionsById[transactionId] as LedgerTransaction,
      validation,
      isAccepted: true,
    };
  }

  /**
   * Drain the pending queue into blocks of at most `maxTransactionsPerBlock`.
   * Called at a stage boundary, and by the stage 2 "seal block one" action.
   */
  sealPendingTransactions(state: DomainState, createdAt: string): DomainState {
    let working = state;

    while (working.pendingTransactionIds.length > 0) {
      const batch = working.pendingTransactionIds.slice(
        0,
        this.configuration.maxTransactionsPerBlock,
      );
      const remaining = working.pendingTransactionIds.slice(batch.length);

      const blockNumber = working.nextBlockSequence;
      const blockId = formatBlockId(blockNumber);
      const previousBlockId = working.blockOrder[working.blockOrder.length - 1];
      const previousBlockHash =
        previousBlockId === undefined
          ? null
          : (working.blocksById[previousBlockId] as LedgerBlock).blockHash;

      const transactionHashes = batch.map(
        (id) => (working.transactionsById[id] as LedgerTransaction).transactionHash as string,
      );

      const blockHash = calculateBlockHash(
        {
          blockId,
          blockNumber,
          previousBlockHash,
          transactionHashes,
          createdAt,
          orderingServiceId: this.configuration.orderingServiceId,
        },
        this.hash,
      );

      const block: LedgerBlock = {
        blockId,
        blockNumber,
        previousBlockHash,
        transactionIds: batch,
        createdAt,
        blockHash,
        orderingServiceId: this.configuration.orderingServiceId,
      };

      const committedTransactions: Record<string, LedgerTransaction> = {};
      for (const id of batch) {
        const transaction = working.transactionsById[id] as LedgerTransaction;
        committedTransactions[id] = {
          ...transaction,
          transactionStatus: TransactionStatus.COMMITTED,
          committedAt: createdAt,
          blockId,
        };
      }

      working = {
        ...working,
        transactionsById: { ...working.transactionsById, ...committedTransactions },
        blocksById: { ...working.blocksById, [blockId]: block },
        blockOrder: [...working.blockOrder, blockId],
        pendingTransactionIds: remaining,
        nextBlockSequence: blockNumber + 1,
      };
    }

    return working;
  }

  private recordTransaction(state: DomainState, transaction: LedgerTransaction): DomainState {
    return {
      ...state,
      transactionsById: {
        ...state.transactionsById,
        [transaction.transactionId]: transaction,
      },
      transactionOrder: [...state.transactionOrder, transaction.transactionId],
      nextTransactionSequence: state.nextTransactionSequence + 1,
    };
  }
}

/** Re-exported so tests can build expected asset shapes. */
export type { SupplyChainAsset };

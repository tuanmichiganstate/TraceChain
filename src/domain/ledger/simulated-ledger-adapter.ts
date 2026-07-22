/**
 * The browser-only ledger (specification section 16).
 *
 * A stateful facade over the pure `SimulatedLedger` engine. The engine takes
 * state and returns new state; this holds the current state so callers do not
 * have to thread it through. That split is deliberate -- the engine stays
 * testable as a pure function, and only this thin layer is stateful.
 */

import { TransactionStatus } from "../types/enums";
import type {
  LedgerBlock,
  LedgerTransaction,
  ProvenanceEdge,
  SupplyChainAsset,
} from "../types/models";
import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import { subjectAssetId, producedAssetId } from "../commands/command-targets";
import type { HashFunction } from "../../infrastructure/hashing/sha256";
import { traceBackward, traceForward, type TraceabilityResult } from "../provenance/trace";
import { calculateRecallScope, type RecallScopeResult } from "../provenance/recall-scope";
import type { ValidationRegistries } from "../rules/types";
import { createEmptyDomainState, type DomainState } from "./domain-state";
import { verifyIntegrity, type IntegrityVerificationResult } from "./integrity";
import type { LedgerAdapter } from "./ledger-adapter";
import {
  DEFAULT_LEDGER_CONFIGURATION,
  SimulatedLedger,
  type LedgerConfiguration,
  type TransactionResult,
} from "./ledger-engine";
import type { ScriptedTransactionDefinition } from "../types/scenario";
import { applyEligibleScriptedTransactions } from "../scenario/scripted-transactions";

export interface SimulatedLedgerAdapterOptions {
  readonly hash: HashFunction;
  readonly configuration?: LedgerConfiguration;
  readonly initialState?: DomainState;
  readonly registries: ValidationRegistries;
  readonly scriptedTransactions?: readonly ScriptedTransactionDefinition[];
}

export class SimulatedLedgerAdapter implements LedgerAdapter {
  private state: DomainState;
  private readonly engine: SimulatedLedger;
  private readonly hash: HashFunction;
  private readonly registries: ValidationRegistries;
  private readonly scriptedTransactions: readonly ScriptedTransactionDefinition[];

  constructor(options: SimulatedLedgerAdapterOptions) {
    this.hash = options.hash;
    this.state = options.initialState ?? createEmptyDomainState();
    this.registries = options.registries;
    this.scriptedTransactions = options.scriptedTransactions ?? [];
    this.engine = new SimulatedLedger(
      options.hash,
      options.configuration ?? DEFAULT_LEDGER_CONFIGURATION,
    );
  }

  /** Current world state. Exposed for the session reducer and for replay. */
  getState(): DomainState {
    return this.state;
  }

  async submitCommand(
    command: SupplyChainCommand,
    context: CommandContext,
  ): Promise<TransactionResult> {
    const result = this.engine.submitCommand(
      this.state,
      command,
      context,
      this.registries,
    );
    this.state = this.applyScripts(result.state);
    return {
      ...result,
      state: this.state,
      transaction: this.state.transactionsById[result.transaction.transactionId] ??
        result.transaction,
    };
  }

  async getAsset(assetId: string): Promise<SupplyChainAsset | null> {
    return this.state.assetsById[assetId] ?? null;
  }

  async getAllAssets(): Promise<readonly SupplyChainAsset[]> {
    return Object.values(this.state.assetsById);
  }

  /**
   * Transactions touching an asset, oldest first.
   *
   * Rejected transactions are included deliberately. History is not only what
   * succeeded: a learner reviewing the audit trail should see the attempt that
   * was refused and why, which is half of what an audit trail is for.
   */
  async getAssetHistory(assetId: string): Promise<readonly LedgerTransaction[]> {
    return this.state.transactionOrder
      .map((id) => this.state.transactionsById[id])
      .filter((transaction): transaction is LedgerTransaction => transaction !== undefined)
      .filter((transaction) => {
        const command = transaction.commandPayload as SupplyChainCommand;
        return subjectAssetId(command) === assetId || producedAssetId(command) === assetId;
      });
  }

  async getTransaction(transactionId: string): Promise<LedgerTransaction | null> {
    return this.state.transactionsById[transactionId] ?? null;
  }

  async getAllTransactions(): Promise<readonly LedgerTransaction[]> {
    return this.state.transactionOrder
      .map((id) => this.state.transactionsById[id])
      .filter((transaction): transaction is LedgerTransaction => transaction !== undefined);
  }

  async getBlocks(): Promise<readonly LedgerBlock[]> {
    return this.state.blockOrder
      .map((id) => this.state.blocksById[id])
      .filter((block): block is LedgerBlock => block !== undefined);
  }

  async getPendingTransactionIds(): Promise<readonly string[]> {
    return this.state.pendingTransactionIds;
  }

  async sealPendingTransactions(createdAt: string): Promise<readonly LedgerBlock[]> {
    const before = new Set(this.state.blockOrder);
    this.state = this.engine.sealPendingTransactions(this.state, createdAt);
    this.state = this.applyScripts(this.state);
    return this.state.blockOrder
      .filter((id) => !before.has(id))
      .map((id) => this.state.blocksById[id])
      .filter((block): block is LedgerBlock => block !== undefined);
  }

  async getProvenanceEdges(): Promise<readonly ProvenanceEdge[]> {
    return this.state.provenanceEdges;
  }

  async traceBackward(assetId: string): Promise<TraceabilityResult> {
    return traceBackward(assetId, this.state.provenanceEdges);
  }

  async traceForward(assetId: string): Promise<TraceabilityResult> {
    return traceForward(assetId, this.state.provenanceEdges);
  }

  async calculateRecallScope(assetId: string): Promise<RecallScopeResult> {
    return calculateRecallScope(assetId, this.state);
  }

  async verifyIntegrity(): Promise<IntegrityVerificationResult> {
    return verifyIntegrity(this.state, this.hash);
  }

  /** Committed transaction count, for the final report. */
  countByStatus(status: TransactionStatus): number {
    return Object.values(this.state.transactionsById).filter(
      (transaction) => transaction.transactionStatus === status,
    ).length;
  }

  private applyScripts(state: DomainState): DomainState {
    return applyEligibleScriptedTransactions(
      state,
      this.scriptedTransactions,
      this.engine,
      this.registries,
    ).state;
  }
}

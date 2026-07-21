/**
 * The ledger seam (specification section 16).
 *
 * React components depend on this interface and never on arrays, maps, or the
 * `DomainState` shape. That is what makes the Tier 2 and Tier 3 adapters --
 * a shared server ledger, then Hyperledger Fabric -- drop-in replacements
 * rather than rewrites (see docs/FUTURE_LEDGER_ADAPTERS.md).
 *
 * Every method is asynchronous even though the simulated implementation is
 * synchronous. A network-backed adapter cannot be, and changing the signatures
 * later would mean touching every caller.
 */

import type {
  LedgerBlock,
  LedgerTransaction,
  ProvenanceEdge,
  SupplyChainAsset,
} from "../types/models";
import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import type { TraceabilityResult } from "../provenance/trace";
import type { RecallScopeResult } from "../provenance/recall-scope";
import type { IntegrityVerificationResult } from "./integrity";
import type { TransactionResult } from "./ledger-engine";

export interface LedgerAdapter {
  submitCommand(
    command: SupplyChainCommand,
    context: CommandContext,
  ): Promise<TransactionResult>;

  getAsset(assetId: string): Promise<SupplyChainAsset | null>;
  getAllAssets(): Promise<readonly SupplyChainAsset[]>;

  /** Committed transactions touching this asset, oldest first. */
  getAssetHistory(assetId: string): Promise<readonly LedgerTransaction[]>;

  getTransaction(transactionId: string): Promise<LedgerTransaction | null>;
  getAllTransactions(): Promise<readonly LedgerTransaction[]>;

  getBlocks(): Promise<readonly LedgerBlock[]>;
  getPendingTransactionIds(): Promise<readonly string[]>;

  /** Seal ordered transactions into blocks. Called at a stage boundary. */
  sealPendingTransactions(createdAt: string): Promise<readonly LedgerBlock[]>;

  getProvenanceEdges(): Promise<readonly ProvenanceEdge[]>;
  traceBackward(assetId: string): Promise<TraceabilityResult>;
  traceForward(assetId: string): Promise<TraceabilityResult>;
  calculateRecallScope(assetId: string): Promise<RecallScopeResult>;

  verifyIntegrity(): Promise<IntegrityVerificationResult>;
}

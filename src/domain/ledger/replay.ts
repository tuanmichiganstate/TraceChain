/** Deterministic replay through the same validation/event/hash pipeline as live use. */

import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import type { ValidationRegistries } from "../rules/types";
import type { HashFunction } from "../../infrastructure/hashing/sha256";
import { createEmptyDomainState, type DomainState } from "./domain-state";
import {
  DEFAULT_LEDGER_CONFIGURATION,
  SimulatedLedger,
  type LedgerConfiguration,
} from "./ledger-engine";

export interface ReplayCommandEntry {
  readonly command: SupplyChainCommand;
  readonly context: CommandContext;
  /** Seal after this command even when the configured block is not full. */
  readonly sealAfter?: boolean;
}

export interface ReplayCommandJournalOptions {
  readonly entries: readonly ReplayCommandEntry[];
  readonly registries: ValidationRegistries;
  readonly hash: HashFunction;
  readonly configuration?: LedgerConfiguration;
  readonly initialState?: DomainState;
}

export function replayCommandJournal(options: ReplayCommandJournalOptions): DomainState {
  const ledger = new SimulatedLedger(
    options.hash,
    options.configuration ?? DEFAULT_LEDGER_CONFIGURATION,
  );
  let state = options.initialState ?? createEmptyDomainState();

  for (const entry of options.entries) {
    const result = ledger.submitCommand(state, entry.command, entry.context, options.registries);
    if (!result.isAccepted) {
      const failures = result.validation.failures.map((failure) => failure.ruleId).join(", ");
      throw new Error(`Replay rejected ${entry.command.commandType}: ${failures}`);
    }
    state = result.state;
    if (entry.sealAfter === true) {
      state = ledger.sealPendingTransactions(state, entry.command.scenarioTimestamp);
    }
  }

  return state;
}


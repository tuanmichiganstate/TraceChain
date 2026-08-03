import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type {
  EmbeddedSimuLedgerConfiguration,
  SimuLedgerConfiguration,
} from "./types";

export function hashConfiguration(configuration: SimuLedgerConfiguration): string {
  return sha256Hex(canonicalize(configuration));
}

export function embedConfiguration(
  configuration: SimuLedgerConfiguration,
): EmbeddedSimuLedgerConfiguration {
  return {
    configuration,
    configurationHash: hashConfiguration(configuration),
  };
}

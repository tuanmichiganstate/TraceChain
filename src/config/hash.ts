import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import type {
  EmbeddedTraceChainConfiguration,
  TraceChainConfiguration,
} from "./types";

export function hashConfiguration(configuration: TraceChainConfiguration): string {
  return sha256Hex(canonicalize(configuration));
}

export function embedConfiguration(
  configuration: TraceChainConfiguration,
): EmbeddedTraceChainConfiguration {
  return {
    configuration,
    configurationHash: hashConfiguration(configuration),
  };
}

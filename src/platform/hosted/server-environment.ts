import type {
  Clock,
  IdGenerator,
} from "../../domain/simulation/environment";

export class SystemUtcClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

/**
 * Event identifiers are authoritative stored inputs, so cryptographic
 * uniqueness is preferable to replay-derived IDs at the server boundary.
 * Simulation-internal IDs continue to use deterministic injected generators.
 */
export class WebCryptoIdGenerator implements IdGenerator {
  nextId(prefix: string): string {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(prefix)) {
      throw new Error("Identifier prefix must be a stable uppercase token.");
    }
    return `${prefix}_${crypto.randomUUID()}`;
  }
}

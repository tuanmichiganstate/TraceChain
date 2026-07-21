/**
 * Typed application errors (specification section 28).
 *
 * Learner-facing messages are never taken from `error.message`. Each error
 * carries a `messageKey` that the interface resolves through the Vietnamese
 * localization catalogue; the English `message` is for developer diagnostics
 * only and must never reach the learner.
 */

export abstract class TraceChainError extends Error {
  abstract readonly messageKey: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DomainValidationError extends TraceChainError {
  readonly messageKey = "errors.domainValidation";
}

export class LedgerIntegrityError extends TraceChainError {
  readonly messageKey = "errors.ledgerIntegrity";
}

export class ScenarioConfigurationError extends TraceChainError {
  readonly messageKey = "errors.scenarioConfiguration";
}

export class PersistenceError extends TraceChainError {
  readonly messageKey = "errors.persistence";
}

export class ScormCommunicationError extends TraceChainError {
  readonly messageKey = "errors.scormCommunication";

  constructor(
    message: string,
    readonly scormErrorCode: string | null = null,
    readonly scormMethod: string | null = null,
  ) {
    super(message);
  }
}

export class UnsupportedStateVersionError extends TraceChainError {
  readonly messageKey = "errors.unsupportedStateVersion";

  constructor(
    message: string,
    readonly foundVersion: string | null = null,
  ) {
    super(message);
  }
}

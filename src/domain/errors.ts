/**
 * Typed application errors (specification section 28).
 *
 * Learner-facing messages are never taken from `error.message`. Each error
 * carries a `messageKey` that the interface resolves through the Vietnamese
 * localization catalogue; the English `message` is for developer diagnostics
 * only and must never reach the learner.
 */

export abstract class SimuLedgerError extends Error {
  abstract readonly messageKey: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DomainValidationError extends SimuLedgerError {
  readonly messageKey = "errors.domainValidation";
}

export class LedgerIntegrityError extends SimuLedgerError {
  readonly messageKey = "errors.ledgerIntegrity";
}

export class ScenarioConfigurationError extends SimuLedgerError {
  readonly messageKey = "errors.scenarioConfiguration";
}

export class PersistenceError extends SimuLedgerError {
  readonly messageKey = "errors.persistence";
}

export class ScormCommunicationError extends SimuLedgerError {
  readonly messageKey = "errors.scormCommunication";

  constructor(
    message: string,
    readonly scormErrorCode: string | null = null,
    readonly scormMethod: string | null = null,
  ) {
    super(message);
  }
}

export class UnsupportedStateVersionError extends SimuLedgerError {
  readonly messageKey = "errors.unsupportedStateVersion";

  constructor(
    message: string,
    readonly foundVersion: string | null = null,
  ) {
    super(message);
  }
}

/** A valid attempt belongs to another resolved package or scenario version. */
export class IncompatibleAttemptError extends SimuLedgerError {
  readonly messageKey = "errors.incompatibleAttempt";
}

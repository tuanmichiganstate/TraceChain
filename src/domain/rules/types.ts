/**
 * The validation rule engine (specification section 13).
 *
 * Rules are pure functions of a command and a context. They never import React,
 * never read a clock, and never mutate anything, so a rule's result is
 * reproducible from its inputs alone.
 */

import type { TransactionType, ValidationStatus } from "../types/enums";
import type { ValidationRuleId } from "../types/rule-ids";
import type { Actor, Organization, ValidationResult } from "../types/models";
import type { SupplyChainCommand } from "../commands/commands";
import type { DomainState } from "../ledger/domain-state";

export interface ValidationContext {
  readonly state: DomainState;
  readonly organizationsById: Readonly<Record<string, Organization>>;
  readonly actorsById: Readonly<Record<string, Actor>>;
  /** The actor proposing the transaction. */
  readonly actorId: string;
  readonly organizationId: string;
}

export interface ValidationRule<TCommand extends SupplyChainCommand = SupplyChainCommand> {
  readonly ruleId: ValidationRuleId;
  readonly appliesTo: readonly TransactionType[];
  evaluate(command: TCommand, context: ValidationContext): ValidationResult;
}

/** Convenience constructors keeping rule bodies short and consistent. */
export function passed(ruleId: ValidationRuleId, messageKey: string): ValidationResult {
  return { ruleId, status: "PASSED" as ValidationStatus, messageKey };
}

export function failed(
  ruleId: ValidationRuleId,
  messageKey: string,
  details?: Record<string, string | number | boolean>,
): ValidationResult {
  return details === undefined
    ? { ruleId, status: "FAILED" as ValidationStatus, messageKey }
    : { ruleId, status: "FAILED" as ValidationStatus, messageKey, details };
}

export function warning(
  ruleId: ValidationRuleId,
  messageKey: string,
  details?: Record<string, string | number | boolean>,
): ValidationResult {
  return details === undefined
    ? { ruleId, status: "WARNING" as ValidationStatus, messageKey }
    : { ruleId, status: "WARNING" as ValidationStatus, messageKey, details };
}

export function notApplicable(ruleId: ValidationRuleId): ValidationResult {
  return { ruleId, status: "NOT_APPLICABLE" as ValidationStatus, messageKey: "" };
}

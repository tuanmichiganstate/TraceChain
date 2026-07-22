/**
 * Rule registry and evaluation (specification section 13.4).
 *
 * Evaluation never short-circuits. A learner who has made three mistakes should
 * see all three at once, not discover them one submission at a time.
 */

import { ValidationStatus } from "../types/enums";
import type { ValidationResult } from "../types/models";
import type { ValidationRuleId } from "../types/rule-ids";
import type { SupplyChainCommand } from "../commands/commands";
import { authorizationRules } from "./authorization-rules";
import { assetRules } from "./asset-rules";
import { correctionRules } from "./correction-rules";
import { documentRules } from "./document-rules";
import { ownershipCustodyRules } from "./ownership-custody-rules";
import { quantityRules } from "./quantity-rules";
import { sequenceRules } from "./sequence-rules";
import { transformationRules } from "./transformation-rules";
import type { ValidationContext, ValidationRule } from "./types";

/**
 * Every rule in the application, grouped by concern. A test asserts this
 * covers every identifier in `ValidationRuleId`, so a rule that is
 * declared but never registered cannot slip through.
 */
const ALL_RULES: readonly ValidationRule<SupplyChainCommand>[] = [
  ...authorizationRules,
  ...assetRules,
  ...ownershipCustodyRules,
  ...quantityRules,
  ...transformationRules,
  ...documentRules,
  ...sequenceRules,
  ...correctionRules,
];

export interface RuleEvaluation {
  readonly results: readonly ValidationResult[];
  readonly isValid: boolean;
  readonly failures: readonly ValidationResult[];
  readonly warnings: readonly ValidationResult[];
}

/**
 * Run every rule that applies to this command type.
 *
 * A failure blocks endorsement and commitment; a warning does not. Results that
 * are NOT_APPLICABLE are dropped, so the learner sees only rules that had
 * something to say about their transaction.
 */
export function evaluateRules(
  command: SupplyChainCommand,
  context: ValidationContext,
  rules: readonly ValidationRule<SupplyChainCommand>[] = ALL_RULES,
): RuleEvaluation {
  const applicable = rules.filter((rule) => rule.appliesTo.includes(command.commandType));

  const results = applicable
    .map((rule) => rule.evaluate(command, context))
    .filter((result) => result.status !== ValidationStatus.NOT_APPLICABLE);

  const failures = results.filter((result) => result.status === ValidationStatus.FAILED);
  const warnings = results.filter((result) => result.status === ValidationStatus.WARNING);

  return { results, isValid: failures.length === 0, failures, warnings };
}

export function getAllRules(): readonly ValidationRule<SupplyChainCommand>[] {
  return ALL_RULES;
}

/** Which rule identifiers are actually registered. Used by a coverage test. */
export function getRegisteredRuleIds(): readonly ValidationRuleId[] {
  return ALL_RULES.map((rule) => rule.ruleId);
}

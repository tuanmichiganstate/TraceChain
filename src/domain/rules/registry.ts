/**
 * Rule registry and evaluation (specification section 13.4).
 *
 * Evaluation never short-circuits. A learner who has made three mistakes should
 * see all three at once, not discover them one submission at a time.
 */

import type { ValidationStatus } from "../types/enums";
import type { ValidationResult } from "../types/models";
import type { SupplyChainCommand } from "../commands/commands";
import { createBatchRules } from "./create-batch-rules";
import type { ValidationContext, ValidationRule } from "./types";

/**
 * Every rule in the application. Milestone 2 extends this list; nothing else
 * needs to change, because evaluation filters by `appliesTo`.
 */
const ALL_RULES: readonly ValidationRule<never>[] = [
  ...(createBatchRules as readonly ValidationRule<never>[]),
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
 * A failure blocks endorsement and commitment; a warning does not.
 */
export function evaluateRules(
  command: SupplyChainCommand,
  context: ValidationContext,
  rules: readonly ValidationRule<never>[] = ALL_RULES,
): RuleEvaluation {
  const applicable = rules.filter((rule) => rule.appliesTo.includes(command.commandType));

  const results = applicable.map((rule) =>
    (rule as ValidationRule<SupplyChainCommand>).evaluate(command, context),
  );

  const failures = results.filter((result) => result.status === ("FAILED" as ValidationStatus));
  const warnings = results.filter((result) => result.status === ("WARNING" as ValidationStatus));

  return { results, isValid: failures.length === 0, failures, warnings };
}

export function getAllRules(): readonly ValidationRule<never>[] {
  return ALL_RULES;
}

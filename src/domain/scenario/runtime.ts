import type { CommandContext, SupplyChainCommand } from "../commands/commands";
import { ScenarioConfigurationError } from "../errors";
import type {
  ScenarioDefinition,
  ScenarioTrustedContext,
} from "../types/scenario";

export function runtimeCommand<TCommand extends SupplyChainCommand>(
  scenario: ScenarioDefinition,
  actionId: string,
  overrides: Partial<TCommand> = {},
): TCommand {
  const template = scenario.runtime.learnerCommandTemplates[actionId];
  if (template === undefined) {
    throw new ScenarioConfigurationError(
      `Scenario "${scenario.scenarioId}" has no command template for "${actionId}"`,
    );
  }
  return { ...structuredClone(template), ...overrides } as TCommand;
}

export function runtimeMitigationCommand<TCommand extends SupplyChainCommand>(
  scenario: ScenarioDefinition,
  actionId: string,
  overrides: Partial<TCommand> = {},
): TCommand {
  const template =
    scenario.runtime.mitigationCommandTemplates?.[actionId] ??
    scenario.runtime.learnerCommandTemplates[actionId];
  if (template === undefined) {
    throw new ScenarioConfigurationError(
      `Scenario "${scenario.scenarioId}" has no mitigated command template for "${actionId}"`,
    );
  }
  return { ...structuredClone(template), ...overrides } as TCommand;
}

export function trustedContext(
  scenario: ScenarioDefinition,
  contextId: string,
): ScenarioTrustedContext {
  const context = scenario.runtime.trustedContexts.find(
    (candidate) => candidate.contextId === contextId,
  );
  if (context === undefined) {
    throw new ScenarioConfigurationError(
      `Scenario "${scenario.scenarioId}" has no trusted context "${contextId}"`,
    );
  }
  return context;
}

export function commandContext(
  scenario: ScenarioDefinition,
  actionId: string,
): CommandContext {
  const contextId = scenario.runtime.commandContextByAction[actionId];
  if (contextId === undefined) {
    throw new ScenarioConfigurationError(
      `Scenario "${scenario.scenarioId}" has no command context for "${actionId}"`,
    );
  }
  const context = trustedContext(scenario, contextId);
  return { actorId: context.actorId, organizationId: context.organizationId };
}

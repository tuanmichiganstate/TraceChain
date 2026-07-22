import { describe, expect, it } from "vitest";
import { TransactionType, ValidationStatus } from "../types/enums";
import { ValidationRuleId } from "../types/rule-ids";
import { getAllRules, getRegisteredRuleIds, evaluateRules } from "./registry";
import { commands, contextFor, ActorId, coffeeScenario } from "../../../test/support/scenario-driver";
import { createEmptyDomainState } from "../ledger/domain-state";

const registries = {
  organizationsById: Object.fromEntries(
    coffeeScenario.organizations.map((organization) => [organization.organizationId, organization]),
  ),
  actorsById: Object.fromEntries(coffeeScenario.actors.map((actor) => [actor.actorId, actor])),
};

describe("rule registry", () => {
  /**
   * A rule that is declared in `ValidationRuleId` but never registered would
   * simply never run. Nothing fails, no test breaks, and the protection it was
   * supposed to provide silently is not there.
   */
  it("registers every declared rule identifier", () => {
    const registered = new Set(getRegisteredRuleIds());
    const declared = Object.values(ValidationRuleId);
    const missing = declared.filter((ruleId) => !registered.has(ruleId));

    expect(missing, `Unregistered rules: ${missing.join(", ")}`).toHaveLength(0);
    expect(declared).toHaveLength(28);
  });

  it("registers each rule exactly once", () => {
    const ids = getRegisteredRuleIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every rule at least one transaction type to apply to", () => {
    for (const rule of getAllRules()) {
      expect(rule.appliesTo.length, rule.ruleId).toBeGreaterThan(0);
    }
  });

  it("covers every transaction type with at least one rule", () => {
    // An unguarded transaction type would accept anything.
    for (const transactionType of Object.values(TransactionType)) {
      const applicable = getAllRules().filter((rule) =>
        rule.appliesTo.includes(transactionType),
      );
      expect(applicable.length, transactionType).toBeGreaterThan(0);
    }
  });

  it("uses a localization key for every message it can emit", () => {
    // A rule returning a bare sentence would be untranslatable, and section
    // 18.4 forbids showing the learner an unexplained rejection.
    const result = evaluateRules(commands.createBatch(), {
      ...registries,
      state: createEmptyDomainState(),
      ...contextFor(ActorId.PRODUCER_MANAGER),
    });
    for (const outcome of result.results) {
      expect(outcome.messageKey, outcome.ruleId).toMatch(/^validation\./);
    }
  });

  it("drops results that do not apply, so the learner sees only relevant rules", () => {
    const result = evaluateRules(commands.createBatch(), {
      ...registries,
      state: createEmptyDomainState(),
      ...contextFor(ActorId.PRODUCER_MANAGER),
    });
    expect(
      result.results.some((outcome) => outcome.status === ValidationStatus.NOT_APPLICABLE),
    ).toBe(false);
  });

  it("reports every failure rather than stopping at the first", () => {
    const result = evaluateRules(
      commands.createBatch({
        quantity: -5,
        producerOrganizationId: "ORG_LOGISTICS_PROVIDER",
      }),
      {
        ...registries,
        state: createEmptyDomainState(),
        ...contextFor(ActorId.PRODUCER_MANAGER),
      },
    );

    expect(result.isValid).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(2);
  });
});

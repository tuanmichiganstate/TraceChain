import { describe, expect, it } from "vitest";
import type {
  RecallBatchCommand,
  RecordCorrectionCommand,
  SupplyChainCommand,
} from "../commands/commands";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { SimulatedLedger } from "../ledger/ledger-engine";
import {
  ContractLedgerDriver,
  orderedTransactions,
} from "./contract-helpers";
import { applyScenarioSeed } from "./seed-replay";
import { validateScenario } from "./validate-scenario";
import type {
  ScenarioDefinition,
  ScenarioTrustedContext,
} from "../types/scenario";
import {
  TransactionStatus,
  TransactionType,
} from "../types/enums";
import { allScorableItems } from "../types/scenario";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import { challengeAScenario } from "../../scenarios/challenge-a/scenario";

const scenarios = [
  ["guided", coffeeScenario],
  ["challenge-a", challengeAScenario],
] as const;

function registries(scenario: ScenarioDefinition) {
  return {
    organizationsById: Object.fromEntries(
      scenario.organizations.map((organization) => [
        organization.organizationId,
        organization,
      ]),
    ),
    actorsById: Object.fromEntries(
      scenario.actors.map((actor) => [actor.actorId, actor]),
    ),
  };
}

function command(
  scenario: ScenarioDefinition,
  actionId: string,
): SupplyChainCommand {
  const value = scenario.runtime.learnerCommandTemplates[actionId];
  if (value === undefined) throw new Error(`Missing command ${actionId}`);
  return structuredClone(value);
}

function commandContext(
  scenario: ScenarioDefinition,
  actionId: string,
): ScenarioTrustedContext {
  const contextId = scenario.runtime.commandContextByAction[actionId];
  const context = scenario.runtime.trustedContexts.find(
    (candidate) => candidate.contextId === contextId,
  );
  if (context === undefined) throw new Error(`Missing context ${actionId}`);
  return context;
}

function asLedgerContext(context: ScenarioTrustedContext) {
  return {
    actorId: context.actorId,
    organizationId: context.organizationId,
  };
}

describe.each(scenarios)("%s scenario through the shared core", (_name, scenario) => {
  it("passes the same schema and exact 100-point contract", () => {
    expect(validateScenario(scenario).isValid).toBe(true);
    expect(
      allScorableItems(scenario).reduce(
        (total, item) => total + item.points,
        0,
      ),
    ).toBe(100);
  });

  it("completes the authored transaction path without React or SCORM", () => {
    const validationRegistries = registries(scenario);
    const initial = applyScenarioSeed(
      scenario,
      sha256Hex,
      validationRegistries,
    ).state;
    const driver = new ContractLedgerDriver(
      initial,
      scenario,
      new SimulatedLedger(sha256Hex, scenario.ledgerConfiguration),
      validationRegistries,
    );
    const submit = (actionId: string, value = command(scenario, actionId)) =>
      driver.submitAndCommit(
        value,
        asLedgerContext(commandContext(scenario, actionId)),
      );

    submit("CREATE_BATCH");
    submit(
      "ANCHOR_CERTIFICATE",
      scenario.runtime.mitigationCommandTemplates?.["ANCHOR_CERTIFICATE"] ??
        command(scenario, "ANCHOR_CERTIFICATE"),
    );
    submit("ISSUE_CERTIFICATE");
    submit("TRANSFER_CUSTODY");
    submit("RECORD_TRANSPORT");
    submit("RECEIVE_BATCH");
    submit("PURCHASE_ON_RECEIPT");

    const manifest = orderedTransactions(driver.state()).find(
      (transaction) =>
        transaction.transactionType === TransactionType.ANCHOR_DOCUMENT &&
        transaction.transactionStatus === TransactionStatus.COMMITTED &&
        (transaction.commandPayload as { readonly documentType?: string })
          .documentType === "SHIPPING_MANIFEST",
    );
    if (manifest === undefined) throw new Error("Manifest was not scripted");
    const correction = command(
      scenario,
      "RECORD_CORRECTION",
    ) as RecordCorrectionCommand;
    submit("RECORD_CORRECTION", {
      ...correction,
      correctionOfTransactionId: manifest.transactionId,
      reason: "Authored bounded reason",
    });
    submit("TRANSFORM_BATCH");
    submit("PACKAGE_BATCH");
    submit("TRANSFER_OWNERSHIP");
    submit("DISPATCH_BATCH");

    const recallCheck = scenario.stages
      .flatMap((stage) => stage.knowledgeChecks)
      .find(
        (candidate) => candidate.knowledgeCheckId === "INT_RECALL_SCOPE",
      );
    if (recallCheck === undefined) throw new Error("Recall check is missing");
    const recall = command(scenario, "RECALL_BATCH") as RecallBatchCommand;
    submit("RECALL_BATCH", {
      ...recall,
      selectedAssetIds: recallCheck.correctOptionIds,
    });

    expect(
      orderedTransactions(driver.state()).filter(
        (transaction) =>
          transaction.transactionStatus === TransactionStatus.COMMITTED,
      ).length,
    ).toBeGreaterThan(10);
  });
});

describe("Challenge A curation", () => {
  it("changes identifiers, quantities, evidence, cause, and recall origin", () => {
    expect(challengeAScenario.scenarioId).not.toBe(coffeeScenario.scenarioId);
    expect(challengeAScenario.runtime.assetRoles.sourceBatchId).toContain(
      "CA01",
    );
    expect(
      (
        challengeAScenario.runtime.learnerCommandTemplates[
          "CREATE_BATCH"
        ] as { readonly quantity: number }
      ).quantity,
    ).toBe(120);
    expect(
      challengeAScenario.runtime.consequentialCases.certificate
        .issuerAssessment,
    ).toBe("UNRECOGNIZED");
    expect(
      challengeAScenario.runtime.consequentialCases.discrepancy
        .authoredCauseCode,
    ).toBe("UNKNOWN");
    expect(challengeAScenario.runtime.assetRoles.recallSourceAssetId).toBe(
      challengeAScenario.runtime.assetRoles.primaryPackagedLotId,
    );
  });
});

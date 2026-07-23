import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateBatchCommand } from "../domain/commands/commands";
import {
  commandContext,
  runtimeCommand,
} from "../domain/scenario/runtime";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { TransactionAction } from "./transaction-action";

const simulationMocks = vi.hoisted(() => ({
  submitCommand: vi.fn(),
  sealPendingBlock: vi.fn(),
}));

vi.mock("../app/providers/simulation-provider", () => ({
  useSimulation: () => ({
    state: {
      decisions: {},
      domain: {
        transactionOrder: [],
        transactionsById: {},
      },
      isReadOnly: false,
    },
    submitCommand: simulationMocks.submitCommand,
    sealPendingBlock: simulationMocks.sealPendingBlock,
  }),
}));

vi.mock("../app/providers/locale-provider", () => ({
  useTranslator: () => (key: string) => key,
}));

vi.mock("../app/providers/scenario-provider", () => ({
  useScenario: () => ({ scenario: { organizations: [] } }),
}));

describe("transaction submission failures", () => {
  beforeEach(() => {
    simulationMocks.submitCommand.mockReset();
    simulationMocks.sealPendingBlock.mockReset();
  });

  it("shows a recoverable error instead of failing silently", async () => {
    simulationMocks.submitCommand.mockRejectedValue(
      new Error("prospective persistence failed"),
    );
    const command = runtimeCommand<CreateBatchCommand>(
      coffeeScenario,
      "CREATE_BATCH",
    );
    const user = userEvent.setup();

    render(
      <TransactionAction
        decisionId="INT_CREATE_BATCH"
        actionId="CREATE_BATCH"
        labelKey="stage.createBatch.action"
        summary={[]}
        buildCommand={() => command}
        context={commandContext(coffeeScenario, "CREATE_BATCH")}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "transaction.submit" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "transaction.submissionFailed",
    );
    expect(
      screen.getByRole("button", { name: "transaction.submit" }),
    ).toBeEnabled();
  });
});

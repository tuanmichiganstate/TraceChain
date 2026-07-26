import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateBatchCommand } from "../domain/commands/commands";
import {
  TransactionStatus,
  TransactionType,
} from "../domain/types/enums";
import type { LedgerTransaction } from "../domain/types/models";
import {
  commandContext,
  runtimeCommand,
} from "../domain/scenario/runtime";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { TransactionAction } from "./transaction-action";

const simulationMocks = vi.hoisted(() => ({
  submitCommand: vi.fn(),
  sealPendingBlock: vi.fn(),
  state: {
    decisions: {},
    domain: {
      transactionOrder: [] as string[],
      transactionsById: {} as Record<string, LedgerTransaction>,
    },
    isReadOnly: false,
  },
}));

vi.mock("../app/providers/simulation-provider", () => ({
  useSimulation: () => ({
    state: simulationMocks.state,
    submitCommand: simulationMocks.submitCommand,
    sealPendingBlock: simulationMocks.sealPendingBlock,
  }),
}));

vi.mock("../app/providers/locale-provider", () => ({
  useTranslator: () => (key: string) => key,
}));

vi.mock("../app/providers/scenario-provider", () => ({
  useScenario: () => ({
    scenario: {
      organizations: [],
      runtime: {
        commandContextByAction: {
          CREATE_BATCH: "CTX_PRODUCER",
        },
        trustedContexts: [
          {
            contextId: "CTX_PRODUCER",
            actorId: "ACT_PRODUCER_MANAGER",
            organizationId: "ORG_PRODUCER_COOP",
            roleId: "PRODUCER_MANAGER",
          },
        ],
      },
    },
  }),
}));

describe("transaction submission failures", () => {
  beforeEach(() => {
    simulationMocks.submitCommand.mockReset();
    simulationMocks.sealPendingBlock.mockReset();
    simulationMocks.state.domain.transactionOrder = [];
    simulationMocks.state.domain.transactionsById = {};
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

  it("shows processing state and prevents duplicate clicks", async () => {
    let rejectSubmission = (_reason: Error): void => {
      throw new Error("Submission promise was not initialized");
    };
    simulationMocks.submitCommand.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSubmission = reject;
        }),
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
    const processing = screen.getByRole("button", {
      name: "action.processing",
    });
    expect(processing).toBeDisabled();
    await user.click(processing);
    expect(simulationMocks.submitCommand).toHaveBeenCalledTimes(1);

    rejectSubmission(new Error("test completion"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "transaction.submissionFailed",
    );
  });

  it("replaces the ordered receipt with authoritative committed state", async () => {
    const ordered = transaction(TransactionStatus.ORDERED);
    simulationMocks.submitCommand.mockResolvedValue({
      isAccepted: true,
      transaction: ordered,
      auditEvent: null,
    });
    const command = runtimeCommand<CreateBatchCommand>(
      coffeeScenario,
      "CREATE_BATCH",
    );
    const user = userEvent.setup();
    const action = (): React.ReactNode => (
      <TransactionAction
        decisionId="INT_CREATE_BATCH"
        actionId="CREATE_BATCH"
        labelKey="stage.createBatch.action"
        summary={[]}
        buildCommand={() => command}
        context={commandContext(coffeeScenario, "CREATE_BATCH")}
      />
    );
    const view = render(action());

    await user.click(
      screen.getByRole("button", { name: "transaction.submit" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "stage.createBatch.sealBlock",
      }),
    ).toBeInTheDocument();

    simulationMocks.state.domain.transactionOrder = [
      ordered.transactionId,
    ];
    simulationMocks.state.domain.transactionsById = {
      [ordered.transactionId]: {
        ...ordered,
        transactionStatus: TransactionStatus.COMMITTED,
        blockId: "BLK_000001",
      },
    };
    view.rerender(action());

    expect(
      screen.getByText("pipeline.announceCommitted"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "stage.createBatch.sealBlock",
      }),
    ).toBeNull();
  });
});

function transaction(
  transactionStatus: TransactionStatus,
): LedgerTransaction {
  return {
    transactionId: "TX_000001",
    transactionType: TransactionType.CREATE_BATCH,
    transactionStatus,
    commandPayload: {},
    proposedByActorId: "ACT_PRODUCER_MANAGER",
    proposedByOrganizationId: "ORG_PRODUCER_COOP",
    simulatedSignature: {
      signatureId: "SIG_000001",
      signedByActorId: "ACT_PRODUCER_MANAGER",
      signedByOrganizationId: "ORG_PRODUCER_COOP",
      signedAt: "2026-01-01T00:00:00.000Z",
      signedPayloadHash: "hash",
      signatureType: "EDUCATIONAL_SIMULATION",
    },
    validationResults: [],
    endorsementResults: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

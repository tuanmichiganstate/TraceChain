import { describe, expect, it } from "vitest";
import {
  ACT_PRODUCER_MANAGER,
  ORG_PRODUCER_COOP,
  createEmptyDomainState,
  makeCreateBatchCommand,
  makeValidationContext,
} from "../../../test/support/domain-fixtures";
import { sha256Hex } from "../../infrastructure/hashing/sha256";
import { SimulatedLedger } from "../ledger/ledger-engine";
import {
  FixedClock,
  SeededRandomSource,
  SequenceIdGenerator,
  type SimulationEnvironment,
} from "./environment";
import {
  createSimulationRuntimeState,
  handleSimulationCommand,
} from "./command-handler";
import type { DomainSimulationCommand, TrustedExecutionContext } from "./types";

const trustedContext: TrustedExecutionContext = {
  contextId: "CTX_PRODUCER",
  actorId: ACT_PRODUCER_MANAGER,
  organizationId: ORG_PRODUCER_COOP,
  roleId: "PRODUCER_MANAGER",
};

function environment(): SimulationEnvironment {
  return {
    clock: new FixedClock("2025-12-10T02:00:00.000Z"),
    random: new SeededRandomSource("guided-standard-v1"),
    ids: new SequenceIdGenerator(),
  };
}

function submitted(
  overrides: Partial<DomainSimulationCommand["metadata"]> = {},
): DomainSimulationCommand {
  return {
    metadata: {
      commandId: "CMD_000001",
      sessionId: "SES_000001",
      actorId: trustedContext.actorId,
      organizationId: trustedContext.organizationId,
      roleId: trustedContext.roleId,
      submittedAt: "2025-12-10T02:00:00.000Z",
      expectedStateVersions: {},
      ...overrides,
    },
    payload: makeCreateBatchCommand(),
  };
}

function execute(
  runtime = createSimulationRuntimeState(createEmptyDomainState()),
  command = submitted(),
  context = trustedContext,
  env = environment(),
) {
  return handleSimulationCommand({
    runtime,
    command,
    trustedContext: context,
    ledger: new SimulatedLedger(sha256Hex),
    registries: makeValidationContext(),
    environment: env,
  });
}

describe("simulation command boundary", () => {
  it("retains actor and organization context on accepted events", () => {
    const result = execute();
    expect(result.isAccepted).toBe(true);
    expect(result.state.acceptedEvents[0]).toMatchObject({
      kind: "LEDGER_MUTATION",
      commandId: "CMD_000001",
      sessionId: "SES_000001",
      actorId: ACT_PRODUCER_MANAGER,
      organizationId: ORG_PRODUCER_COOP,
      roleId: "PRODUCER_MANAGER",
      assetVersionTransitions: [
        {
          assetId: "BAT_GREEN_COFFEE_001",
          previousVersion: null,
          newVersion: 1,
        },
      ],
    });
  });

  it("records a context mismatch only as an audit event", () => {
    const result = execute(
      undefined,
      submitted({ organizationId: "ORG_UNTRUSTED" }),
    );
    expect(result.isAccepted).toBe(false);
    expect(result.state.domain).toEqual(createEmptyDomainState());
    expect(result.state.acceptedEvents).toEqual([]);
    expect(result.state.attemptAuditEvents).toHaveLength(1);
    expect(result.state.attemptAuditEvents[0]?.validationFailures[0]?.code).toBe(
      "TRUSTED_CONTEXT_MISMATCH",
    );
  });

  it("regenerates one stable outcome for duplicate delivery", () => {
    const env = environment();
    const first = execute(undefined, submitted(), trustedContext, env);
    const duplicate = execute(first.state, submitted(), trustedContext, env);
    expect(duplicate).toMatchObject(
      first.state.outcomesByCommandId["CMD_000001"] as object,
    );
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.state.acceptedEvents).toHaveLength(1);
    expect(duplicate.state.domain.transactionOrder).toEqual(["TX_000001"]);
  });

  it("rejects a stale expected version without invoking the ledger", () => {
    const created = execute();
    const stale = execute(
      created.state,
      {
        metadata: {
          ...submitted().metadata,
          commandId: "CMD_000002",
          expectedStateVersions: { BAT_GREEN_COFFEE_001: 0 },
        },
        payload: {
          ...makeCreateBatchCommand(),
          commandType: "TRANSFER_CUSTODY",
          assetId: "BAT_GREEN_COFFEE_001",
          fromOrganizationId: ORG_PRODUCER_COOP,
          toOrganizationId: "ORG_LOGISTICS_PROVIDER",
          toLocationId: "LOC_TRANSIT_STATION",
          alsoTransfersOwnership: false,
        },
      } as DomainSimulationCommand,
    );
    expect(stale.isAccepted).toBe(false);
    expect(stale.state.domain.transactionOrder).toEqual(["TX_000001"]);
    expect(stale.state.attemptAuditEvents[0]?.validationFailures[0]?.code).toBe(
      "STALE_STATE_VERSION",
    );
  });
});

describe("deterministic environment services", () => {
  it("produces the same random sequence from the same seed", () => {
    const left = new SeededRandomSource("challenge-a-v1");
    const right = new SeededRandomSource("challenge-a-v1");
    expect([left.next(), left.next(), left.next()]).toEqual([
      right.next(),
      right.next(),
      right.next(),
    ]);
  });

  it("produces deterministic prefixed identifiers", () => {
    const ids = new SequenceIdGenerator(7);
    expect(ids.nextId("CMD")).toBe("CMD_000007");
    expect(ids.nextId("CMD")).toBe("CMD_000008");
  });
});

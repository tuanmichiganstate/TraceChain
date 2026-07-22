import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type React from "react";
import { CorrectionLineage } from "./correction-lineage";
import { LocaleProvider } from "../app/providers/locale-provider";
import { SimulatedLedger, type LedgerConfiguration } from "../domain/ledger/ledger-engine";
import { createEmptyDomainState, type DomainState } from "../domain/ledger/domain-state";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { DocumentType, QuantityUnit, TransactionType } from "../domain/types/enums";
import type { CorrectionTarget, CorrectionValue } from "../domain/types/correction";
import type {
  AnchorDocumentCommand,
  CommandContext,
  RecordCorrectionCommand,
} from "../domain/commands/commands";
import type { ValidationRegistries } from "../domain/rules/types";
import {
  actors,
  makeCreateBatchCommand,
  organizations,
  ORG_PRODUCER_COOP,
} from "../../test/support/domain-fixtures";

/**
 * The lineage panel is the one place the ledger record and the value in use are
 * shown disagreeing, so what it renders against each step has to be exactly the
 * value that step established -- not the final one, which is indistinguishable
 * while there is only ever one correction and wrong as soon as there are two.
 */

const immediate: LedgerConfiguration = {
  maxTransactionsPerBlock: 2,
  blockCommitMode: "IMMEDIATE",
  orderingServiceId: "ORDERER_SIMULATED_001",
};

const producer: CommandContext = {
  actorId: "ACT_PRODUCER_MANAGER",
  organizationId: ORG_PRODUCER_COOP,
};

const registries: ValidationRegistries = {
  organizationsById: {
    ...organizations,
    [ORG_PRODUCER_COOP]: {
      ...organizations[ORG_PRODUCER_COOP]!,
      authorizedActions: [
        ...organizations[ORG_PRODUCER_COOP]!.authorizedActions,
        TransactionType.ANCHOR_DOCUMENT,
        TransactionType.RECORD_CORRECTION,
      ],
    },
  },
  actorsById: actors,
};

const DOCUMENT_ANCHOR_ID = "DOC_MANIFEST_TEST_001";

const q = (amount: number): Extract<CorrectionValue, { kind: "QUANTITY" }> => ({
  kind: "QUANTITY",
  amount,
  unit: QuantityUnit.KG,
});

const target: CorrectionTarget = {
  kind: "DOCUMENT_METADATA_FIELD",
  documentAnchorId: DOCUMENT_ANCHOR_ID,
  field: "declaredQuantity",
};

function manifestCommand(): AnchorDocumentCommand {
  return {
    commandType: TransactionType.ANCHOR_DOCUMENT,
    assetId: "BAT_GREEN_COFFEE_001",
    documentAnchorId: DOCUMENT_ANCHOR_ID,
    documentType: DocumentType.SHIPPING_MANIFEST,
    fileName: "shipping-manifest-test.pdf",
    contentHash: sha256Hex("shipping manifest test content"),
    metadata: { kind: DocumentType.SHIPPING_MANIFEST, declaredQuantity: q(1000) },
    issuerOrganizationId: ORG_PRODUCER_COOP,
    issuedAt: "2026-06-15T10:00:00.000Z",
    initiatedByActorId: producer.actorId,
    scenarioTimestamp: "2026-06-15T10:00:00.000Z",
  };
}

function correctionCommand(
  incorrectValue: CorrectionValue,
  correctedValue: CorrectionValue,
  scenarioTimestamp: string,
): RecordCorrectionCommand {
  return {
    commandType: TransactionType.RECORD_CORRECTION,
    assetId: "BAT_GREEN_COFFEE_001",
    correctionOfTransactionId: "TX_000002",
    target,
    incorrectValue,
    correctedValue,
    reason: "Physical reweigh confirmed the declared quantity",
    initiatedByActorId: producer.actorId,
    scenarioTimestamp,
  };
}

function submit(
  ledger: SimulatedLedger,
  state: DomainState,
  command: Parameters<SimulatedLedger["submitCommand"]>[1],
): DomainState {
  const result = ledger.submitCommand(state, command, producer, registries);
  expect(result.validation.failures).toEqual([]);
  return result.state;
}

/** A committed manifest declaring 1000 kg, plus `corrections` applied in order. */
function stateWithCorrections(...corrections: ReadonlyArray<readonly [number, number]>): DomainState {
  const ledger = new SimulatedLedger(sha256Hex, immediate);
  let state = submit(ledger, createEmptyDomainState(), makeCreateBatchCommand());
  state = submit(ledger, state, manifestCommand());
  corrections.forEach(([from, to], index) => {
    state = submit(
      ledger,
      state,
      correctionCommand(q(from), q(to), `2026-06-17T0${index + 3}:00:00.000Z`),
    );
  });
  return state;
}

/** A correction the rules refuse: it misstates the value it claims to replace. */
function stateWithRejectedCorrection(): DomainState {
  const ledger = new SimulatedLedger(sha256Hex, immediate);
  let state = submit(ledger, createEmptyDomainState(), makeCreateBatchCommand());
  state = submit(ledger, state, manifestCommand());
  const rejected = ledger.submitCommand(
    state,
    correctionCommand(q(999), q(100), "2026-06-17T03:00:00.000Z"),
    producer,
    registries,
  );
  expect(rejected.isAccepted).toBe(false);
  return rejected.state;
}

function renderLineage(state: DomainState, lineageTarget: CorrectionTarget = target): void {
  const element: React.ReactElement = (
    <LocaleProvider>
      <CorrectionLineage state={state} target={lineageTarget} />
    </LocaleProvider>
  );
  render(element);
}

function stepValues(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".lineage__value")?.textContent?.trim() ?? "");
}

describe("the correction lineage panel", () => {
  it("shows the original value, the correction, and the effective value", () => {
    renderLineage(stateWithCorrections([1000, 100]));

    expect(stepValues()).toEqual(["1000 kg", "100 kg", "100 kg"]);
    expect(screen.getByText(/Vận đơn gốc không bị sửa/)).toBeInTheDocument();
  });

  it("gives each correction in a chain the value that correction established", () => {
    // 1000 -> 100 -> 105. The middle step is the one a naive implementation
    // gets wrong, by rendering the final effective value against every step.
    renderLineage(stateWithCorrections([1000, 100], [100, 105]));

    expect(stepValues()).toEqual(["1000 kg", "100 kg", "105 kg", "105 kg"]);
  });

  it("names the transaction each value was recorded in", () => {
    renderLineage(stateWithCorrections([1000, 100], [100, 105]));

    const sources = screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".lineage__source")?.textContent ?? "");
    // Original, then one per correction; the effective step is a derived value
    // and belongs to no single transaction, so it names none.
    expect(sources.filter((text) => text.includes("TX_")).length).toBe(3);
  });

  it("says the original figure is still in use when nothing has corrected it", () => {
    renderLineage(stateWithCorrections());

    expect(stepValues()).toEqual(["1000 kg", "1000 kg"]);
    expect(screen.getByText(/Chưa có giao dịch điều chỉnh nào/)).toBeInTheDocument();
    // The conclusion is about a correction having been appended; with none, it
    // would be describing something that did not happen.
    expect(screen.queryByText(/Vận đơn gốc không bị sửa/)).not.toBeInTheDocument();
  });

  it("ignores a correction the rules rejected", () => {
    // The rejected attempt is on the ledger -- the learner must be able to see
    // why it failed -- but it changed nothing, so the lineage must not present
    // it as a step in the chain.
    renderLineage(stateWithRejectedCorrection());

    expect(stepValues()).toEqual(["1000 kg", "1000 kg"]);
    expect(screen.getByText(/Chưa có giao dịch điều chỉnh nào/)).toBeInTheDocument();
  });

  it("renders nothing when the target resolves to no committed value", () => {
    const { container } = render(
      <LocaleProvider>
        <CorrectionLineage
          state={stateWithCorrections()}
          target={{
            kind: "DOCUMENT_METADATA_FIELD",
            documentAnchorId: "DOC_DOES_NOT_EXIST",
            field: "declaredQuantity",
          }}
        />
      </LocaleProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not strike through the superseded value", () => {
    // Rendering the original as deleted text would assert the opposite of the
    // lesson: it is still on the ledger, unaltered and readable forever.
    renderLineage(stateWithCorrections([1000, 100]));

    const original = screen.getAllByRole("listitem")[0] as HTMLElement;
    expect(within(original).queryByText("1000 kg")).toBeInTheDocument();
    expect(original.querySelector("del, s, strike")).toBeNull();
  });
});

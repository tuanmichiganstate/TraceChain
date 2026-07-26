import { describe, expect, it } from "vitest";
import { notificationForPersistedAction } from "./action-notifications";

describe("persisted action notification mapping", () => {
  it("uses warning semantics for an accepted decision with unresolved risk", () => {
    expect(
      notificationForPersistedAction({
        kind: "DECISION_RECORDED",
        operationId: "CMD_1",
        outcome: "RISK_REMAINS",
      }),
    ).toMatchObject({
      tone: "warning",
      sourceCommandId: "CMD_1",
      titleKey: "notification.decisionRisk.title",
    });
  });

  it("uses a polite domain-error notification for a rejected attempt", () => {
    expect(
      notificationForPersistedAction({
        kind: "TRANSACTION_RESULT",
        operationId: "CMD_2",
        accepted: false,
        reasonKey: "validation.appendOnlyRequired",
      }),
    ).toMatchObject({
      tone: "error",
      messageKey: "validation.appendOnlyRequired",
      autoDismissMs: 8_000,
    });
  });

  it("distinguishes pending and satisfied endorsements", () => {
    const pending = notificationForPersistedAction({
      kind: "ENDORSEMENT_RECORDED",
      operationId: "CMD_3",
      accepted: true,
      satisfied: false,
      missingOrganization: "Processor",
    });
    const satisfied = notificationForPersistedAction({
      kind: "ENDORSEMENT_RECORDED",
      operationId: "CMD_4",
      accepted: true,
      satisfied: true,
    });

    expect(pending).toMatchObject({
      tone: "info",
      interpolation: { organization: "Processor" },
    });
    expect(satisfied).toMatchObject({
      tone: "success",
      titleKey: "notification.endorsementSatisfied.title",
    });
  });

  it("returns no notification for unsupported results", () => {
    expect(
      notificationForPersistedAction({
        kind: "UNSUPPORTED",
        operationId: "NO_NOTICE",
      }),
    ).toBeNull();
  });
});

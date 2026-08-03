import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import packJson from "../../../scenario-packs/guided-coffee-audit/simuledger.pack.json";
import challengePackJson from "../../../scenario-packs/challenge-coffee-audit/simuledger.pack.json";
import { LocaleProvider } from "../../app/providers/locale-provider";
import { hashConfiguration } from "../../config/hash";
import {
  AUDIT_CHALLENGE_PRESET,
  AUDIT_GUIDED_PRESET,
} from "../../config/presets";
import type { AuditRuntimePackage } from "../../config/audit-runtime-loader";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import { AuditScormApp } from "./audit-scorm-app";
import { inspectTa2AuditStoredHeader } from "../../infrastructure/persistence/ta2-audit-codec";

function runtime(): AuditRuntimePackage {
  const validation = validateScenarioPack(structuredClone(packJson));
  if (!validation.isValid) {
    throw new Error("Guided Audit fixture is invalid.");
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "SIMULEDGER_PACKAGE_GENERATOR",
  }) as ScenarioPackV2;
  const scenario = pack.scenarios[0]!;
  return {
    configuration: AUDIT_GUIDED_PRESET,
    configurationHash: hashConfiguration(AUDIT_GUIDED_PRESET),
    pack,
    scenario,
    auditCase: scenario.auditCase!,
    variantBank: null,
  };
}

function challengeRuntime(): AuditRuntimePackage {
  const validation = validateScenarioPack(
    structuredClone(challengePackJson),
  );
  if (!validation.isValid) {
    throw new Error("Audit Challenge fixture is invalid.");
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "SIMULEDGER_PACKAGE_GENERATOR",
  }) as ScenarioPackV2;
  const variantBank = pack.auditVariantBanks[0]!;
  const representative = variantBank.variants[0]!;
  const scenario = pack.scenarios.find(
    (candidate) =>
      candidate.scenarioId === representative.scenarioId &&
      candidate.version === representative.scenarioVersion,
  )!;
  return {
    configuration: AUDIT_CHALLENGE_PRESET,
    configurationHash: hashConfiguration(AUDIT_CHALLENGE_PRESET),
    pack,
    scenario,
    auditCase: scenario.auditCase!,
    variantBank,
  };
}

function storedTa2(): string {
  for (const raw of Object.values(localStorage)) {
    const parsed = JSON.parse(raw) as { readonly encodedState?: unknown };
    if (
      typeof parsed.encodedState === "string" &&
      parsed.encodedState.startsWith("TA2.")
    ) {
      return parsed.encodedState;
    }
  }
  throw new Error("No TA2 snapshot was persisted.");
}

function renderApp(configured: AuditRuntimePackage) {
  return render(
    <LocaleProvider locale="en">
      <AuditScormApp runtime={configured} />
    </LocaleProvider>,
  );
}

describe("AuditScormApp", () => {
  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(window, "API");
  });

  it("durably stores a TA2 command before publishing it and resumes by replay", async () => {
    const user = userEvent.setup();
    const configured = runtime();
    const first = renderApp(configured);
    const review = await screen.findByRole("button", {
      name: "Record scope review",
    });

    expect(review).toBeEnabled();
    await user.click(review);
    await waitFor(() => expect(review).toBeDisabled());

    const stored = Object.values(localStorage).find((value) =>
      value.includes("TA2."),
    );
    expect(stored).toContain("TA2.");

    first.unmount();
    renderApp(configured);
    expect(
      await screen.findByRole("button", {
        name: "Record scope review",
      }),
    ).toBeDisabled();
  });

  it("persists one Audit Challenge assignment before reveal and resumes the exact case", async () => {
    const configured = challengeRuntime();
    const first = renderApp(configured);

    expect(
      await screen.findByRole("button", {
        name: "Record scope review",
      }),
    ).toBeEnabled();
    const firstHeader = inspectTa2AuditStoredHeader(storedTa2());
    expect(firstHeader.assignment).not.toBeNull();
    expect(
      await screen.findByText(
        configured.variantBank!.variants[
          firstHeader.assignment!.variantIndex
        ]!.caseReference,
      ),
    ).toBeVisible();

    first.unmount();
    renderApp(configured);
    expect(
      await screen.findByRole("button", {
        name: "Record scope review",
      }),
    ).toBeEnabled();
    expect(inspectTa2AuditStoredHeader(storedTa2())).toEqual(
      firstHeader,
    );
  });
});

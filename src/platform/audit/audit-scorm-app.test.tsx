import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import packJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import { LocaleProvider } from "../../app/providers/locale-provider";
import { hashConfiguration } from "../../config/hash";
import { AUDIT_GUIDED_PRESET } from "../../config/presets";
import type { AuditRuntimePackage } from "../../config/audit-runtime-loader";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { publishScenarioPack } from "../scenario-packs/publication";
import { validateScenarioPack } from "../scenario-packs/validation";
import { AuditScormApp } from "./audit-scorm-app";

function runtime(): AuditRuntimePackage {
  const validation = validateScenarioPack(structuredClone(packJson));
  if (!validation.isValid) {
    throw new Error("Guided Audit fixture is invalid.");
  }
  const pack = publishScenarioPack(validation.pack, {
    publishedAt: "2026-07-27T03:00:00.000Z",
    publishedBy: "TRACECHAIN_PACKAGE_GENERATOR",
  }) as ScenarioPackV1;
  const scenario = pack.scenarios[0]!;
  return {
    configuration: AUDIT_GUIDED_PRESET,
    configurationHash: hashConfiguration(AUDIT_GUIDED_PRESET),
    pack,
    scenario,
    auditCase: scenario.auditCase!,
  };
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

  it("durably stores a TA1 command before publishing it and resumes by replay", async () => {
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
      value.includes("TA1."),
    );
    expect(stored).toContain("TA1.");

    first.unmount();
    renderApp(configured);
    expect(
      await screen.findByRole("button", {
        name: "Record scope review",
      }),
    ).toBeDisabled();
  });
});

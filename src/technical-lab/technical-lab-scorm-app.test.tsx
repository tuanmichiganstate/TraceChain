import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "../app/providers/locale-provider";
import { NotificationProvider } from "../app/providers/notification-provider";
import { hashConfiguration } from "../config/hash";
import { TECHNICAL_LAB_PRESET } from "../config/presets";
import type { TechnicalLabRuntimePackage } from "../config/technical-lab-runtime-loader";
import {
  inspectTl1TechnicalLabStoredHeader,
  technicalLabBundleContentHash,
} from "../infrastructure/persistence/tl1-technical-lab-codec";
import { technicalLabCryptographicRuntime } from "./cryptographic-runtime";
import { permissionedFoundationsLabBundle } from "./permissioned-foundations-pack";
import { TechnicalLabScormApp } from "./technical-lab-scorm-app";

function runtime(): TechnicalLabRuntimePackage {
  return {
    configuration: TECHNICAL_LAB_PRESET,
    configurationHash: hashConfiguration(
      TECHNICAL_LAB_PRESET,
    ),
    bundle: permissionedFoundationsLabBundle,
    cryptographicRuntime: technicalLabCryptographicRuntime,
  };
}

function renderApp() {
  return render(
    <LocaleProvider locale="en">
      <NotificationProvider>
        <TechnicalLabScormApp runtime={runtime()} />
      </NotificationProvider>
    </LocaleProvider>,
  );
}

function storedTl1(): string {
  for (const raw of Object.values(localStorage)) {
    const parsed = JSON.parse(raw) as {
      readonly encodedState?: unknown;
    };
    if (
      typeof parsed.encodedState === "string" &&
      parsed.encodedState.startsWith("TL1.")
    ) {
      return parsed.encodedState;
    }
  }
  throw new Error("No TL1 snapshot was persisted.");
}

describe("TechnicalLabScormApp", () => {
  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(window, "API");
  });

  it("persists a genuine laboratory action before publishing its next step", async () => {
    const user = userEvent.setup();
    renderApp();
    const inspect = await screen.findByRole("button", {
      name: "Run: inspect the authored input",
    });

    await user.click(inspect);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Run: compute SHA-256",
        }),
      ).toBeEnabled(),
    );
    expect(storedTl1()).toMatch(/^TL1\./u);
  });

  it("resumes the exact TL1 journal without duplicating the completed action", async () => {
    const user = userEvent.setup();
    const first = renderApp();
    await user.click(
      await screen.findByRole("button", {
        name: "Run: inspect the authored input",
      }),
    );
    await screen.findByRole("button", {
      name: "Run: compute SHA-256",
    });
    const header = inspectTl1TechnicalLabStoredHeader(
      storedTl1(),
    );

    first.unmount();
    renderApp();

    expect(
      await screen.findByRole("button", {
        name: "Run: compute SHA-256",
      }),
    ).toBeEnabled();
    expect(
      inspectTl1TechnicalLabStoredHeader(storedTl1()),
    ).toEqual(header);
  });

  it("starts with technical evidence expanded", async () => {
    renderApp();

    const summary = await screen.findByText(
      "Technical evidence",
    );
    const disclosure = summary.closest("details");
    expect(disclosure).not.toBeNull();
    expect((disclosure as HTMLDetailsElement).open).toBe(true);
  });

  it("does not load standalone progress written before the lab-content hash joined the storage identity", async () => {
    const current = runtime();
    localStorage.setItem(
      `tracechain:${current.configurationHash}:${current.bundle.pack.labPackId}`,
      JSON.stringify({
        encodedState: "TL1.obsolete.payload",
        location: "TL4",
        score: 50,
        status: "incomplete",
      }),
    );

    renderApp();

    expect(
      await screen.findByRole("button", {
        name: "Run: inspect the authored input",
      }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("heading", {
        name: "Progress cannot be restored",
      }),
    ).not.toBeInTheDocument();
  });

  it("offers a local reset instead of LMS instructions for invalid standalone progress", async () => {
    const current = runtime();
    localStorage.setItem(
      `tracechain:${current.configurationHash}.${technicalLabBundleContentHash(current.bundle)}:${current.bundle.pack.labPackId}`,
      JSON.stringify({
        encodedState: "TL1.invalid.payload",
        location: "TL4",
        score: 50,
        status: "incomplete",
      }),
    );

    renderApp();

    expect(
      await screen.findByRole("heading", {
        name: "Local practice progress cannot be restored",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/use the LMS to begin a new attempt/iu),
    ).not.toBeInTheDocument();
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Reset local practice",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Run: inspect the authored input",
      }),
    ).toBeEnabled();
  });
});

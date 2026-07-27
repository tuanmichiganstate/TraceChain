import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "../app/providers/locale-provider";
import { NotificationProvider } from "../app/providers/notification-provider";
import { WorkspaceArchitecturePrototypeScreen } from "./workspace-architecture-prototype-screen";

function renderPrototype(): void {
  render(
    <LocaleProvider locale="en">
      <NotificationProvider>
        <WorkspaceArchitecturePrototypeScreen />
      </NotificationProvider>
    </LocaleProvider>,
  );
}

describe("workspace architecture benchmark screen", () => {
  it("exposes all eight benchmarks one at a time", async () => {
    const user = userEvent.setup();
    renderPrototype();

    expect(
      screen.getByRole("heading", { name: "Verify the quality certificate" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: /Practice|Audit|Blockchain|Mobile/u,
      }),
    ).toHaveLength(8);

    await user.click(
      screen.getByRole("button", { name: "Audit ledger investigation" }),
    );
    expect(
      screen.getByRole("heading", { name: "Investigate ledger evidence" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Verify the quality certificate" }),
    ).not.toBeInTheDocument();
  });

  it("pairs a transient acknowledgement with a persistent decision result", async () => {
    const user = userEvent.setup();
    renderPrototype();

    await user.click(screen.getByRole("button", { name: "Record decision" }));

    expect(
      screen.getByRole("heading", { name: "Lot placed on quality hold" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Decision recorded")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The original evidence and your committed decision remain visible after the submission acknowledgement disappears.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the mobile audit draft when moving between workbench tabs", async () => {
    const user = userEvent.setup();
    renderPrototype();

    await user.click(
      screen.getByRole("button", { name: "Mobile audit finding" }),
    );
    const title = screen.getByRole("textbox", { name: "Finding title" });
    await user.type(title, " retained");
    await user.click(
      screen.getByRole("tab", { name: "Evidence, 2 cited items" }),
    );
    await user.click(
      screen.getByRole("tab", { name: "Findings, Draft in progress" }),
    );

    expect(screen.getByRole("textbox", { name: "Finding title" })).toHaveValue(
      "Incomplete discrepancy investigation retained",
    );
  });
});

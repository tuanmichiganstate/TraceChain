import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CaseWorkspaceTabs,
  InspectorSurface,
  RoleApplicationShell,
} from "./simulation-workspace";
import userEvent from "@testing-library/user-event";

describe("simulation workspace presentation boundaries", () => {
  it("names the professional application and technical inspector as separate regions", () => {
    render(
      <RoleApplicationShell
        eyebrow="Certifier workspace"
        title="Certificate Verification Console"
        description="Review the certificate before committing an action."
        statusLabel="Case status"
        status="Awaiting review"
      >
        <p>Certificate evidence</p>
        <InspectorSurface
          eyebrow="Blockchain inspector"
          title="Transaction evidence"
          description="Inspect the proposal and its validation state."
        >
          <p>Proposal digest</p>
        </InspectorSurface>
      </RoleApplicationShell>,
    );

    expect(
      screen.getByRole("region", {
        name: "Certificate Verification Console",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Transaction evidence" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
  });

  it("keeps case sections mounted while exposing one accessible work panel at a time", async () => {
    const user = userEvent.setup();

    render(
      <CaseWorkspaceTabs
        label="Receiving case"
        initialTabId="overview"
        tabs={[
          {
            id: "overview",
            label: "Overview",
            status: "Complete",
            content: <label>Manifest note<input /></label>,
          },
          {
            id: "investigation",
            label: "Investigation",
            status: "Action required",
            content: <label>Investigation note<input /></label>,
          },
        ]}
      />,
    );

    expect(screen.getByRole("tabpanel", { name: "Overview" })).toBeVisible();
    expect(
      screen.queryByRole("tabpanel", { name: "Investigation" }),
    ).not.toBeInTheDocument();

    const overviewNote = screen.getByRole("textbox", { name: "Manifest note" });
    await user.type(overviewNote, "preserved draft");
    await user.click(
      screen.getByRole("tab", { name: "Investigation, Action required" }),
    );

    expect(
      screen.getByRole("tabpanel", { name: "Investigation" }),
    ).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Overview, Complete" }));
    expect(screen.getByRole("textbox", { name: "Manifest note" })).toHaveValue(
      "preserved draft",
    );
  });
});

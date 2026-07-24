import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import {
  HostedPortalScreen,
  type HostedPortalApi,
} from "./hosted-portal-screen";

describe("hosted role portal", () => {
  it("shows only workspaces granted by server-owned application roles", async () => {
    const api: HostedPortalApi = {
      loadSession: vi.fn().mockResolvedValue({
        userId: "USER_AUTHOR_RATER_001",
        email: "reviewer@example.edu",
        roles: ["rater", "scenario-author"],
      }),
    };
    render(
      <LocaleProvider locale="en">
        <HostedPortalScreen api={api} />
      </LocaleProvider>,
    );

    expect(
      await screen.findAllByRole("link", {
        name: "Open workspace",
      }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Instructor and rater review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Scenario authoring" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Learner assignments" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Open workspace" }).map(
        (link) => link.getAttribute("href"),
      ),
    ).toEqual(["/instructor", "/author"]);
  });
});

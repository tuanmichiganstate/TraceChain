import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import {
  ApplicationAccessScreen,
  type ApplicationAccessApi,
} from "./application-access-screen";

describe("application access administration", () => {
  it("provisions one user with server-owned application roles", async () => {
    const api: ApplicationAccessApi = {
      loadUsers: vi.fn().mockResolvedValue([
        {
          schemaVersion: "1.0.0",
          userId: "USER_ADMIN_001",
          email: "admin@example.edu",
          status: "active",
          roles: ["administrator"],
          createdAt: "2026-07-24T03:00:00.000Z",
        },
      ]),
      saveUser: vi.fn().mockResolvedValue({
        user: {
          schemaVersion: "1.0.0",
          userId: "USER_NEW_001",
          email: "new.learner@example.edu",
          status: "active",
          roles: ["learner"],
          createdAt: "2026-07-25T04:00:00.000Z",
        },
        wasIdempotentReplay: false,
      }),
    };
    render(
      <LocaleProvider locale="en">
        <ApplicationAccessScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();

    expect(
      await screen.findByText("admin@example.edu"),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "new.learner@example.edu",
    );
    await user.click(
      screen.getByRole("button", { name: "Save access" }),
    );

    expect(api.saveUser).toHaveBeenCalledWith({
      commandId: expect.stringMatching(/^COMMAND_ACCESS_/u),
      email: "new.learner@example.edu",
      status: "active",
      roles: ["learner"],
    });
    expect(
      await screen.findByText("new.learner@example.edu"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Access saved for new.learner@example.edu.",
      ),
    ).toBeInTheDocument();
  });

  it("loads an existing user into a read-only identity edit", async () => {
    const existing = {
      schemaVersion: "1.0.0" as const,
      userId: "USER_LEARNER_001",
      email: "learner@example.edu",
      status: "active" as const,
      roles: ["learner" as const],
      createdAt: "2026-07-24T03:00:00.000Z",
    };
    const api: ApplicationAccessApi = {
      loadUsers: vi.fn().mockResolvedValue([existing]),
      saveUser: vi.fn().mockResolvedValue({
        user: {
          ...existing,
          roles: ["rater"],
        },
        wasIdempotentReplay: false,
      }),
    };
    render(
      <LocaleProvider locale="en">
        <ApplicationAccessScreen api={api} />
      </LocaleProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Edit learner@example.edu",
      }),
    );

    const email = screen.getByRole("textbox", {
      name: "Email address",
    });
    expect(email).toHaveAttribute("readonly");
    await user.click(
      screen.getByRole("checkbox", { name: "Learner" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Rater" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save access" }),
    );

    expect(api.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "learner@example.edu",
        roles: ["rater"],
      }),
    );
  });
});

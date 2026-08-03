import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import {
  ApplicationAccessApiError,
  ApplicationAccessScreen,
  type ApplicationAccessApi,
} from "./application-access-screen";

describe("application access administration", () => {
  it("shows an explicit access boundary instead of failed administration controls", async () => {
    const api: ApplicationAccessApi = {
      loadUsers: vi.fn().mockRejectedValue(
        new ApplicationAccessApiError("APPLICATION_ROLE_REQUIRED"),
      ),
      loadAudit: vi.fn().mockRejectedValue(
        new ApplicationAccessApiError("APPLICATION_ROLE_REQUIRED"),
      ),
      saveUser: vi.fn(),
    };

    render(
      <LocaleProvider locale="en">
        <ApplicationAccessScreen api={api} />
      </LocaleProvider>,
    );

    expect(
      await screen.findByText(
        "Your TraceChain account does not have administrator permission.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save access" }),
    ).not.toBeInTheDocument();
  });

  it("fails closed when administrator access cannot be verified", async () => {
    const api: ApplicationAccessApi = {
      loadUsers: vi.fn().mockRejectedValue(new TypeError("offline")),
      loadAudit: vi.fn().mockRejectedValue(new TypeError("offline")),
      saveUser: vi.fn(),
    };

    render(
      <LocaleProvider locale="en">
        <ApplicationAccessScreen api={api} />
      </LocaleProvider>,
    );

    expect(
      await screen.findByText(
        "Administrator access could not be verified. Sign in through the hosted TraceChain site and try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save access" }),
    ).not.toBeInTheDocument();
  });

  it("shows the append-only access-change audit history", async () => {
    const api = {
      loadUsers: vi.fn().mockResolvedValue([]),
      loadAudit: vi.fn().mockResolvedValue([
        {
          schemaVersion: "1.0.0",
          commandId: "COMMAND_DISABLE_ACCESS_001",
          targetUserId: "USER_LEARNER_001",
          targetEmail: "learner@example.edu",
          status: "disabled",
          roles: ["learner", "rater"],
          performedAt: "2026-07-25T04:00:00.000Z",
          performedByUserId: "USER_ADMIN_001",
          performedByEmail: "admin@example.edu",
        },
      ]),
      saveUser: vi.fn(),
    } as unknown as ApplicationAccessApi;

    render(
      <LocaleProvider locale="en">
        <ApplicationAccessScreen api={api} />
      </LocaleProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Access-change audit",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("COMMAND_DISABLE_ACCESS_001"),
    ).toBeInTheDocument();
    expect(screen.getByText("admin@example.edu")).toBeInTheDocument();
    expect(screen.getByText("learner@example.edu")).toBeInTheDocument();
  });

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
      loadAudit: vi.fn().mockResolvedValue([]),
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
      loadAudit: vi.fn().mockResolvedValue([]),
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

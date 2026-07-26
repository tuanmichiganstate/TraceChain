import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "./locale-provider";
import {
  NotificationProvider,
  enqueueNotification,
  useNotifications,
  type AppNotification,
} from "./notification-provider";

const baseNotification = {
  notificationId: "NOTICE_1",
  tone: "info",
  titleKey: "notification.proposalCreated.title",
} as const satisfies AppNotification;

describe("notification queue", () => {
  it("enqueues and caps the three most recent notifications", () => {
    const queue = [1, 2, 3, 4].reduce<readonly AppNotification[]>(
      (current, number) =>
        enqueueNotification(current, {
          ...baseNotification,
          notificationId: `NOTICE_${number}`,
        }),
      [],
    );

    expect(queue.map((item) => item.notificationId)).toEqual([
      "NOTICE_2",
      "NOTICE_3",
      "NOTICE_4",
    ]);
  });

  it("replaces a matching notification and suppresses duplicate commands", () => {
    const first = {
      ...baseNotification,
      sourceCommandId: "CMD_1",
    };
    const replaced = enqueueNotification([first], {
      ...first,
      tone: "success",
      titleKey: "notification.transactionCommitted.title",
    });
    const duplicateCommand = enqueueNotification(replaced, {
      ...baseNotification,
      notificationId: "NOTICE_OTHER",
      sourceCommandId: "CMD_1",
    });

    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.tone).toBe("success");
    expect(duplicateCommand).toHaveLength(1);
    expect(duplicateCommand[0]?.notificationId).toBe("NOTICE_OTHER");
  });
});

describe("notification viewport", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("announces localized interpolation and dismisses without moving focus", () => {
    let channel: ReturnType<typeof useNotifications> | null = null;
    function Probe(): React.ReactNode {
      channel = useNotifications();
      return <button type="button">Trigger</button>;
    }

    render(
      <LocaleProvider locale="en">
        <NotificationProvider>
          <Probe />
        </NotificationProvider>
      </LocaleProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Trigger" });
    trigger.focus();

    act(() => {
      channel?.notify({
        ...baseNotification,
        messageKey: "notification.proposalCreated.awaiting",
        interpolation: { organization: "An Viet Processing Plant" },
      });
    });

    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(
      screen.getByText(
        "The proposal is waiting for approval from An Viet Processing Plant.",
      ),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("automatically dismisses and pauses while hovered or focused", () => {
    vi.useFakeTimers();
    let channel: ReturnType<typeof useNotifications> | null = null;
    function Probe(): React.ReactNode {
      channel = useNotifications();
      return null;
    }

    render(
      <LocaleProvider locale="en">
        <NotificationProvider>
          <Probe />
        </NotificationProvider>
      </LocaleProvider>,
    );
    act(() => {
      channel?.notify({
        ...baseNotification,
        autoDismissMs: 1_000,
      });
    });
    const notice = screen
      .getByText("Proposal signed")
      .closest("li") as HTMLElement;

    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerEnter(notice);
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText("Proposal signed")).toBeInTheDocument();

    fireEvent.pointerLeave(notice);
    act(() => vi.advanceTimersByTime(599));
    expect(screen.getByText("Proposal signed")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Proposal signed")).not.toBeInTheDocument();
  });
});

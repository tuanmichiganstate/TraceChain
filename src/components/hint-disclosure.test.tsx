import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "../app/app";
import { LocaleProvider } from "../app/providers/locale-provider";
import { ScenarioProvider } from "../app/providers/scenario-provider";
import { SimulationProvider } from "../app/providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";

/**
 * A learner has to be able to weigh a hint before opening it, which means being
 * told which work it will cap, by how much, and that finished work counts too.
 * All three come from the hint's declared targets and the live scoring state,
 * so the notice cannot drift from what the engine charges.
 */
function AppUnderTest(): React.ReactElement {
  return (
    <LocaleProvider>
      <ScenarioProvider>
        <SimulationProvider>
          <App />
        </SimulationProvider>
      </ScenarioProvider>
    </LocaleProvider>
  );
}

async function reachStageTwo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
  await user.click(screen.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
  await user.click(screen.getByRole("button", { name: "Trả lời" }));
  await user.click(await screen.findByRole("button", { name: "Tiếp tục" }));
  await screen.findByRole("heading", { name: /Bước 2 - Tạo lô cà phê trên sổ cái/ });
}

describe("what a learner is told before opening a hint", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });
  afterEach(() => uninstall());

  it("names the activity it caps, the cap, and the points at stake", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await reachStageTwo(user);

    const notice = document.querySelector(".hint p.muted") as HTMLElement;
    // Stage 2's hint helps compose the create-batch transaction: 4 points,
    // capped at 70%, so 1.2 points are at stake.
    expect(notice.textContent).toContain("Tạo lô cà phê trên sổ cái");
    expect(notice.textContent).toContain("70%");
    expect(notice.textContent).toContain("1.2");
    expect(notice.textContent).toMatch(/không bị ảnh hưởng/);
    expect(notice.textContent).toMatch(/đã làm xong/);
  });

  it("shows no internal identifier", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await reachStageTwo(user);

    const notice = document.querySelector(".hint p.muted") as HTMLElement;
    expect(notice.textContent).not.toMatch(/INT_|HINT_|BAT_/);
  });

  it("replaces the notice with the hint once it is opened", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await reachStageTwo(user);

    await user.click(screen.getByRole("button", { name: "Xem gợi ý" }));
    expect(screen.getByText(/Mã lô phải là duy nhất trên toàn mạng/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem gợi ý" })).toBeNull();
  });
});

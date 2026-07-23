import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "../app/app";
import { LocaleProvider } from "../app/providers/locale-provider";
import { ScenarioProvider } from "../app/providers/scenario-provider";
import { SimulationProvider } from "../app/providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";

/**
 * The top bar must describe the stage the learner is looking at.
 *
 * Session state deliberately separates the furthest stage unlocked from the
 * stage on screen, because progression is derived: the moment a learner answers
 * the last outstanding condition the derived stage jumps forward, while the
 * learner is still reading the feedback that explains their answer. The router
 * honours that split. The top bar did not, so the header announced the next
 * stage number and the next stage's role over the screen the learner was still
 * on -- which is exactly the disorientation the split exists to prevent.
 */
function AppUnderTest(): React.ReactElement {
  return (
    <LocaleProvider>
      <ScenarioProvider scenario={coffeeScenario}>
        <SimulationProvider>
          <App />
        </SimulationProvider>
      </ScenarioProvider>
    </LocaleProvider>
  );
}

describe("the top bar follows the stage on screen", () => {
  let api: MockScorm12Api;
  let uninstall: () => void;

  beforeEach(() => {
    api = new MockScorm12Api();
    uninstall = installMockScormApi(api);
    window.localStorage.clear();
  });

  afterEach(() => {
    uninstall();
  });

  it("keeps stage 1's number and role while stage 1 feedback is still showing", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1 – Làm quen với mạng blockchain/ });

    // Answering the diagnostic question satisfies stage 1's only condition, so
    // stage 2 unlocks. The learner has not advanced: the explanation of the
    // answer they just gave is on screen, and moving on is their choice.
    await user.click(screen.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
    await user.click(screen.getByRole("button", { name: "Trả lời" }));
    await screen.findByText(
      /không tự động chứng minh rằng thông tin về thế giới thực là đúng/,
    );

    const progress = screen.getByText("Tiến độ").closest("div") as HTMLElement;
    const role = screen.getByText("Vai trò hiện tại").closest("div") as HTMLElement;

    expect(within(progress).getByText("Bước 1 trên 9")).toBeInTheDocument();
    expect(
      within(role).getByText("Chưa nhận vai trò - đang tìm hiểu hệ thống"),
    ).toBeInTheDocument();

    // And it follows the learner forward when they do advance.
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { name: /Bước 2 – Tạo lô cà phê trên sổ cái/ });

    expect(within(progress).getByText("Bước 2 trên 9")).toBeInTheDocument();
    expect(within(role).getByText(/Hợp tác xã Cà phê Cao nguyên/)).toBeInTheDocument();
  });
});

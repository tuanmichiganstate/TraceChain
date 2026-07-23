import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "../app/app";
import { LocaleProvider } from "../app/providers/locale-provider";
import { ScenarioProvider } from "../app/providers/scenario-provider";
import { SimulationProvider } from "../app/providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";

/**
 * The reference workspace holds five panels behind one collapsed toggle, so the
 * one a stage actually needs is otherwise always two clicks away. Which one that
 * is happens to be entirely predictable from the stage, so the panel opens on it.
 *
 * The two behaviours that matter are in tension: it must re-aim when the learner
 * moves on, and it must not overrule a choice they made inside a stage.
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

function selectedTabName(): string {
  const selected = screen
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true");
  return selected?.textContent ?? "";
}

describe("the reference workspace opens on the panel its stage needs", () => {
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

  it("re-aims on a stage change but keeps a choice made within a stage", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await user.click(screen.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
    await user.click(screen.getByRole("button", { name: "Trả lời" }));
    await user.click(await screen.findByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { name: /Bước 2 – Tạo lô cà phê trên sổ cái/ });

    // Stage 2 has no panel of its own to prefer, so it opens on current state.
    await user.click(screen.getByRole("button", { name: "Bảng tra cứu" }));
    expect(selectedTabName()).toBe("Trạng thái hiện tại");

    // A choice inside the stage survives the re-renders that submitting a
    // transaction and sealing a block cause.
    await user.click(screen.getByRole("tab", { name: "Sổ cái" }));
    expect(selectedTabName()).toBe("Sổ cái");

    await user.click(screen.getByRole("button", { name: "Gửi giao dịch lên mạng" }));
    await user.click(await screen.findByRole("button", { name: "Ghi giao dịch vào khối" }));
    expect(selectedTabName()).toBe("Sổ cái");

    // Moving on re-aims: stage 3 is about on-chain versus off-chain wording, so
    // it opens on the glossary. The workspace stays open across the change.
    await user.click(await screen.findByRole("button", { name: "Tiếp tục" }));
    await screen.findByRole("heading", { name: /Bước 3 – Ghi nhận chứng nhận/ });
    expect(selectedTabName()).toBe("Thuật ngữ");
  });

  it("keeps the panel closed until the learner opens it", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Bảng tra cứu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

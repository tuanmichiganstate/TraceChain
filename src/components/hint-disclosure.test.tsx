import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  await screen.findByRole("heading", { name: /Bước 2 – Tạo lô cà phê trên sổ cái/ });
}

async function reachStageFour(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const submitAndSeal = async (name: string): Promise<void> => {
    const panel = (
      await screen.findByRole("heading", { name, level: 3 })
    ).closest("section") as HTMLElement;
    await user.click(within(panel).getByRole("button", { name: "Gửi giao dịch lên mạng" }));
    const seal = within(panel).queryByRole("button", { name: "Ghi giao dịch vào khối" });
    if (seal !== null) await user.click(seal);
  };
  const answer = async (option: RegExp): Promise<void> => {
    await user.click(await screen.findByRole("radio", { name: option }));
    const submit = screen
      .getAllByRole("button", { name: "Trả lời" })
      .find((button) => !(button as HTMLButtonElement).disabled);
    if (submit === undefined) throw new Error("No enabled answer button");
    await user.click(submit);
  };
  const advance = async (): Promise<void> => {
    const buttons = await screen.findAllByRole("button", { name: "Tiếp tục" });
    await user.click(buttons[buttons.length - 1] as HTMLElement);
  };

  await reachStageTwo(user);
  await submitAndSeal("Thông tin lô hàng");
  await advance();
  await answer(/Lưu tệp ngoài chuỗi/);
  await submitAndSeal("Ghi nhận tài liệu lên chuỗi");
  await submitAndSeal("Cấp chứng nhận cho lô hàng");
  await user.click(screen.getByRole("button", { name: "Thử gửi chứng nhận này" }));
  await answer(/Từ chối, vì đơn vị cấp không có thẩm quyền/);
  await advance();
  await screen.findByRole("heading", { name: /Bước 4/ });
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
    // capped at 70%, so 1.2 points are at stake -- written 1,2, because the
    // sentence around it is Vietnamese.
    expect(notice.textContent).toContain("Tạo lô cà phê trên sổ cái");
    expect(notice.textContent).toContain("70%");
    expect(notice.textContent).toContain("1,2");
    expect(notice.textContent).not.toContain("1.2");
    expect(notice.textContent).toMatch(/không bị ảnh hưởng/);
    expect(notice.textContent).toMatch(/đã hoàn thành/);
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

  /**
   * Stage 4's hint targets the custody-scope question, which is retryable, so
   * the three states the disclosure has to distinguish are all reachable: the
   * first attempt still ahead, one wrong answer behind, and two.
   */
  it("stops claiming a cost once earlier attempts have dropped the target below the cap", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await reachStageFour(user);

    const notice = () => (document.querySelector(".hint p.muted") as HTMLElement).textContent ?? "";
    const answerWrongly = async (): Promise<void> => {
      await user.click(await screen.findByRole("radio", { name: /Chuyển cả quyền sở hữu/ }));
      const submit = screen
        .getAllByRole("button", { name: "Trả lời" })
        .find((button) => !(button as HTMLButtonElement).disabled);
      if (submit === undefined) throw new Error("No enabled answer button");
      await user.click(submit);
      await user.click(await screen.findByRole("button", { name: "Thử lại" }));
    };

    // Six points, first attempt still ahead: the cap can take 30%.
    expect(notice()).toContain("1,8");

    // One wrong answer. The next success scores at 80%, so a 70% cap can only
    // take the difference.
    await answerWrongly();
    expect(notice()).toContain("0,6");

    // Two wrong answers put the next success at 60%, already below the cap, so
    // the hint is free -- and must not be described as costing anything.
    await answerWrongly();
    expect(notice()).toMatch(/không làm giảm/);
    expect(notice()).not.toMatch(/\d/);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "../../app/app";
import { LocaleProvider } from "../../app/providers/locale-provider";
import { ScenarioProvider } from "../../app/providers/scenario-provider";
import { SimulationProvider } from "../../app/providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../../test/scorm-mock/mock-scorm-api";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";

/**
 * The discrepancy panel classifies two figures; it does not judge them.
 *
 * The manifest passed every rule when the co-operative's clerk filed it and is
 * committed for good -- it is inaccurate, not invalid -- and the plant scale's
 * reading is not a validation outcome at all. Both once wore the rejection and
 * success glyphs, which mean "failed" and "passed" everywhere else in this
 * interface, on a screen the learner reaches before doing anything.
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

type User = ReturnType<typeof userEvent.setup>;

async function playToStageFive(user: User): Promise<void> {
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

  await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
  await answer(/Không\. Blockchain giúp xác định/);
  await advance();
  await submitAndSeal("Thông tin lô hàng");
  await advance();
  await user.selectOptions(
    await screen.findByRole("combobox", {
      name: "Nội dung và thời hạn chứng nhận",
    }),
    "VALID",
  );
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Sự công nhận và thẩm quyền của đơn vị cấp",
    }),
    "RECOGNIZED_AUTHORIZED",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Cách lưu trữ tài liệu" }),
    "HASH_OFF_CHAIN",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Cách xử lý lô hàng" }),
    "CONTINUE",
  );
  await user.click(
    screen.getByRole("button", { name: "Gửi quyết định về chứng nhận" }),
  );
  await submitAndSeal("Ghi nhận tài liệu lên chuỗi");
  await submitAndSeal("Cấp chứng nhận cho lô hàng");
  await advance();
  await answer(/Chỉ chuyển quyền lưu giữ/);
  await submitAndSeal("Bàn giao lô hàng cho đơn vị vận chuyển");
  await answer(/Ghi nhận vượt ngưỡng/);
  await submitAndSeal("Ghi nhận điều kiện vận chuyển");
  await advance();
  await screen.findByRole("heading", { name: /Bước 5/ });
}

function discrepancyPanel(): HTMLElement {
  return screen.getByText("Chênh lệch số lượng").closest("section") as HTMLElement;
}

describe("the stage 5 discrepancy panel", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });

  afterEach(() => uninstall());

  it("labels both figures by origin without passing a verdict on either", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await playToStageFive(user);

    const panel = discrepancyPanel();
    expect(
      within(panel).getByText("Số lượng trên vận đơn đã ghi lên sổ cái"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Số lượng cân thực tế tại nhà máy")).toBeInTheDocument();

    // Neither value carries a status pill, so neither carries a glyph that
    // means "failed" or "passed" anywhere else in this interface.
    const values = panel.querySelectorAll(".discrepancy__value");
    expect(values).toHaveLength(2);
    for (const value of values) {
      expect(value.querySelector(".status")).toBeNull();
    }
    expect(panel.querySelectorAll(".status--fail, .status--pass")).toHaveLength(0);
  });

  it("states the mismatch in words rather than through colour", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await playToStageFive(user);

    const mismatch = within(discrepancyPanel()).getByText(/Phát hiện chênh lệch/);
    expect(mismatch).toBeInTheDocument();
    // And it says which kind of wrong the manifest is, because "invalid" and
    // "inaccurate" lead to opposite conclusions about whether it can be removed.
    expect(mismatch.textContent).toMatch(/không phải là bản ghi không hợp lệ/);
    expect(mismatch.textContent).toMatch(/vẫn nằm trên sổ cái/);
  });

  it("keeps both figures readable and spelled the way the rest of the screen spells them", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await playToStageFive(user);

    const panel = discrepancyPanel();
    const values = [...panel.querySelectorAll(".discrepancy__value")].map(
      (element) => element.textContent?.trim() ?? "",
    );
    expect(values).toEqual(["1000 kg", "100 kg"]);
  });

  it("rejects an over-budget UTF-8 correction reason without truncating it", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await playToStageFive(user);

    const submitAndSeal = async (name: string): Promise<void> => {
      const panel = (
        await screen.findByRole("heading", { name, level: 3 })
      ).closest("section") as HTMLElement;
      await user.click(
        within(panel).getByRole("button", {
          name: "Gửi giao dịch lên mạng",
        }),
      );
      await user.click(
        within(panel).getByRole("button", {
          name: "Ghi giao dịch vào khối",
        }),
      );
    };

    await submitAndSeal("Tiếp nhận lô hàng");
    await submitAndSeal("Ghi nhận việc mua lô hàng");
    await user.selectOptions(
      screen.getByLabelText("Hành động đề xuất đối với bản ghi"),
      "APPEND_CORRECTION",
    );
    await user.selectOptions(
      screen.getByLabelText("Nguyên nhân có khả năng nhất"),
      "TYPING_ERROR",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Gửi quyết định xử lý chênh lệch",
      }),
    );

    const reason = await screen.findByRole("textbox", {
      name: "Lý do điều chỉnh",
    });
    const overBudgetReason = "ộ".repeat(121);
    await user.clear(reason);
    await user.type(reason, overBudgetReason);

    expect(reason).toHaveValue(overBudgetReason);
    expect(
      screen.getByText(/không được vượt quá 240 byte UTF-8/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Gửi giao dịch lên mạng" }),
    ).toBeNull();
  });
});

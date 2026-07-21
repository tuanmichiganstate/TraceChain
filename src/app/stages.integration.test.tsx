import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "./app";
import { LocaleProvider } from "./providers/locale-provider";
import { ScenarioProvider } from "./providers/scenario-provider";
import { SimulationProvider } from "./providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";

/**
 * THE MILESTONE 4 EXIT CONDITION, EXTENDED THROUGH STAGE 8.
 *
 * A learner completes stages 1 to 8 in the browser: answering checks, composing
 * transactions, watching them validate, sealing blocks, moving on, and finally
 * trying to edit history and watching it fail. The domain was already proven
 * headless; this proves the interface reaches it.
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

type User = ReturnType<typeof userEvent.setup>;

/**
 * Submit the transaction in the named panel, then seal its block.
 *
 * Matched at heading level 3: stage titles are level 2, and several action
 * labels are substrings of their stage's title.
 */
async function submitAndSeal(user: User, actionName: string): Promise<void> {
  const panel = (
    await screen.findByRole("heading", { name: actionName, level: 3 })
  ).closest("section") as HTMLElement;
  await user.click(within(panel).getByRole("button", { name: "Gửi giao dịch lên mạng" }));
  const seal = within(panel).queryByRole("button", { name: "Ghi giao dịch vào khối" });
  if (seal !== null) await user.click(seal);
}

async function answer(user: User, optionPattern: RegExp): Promise<void> {
  await user.click(await screen.findByRole("radio", { name: optionPattern }));
  const submit = screen
    .getAllByRole("button", { name: "Trả lời" })
    .find((button) => !(button as HTMLButtonElement).disabled);
  if (submit === undefined) throw new Error("No enabled answer button");
  await user.click(submit);
}

async function advance(user: User): Promise<void> {
  const buttons = await screen.findAllByRole("button", { name: "Tiếp tục" });
  await user.click(buttons[buttons.length - 1] as HTMLElement);
}

describe("stages 1 to 8 in the browser", () => {
  let api: MockScorm12Api;
  let uninstall: () => void;

  beforeEach(() => {
    api = new MockScorm12Api();
    uninstall = installMockScormApi(api);
    window.localStorage.clear();
  });

  afterEach(() => uninstall());

  it("carries a learner from orientation through the tamper demonstration", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    // ---- Stage 1: orientation ----------------------------------------
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);

    // ---- Stage 2: create the batch -----------------------------------
    await screen.findByRole("heading", { name: /Bước 2/ });
    await submitAndSeal(user, "Thông tin lô hàng");
    expect(await screen.findByText("Tất cả quy tắc đều được thỏa mãn.")).toBeInTheDocument();
    await advance(user);

    // ---- Stage 3: certificate, and an issuer with no standing --------
    await screen.findByRole("heading", { name: /Bước 3/ });
    await answer(user, /Lưu tệp ngoài chuỗi/);
    await submitAndSeal(user, "Ghi nhận tài liệu lên chuỗi");
    await submitAndSeal(user, "Cấp chứng nhận cho lô hàng");

    // The suspicious certificate is refused, and the reason is legible.
    await user.click(screen.getByRole("button", { name: "Thử gửi chứng nhận này" }));
    expect(
      await screen.findByText(/chưa được công nhận trên mạng này/),
    ).toBeInTheDocument();

    await answer(user, /Từ chối, vì đơn vị cấp không có thẩm quyền/);
    await advance(user);

    // ---- Stage 4: custody moves, ownership stays ---------------------
    await screen.findByRole("heading", { name: /Bước 4/ });
    await answer(user, /Chỉ chuyển quyền lưu giữ/);
    await submitAndSeal(user, "Bàn giao lô hàng cho đơn vị vận chuyển");
    await answer(user, /Ghi nhận vượt ngưỡng/);
    await submitAndSeal(user, "Ghi nhận điều kiện vận chuyển");
    await advance(user);

    // ---- Stage 5: receive, buy, and correct --------------------------
    await screen.findByRole("heading", { name: /Bước 5/ });
    await submitAndSeal(user, "Tiếp nhận lô hàng");
    await submitAndSeal(user, "Ghi nhận việc mua lô hàng");
    await submitAndSeal(user, "Gửi giao dịch điều chỉnh");
    await advance(user);

    // ---- Stage 6: roast ----------------------------------------------
    await screen.findByRole("heading", { name: /Bước 6/ });
    await submitAndSeal(user, "Chuyển đổi lô hàng");
    await answer(user, /Là một lô mới, có quan hệ nguồn gốc/);
    await advance(user);

    // ---- Stage 7: package and distribute -----------------------------
    await screen.findByRole("heading", { name: /Bước 7/ });
    await submitAndSeal(user, "Đóng gói thành phẩm");
    await submitAndSeal(user, "Chuyển quyền sở hữu cho nhà phân phối");
    await submitAndSeal(user, "Giao hàng cho nhà bán lẻ");

    // The packaged lot reached the retailer with both rights.
    const cards = await screen.findAllByRole("article");
    const packaged = cards[cards.length - 1] as HTMLElement;
    expect(within(packaged).getAllByText("Siêu thị Việt Market")).toHaveLength(2);
    expect(within(packaged).getByText("820 gói")).toBeInTheDocument();

    // ---- Stage 8: what the public sees, and what editing history costs ----
    await advance(user);
    await screen.findByRole("heading", { name: /Bước 8/ });
    await user.click(screen.getByRole("button", { name: "Chạy thử nghiệm sửa dữ liệu" }));

    // The escalation is the lesson: each forgery repairs one layer and exposes
    // the next, and none of the three is prevented.
    expect(await screen.findByRole("heading", { name: /Bước 1 — Sửa khối lượng/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Bước 2 — Làm lại hàm băm của giao dịch/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Bước 3 — Làm lại hàm băm của khối/ })).toBeInTheDocument();

    // And the learner's own attempt survives it.
    expect(
      screen.getByText(/Sổ cái thật của bạn vẫn nguyên vẹn/),
    ).toBeInTheDocument();
  }, 90_000);

  it("rejects a custody transfer that also moves ownership, and explains why", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);
    await submitAndSeal(user, "Thông tin lô hàng");
    await advance(user);
    await answer(user, /Lưu tệp ngoài chuỗi/);
    await submitAndSeal(user, "Ghi nhận tài liệu lên chuỗi");
    await submitAndSeal(user, "Cấp chứng nhận cho lô hàng");
    await user.click(screen.getByRole("button", { name: "Thử gửi chứng nhận này" }));
    await answer(user, /Từ chối, vì đơn vị cấp không có thẩm quyền/);
    await advance(user);

    // Answer the scope question wrongly: the transaction the learner then
    // submits is the one the rules refuse.
    await screen.findByRole("heading", { name: /Bước 4/ });
    await answer(user, /Chuyển cả quyền sở hữu và quyền lưu giữ/);

    const panel = (
      await screen.findByRole("heading", {
        name: "Bàn giao lô hàng cho đơn vị vận chuyển",
        level: 3,
      })
    ).closest("section") as HTMLElement;
    await user.click(within(panel).getByRole("button", { name: "Gửi giao dịch lên mạng" }));

    // The rejection is a teaching message, not an error code.
    expect(
      await screen.findByText(/Đơn vị vận chuyển giữ hộ hàng chứ không mua lô hàng/),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Giao dịch chưa được chấp nhận. Vui lòng xem các quy tắc chưa thỏa mãn bên dưới.")).toBeInTheDocument();
  }, 60_000);
});

describe("the reference panels", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });

  afterEach(() => uninstall());

  it("exposes the ledger, history, traceability and glossary as keyboard tabs", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));

    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(5);

    // Arrow keys move between tabs, per the ARIA authoring practice.
    (tabs[0] as HTMLElement).focus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tabs[4]).toHaveAttribute("aria-selected", "true");

    // The glossary pairs each Vietnamese term with its English.
    expect(await screen.findByText(/Quyền lưu giữ \(Custody\)/)).toBeInTheDocument();
  });

  it("never claims more outstanding work than it lists", async () => {
    // The panel listed one step for stage 2 while announcing "2 items
    // remaining": the list came from the stage's required actions and the count
    // from its completion conditions, and the two are not the same set. A
    // learner cannot act on a count whose items are invisible.
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await answer(user, /Không\. Blockchain giúp xác định/);
    await advance(user);
    await screen.findByRole("heading", { name: /Bước 2/ });

    const panel = (
      await screen.findByRole("heading", { name: "Việc cần hoàn thành ở bước này" })
    ).closest("section") as HTMLElement;
    const items = within(panel).getAllByRole("listitem");

    const summary = panel.querySelector(".status") as HTMLElement;
    const claimed = (summary.textContent ?? "").match(/\d+/g)?.map(Number) ?? [];
    expect(
      claimed.filter((n) => n > items.length),
      `panel lists ${items.length} step(s) but its summary says "${summary.textContent}"`,
    ).toEqual([]);
  }, 30_000);

  it("shows seeded background lots before the learner has done anything", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));

    // The distractor lots exist from the start; recall is not the first time
    // the learner sees them.
    expect(await screen.findByText("BAT_PACKAGED_COFFEE_002")).toBeInTheDocument();
    expect(screen.getByText("BAT_PACKAGED_COFFEE_003")).toBeInTheDocument();
  });
});

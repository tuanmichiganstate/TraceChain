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
 * Structural accessibility, asserted rather than audited once.
 *
 * These are the properties a manual pass keeps re-checking and a refactor keeps
 * quietly breaking: the document outline, accessible names, and unique ids.
 * None of them is visible on screen, which is exactly why they need tests.
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

/** Heading levels in document order. */
function headingLevels(): number[] {
  return [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
    Number(h.tagName.slice(1)),
  );
}

function skippedLevels(): string[] {
  const levels = headingLevels();
  const skips: string[] = [];
  for (let i = 1; i < levels.length; i += 1) {
    const previous = levels[i - 1] as number;
    const current = levels[i] as number;
    if (current > previous + 1) skips.push(`h${previous} -> h${current}`);
  }
  return skips;
}

function accessibleName(element: Element): string {
  const el = element as HTMLElement & { labels?: NodeListOf<HTMLLabelElement>; value?: string };
  return (
    el.getAttribute("aria-label") ??
    el.textContent?.trim() ??
    el.labels?.[0]?.textContent?.trim() ??
    ""
  ).trim();
}

function unnamedControls(): string[] {
  return [...document.querySelectorAll("button, a[href], select, textarea")]
    .filter((el) => accessibleName(el) === "")
    .map((el) => `${el.tagName}.${el.className.split(" ")[0] ?? ""}`);
}

type User = ReturnType<typeof userEvent.setup>;

/** Stages 1 to 5, ending with three transaction panels on one screen. */
async function playThroughStageFive(user: User): Promise<void> {
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

  await answer(/Lưu tệp ngoài chuỗi/);
  await submitAndSeal("Ghi nhận tài liệu lên chuỗi");
  await submitAndSeal("Cấp chứng nhận cho lô hàng");
  await user.click(screen.getByRole("button", { name: "Thử gửi chứng nhận này" }));
  await answer(/Từ chối, vì đơn vị cấp không có thẩm quyền/);
  await advance();

  await answer(/Chỉ chuyển quyền lưu giữ/);
  await submitAndSeal("Bàn giao lô hàng cho đơn vị vận chuyển");
  await answer(/Ghi nhận vượt ngưỡng/);
  await submitAndSeal("Ghi nhận điều kiện vận chuyển");
  await advance();

  await screen.findByRole("heading", { name: /Bước 5/ });
  await submitAndSeal("Tiếp nhận lô hàng");
  await submitAndSeal("Ghi nhận việc mua lô hàng");
  await submitAndSeal("Gửi giao dịch điều chỉnh");
}

function duplicateIds(): string[] {
  const counts = new Map<string, number>();
  document.querySelectorAll("[id]").forEach((el) => {
    counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
  });
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
}

describe("the document outline", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });
  afterEach(() => uninstall());

  it("names the page with a single h1 before the activity starts", async () => {
    render(<AppUnderTest />);
    await screen.findByRole("button", { name: "Bắt đầu mô phỏng" });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(skippedLevels()).toEqual([]);
  });

  /**
   * The running workspace used to open at h2: the application title sat in a
   * span, so a screen-reader user navigating by heading landed inside the first
   * stage with nothing above it saying what they were in.
   */
  it("still has exactly one h1 once the activity is running", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("skips no heading level anywhere in the running workspace", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    expect(skippedLevels(), headingLevels().join(",")).toEqual([]);
  });
});

describe("controls and references", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });
  afterEach(() => uninstall());

  it("gives every control an accessible name", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    const offenders = unnamedControls();
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("keeps the reference workspace available without letting it dominate the task", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    const toggle = screen.getByRole("button", { name: "Bảng tra cứu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tab", { name: "Trạng thái hiện tại" })).toBeNull();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tab", { name: "Trạng thái hiện tại" })).toBeInTheDocument();
  });

  /**
   * Duplicate ids silently break every aria-labelledby, aria-describedby and
   * label-for that points at them: the reference resolves to whichever element
   * comes first.
   */
  it("issues no duplicate element ids", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    const offenders = duplicateIds();
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  /**
   * Stage 1 renders one of everything, which is why it never caught this: the
   * transaction pipeline and the validation results each carried a hard-coded
   * heading id, so stage 5 -- three transaction panels at once -- issued
   * `pipeline-heading` and `validation-heading` three times apiece and two
   * thirds of those regions were labelled by the wrong heading.
   */
  it("issues no duplicate element ids on a stage showing several transactions", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await playThroughStageFive(user);

    const offenders = duplicateIds();
    expect(offenders, offenders.join(", ")).toEqual([]);
    expect(skippedLevels(), headingLevels().join(",")).toEqual([]);
  });

  it("exposes exactly one main landmark, reachable by the skip link", async () => {
    const user = userEvent.setup();
    render(<AppUnderTest />);
    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await screen.findByRole("heading", { name: /Bước 1/ });

    const mains = document.querySelectorAll("main, [role=main]");
    expect(mains).toHaveLength(1);
    const skip = screen.getByRole("link", { name: /Chuyển tới nội dung|Bỏ qua/ });
    expect(skip.getAttribute("href")).toBe(`#${(mains[0] as HTMLElement).id}`);
  });
});

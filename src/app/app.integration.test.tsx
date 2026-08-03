import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./app";
import { LocaleProvider } from "./providers/locale-provider";
import { ScenarioProvider } from "./providers/scenario-provider";
import { SimulationProvider } from "./providers/simulation-provider";
import type React from "react";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { APP_VERSION } from "./configuration";

/**
 * The Milestone 0 exit condition, proven end to end: a learner starts the
 * activity inside a SCORM host, completes stages 1 and 2, watches the first
 * block form, and their progress reaches the LMS within the data model's
 * limits.
 *
 * Everything here runs against the strict mock API, which enforces the real
 * 4096-character suspend_data ceiling and the lesson_status vocabulary. A
 * regression that overflows the budget fails this test rather than surfacing in
 * front of a class.
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

function renderApp(): void {
  render(<AppUnderTest />);
}

/**
 * Stage 2 in full: submit the batch, then seal the block. The ledger runs in
 * STAGE_BOUNDARY mode, so the transaction sits ORDERED in the pending queue
 * until the learner presses the seal button -- which is the moment the stage
 * exists to show.
 */
async function completeStageTwo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "Gửi giao dịch lên mạng" }));
  await screen.findByText("Tất cả quy tắc đều được thỏa mãn.");
  await user.click(await screen.findByRole("button", { name: "Ghi giao dịch vào khối" }));
}

async function completeStageOne(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
  await user.click(screen.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
  await user.click(screen.getByRole("button", { name: "Trả lời" }));
  // The next stage unlocks automatically, but the screen only moves when the
  // learner says so -- otherwise the feedback would vanish before it is read.
  await user.click(await screen.findByRole("button", { name: "Tiếp tục" }));
}

describe("SimuLedger end to end, stages 1 to 2", () => {
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

  it("carries a learner from the start screen through the first committed block", async () => {
    const user = userEvent.setup();
    renderApp();

    // ---- Start screen, in Vietnamese ---------------------------------
    const beginButton = await screen.findByRole("button", { name: "Bắt đầu mô phỏng" });
    expect(
      screen.getByText(/Đây là môi trường mô phỏng phục vụ học tập/),
    ).toBeInTheDocument();
    // Inside a SCORM host, the standalone warning must not appear.
    expect(screen.queryByText(/Chế độ chạy độc lập/)).not.toBeInTheDocument();

    await user.click(beginButton);

    // ---- Stage 1: orientation ----------------------------------------
    expect(
      await screen.findByRole("heading", { name: /Bước 1 – Làm quen với mạng blockchain/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Vai trò hiện tại")).toBeInTheDocument();

    // The diagnostic question, whose correct answer is that blockchain does not
    // prove input truth.
    await user.click(screen.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
    await user.click(screen.getByRole("button", { name: "Trả lời" }));

    // The explanation stays on screen: the stage unlocks but does not jump.
    expect(
      await screen.findByText(/không tự động chứng minh rằng thông tin về thế giới thực là đúng/),
    ).toBeInTheDocument();

    // ---- Stage 2: create the batch -----------------------------------
    await user.click(screen.getByRole("button", { name: "Tiếp tục" }));
    expect(
      await screen.findByRole("heading", { name: /Bước 2 – Tạo lô cà phê trên sổ cái/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gửi giao dịch lên mạng" }));

    // Every rule passed, so the transaction is accepted and ordered.
    expect(await screen.findByText("Tất cả quy tắc đều được thỏa mãn.")).toBeInTheDocument();

    // Ordered is not yet committed: the block has to be sealed, and until it is
    // there is no ledger to inspect.
    expect(screen.queryByRole("region", { name: "Sổ cái blockchain mô phỏng" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ghi giao dịch vào khối" }));

    // ---- The first block exists and is the genesis block --------------
    const ledger = await screen.findByRole("region", { name: "Sổ cái blockchain mô phỏng" });
    expect(within(ledger).getAllByText(/Số khối/).length).toBeGreaterThan(0);
    expect(within(ledger).getByText(/Khối đầu tiên không có khối trước/)).toBeInTheDocument();
    expect(within(ledger).getAllByText("Chuỗi hàm băm nhất quán").length).toBeGreaterThan(0);
    expect(
      within(ledger).getByRole("list", { name: "Danh sách khối" }),
    ).toBeInTheDocument();
    expect(
      within(ledger).getByRole("region", { name: "Chi tiết khối 1" }),
    ).toBeInTheDocument();

    // ---- World state reflects the committed transaction ---------------
    // Owner and custodian appear as separate rows: the distinction between them
    // is the simulation's central idea and must never be collapsed into one.
    const assetCard = screen.getAllByRole("article")[0] as HTMLElement;
    expect(within(assetCard).getByText("Chủ sở hữu hiện tại")).toBeInTheDocument();
    expect(within(assetCard).getByText("Bên đang lưu giữ")).toBeInTheDocument();
    expect(within(assetCard).getAllByText("Hợp tác xã Cà phê Cao nguyên")).toHaveLength(2);
    expect(within(assetCard).getByText("100 kg")).toBeInTheDocument();
    expect(within(assetCard).getByText("Chờ chứng nhận")).toBeInTheDocument();
  });

  it("reports progress to the LMS within the SCORM data model", async () => {
    const user = userEvent.setup();
    renderApp();

    await completeStageOne(user);
    await completeStageTwo(user);

    // Initialization marked the attempt in progress and declared the range.
    expect(api.peek("cmi.core.lesson_status")).toBe("incomplete");
    expect(api.peek("cmi.core.score.min")).toBe("0");
    expect(api.peek("cmi.core.score.max")).toBe("100");

    // Suspend data was accepted -- the mock rejects anything over 4096 -- and
    // sits far inside the limit.
    const suspendData = api.peek("cmi.suspend_data");
    expect(suspendData).not.toBe("");
    expect(suspendData.length).toBeLessThanOrEqual(3_800);
    expect(suspendData.startsWith("SL1.")).toBe(true);

    // The raw stage identifier, not a translated label (section 21.6).
    expect(api.peek("cmi.core.lesson_location")).toMatch(/^STG_0\d_[A-Z_]+$/);

    // No student identity reached the stored attempt state (section 21.3).
    expect(suspendData).not.toMatch(/Nguyen/);
    expect(suspendData).not.toMatch(/student-001/);

    expect(api.commitCount).toBeGreaterThan(0);
  });

  it("offers to resume when the LMS reports a suspended attempt", async () => {
    const user = userEvent.setup();

    // First session: get as far as stage 2 and let it save.
    renderApp();
    await completeStageOne(user);
    const savedState = api.peek("cmi.suspend_data");
    expect(savedState).not.toBe("");

    screen.getByRole("heading", { name: /Bước 2/ });

    // Second session: a fresh launch against the same LMS state.
    uninstall();
    const relaunched = new MockScorm12Api({ initialValues: api.snapshot() });
    uninstall = installMockScormApi(relaunched);

    const { unmount } = render(<AppUnderTest />);

    const resumeButtons = await screen.findAllByRole("button", {
      name: "Tiếp tục lần học trước",
    });
    await user.click(resumeButtons[resumeButtons.length - 1] as HTMLElement);

    // Resumes at the stage the learner reached, not back at the beginning.
    expect(await screen.findAllByRole("heading", { name: /Bước 2/ })).not.toHaveLength(0);
    unmount();
  });

  it("falls back to standalone mode and says so when no SCORM API exists", async () => {
    uninstall();
    renderApp();

    expect(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" })).toBeInTheDocument();
    expect(screen.getByText(/Chế độ chạy độc lập/)).toBeInTheDocument();
  });

  it("resets unsupported browser progress outside an LMS", async () => {
    const user = userEvent.setup();
    uninstall();
    const storageKey = `simuledger:${APP_VERSION}:${coffeeScenario.scenarioId}`;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        encodedState: "LEGACY2.61r.0021.0.0.deadbeef",
        location: "STG_03_ANCHOR_CERTIFICATE",
        score: null,
        status: "incomplete",
      }),
    );

    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Không khôi phục được tiến độ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/phiên bản cũ và không còn tương thích/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/dùng LMS để bắt đầu một lượt học mới/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Bắt đầu lại hoạt động" }));

    expect(
      await screen.findByRole("heading", { name: /Bước 1 – Làm quen với mạng blockchain/ }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(storageKey) ?? "").not.toContain("LEGACY2.");
  });

  it("recovers rather than crashing when stored state is corrupt", async () => {
    uninstall();
    const corrupt = new MockScorm12Api({
      initialValues: { "cmi.suspend_data": "LEGACY1.corrupted.data.0.0.deadbeef" },
    });
    uninstall = installMockScormApi(corrupt);

    renderApp();

    // Progress is never silently discarded: the learner is told and offered a
    // way forward (section 21.11).
    expect(
      await screen.findByRole("heading", { name: "Không khôi phục được tiến độ" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/dùng LMS để bắt đầu một lượt học mới/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu lại hoạt động" })).toBeNull();
  });
});

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Driving the activity the way a learner does.
 *
 * Everything is located by accessible role and visible Vietnamese text, never
 * by CSS class or test id. That is deliberate: if a locator here stops
 * resolving, either the accessible name changed -- which a screen reader user
 * would also notice -- or the interface genuinely moved. Test ids would hide
 * both.
 */
export class Activity {
  constructor(private readonly page: Page) {}

  /**
   * Per-stage timing, printed only when TRACECHAIN_E2E_TIMING is set.
   *
   * Off by default so the suite stays quiet and deterministic; on, it turns the
   * walkthrough into a profile that says which stage consumed the budget rather
   * than only that the test timed out. It reads the clock, never sleeps, so it
   * changes no behaviour.
   */
  private readonly timingEnabled = Boolean(process.env["TRACECHAIN_E2E_TIMING"]);
  private lastMark = Date.now();

  private mark(label: string): void {
    if (!this.timingEnabled) return;
    const now = Date.now();
    console.log(`[timing] ${label}: +${now - this.lastMark}ms`);
    this.lastMark = now;
  }

  async start(): Promise<void> {
    this.lastMark = Date.now();
    await this.page.getByRole("button", { name: "Bắt đầu mô phỏng" }).click();
  }

  async resumePrevious(): Promise<void> {
    await this.page.getByRole("button", { name: "Tiếp tục lần học trước" }).click();
  }

  /** The stage heading currently on screen, e.g. "Bước 4 - ...". */
  stageHeading(): Locator {
    return this.page.getByRole("heading", { level: 2 }).first();
  }

  async expectStage(number: number): Promise<void> {
    await expect(
      this.page.getByRole("heading", { level: 2, name: new RegExp(`^Bước ${number}\\b`) }),
    ).toBeVisible();
    this.mark(`reached stage ${number}`);
  }

  /** Answer a single- or multi-choice check by matching its option text. */
  async answer(optionPattern: RegExp): Promise<void> {
    await this.page.getByRole("radio", { name: optionPattern }).check();
    await this.submitAnswer();
  }

  async selectLots(...patterns: RegExp[]): Promise<void> {
    for (const pattern of patterns) {
      await this.page.getByRole("checkbox", { name: pattern }).check();
    }
    await this.submitAnswer();
  }

  /**
   * Several checks can be on screen at once and the answered ones keep their
   * (disabled) button, so this takes the first one still live.
   */
  private async submitAnswer(): Promise<void> {
    await this.page
      .locator("button:not([disabled])")
      .filter({ hasText: /^Trả lời$/ })
      .first()
      .click();
  }

  /** Place every item of the data-governance classification correctly. */
  async classifyGovernanceItems(): Promise<void> {
    const placements: Readonly<Record<string, string>> = {
      ITEM_BATCH_ID: "CAT_ON_CHAIN",
      ITEM_RECALL_STATUS: "CAT_ON_CHAIN",
      ITEM_CERTIFICATE_PDF: "CAT_OFF_CHAIN_HASH",
      ITEM_SENSOR_DATASET: "CAT_OFF_CHAIN_HASH",
      ITEM_WHOLESALE_PRICE: "CAT_AUTHORIZED_ONLY",
      ITEM_CUSTOMER_ADDRESS: "CAT_DO_NOT_COLLECT",
    };
    for (const [item, category] of Object.entries(placements)) {
      await this.page
        .locator(`#INT_DATA_GOVERNANCE_CLASSIFICATION-${item}`)
        .selectOption(category);
    }
    await this.submitAnswer();
  }

  /** The panel whose level-3 heading is exactly `name`. */
  panel(name: string): Locator {
    return this.page.locator("section").filter({
      has: this.page.getByRole("heading", { level: 3, name, exact: true }),
    });
  }

  /** Submit the named transaction, then seal its block if that step is offered. */
  async submitAndSeal(name: string): Promise<void> {
    const panel = this.panel(name);
    await panel.getByRole("button", { name: "Gửi giao dịch lên mạng" }).click();
    const seal = panel.getByRole("button", { name: "Ghi giao dịch vào khối" });
    if ((await seal.count()) > 0) await seal.click();
  }

  async continue(): Promise<void> {
    await this.page.getByRole("button", { name: "Tiếp tục" }).last().click();
  }

  /** Stages 1 to 5, ending with the committed manifest correction. */
  async playThroughStageFive(): Promise<void> {
    await this.start();
    await this.expectStage(1);
    await this.answer(/Không\. Blockchain giúp xác định/);
    await this.continue();

    await this.expectStage(2);
    await this.submitAndSeal("Thông tin lô hàng");
    await this.continue();

    await this.expectStage(3);
    await this.answer(/Lưu tệp ngoài chuỗi/);
    await this.submitAndSeal("Ghi nhận tài liệu lên chuỗi");
    await this.submitAndSeal("Cấp chứng nhận cho lô hàng");
    await this.page.getByRole("button", { name: "Thử gửi chứng nhận này" }).click();
    await this.answer(/Từ chối, vì đơn vị cấp không có thẩm quyền/);
    await this.continue();

    await this.expectStage(4);
    await this.answer(/Chỉ chuyển quyền lưu giữ/);
    await this.submitAndSeal("Bàn giao lô hàng cho đơn vị vận chuyển");
    await this.answer(/Ghi nhận vượt ngưỡng/);
    await this.submitAndSeal("Ghi nhận điều kiện vận chuyển");
    await this.continue();

    await this.expectStage(5);
    await this.submitAndSeal("Tiếp nhận lô hàng");
    await this.submitAndSeal("Ghi nhận việc mua lô hàng");
    await this.submitAndSeal("Gửi giao dịch điều chỉnh");
  }

  /** Stages 1 to 7, ending with the packaged lot on the retailer's shelf. */
  async playThroughStageSeven(): Promise<void> {
    await this.playThroughStageFive();
    await this.continue();

    await this.expectStage(6);
    await this.submitAndSeal("Chuyển đổi lô hàng");
    await this.answer(/Là một lô mới, có quan hệ nguồn gốc/);
    await this.continue();

    await this.expectStage(7);
    await this.submitAndSeal("Đóng gói thành phẩm");
    await this.submitAndSeal("Chuyển quyền sở hữu cho nhà phân phối");
    await this.submitAndSeal("Giao hàng cho nhà bán lẻ");
  }

  /** Stage 8: the public view and the tamper escalation. */
  async playThroughStageEight(): Promise<void> {
    await this.continue();
    await this.expectStage(8);
    await this.page.getByRole("button", { name: "Chạy thử nghiệm sửa dữ liệu" }).click();
    await this.answer(/Blockchain không ngăn được việc sửa/);
    await this.classifyGovernanceItems();
  }
}

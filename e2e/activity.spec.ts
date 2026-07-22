import { expect, test } from "@playwright/test";
import { Activity } from "./support/activity";
import { installScormApi, peek } from "./scorm-harness";

test.beforeEach(async ({ page }) => {
  await installScormApi(page);
});

function allowMeasuredWebKitWalkthrough(browserName: string): void {
  if (browserName === "webkit") test.setTimeout(240_000);
}

test.describe("the whole activity in a real browser", () => {
  // Nine stages of real rendering, in four engines. Generous, and it earns it.

  test("carries a learner from orientation to a graded result", async ({ page, browserName }) => {
    allowMeasuredWebKitWalkthrough(browserName);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.playThroughStageSeven();

    // Both immutable lineage records are learner-visible. The manifest still
    // says 1000 KG; the appended correction resolves the effective value to 100 KG.
    await page.getByRole("tab", { name: "Lịch sử giao dịch" }).click();
    const manifestRow = page
      .getByRole("row")
      .filter({ hasText: "Hợp tác xã Cà phê Cao nguyên" })
      .filter({ hasText: "Ghi nhận tài liệu" });
    await expect(manifestRow).toHaveCount(1);
    await manifestRow.getByRole("button").click();
    await expect(page.getByText("Vận đơn", { exact: true })).toBeVisible();
    await expect(page.getByText("1000 KG", { exact: true })).toBeVisible();

    const correctionRow = page.getByRole("row").filter({ hasText: "Giao dịch điều chỉnh" });
    await correctionRow.getByRole("button").click();
    await expect(page.getByText("DOC_SHIPPING_MANIFEST_001.declaredQuantity")).toBeVisible();
    await expect(page.getByText("100 KG", { exact: true }).last()).toBeVisible();

    // The packaged lot reached the retailer holding both rights.
    const packagedCard = page.getByRole("article").filter({
      has: page.getByText("BAT_PACKAGED_COFFEE_001", { exact: true }),
    });
    await expect(packagedCard.getByText("Siêu thị Việt Market").first()).toBeVisible();
    await expect(packagedCard.getByText("820 gói")).toBeVisible();

    await activity.playThroughStageEight();
    await activity.continue();

    await activity.expectStage(9);
    await activity.selectLots(/BAT_PACKAGED_COFFEE_001/, /BAT_ROASTED_COFFEE_001/);
    await expect(page.getByText(/Phạm vi thu hồi chính xác/)).toBeVisible();

    await activity.submitAndSeal("Gửi lệnh thu hồi");
    await activity.answer(/Khi nhiều tổ chức độc lập cần dùng chung bản ghi/);

    const report = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Kết quả hoạt động" }),
    });
    await expect(report.getByText(/Tổng điểm/)).toBeVisible();

    // Nothing reaches the LMS until the learner has seen the result.
    expect(await peek(page, "cmi.core.lesson_status")).not.toBe("passed");
    await report.getByRole("button", { name: "Kết thúc và gửi kết quả" }).click();
    await expect(report.getByText(/Đã gửi kết quả/)).toBeVisible();

    expect(await peek(page, "cmi.core.lesson_status")).toBe("passed");
    expect(Number(await peek(page, "cmi.core.score.raw"))).toBeGreaterThanOrEqual(70);
  });
});

test.describe("rules the learner can feel", () => {
  test("refuses a custody transfer that also moves ownership, and explains why", async ({
    page,
  }) => {
    await page.goto("/");
    const activity = new Activity(page);

    await activity.start();
    await activity.answer(/Không\. Blockchain giúp xác định/);
    await activity.continue();
    await activity.submitAndSeal("Thông tin lô hàng");
    await activity.continue();
    await activity.answer(/Lưu tệp ngoài chuỗi/);
    await activity.submitAndSeal("Ghi nhận tài liệu lên chuỗi");
    await activity.submitAndSeal("Cấp chứng nhận cho lô hàng");
    await page.getByRole("button", { name: "Thử gửi chứng nhận này" }).click();
    await activity.answer(/Từ chối, vì đơn vị cấp không có thẩm quyền/);
    await activity.continue();

    // Answering the scope question wrongly builds the transaction the rules
    // refuse -- the mark and the mechanic cannot disagree.
    await activity.expectStage(4);
    await activity.answer(/Chuyển cả quyền sở hữu và quyền lưu giữ/);

    const panel = activity.panel("Bàn giao lô hàng cho đơn vị vận chuyển");
    await panel.getByRole("button", { name: "Gửi giao dịch lên mạng" }).click();

    // A teaching message, not an error code.
    await expect(
      page.getByText(/Đơn vị vận chuyển giữ hộ hàng chứ không mua lô hàng/),
    ).toBeVisible();
  });

  test("shows the tamper escalation without touching the learner's ledger", async ({ page }) => {
    await page.goto("/");
    const activity = new Activity(page);

    await activity.playThroughStageSeven();
    await activity.continue();
    await activity.expectStage(8);

    await page.getByRole("button", { name: "Chạy thử nghiệm sửa dữ liệu" }).click();

    await expect(page.getByRole("heading", { name: /Bước 1 — Sửa khối lượng/ })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Bước 2 — Làm lại hàm băm của giao dịch/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Bước 3 — Làm lại hàm băm của khối/ }),
    ).toBeVisible();
    await expect(page.getByText(/Sổ cái thật của bạn vẫn nguyên vẹn/)).toBeVisible();
  });

  test("scores a recall that sweeps up the lookalike lot as over-broad", async ({
    page,
    browserName,
  }) => {
    allowMeasuredWebKitWalkthrough(browserName);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.playThroughStageSeven();
    await activity.playThroughStageEight();
    await activity.continue();
    await activity.expectStage(9);

    // BAT_PACKAGED_COFFEE_002 shares co-operative, region, product name and
    // roasting day. Only the provenance edge separates it.
    await activity.selectLots(
      /BAT_PACKAGED_COFFEE_001/,
      /BAT_ROASTED_COFFEE_001/,
      /BAT_PACKAGED_COFFEE_002/,
    );

    await expect(page.getByText(/Thu hồi thừa 1 lô không chịu ảnh hưởng/)).toBeVisible();
  });
});

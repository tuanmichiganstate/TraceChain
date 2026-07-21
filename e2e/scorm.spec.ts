import { expect, test } from "@playwright/test";
import { Activity } from "./support/activity";
import { installScormApi, peek, writes } from "./scorm-harness";

test.describe("saving and resuming", () => {
  test.slow();

  /**
   * The scenario that matters most in production and is hardest to fake: a
   * learner leaves mid-attempt and comes back. jsdom can assert the codec round
   * trips; only a real browser reload proves the application rebuilds itself
   * from what the LMS handed back.
   */
  test("returns a learner to where they left off, from suspend data alone", async ({ page }) => {
    await installScormApi(page);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.start();
    await activity.answer(/Không\. Blockchain giúp xác định/);
    await activity.continue();
    await activity.expectStage(2);
    await activity.submitAndSeal("Thông tin lô hàng");

    const saved = await peek(page, "cmi.suspend_data");
    expect(saved).not.toBe("");
    expect(saved.length).toBeLessThan(4096);

    // Relaunch exactly as Moodle would: same suspend data, entry=resume.
    await installScormApi(page, {
      initialValues: { "cmi.suspend_data": saved, "cmi.core.entry": "resume" },
    });
    await page.goto("/");

    await activity.resumePrevious();
    await activity.expectStage(2);
    // The batch the learner created is still on the ledger after the reload.
    await expect(page.getByText("BAT_GREEN_COFFEE_001").first()).toBeVisible();
  });

  test("keeps suspend data inside the 4096-character ceiling", async ({ page }) => {
    await installScormApi(page);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.playThroughStageSeven();
    await activity.playThroughStageEight();

    const saved = await peek(page, "cmi.suspend_data");
    // The harness refuses anything longer with error 405, exactly as Moodle
    // does, so an overflow would have failed the write rather than truncating.
    expect(saved.length).toBeLessThan(4096);
  });
});

test.describe("a relaunch in review mode", () => {
  /**
   * Moodle reopens a completed activity in review mode. The grade must survive
   * the visit, and the learner must be told why nothing they do sticks.
   */
  test("is read-only, says so, and writes nothing at all", async ({ page }) => {
    await installScormApi(page, {
      initialValues: {
        "cmi.core.lesson_mode": "review",
        "cmi.core.lesson_status": "passed",
        "cmi.core.score.raw": "84",
      },
    });
    await page.goto("/");

    await expect(page.getByText(/Chế độ chỉ xem lại/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Bắt đầu mô phỏng" })).toHaveCount(0);
    await expect(page.getByText("Đã lưu tiến độ")).toHaveCount(0);

    // Controls are inert, not merely ignored: the option itself cannot be
    // chosen, so there is no answer to submit in the first place.
    await expect(
      page.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Trả lời" }).first()).toBeDisabled();

    expect(await writes(page)).toEqual([]);
    expect(await peek(page, "cmi.core.lesson_status")).toBe("passed");
    expect(await peek(page, "cmi.core.score.raw")).toBe("84");
  });
});

test.describe("suspend data that no longer decodes", () => {
  test("offers recovery instead of silently starting over", async ({ page }) => {
    const corrupted = "TC1.61r.0021.0.0.deadbeef";
    await installScormApi(page, {
      initialValues: { "cmi.suspend_data": corrupted, "cmi.core.entry": "resume" },
    });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Không khôi phục được tiến độ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bắt đầu lại hoạt động" })).toBeVisible();
    // Nothing overwrote it before the learner chose what to do.
    expect(await peek(page, "cmi.suspend_data")).toBe(corrupted);
  });
});

test.describe("a launch with no LMS at all", () => {
  test("falls back to standalone and says progress stays in the browser", async ({ page }) => {
    // No installScormApi: window.API is absent, as when the package is opened
    // straight from disk.
    await page.goto("/");
    await page.getByRole("button", { name: "Bắt đầu mô phỏng" }).click();

    await expect(page.getByText(/Chế độ chạy độc lập/)).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";
import { Activity } from "./support/activity";
import { installScormApi, peek, writes } from "./scorm-harness";

test.describe("saving and resuming", () => {

  /**
   * The scenario that matters most in production and is hardest to fake: a
   * learner leaves mid-attempt and comes back. jsdom can assert the codec round
   * trips; only a real browser reload proves the application rebuilds itself
   * from what the LMS handed back.
   */
  test("returns a learner to where they left off, from suspend data alone", async ({
    page,
    browserName,
  }) => {
    // The two-core Linux WebKit runner has been measured reaching the final
    // Stage 5 commit at roughly 86 seconds. Keep the ordinary 90-second budget
    // for every short test, while giving this full replay walkthrough the same
    // measured allowance as the other long WebKit journeys in this suite.
    if (browserName === "webkit") test.setTimeout(240_000);
    await installScormApi(page);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.playThroughStageFive();
    await activity.continue();
    await activity.expectStage(6);

    const saved = await peek(page, "cmi.suspend_data");
    expect(saved).not.toBe("");
    expect(saved.length).toBeLessThan(4096);

    // Relaunch exactly as Moodle would: same suspend data, entry=resume.
    await installScormApi(page, {
      initialValues: { "cmi.suspend_data": saved, "cmi.core.entry": "resume" },
    });
    await page.goto("/");

    await activity.resumePrevious();
    await activity.expectStage(6);

    // The scripted manifest and learner correction are rebuilt from suspend
    // data, not inferred from static stage copy.
    // This test covers replay, not pointer hit testing. WebKit CI can stall
    // while scrolling these already-visible controls into view, so bypass its
    // flaky actionability wait while still dispatching real browser clicks.
    await page
      .getByRole("button", { name: "Bảng tra cứu" })
      .click({ force: true });
    await page
      .getByRole("tab", { name: "Lịch sử giao dịch" })
      .click({ force: true });
    const correctionRow = page.getByRole("row").filter({ hasText: "Giao dịch điều chỉnh" });
    await expect(correctionRow).toHaveCount(1);
    await correctionRow.getByRole("button").click({ force: true });
    await expect(page.getByText("DOC_SHIPPING_MANIFEST_001.declaredQuantity")).toBeVisible();
    await expect(page.getByText("100 kg", { exact: true }).last()).toBeVisible();
  });

  test("replays a rejected signed proposal with byte-identical evidence", async ({
    page,
  }) => {
    await installScormApi(page);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.start();
    await activity.answer(/Không\. Blockchain giúp xác định/);
    await activity.continue();
    await activity.submitAndSeal("Thông tin lô hàng");
    await activity.continue();
    await activity.submitSoundCertificateDecision();
    await activity.inspectUnauthorizedCertificateSignature();

    const panel = activity.panel(
      "Kiểm tra chữ ký của bên đề nghị cấp chứng nhận",
    );
    await panel
      .getByText("Xem bằng chứng kỹ thuật", { exact: true })
      .click();
    const digest = await panel.locator("code.hash").first().innerText();
    const saved = await peek(page, "cmi.suspend_data");
    expect(saved).not.toBe("");

    await installScormApi(page, {
      initialValues: {
        "cmi.suspend_data": saved,
        "cmi.core.entry": "resume",
      },
    });
    await page.goto("/");
    await activity.resumePrevious();
    await activity.expectStage(3);

    const replayedPanel = activity.panel(
      "Kiểm tra chữ ký của bên đề nghị cấp chứng nhận",
    );
    await expect(
      replayedPanel.getByText("Không được phép thực hiện hành động này"),
    ).toBeVisible();
    await replayedPanel
      .getByText("Xem bằng chứng kỹ thuật", { exact: true })
      .click();
    await expect(replayedPanel.locator("code.hash").first()).toHaveText(
      digest,
    );
    await expect(
      replayedPanel.getByRole("button", {
        name: "Ghi giao dịch vào khối",
      }),
    ).toHaveCount(0);
  });

  test("resumes a pending proposal, retained decline, and collected endorsement", async ({
    page,
  }) => {
    await installScormApi(page);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.start();
    await activity.answer(/Không\. Blockchain giúp xác định/);
    await activity.continue();
    await activity.submitAndSeal("Thông tin lô hàng");
    await activity.continue();
    await activity.submitSoundCertificateDecision();
    await activity.submitAndSeal("Ghi nhận tài liệu lên chuỗi");
    await activity.submitAndSeal("Cấp chứng nhận cho lô hàng");
    await activity.continue();
    await activity.answer(/Chỉ chuyển quyền lưu giữ/);

    const panel = activity.panel(
      "Bàn giao lô hàng cho đơn vị vận chuyển",
    );
    await panel
      .getByRole("button", {
        name: "Gửi giao dịch lên mạng",
      })
      .click();
    await expect(
      panel.getByText(/1 trên 2 tổ chức bắt buộc/),
    ).toBeVisible();

    const pendingSaved = await peek(page, "cmi.suspend_data");
    await installScormApi(page, {
      initialValues: {
        "cmi.suspend_data": pendingSaved,
        "cmi.core.entry": "resume",
      },
    });
    await page.goto("/");
    await activity.resumePrevious();
    await activity.expectStage(4);

    const replayedPanel = activity.panel(
      "Bàn giao lô hàng cho đơn vị vận chuyển",
    );
    await expect(
      replayedPanel.getByText(/1 trên 2 tổ chức bắt buộc/),
    ).toBeVisible();
    await replayedPanel
      .getByRole("button", {
        name: "Bàn giao cho bên tiếp nhận lưu giữ",
      })
      .click();
    await replayedPanel
      .getByRole("button", { name: "Từ chối đề xuất" })
      .click();
    await expect(
      replayedPanel.getByText(
        /Lần từ chối trước vẫn được giữ trong lịch sử/,
      ),
    ).toBeVisible();

    const declinedSaved = await peek(page, "cmi.suspend_data");
    await installScormApi(page, {
      initialValues: {
        "cmi.suspend_data": declinedSaved,
        "cmi.core.entry": "resume",
      },
    });
    await page.goto("/");
    await activity.resumePrevious();
    await activity.expectStage(4);

    const declinedPanel = activity.panel(
      "Bàn giao lô hàng cho đơn vị vận chuyển",
    );
    await expect(
      declinedPanel.getByText(
        /Lần từ chối trước vẫn được giữ trong lịch sử/,
      ),
    ).toBeVisible();
    await declinedPanel
      .getByRole("button", {
        name: "Ký và phê duyệt đề xuất",
      })
      .click();
    await expect(
      declinedPanel.getByText(/Đã đáp ứng yêu cầu/),
    ).toBeVisible();

    const endorsedSaved = await peek(page, "cmi.suspend_data");
    await installScormApi(page, {
      initialValues: {
        "cmi.suspend_data": endorsedSaved,
        "cmi.core.entry": "resume",
      },
    });
    await page.goto("/");
    await activity.resumePrevious();
    await activity.expectStage(4);

    const endorsedPanel = activity.panel(
      "Bàn giao lô hàng cho đơn vị vận chuyển",
    );
    await expect(
      endorsedPanel.getByText(/Đã đáp ứng yêu cầu/),
    ).toBeVisible();
    await endorsedPanel
      .getByRole("button", {
        name: "Cam kết giao dịch đã được phê duyệt",
      })
      .click();
    await expect(
      endorsedPanel.getByRole("button", {
        name: "Ghi giao dịch vào khối",
      }),
    ).toBeVisible();
  });

  /**
   * A hint is persisted as one bit in the hint bitmap, and the credit it caps is
   * recomputed from the scenario's declared targets on load rather than stored.
   * That is what keeps a resumed attempt worth exactly what it was worth when
   * the learner left it -- and it is the part a schema change could silently
   * break, because nothing on screen would look wrong.
   */
  test("keeps the score a used hint produced across a real reload", async ({ page }) => {
    await installScormApi(page);
    await page.goto("/");
    const activity = new Activity(page);

    await activity.start();
    await activity.expectStage(1);
    await activity.answer(/Không\. Blockchain giúp xác định/);
    await activity.continue();
    await activity.expectStage(2);

    // Do the work first, then take the hint: that exercises the retroactive
    // cap through a real reload rather than only the flag surviving.
    await activity.submitAndSeal("Thông tin lô hàng");
    const earned = await page.locator(".top-bar__item--score dd").innerText();

    // The stage 2 hint caps only "create the coffee batch": 4 points at 70%.
    await expect(page.getByText(/Tạo lô cà phê trên sổ cái/).last()).toBeVisible();
    await page.getByRole("button", { name: "Xem gợi ý" }).click();

    const capped = await page.locator(".top-bar__item--score dd").innerText();
    expect(capped).not.toBe(earned);

    const saved = await peek(page, "cmi.suspend_data");
    expect(saved).not.toBe("");

    await installScormApi(page, {
      initialValues: { "cmi.suspend_data": saved, "cmi.core.entry": "resume" },
    });
    await page.goto("/");
    await activity.resumePrevious();
    await activity.expectStage(3);

    await expect(page.locator(".top-bar__item--score dd")).toHaveText(capped);
  });

  test("keeps suspend data inside the 4096-character ceiling", async ({ page, browserName }) => {
    if (browserName === "webkit") test.setTimeout(240_000);
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
    const corrupted = "LEGACY2.61r.0021.0.0.deadbeef";
    await installScormApi(page, {
      initialValues: { "cmi.suspend_data": corrupted, "cmi.core.entry": "resume" },
    });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Không khôi phục được tiến độ" })).toBeVisible();
    await expect(page.getByText(/dùng LMS để bắt đầu một lượt học mới/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Bắt đầu lại hoạt động" })).toHaveCount(0);
    // SimuLedger cannot create a new LMS attempt or destructively clear this
    // one from inside the package.
    expect(await peek(page, "cmi.suspend_data")).toBe(corrupted);
  });
});

test.describe("an invalid embedded package configuration", () => {
  test("shows the localized failure screen instead of starting", async ({ page }) => {
    await installScormApi(page);
    await page.route("**/simuledger.config.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          configuration: {},
          configurationHash: "invalid",
        }),
      });
    });
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "Không thể khởi động gói SimuLedger này",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Cấu hình hoặc kịch bản nhúng bị thiếu/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bắt đầu mô phỏng" }),
    ).toHaveCount(0);
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

test.describe("the suspend_data boundary in a real browser", () => {
  /**
   * The harness's limit is deliberately not imported from production code, so a
   * unit test comparing constants cannot prove it behaves correctly. This
   * exercises it through the API surface the application actually calls.
   */
  test("accepts 4096 characters and refuses 4097 with error 405", async ({ page }) => {
    await installScormApi(page);
    await page.goto("/");

    const result = await page.evaluate(() => {
      const api = (window as unknown as { API: Record<string, (...a: string[]) => string> }).API;
      const set = (n: number) => {
        const ok = api["LMSSetValue"]!("cmi.suspend_data", "x".repeat(n));
        return { ok, error: api["LMSGetLastError"]!() };
      };
      return { at4095: set(4095), at4096: set(4096), at4097: set(4097) };
    });

    expect(result.at4095.ok).toBe("true");
    expect(result.at4096.ok).toBe("true");
    expect(result.at4097.ok).toBe("false");
    expect(result.at4097.error).toBe("405");
    // A refused write must not truncate what was already stored.
    expect(await peek(page, "cmi.suspend_data")).toHaveLength(4096);
  });
});

import { expect, test, type Page } from "@playwright/test";
import { Activity } from "./support/activity";
import { installScormApi } from "./scorm-harness";

test.beforeEach(async ({ page }) => {
  await installScormApi(page);
});

test.describe("keyboard only", () => {
  /**
   * Section 26 requires the activity to be operable without a mouse. jsdom
   * cannot answer this: focus behaviour belongs to the browser, and the engines
   * genuinely disagree about it.
   */
  test("operates the first stage with the keyboard alone", async ({ page }) => {
    await page.goto("/");

    const start = page.getByRole("button", { name: "Bắt đầu mô phỏng" });
    await start.focus();
    await page.keyboard.press("Enter");

    const stageHeading = page.getByRole("heading", { level: 2, name: /^Bước 1/ });
    await expect(stageHeading).toBeVisible();
    await expect(stageHeading).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    const option = page.getByRole("radio", { name: /Không\. Blockchain giúp xác định/ });
    await option.focus();
    await page.keyboard.press("Space");
    await expect(option).toBeChecked();

    const submit = page.locator("button:not([disabled])").filter({ hasText: /^Trả lời$/ }).first();
    await submit.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByText(/^(Đúng|Chưa đúng)$/).first()).toBeVisible();
  });

  test("moves between the reference panels with arrow keys, per the ARIA tab pattern", async ({
    page,
  }) => {
    await page.goto("/");
    const activity = new Activity(page);
    await activity.start();
    await page.getByRole("button", { name: "Bảng tra cứu" }).click();

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(5);

    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(tabs.nth(4)).toHaveAttribute("aria-selected", "true");
  });

  /**
   * WebKit is excluded on purpose, and it is not a defect in the activity.
   * Safari ships with "Press Tab to highlight each item on a webpage" turned
   * off, so Tab moves focus to nothing at all -- a probe run against this build
   * found focus still on BODY after six presses, while Chromium reached the
   * start button on the first. Users who rely on the keyboard turn full
   * keyboard access on; the behaviour under test belongs to that setting, not
   * to this page. Operability itself is covered above, on every engine.
   */
  test.describe("where the platform tabs to buttons by default", () => {
    test.skip(
      ({ browserName }) => browserName === "webkit",
      "Safari does not Tab to buttons unless full keyboard access is enabled",
    );

    test("reaches the start button by tabbing, and shows a focus ring", async ({ page }) => {
      await page.goto("/");
      const start = page.getByRole("button", { name: "Bắt đầu mô phỏng" });
      await expect(start).toBeVisible();

      // The skip link is the first stop and announces itself by moving into
      // view rather than by drawing an outline, so tab past it.
      for (let i = 0; i < 10; i += 1) {
        await page.keyboard.press("Tab");
        if (await start.evaluate((el) => el === document.activeElement)) break;
      }
      await expect(start).toBeFocused();

      // :focus-visible only matches keyboard focus, which is why this cannot be
      // checked by calling .focus() from a script.
      const outline = await start.evaluate((el) => {
        const style = getComputedStyle(el);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline.style).not.toBe("none");
      expect(parseFloat(outline.width)).toBeGreaterThan(0);
    });
  });
});

test.describe("reflow", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  /**
   * Every element that sticks out of a 320 px viewport, by tag and first class.
   *
   * Reported as a list rather than a boolean because the failure message is the
   * whole value: "something overflows" sends a maintainer hunting, whereas
   * "CODE.validation__rule-id" names the rule to fix.
   */
  async function measureReflow(
    page: Page,
  ): Promise<{ scrolls: boolean; offenders: string[] }> {
    return page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll("*")]
        .filter((el) => {
          // The skip link is deliberately parked off-screen until focused.
          if (el.classList.contains("skip-link")) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && (rect.right > width + 1 || rect.left < -1);
        })
        .map((el) => `${el.tagName}.${el.className.toString().split(" ")[0] ?? ""}`);
      return {
        scrolls: document.documentElement.scrollWidth > width + 1,
        offenders: [...new Set(offenders)],
      };
    });
  }

  /**
   * Section 26's narrowest supported width. Checked in a genuinely 320 px
   * viewport rather than a resized element, so the media queries evaluate the
   * way they would on a phone.
   */
  test("neither scrolls horizontally nor overflows at 320 px", async ({ page }) => {
    await page.goto("/");
    const activity = new Activity(page);
    await activity.start();
    await expect(page.getByRole("heading", { level: 2, name: /^Bước 1/ })).toBeVisible();

    const report = await measureReflow(page);
    expect(report.offenders, report.offenders.join(", ")).toEqual([]);
    expect(report.scrolls).toBe(false);
  });

  /**
   * Stage 1 alone is not enough, and that gap shipped: it has no transaction,
   * so it renders no validation results, and the rule identifiers there --
   * unbreakable 29-character tokens -- pushed every later stage into a
   * horizontal scroll at 320 px without any test noticing.
   */
  test("still does not overflow once transactions and their rules are on screen", async ({
    page,
  }) => {
    await page.goto("/");
    const activity = new Activity(page);
    await activity.playThroughStageFive();

    const report = await measureReflow(page);
    expect(report.offenders, report.offenders.join(", ")).toEqual([]);
    expect(report.scrolls).toBe(false);
  });

  /**
   * The recall question is the only check whose options carry asset identifiers,
   * and a fieldset -- uniquely among elements -- refuses to shrink below its
   * min-content width unless told to. Chromium only: this is CSS box sizing
   * rather than an engine quirk, and a fourth full walkthrough would push the
   * WebKit suite back over the budget that was deliberately reclaimed.
   */
  test("does not overflow on the recall question's identifier-laden options", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "layout-only check; one engine suffices");
    await page.goto("/");
    const activity = new Activity(page);

    await activity.playThroughStageSeven();
    await activity.playThroughStageEight();
    await activity.continue();
    await activity.expectStage(9);

    const report = await measureReflow(page);
    expect(report.offenders, report.offenders.join(", ")).toEqual([]);
    expect(report.scrolls).toBe(false);
  });
});

test.describe("the document outline", () => {
  test("names the running workspace with exactly one h1", async ({ page }) => {
    await page.goto("/");
    const activity = new Activity(page);
    await activity.start();
    await expect(page.getByRole("heading", { level: 2, name: /^Bước 1/ })).toBeVisible();

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});

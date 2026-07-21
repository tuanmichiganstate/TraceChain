import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * These tests run against the built bundle rather than the dev server: the
 * artefact that ships to Moodle is `dist/`, and a Vite dev build differs from
 * it in module loading, minification and asset paths. Testing the thing that
 * ships is the point.
 *
 * The unit and component suites already drive all nine stages in jsdom. What
 * only a real browser can answer is layout, focus, real event ordering, and
 * whether the three engines agree -- so these scenarios deliberately favour
 * those over re-asserting domain behaviour.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  // On CI, an HTML report so a failure is inspectable after the fact. The first
  // attempt failed to upload anything because "line" writes no report directory
  // -- a red job with no evidence is barely better than no job.
  reporter: process.env["CI"]
    ? [["line"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // The activity is Vietnamese; a browser negotiating another locale must not
    // change what renders.
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },

  // Per-project test timeouts, set explicitly rather than through `test.slow()`
  // so each project's budget is visible and independent. The long walkthroughs
  // used to call test.slow(), which tripled whatever the default was; that
  // coupling made a per-project override ambiguous, so it was removed.
  //
  // WebKit's Linux port is far slower than macOS WebKit, and this suite's
  // locators are accessibility-tree queries (getByRole with name regexes) that
  // recompute as the workspace DOM grows through the walkthrough. Measured in
  // the pinned Playwright Linux container constrained to two cores -- GitHub's
  // runner size -- the nine-stage walkthrough needs ~180s, where macOS WebKit
  // takes ~4s and Chromium/Firefox take ~10s. So the WebKit family gets 240s
  // (measured 180s plus margin) and the Blink/Gecko projects keep 90s. Raising
  // the latter would hide a real regression behind a WebKit-shaped allowance.
  projects: [
    { name: "chromium", timeout: 90_000, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", timeout: 90_000, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", timeout: 240_000, use: { ...devices["Desktop Safari"] } },
    // A real phone profile, not a resized desktop window: touch, device pixel
    // ratio and viewport all differ, and section 26 requires 320 px reflow.
    // Also WebKit-family, so the same Linux slowness applies.
    { name: "mobile-safari", timeout: 240_000, use: { ...devices["iPhone SE"] } },
  ],

  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});

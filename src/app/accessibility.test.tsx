import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

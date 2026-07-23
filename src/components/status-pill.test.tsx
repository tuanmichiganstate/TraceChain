import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClassificationPill, StatusPill } from "./status-pill";

/**
 * The glyph is what keeps a pill readable without colour, so which pills carry
 * one is a decision worth pinning down rather than leaving to whoever edits the
 * map next.
 *
 * Three of the four verdicts carry one. Neutral does not, and that is the
 * point: it is the absence of a verdict, so a mark there had nothing to say.
 * Both classification pills carry one, filled against hollow, because that pair
 * genuinely does have to survive being read in a single hue.
 */
describe("status pills", () => {
  it("marks each verdict that is a verdict with its own glyph", () => {
    for (const [tone, glyph] of [
      ["pass", "✓"],
      ["warn", "⚠"],
      ["fail", "✕"],
    ] as const) {
      const { unmount } = render(<StatusPill tone={tone}>Label</StatusPill>);
      const pill = screen.getByText("Label").closest(".status") as HTMLElement;
      expect(pill.querySelector('[aria-hidden="true"]')?.textContent).toBe(glyph);
      unmount();
    }
  });

  it("gives a neutral pill no glyph at all", () => {
    render(<StatusPill tone="neutral">Chưa xong</StatusPill>);
    const pill = screen.getByText("Chưa xong").closest(".status") as HTMLElement;
    expect(pill.querySelector('[aria-hidden="true"]')).toBeNull();
    // The label is all there is, so it must be all of the text -- no stray
    // bullet, no leading space left behind by the removed span.
    expect(pill.textContent).toBe("Chưa xong");
  });

  it("keeps the classification pair distinguishable in one hue", () => {
    for (const [tone, glyph] of [
      ["affected", "●"],
      ["unaffected", "○"],
    ] as const) {
      const { unmount } = render(<ClassificationPill tone={tone}>Lot</ClassificationPill>);
      const pill = screen.getByText("Lot").closest(".status") as HTMLElement;
      expect(pill.querySelector('[aria-hidden="true"]')?.textContent).toBe(glyph);
      unmount();
    }
  });

  it("never exposes a glyph to a screen reader", () => {
    render(<StatusPill tone="pass">Đạt</StatusPill>);
    const pill = screen.getByText("Đạt").closest(".status") as HTMLElement;
    for (const marked of pill.querySelectorAll('[aria-hidden="true"]')) {
      expect(marked.textContent).not.toBe("Đạt");
    }
  });
});

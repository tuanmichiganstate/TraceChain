import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { App } from "./app";
import { LocaleProvider } from "./providers/locale-provider";
import { ScenarioProvider } from "./providers/scenario-provider";
import { SimulationProvider } from "./providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../test/scorm-mock/mock-scorm-api";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";

/**
 * THE MILESTONE 6 EXIT CONDITION.
 *
 * The three ways a real LMS differs from a happy path: it can relaunch a
 * finished attempt in review mode, it wants the learner's answers recorded as
 * interactions, and it can hand back suspend data that no longer decodes.
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

function mount(api: MockScorm12Api): () => void {
  const uninstall = installMockScormApi(api);
  window.localStorage.clear();
  render(<AppUnderTest />);
  return uninstall;
}

describe("a relaunch in review mode", () => {
  let uninstall: (() => void) | null = null;
  afterEach(() => uninstall?.());

  /**
   * Moodle reopens a completed activity in `review` mode. The adapter already
   * refuses to write there, which protects the grade -- but a learner who is
   * not told keeps playing, and everything they do is discarded in silence.
   */
  it("tells the learner the attempt is read-only", async () => {
    const api = new MockScorm12Api({
      initialValues: {
        "cmi.core.lesson_mode": "review",
        "cmi.core.lesson_status": "passed",
      },
    });
    uninstall = mount(api);

    expect(await screen.findByText(/chỉ xem lại/i)).toBeInTheDocument();
  });

  it("writes nothing to the LMS, including the status it was launched with", async () => {
    const api = new MockScorm12Api({
      initialValues: {
        "cmi.core.lesson_mode": "review",
        "cmi.core.lesson_status": "passed",
        "cmi.core.score.raw": "84",
      },
    });
    uninstall = mount(api);
    await screen.findByText(/chỉ xem lại/i);

    // The grade the learner already earned survives the visit untouched.
    expect(api.peek("cmi.core.lesson_status")).toBe("passed");
    expect(api.peek("cmi.core.score.raw")).toBe("84");
    expect(api.peek("cmi.suspend_data")).toBe("");
  });

  /**
   * The notice explains that nothing is saved; leaving the controls live would
   * still invite an hour of work that goes nowhere. Read-only has to mean the
   * interface, not just the adapter.
   */
  it("leaves nothing to act on", async () => {
    const api = new MockScorm12Api({
      initialValues: { "cmi.core.lesson_mode": "review", "cmi.core.lesson_status": "passed" },
    });
    uninstall = mount(api);
    await screen.findByText(/chỉ xem lại/i);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
    for (const button of screen.getAllByRole("button", { name: "Trả lời" })) {
      expect(button).toBeDisabled();
    }
  });

  /**
   * The save indicator reads from saveStatus, which reaches "SAVED" whenever
   * the adapter returns without throwing -- and in review mode it returns
   * without throwing precisely because it wrote nothing.
   */
  it("does not claim to have saved anything", async () => {
    const api = new MockScorm12Api({
      initialValues: { "cmi.core.lesson_mode": "review", "cmi.core.lesson_status": "passed" },
    });
    uninstall = mount(api);
    await screen.findByText(/chỉ xem lại/i);

    expect(screen.queryByText("Đã lưu tiến độ")).toBeNull();
  });

  it("does not offer to start or resume an attempt", async () => {
    const api = new MockScorm12Api({
      initialValues: { "cmi.core.lesson_mode": "review", "cmi.core.lesson_status": "passed" },
    });
    uninstall = mount(api);
    await screen.findByText(/chỉ xem lại/i);

    expect(screen.queryByRole("button", { name: "Bắt đầu mô phỏng" })).toBeNull();
  });
});

describe("no-credit launches", () => {
  let uninstall: (() => void) | null = null;
  afterEach(() => uninstall?.());

  it("are read-only too, even in normal mode", async () => {
    const api = new MockScorm12Api({
      initialValues: { "cmi.core.credit": "no-credit", "cmi.core.lesson_mode": "normal" },
    });
    uninstall = mount(api);

    expect(await screen.findByText(/chỉ xem lại/i)).toBeInTheDocument();
  });
});

describe("recording answers as SCORM interactions", () => {
  let uninstall: (() => void) | null = null;
  afterEach(() => uninstall?.());

  /**
   * Section 21.7. SCORM 1.2 interactions are write-only -- nothing here can be
   * read back, so this is reporting for the instructor, never a second source
   * of truth for the attempt.
   */
  it("writes an interaction when a knowledge check is answered", async () => {
    const api = new MockScorm12Api();
    uninstall = mount(api);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await user.click(await screen.findByRole("radio", { name: /Không\. Blockchain giúp xác định/ }));
    await user.click(
      screen
        .getAllByRole("button", { name: "Trả lời" })
        .find((button) => !(button as HTMLButtonElement).disabled) as HTMLElement,
    );

    expect(api.peek("cmi.interactions.0.id")).toBe("INT_ORIENTATION_TRUTH_CHECK");
    expect(api.peek("cmi.interactions.0.type")).toBe("choice");
    expect(api.peek("cmi.interactions.0.result")).toBe("correct");
    expect(api.peek("cmi.interactions.0.student_response")).not.toBe("");
  });

  it("records an incorrect answer as incorrect", async () => {
    const api = new MockScorm12Api();
    uninstall = mount(api);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Bắt đầu mô phỏng" }));
    await user.click(await screen.findByRole("radio", { name: /Có\./ }));
    await user.click(
      screen
        .getAllByRole("button", { name: "Trả lời" })
        .find((button) => !(button as HTMLButtonElement).disabled) as HTMLElement,
    );

    expect(api.peek("cmi.interactions.0.result")).toBe("wrong");
  });
});

describe("suspend data that no longer decodes", () => {
  let uninstall: (() => void) | null = null;
  afterEach(() => uninstall?.());

  /**
   * Unsupported data is not interpreted or cleared. A package cannot create a
   * new Moodle attempt, so the recovery screen must say that honestly and
   * leave the LMS value untouched.
   */
  it("offers recovery rather than pretending the attempt is new", async () => {
    const api = new MockScorm12Api({
      initialValues: {
        "cmi.suspend_data": "LEGACY2.61r.0021.0.0.deadbeef",
        "cmi.core.entry": "resume",
      },
    });
    uninstall = mount(api);

    expect(await screen.findByText("Không khôi phục được tiến độ")).toBeInTheDocument();
    expect(screen.getByText(/dùng LMS để bắt đầu một lượt học mới/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu lại hoạt động" })).toBeNull();
    expect(api.peek("cmi.suspend_data")).toBe("LEGACY2.61r.0021.0.0.deadbeef");
  });
});

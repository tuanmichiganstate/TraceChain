import { beforeEach, describe, expect, it } from "vitest";
import { MockScorm12Api, MockErrorCode } from "../../../test/scorm-mock/mock-scorm-api";
import { Scorm12Adapter } from "./scorm12-adapter";
import { discoverScorm12Api, formatSessionTime, MAX_PARENT_TRAVERSAL_DEPTH } from "./scorm12-api";
import { CompletionStatus, PlatformMode } from "./learning-platform-adapter";

/**
 * A minimal stand-in for a browser window, so the ancestor and opener chains
 * can be shaped precisely. A top-level window is its own parent, which is what
 * makes an unbounded discovery loop possible in the first place.
 */
interface FakeWindow {
  API?: unknown;
  parent: FakeWindow;
  opener: FakeWindow | null;
}

function makeWindow(api?: unknown): FakeWindow {
  const win = { API: api, opener: null } as unknown as FakeWindow;
  win.parent = win;
  return win;
}

class RejectingMockScorm12Api extends MockScorm12Api {
  rejectedElement: string | null = null;
  rejectFinish = false;
  private forcedError: string | null = null;

  override LMSSetValue(element: string, value: string): string {
    if (element === this.rejectedElement) {
      this.forcedError = MockErrorCode.INCORRECT_DATA_TYPE;
      return "false";
    }
    this.forcedError = null;
    return super.LMSSetValue(element, value);
  }

  override LMSFinish(parameter: ""): string {
    if (this.rejectFinish) {
      this.forcedError = MockErrorCode.GENERAL_EXCEPTION;
      return "false";
    }
    this.forcedError = null;
    return super.LMSFinish(parameter);
  }

  override LMSGetLastError(): string {
    return this.forcedError ?? super.LMSGetLastError();
  }
}

function chain(depth: number, api: unknown): FakeWindow {
  const top = makeWindow(api);
  let current = top;
  for (let i = 0; i < depth; i += 1) {
    const child = makeWindow(undefined);
    child.parent = current;
    current = child;
  }
  return current;
}

const asWindow = (fake: FakeWindow): Window => fake as unknown as Window;

describe("SCORM 1.2 API discovery", () => {
  it("finds the API on the current window", () => {
    const api = new MockScorm12Api();
    expect(discoverScorm12Api(asWindow(makeWindow(api))).api).toBe(api);
  });

  it("finds the API several frames up the ancestor chain", () => {
    const api = new MockScorm12Api();
    expect(discoverScorm12Api(asWindow(chain(3, api))).api).toBe(api);
  });

  it("finds the API through the opener, for popup launches", () => {
    const api = new MockScorm12Api();
    const child = makeWindow(undefined);
    child.opener = makeWindow(api);
    expect(discoverScorm12Api(asWindow(child)).api).toBe(api);
  });

  it("stops at the traversal limit instead of looping forever", () => {
    const api = new MockScorm12Api();
    const tooDeep = chain(MAX_PARENT_TRAVERSAL_DEPTH + 5, api);
    const result = discoverScorm12Api(asWindow(tooDeep));
    expect(result.api).toBeNull();
    expect(result.diagnostics.join(" ")).toMatch(/ancestor windows/);
  });

  it("returns no API rather than throwing when there is none", () => {
    const result = discoverScorm12Api(asWindow(makeWindow(undefined)));
    expect(result.api).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("survives a cross-origin ancestor that throws on property access", () => {
    const hostile = makeWindow(undefined);
    Object.defineProperty(hostile, "API", {
      get() {
        throw new DOMException("Blocked a frame with origin", "SecurityError");
      },
    });
    expect(() => discoverScorm12Api(asWindow(hostile))).not.toThrow();
    expect(discoverScorm12Api(asWindow(hostile)).api).toBeNull();
  });
});

describe("session time formatting", () => {
  it("formats as HHHH:MM:SS.SS", () => {
    expect(formatSessionTime(0)).toBe("00:00:00.00");
    expect(formatSessionTime(1_500)).toBe("00:00:01.50");
    expect(formatSessionTime(65_000)).toBe("00:01:05.00");
    expect(formatSessionTime(3_600_000)).toBe("01:00:00.00");
    expect(formatSessionTime(2_730_000)).toBe("00:45:30.00");
  });

  it("carries rounded hundredths into the next minute or hour", () => {
    expect(formatSessionTime(59_999)).toBe("00:01:00.00");
    expect(formatSessionTime(3_599_999)).toBe("01:00:00.00");
  });

  it("produces a value the SCORM data model accepts", () => {
    const api = new MockScorm12Api();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.session_time", formatSessionTime(2_730_000))).toBe("true");
    expect(api.LMSGetLastError()).toBe(MockErrorCode.NO_ERROR);
  });

  it("has a strict mock that rejects an out-of-range seconds field", () => {
    const api = new MockScorm12Api();
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.session_time", "00:00:60.00")).toBe(
      "false",
    );
    expect(api.LMSGetLastError()).toBe(MockErrorCode.INCORRECT_DATA_TYPE);
  });

  it("treats a negative or non-finite duration as zero", () => {
    expect(formatSessionTime(-1)).toBe("00:00:00.00");
    expect(formatSessionTime(Number.NaN)).toBe("00:00:00.00");
  });
});

describe("Scorm12Adapter", () => {
  let api: MockScorm12Api;
  let now: number;

  const makeAdapter = (mockApi: MockScorm12Api = api): Scorm12Adapter =>
    new Scorm12Adapter({
      clock: () => now,
      rootWindow: asWindow(makeWindow(mockApi)),
    });

  beforeEach(() => {
    api = new MockScorm12Api();
    now = 1_000_000;
  });

  describe("initialization", () => {
    it("connects and reports SCORM mode", async () => {
      const result = await makeAdapter().initialize();
      expect(result.mode).toBe(PlatformMode.SCORM_1_2);
      expect(result.isConnected).toBe(true);
      expect(api.isInitialized).toBe(true);
    });

    it("marks a fresh attempt incomplete and declares the score range", async () => {
      await makeAdapter().initialize();
      expect(api.peek("cmi.core.lesson_status")).toBe("incomplete");
      expect(api.peek("cmi.core.score.min")).toBe("0");
      expect(api.peek("cmi.core.score.max")).toBe("100");
      expect(api.commitCount).toBeGreaterThan(0);
    });

    it("falls back to standalone mode when no API is present", async () => {
      const adapter = new Scorm12Adapter({ rootWindow: asWindow(makeWindow(undefined)) });
      const result = await adapter.initialize();
      expect(result.mode).toBe(PlatformMode.STANDALONE);
      expect(result.isConnected).toBe(false);
    });

    it("does not downgrade a status the learner already earned", async () => {
      const passed = new MockScorm12Api({ initialValues: { "cmi.core.lesson_status": "passed" } });
      await makeAdapter(passed).initialize();
      expect(passed.peek("cmi.core.lesson_status")).toBe("passed");
    });

    it("reports a resumed attempt from cmi.core.entry", async () => {
      const resumed = new MockScorm12Api({
        initialValues: { "cmi.core.entry": "resume", "cmi.suspend_data": "LEGACY1.100.0000.0.0.abc" },
      });
      const adapter = makeAdapter(resumed);
      await adapter.initialize();
      expect((await adapter.getLearnerContext()).isResumed).toBe(true);
    });
  });

  describe("save and resume", () => {
    it("round-trips encoded state through suspend_data", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      const encoded = "LEGACY1.81ff.0031002.5.3.a1b2c3d4";

      await adapter.saveAttemptState(encoded);
      await adapter.commit();

      // A relaunch reads what the previous session stored.
      const relaunched = new MockScorm12Api({ initialValues: api.snapshot() });
      const second = makeAdapter(relaunched);
      await second.initialize();
      expect(await second.loadAttemptState()).toBe(encoded);
    });

    it("reports no stored state for a first launch", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      expect(await adapter.loadAttemptState()).toBeNull();
    });

    it("appends interactions after records from a resumed attempt", async () => {
      const resumed = new MockScorm12Api({
        initialValues: {
          "cmi.core.entry": "resume",
          "cmi.interactions.0.id": "INT_EXISTING",
          "cmi.interactions.0.type": "choice",
          "cmi.interactions.0.student_response": "A",
          "cmi.interactions.0.result": "correct",
          "cmi.interactions.0.time": "08:00:00",
        },
      });
      const adapter = makeAdapter(resumed);
      await adapter.initialize();

      expect(resumed.LMSGetValue("cmi.interactions._count")).toBe("1");
      await adapter.recordInteraction({
        interactionId: "INT_NEW",
        type: "choice",
        learnerResponse: "B",
        isCorrect: false,
        scenarioTimestamp: "2026-07-27T08:05:00.000Z",
      });

      expect(resumed.peek("cmi.interactions.0.id")).toBe("INT_EXISTING");
      expect(resumed.peek("cmi.interactions.1.id")).toBe("INT_NEW");
    });

    it("stores the raw stage identifier as the lesson location", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      await adapter.setLocation("STG_06_TRANSFORM_BATCH");
      expect(api.peek("cmi.core.lesson_location")).toBe("STG_06_TRANSFORM_BATCH");
    });

    /**
     * The failure this whole design exists to prevent. If the encoded state
     * ever outgrows the data model, a real LMS rejects the write, and the
     * adapter must notice rather than believe it saved.
     */
    it("rejects the authoritative save when the LMS rejects oversized suspend data", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();

      await expect(
        adapter.saveAttemptState("x".repeat(5000)),
      ).rejects.toThrow(
        "LMSSetValue rejected authoritative suspend data",
      );

      expect(api.peek("cmi.suspend_data")).toBe("");
      expect(adapter.getDiagnostics().join(" ")).toMatch(/rejected with error 405/);
    });
  });

  describe("score and completion", () => {
    it("writes the score with its declared range", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      await adapter.setScore(84);
      expect(api.peek("cmi.core.score.raw")).toBe("84");
      expect(api.peek("cmi.core.score.min")).toBe("0");
      expect(api.peek("cmi.core.score.max")).toBe("100");
    });

    it("clamps and rounds a score into the 0-100 range the data model allows", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      await adapter.setScore(84.6);
      expect(api.peek("cmi.core.score.raw")).toBe("85");
      await adapter.setScore(140);
      expect(api.peek("cmi.core.score.raw")).toBe("100");
      await adapter.setScore(-5);
      expect(api.peek("cmi.core.score.raw")).toBe("0");
    });

    it("writes completion statuses the vocabulary permits", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      for (const status of [
        CompletionStatus.COMPLETED,
        CompletionStatus.PASSED,
        CompletionStatus.FAILED,
      ]) {
        await adapter.setCompletion(status);
        expect(api.peek("cmi.core.lesson_status")).toBe(status);
      }
      expect(adapter.getDiagnostics().join(" ")).not.toMatch(/rejected/);
    });
  });

  describe("review-mode guard", () => {
    /**
     * Relaunching a finished activity must not overwrite the learner's grade.
     * The specification enables review after completion but never addresses
     * this, so cmi.core.lesson_mode and cmi.core.credit are honoured here.
     */
    it("writes nothing when the LMS reports review mode", async () => {
      const review = new MockScorm12Api({
        initialValues: {
          "cmi.core.lesson_mode": "review",
          "cmi.core.lesson_status": "passed",
          "cmi.core.score.raw": "88",
        },
      });
      const adapter = makeAdapter(review);
      await adapter.initialize();

      await adapter.setScore(0);
      await adapter.setCompletion(CompletionStatus.INCOMPLETE);
      await adapter.saveAttemptState("LEGACY1.000.0000.0.0.deadbeef");

      expect(review.peek("cmi.core.score.raw")).toBe("88");
      expect(review.peek("cmi.core.lesson_status")).toBe("passed");
      expect(adapter.getDiagnostics().join(" ")).toMatch(/read-only/);
    });

    it("writes nothing when the attempt carries no credit", async () => {
      const noCredit = new MockScorm12Api({
        initialValues: { "cmi.core.credit": "no-credit", "cmi.core.score.raw": "70" },
      });
      const adapter = makeAdapter(noCredit);
      await adapter.initialize();
      await adapter.setScore(10);
      expect(noCredit.peek("cmi.core.score.raw")).toBe("70");
    });

    it("still allows a review-mode learner to load and read their attempt", async () => {
      const review = new MockScorm12Api({
        initialValues: { "cmi.core.lesson_mode": "review", "cmi.suspend_data": "LEGACY1.abc" },
      });
      const adapter = makeAdapter(review);
      await adapter.initialize();
      expect(await adapter.loadAttemptState()).toBe("LEGACY1.abc");
    });
  });

  describe("exit behaviour", () => {
    it("suspends an unfinished attempt so the LMS offers resume", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      now += 120_000;
      await adapter.finish();
      expect(api.peek("cmi.core.exit")).toBe("suspend");
      expect(api.peek("cmi.core.session_time")).toBe("00:02:00.00");
      expect(api.isFinished).toBe(true);
    });

    it("clears the exit for a finished attempt", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      await adapter.setCompletion(CompletionStatus.PASSED);
      await adapter.finish();
      expect(api.peek("cmi.core.exit")).toBe("");
    });

    it("records elapsed session time", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      now += 45 * 60 * 1000;
      await adapter.finish();
      expect(api.peek("cmi.core.session_time")).toBe("00:45:00.00");
    });
  });

  describe("resilience", () => {
    it.each([
      [
        "lesson location",
        "cmi.core.lesson_location",
        (adapter: Scorm12Adapter) => adapter.setLocation("STG_02"),
      ],
      [
        "raw score",
        "cmi.core.score.raw",
        (adapter: Scorm12Adapter) => adapter.setScore(80),
      ],
      [
        "completion status",
        "cmi.core.lesson_status",
        (adapter: Scorm12Adapter) => adapter.setCompletion(CompletionStatus.PASSED),
      ],
      [
        "interaction result",
        "cmi.interactions.0.result",
        (adapter: Scorm12Adapter) =>
          adapter.recordInteraction({
            interactionId: "INT_FAILURE",
            type: "choice",
            learnerResponse: "A",
            isCorrect: true,
            scenarioTimestamp: "2026-07-27T08:05:00.000Z",
          }),
      ],
    ])("rejects when the LMS refuses a %s write", async (_label, element, action) => {
      const rejecting = new RejectingMockScorm12Api();
      const adapter = makeAdapter(rejecting);
      await adapter.initialize();
      rejecting.rejectedElement = element;

      await expect(action(adapter)).rejects.toMatchObject({
        scormErrorCode: MockErrorCode.INCORRECT_DATA_TYPE,
        scormMethod: "LMSSetValue",
      });
    });

    it("rejects finish when the session-time write fails", async () => {
      const rejecting = new RejectingMockScorm12Api();
      const adapter = makeAdapter(rejecting);
      await adapter.initialize();
      rejecting.rejectedElement = "cmi.core.session_time";

      await expect(adapter.finish()).rejects.toMatchObject({
        scormErrorCode: MockErrorCode.INCORRECT_DATA_TYPE,
        scormMethod: "LMSSetValue",
      });
      expect(rejecting.isInitialized).toBe(true);
    });

    it("rejects finish when LMSFinish fails", async () => {
      const rejecting = new RejectingMockScorm12Api();
      const adapter = makeAdapter(rejecting);
      await adapter.initialize();
      rejecting.rejectFinish = true;

      await expect(adapter.finish()).rejects.toMatchObject({
        scormErrorCode: MockErrorCode.GENERAL_EXCEPTION,
        scormMethod: "LMSFinish",
      });
      expect(rejecting.isInitialized).toBe(true);
    });

    it("reports initialization failure but rejects later authoritative commits", async () => {
      const failing = new MockScorm12Api({ failCommit: true });
      const adapter = makeAdapter(failing);
      await expect(adapter.initialize()).resolves.toBeDefined();
      await expect(adapter.commit()).rejects.toThrow(
        /authoritative state was not stored/,
      );
      expect(adapter.getDiagnostics().join(" ")).toMatch(/LMSCommit failed/);
    });

    it("treats an LMS that throws as non-fatal", async () => {
      const throwing = new MockScorm12Api();
      throwing.LMSGetValue = () => {
        throw new Error("LMS connection lost");
      };
      const adapter = makeAdapter(throwing);
      await expect(adapter.initialize()).resolves.toBeDefined();
      expect(adapter.getDiagnostics().join(" ")).toMatch(/LMS connection lost/);
    });

    it("never writes the learner name or identifier into stored state", async () => {
      const adapter = makeAdapter();
      await adapter.initialize();
      await adapter.saveAttemptState("LEGACY1.100.0000.0.0.abcd1234");

      const suspendWrites = api.writeLog
        .filter((entry) => entry.element === "cmi.suspend_data")
        .map((entry) => entry.value)
        .join(" ");
      expect(suspendWrites).not.toMatch(/Nguyen/);
      expect(suspendWrites).not.toMatch(/student-001/);
    });
  });
});

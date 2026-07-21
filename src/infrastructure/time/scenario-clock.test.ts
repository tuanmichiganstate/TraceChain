import { describe, expect, it } from "vitest";
import { ScenarioConfigurationError } from "../../domain/errors";
import {
  advanceScenarioClock,
  createScenarioClock,
  formatScenarioTime,
  isBefore,
  normalizeInstant,
  setScenarioTime,
} from "./scenario-clock";

describe("scenario clock", () => {
  describe("determinism", () => {
    /**
     * The whole reason this exists. If domain timestamps came from the system
     * clock, two learners would produce different transaction hashes for
     * identical actions, and replay would never reproduce a ledger.
     */
    it("produces the same result regardless of when it runs", () => {
      const run = (): string =>
        advanceScenarioClock(
          advanceScenarioClock(createScenarioClock("2025-12-10T02:00:00.000Z"), 90),
          30,
        ).currentScenarioTime;

      expect(run()).toBe("2025-12-10T04:00:00.000Z");
      expect(run()).toBe(run());
    });

    it("does not consult the system clock", () => {
      const clock = createScenarioClock("2025-12-10T02:00:00.000Z");
      // A scenario instant in the past stays in the past.
      expect(Date.parse(clock.currentScenarioTime)).toBeLessThan(Date.now());
    });

    it("normalizes equivalent spellings of the same instant", () => {
      // Otherwise "...T02:00:00Z" and "...T02:00:00.000Z" would hash differently.
      expect(normalizeInstant("2025-12-10T02:00:00Z")).toBe(
        normalizeInstant("2025-12-10T02:00:00.000Z"),
      );
      expect(createScenarioClock("2025-12-10T02:00:00Z").currentScenarioTime).toBe(
        "2025-12-10T02:00:00.000Z",
      );
    });
  });

  describe("advancing", () => {
    it("moves forward by whole minutes", () => {
      const clock = advanceScenarioClock(createScenarioClock("2026-06-16T01:00:00.000Z"), 510);
      expect(clock.currentScenarioTime).toBe("2026-06-16T09:30:00.000Z");
    });

    it("increments the event sequence on every advance", () => {
      let clock = createScenarioClock("2026-06-16T01:00:00.000Z");
      expect(clock.eventSequence).toBe(0);
      clock = advanceScenarioClock(clock, 5);
      clock = advanceScenarioClock(clock, 5);
      expect(clock.eventSequence).toBe(2);
    });

    it("orders two events that share a scenario instant", () => {
      // A stage may emit several transactions the narrative places at the same
      // moment; the sequence keeps them strictly ordered.
      const first = advanceScenarioClock(createScenarioClock("2026-06-16T01:00:00.000Z"), 0);
      const second = advanceScenarioClock(first, 0);
      expect(second.currentScenarioTime).toBe(first.currentScenarioTime);
      expect(second.eventSequence).toBeGreaterThan(first.eventSequence);
    });

    it("refuses to move backwards", () => {
      const clock = createScenarioClock("2026-06-16T01:00:00.000Z");
      expect(() => advanceScenarioClock(clock, -10)).toThrow(ScenarioConfigurationError);
    });

    it("refuses a non-finite duration", () => {
      const clock = createScenarioClock("2026-06-16T01:00:00.000Z");
      expect(() => advanceScenarioClock(clock, Number.NaN)).toThrow(ScenarioConfigurationError);
    });
  });

  describe("jumping to a fixed scenario instant", () => {
    it("moves to the target time", () => {
      const clock = setScenarioTime(
        createScenarioClock("2026-06-16T01:00:00.000Z"),
        "2026-06-17T02:00:00.000Z",
      );
      expect(clock.currentScenarioTime).toBe("2026-06-17T02:00:00.000Z");
    });

    it("refuses a target earlier than the current time", () => {
      // A backwards jump would break RULE_SHIPMENT_BEFORE_RECEIPT and friends.
      const clock = createScenarioClock("2026-06-17T02:00:00.000Z");
      expect(() => setScenarioTime(clock, "2026-06-16T01:00:00.000Z")).toThrow(
        /cannot move backwards/,
      );
    });

    it("allows staying at the same instant", () => {
      const clock = createScenarioClock("2026-06-17T02:00:00.000Z");
      expect(() => setScenarioTime(clock, "2026-06-17T02:00:00.000Z")).not.toThrow();
    });
  });

  describe("invalid input", () => {
    it("rejects an unparseable start time", () => {
      expect(() => createScenarioClock("not a date")).toThrow(ScenarioConfigurationError);
    });

    it("rejects an unparseable target", () => {
      expect(() => setScenarioTime(createScenarioClock("2026-06-16T01:00:00.000Z"), "soon")).toThrow(
        ScenarioConfigurationError,
      );
    });
  });

  describe("comparison", () => {
    it("orders two instants", () => {
      expect(isBefore("2026-06-16T01:00:00.000Z", "2026-06-16T09:30:00.000Z")).toBe(true);
      expect(isBefore("2026-06-16T09:30:00.000Z", "2026-06-16T01:00:00.000Z")).toBe(false);
      expect(isBefore("2026-06-16T01:00:00.000Z", "2026-06-16T01:00:00.000Z")).toBe(false);
    });
  });

  describe("display formatting", () => {
    /**
     * Fixed locale and timezone, never the browser's. An end-to-end snapshot
     * taken on a machine in Hanoi must match one taken in Berlin.
     */
    it("formats in Vietnam local time regardless of the host timezone", () => {
      // 09:30 UTC is 16:30 in Asia/Ho_Chi_Minh (UTC+7).
      const formatted = formatScenarioTime("2026-06-16T09:30:00.000Z");
      expect(formatted).toContain("16:30");
      expect(formatted).toContain("16/06/2026");
    });

    it("is stable across calls", () => {
      const instant = "2025-12-10T02:00:00.000Z";
      expect(formatScenarioTime(instant)).toBe(formatScenarioTime(instant));
    });
  });
});

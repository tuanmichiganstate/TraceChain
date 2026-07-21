/**
 * The deterministic scenario clock (specification section 17.3).
 *
 * Domain events never take their timestamps from the learner's system clock.
 * A learner in Hanoi and a learner in Berlin must produce byte-identical
 * transaction hashes, and a test run in March must produce the same digests as
 * one run in November. Every domain timestamp comes from here.
 *
 * System time is used only for attempt start and end, elapsed learning time,
 * and SCORM session time -- none of which enter a hash.
 */

import { ScenarioConfigurationError } from "../../domain/errors";

export interface ScenarioClock {
  readonly currentScenarioTime: string;
  /**
   * Increments on every advance. Two events at the same scenario instant are
   * still strictly ordered, which matters when a stage emits several
   * transactions that the narrative places at the same moment.
   */
  readonly eventSequence: number;
}

const MILLISECONDS_PER_MINUTE = 60_000;

function assertValidInstant(isoTimestamp: string): number {
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) {
    throw new ScenarioConfigurationError(`Invalid scenario timestamp: "${isoTimestamp}"`);
  }
  return parsed;
}

export function createScenarioClock(startTime: string): ScenarioClock {
  assertValidInstant(startTime);
  return { currentScenarioTime: normalizeInstant(startTime), eventSequence: 0 };
}

/** Move the clock forward. Negative durations are rejected: scenario time
 *  only moves forward, and a backwards jump would break the ordering rules. */
export function advanceScenarioClock(clock: ScenarioClock, minutes: number): ScenarioClock {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new ScenarioConfigurationError(
      `Scenario time cannot move backwards or by a non-finite amount: ${minutes}`,
    );
  }
  const current = assertValidInstant(clock.currentScenarioTime);
  return {
    currentScenarioTime: new Date(current + minutes * MILLISECONDS_PER_MINUTE).toISOString(),
    eventSequence: clock.eventSequence + 1,
  };
}

/**
 * Jump to a specific scenario instant -- used when a stage's narrative time is
 * fixed by the timeline rather than derived from the previous event. Moving
 * backwards is rejected for the same reason as above.
 */
export function setScenarioTime(clock: ScenarioClock, isoTimestamp: string): ScenarioClock {
  const target = assertValidInstant(isoTimestamp);
  const current = assertValidInstant(clock.currentScenarioTime);
  if (target < current) {
    throw new ScenarioConfigurationError(
      `Scenario time cannot move backwards: ${clock.currentScenarioTime} -> ${isoTimestamp}`,
    );
  }
  return {
    currentScenarioTime: normalizeInstant(isoTimestamp),
    eventSequence: clock.eventSequence + 1,
  };
}

/**
 * Canonical ISO 8601 with milliseconds, in UTC. Normalizing here means two
 * spellings of the same instant ("...T02:00:00Z" and "...T02:00:00.000Z")
 * cannot produce different hashes.
 */
export function normalizeInstant(isoTimestamp: string): string {
  return new Date(assertValidInstant(isoTimestamp)).toISOString();
}

export function isBefore(earlier: string, later: string): boolean {
  return assertValidInstant(earlier) < assertValidInstant(later);
}

/** Format for display. Fixed locale and timezone, never the browser's -- an
 *  end-to-end snapshot must not differ between machines. */
const DISPLAY_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatScenarioTime(isoTimestamp: string): string {
  return DISPLAY_FORMATTER.format(new Date(assertValidInstant(isoTimestamp)));
}

/**
 * SCORM 1.2 implementation of LearningPlatformAdapter (specification section 21).
 *
 * Two behaviours here are not in the specification and are deliberate:
 *
 *   1. REVIEW-MODE GUARD. The specification enables review after completion
 *      (section 39) but never says what happens to the score when a finished
 *      attempt is relaunched. Without a guard, the application starts fresh,
 *      recalculates a score of zero, and writes it over the learner's real
 *      grade. `cmi.core.lesson_mode` and `cmi.core.credit` are therefore read
 *      at initialization, and every write is suppressed in review or no-credit
 *      mode.
 *
 *   2. GUARDED LMS CALLS. Every LMS call is wrapped. Initialization can
 *      continue with diagnostics, while a failed authoritative commit rejects
 *      so the application never publishes state that the LMS did not store.
 */

import {
  type LearnerContext,
  type LearningPlatformAdapter,
  type PlatformInitializationResult,
  type PlatformInteraction,
  CompletionStatus,
  CreditMode,
  isReadOnlyAttempt,
  LessonMode,
  PlatformMode,
} from "./learning-platform-adapter";
import {
  discoverScorm12Api,
  formatSessionTime,
  type Scorm12Api,
  ScormErrorCode,
} from "./scorm12-api";
import { ScormCommunicationError } from "../../domain/errors";

const ELEMENT = {
  STUDENT_ID: "cmi.core.student_id",
  STUDENT_NAME: "cmi.core.student_name",
  LESSON_STATUS: "cmi.core.lesson_status",
  LESSON_LOCATION: "cmi.core.lesson_location",
  LESSON_MODE: "cmi.core.lesson_mode",
  CREDIT: "cmi.core.credit",
  ENTRY: "cmi.core.entry",
  SCORE_RAW: "cmi.core.score.raw",
  SCORE_MIN: "cmi.core.score.min",
  SCORE_MAX: "cmi.core.score.max",
  SESSION_TIME: "cmi.core.session_time",
  EXIT: "cmi.core.exit",
  SUSPEND_DATA: "cmi.suspend_data",
  INTERACTIONS_COUNT: "cmi.interactions._count",
} as const;

const SCORE_MINIMUM = 0;
const SCORE_MAXIMUM = 100;

/** Cheap clock injection so tests can control session time. */
export type Clock = () => number;

export class Scorm12Adapter implements LearningPlatformAdapter {
  private api: Scorm12Api | null = null;
  private context: LearnerContext | null = null;
  private sessionStartedAt = 0;
  private readonly diagnostics: string[] = [];
  private readonly clock: Clock;
  private readonly rootWindow: Window | null;

  constructor(options: { clock?: Clock; rootWindow?: Window | null } = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.rootWindow = options.rootWindow ?? (globalThis.window ?? null);
  }

  async initialize(): Promise<PlatformInitializationResult> {
    const discovery = discoverScorm12Api(this.rootWindow);
    this.diagnostics.push(...discovery.diagnostics);

    if (discovery.api === null) {
      return {
        mode: PlatformMode.STANDALONE,
        isConnected: false,
        isReadOnly: false,
        diagnostics: [...this.diagnostics],
      };
    }

    this.api = discovery.api;
    this.sessionStartedAt = this.clock();

    if (this.call("LMSInitialize", () => this.api?.LMSInitialize("")) !== "true") {
      this.diagnostics.push("LMSInitialize did not return true; falling back to standalone.");
      this.api = null;
      return {
        mode: PlatformMode.STANDALONE,
        isConnected: false,
        isReadOnly: false,
        diagnostics: [...this.diagnostics],
      };
    }

    this.context = this.readLearnerContext();
    this.interactionIndex = this.readInteractionCount();

    // Section 21.4: mark the attempt in progress, but never downgrade a status
    // the learner already earned, and never write anything in review mode.
    const alreadyResolved =
      this.context.previousStatus === CompletionStatus.COMPLETED ||
      this.context.previousStatus === CompletionStatus.PASSED ||
      this.context.previousStatus === CompletionStatus.FAILED;

    if (!alreadyResolved && !isReadOnlyAttempt(this.context)) {
      this.setValue(ELEMENT.LESSON_STATUS, CompletionStatus.INCOMPLETE);
      this.setValue(ELEMENT.SCORE_MIN, String(SCORE_MINIMUM));
      this.setValue(ELEMENT.SCORE_MAX, String(SCORE_MAXIMUM));
      try {
        await this.commit();
      } catch {
        // Initialization remains inspectable. Any later state-changing action
        // will retry the commit and enter the blocking recovery path if the
        // LMS is still unavailable.
      }
    }

    if (isReadOnlyAttempt(this.context)) {
      this.diagnostics.push(
        `Attempt is read-only (mode=${this.context.lessonMode}, credit=${this.context.credit}); ` +
          "score, status and suspend data will not be written.",
      );
    }

    return {
      mode: PlatformMode.SCORM_1_2,
      isConnected: true,
      isReadOnly: isReadOnlyAttempt(this.context),
      diagnostics: [...this.diagnostics],
    };
  }

  async getLearnerContext(): Promise<LearnerContext> {
    return this.context ?? this.readLearnerContext();
  }

  async loadAttemptState(): Promise<string | null> {
    const raw = this.getValue(ELEMENT.SUSPEND_DATA);
    return raw.length > 0 ? raw : null;
  }

  async saveAttemptState(encodedState: string): Promise<void> {
    if (this.isSuppressed()) return;
    this.setRequiredValue(
      ELEMENT.SUSPEND_DATA,
      encodedState,
      "LMSSetValue rejected authoritative suspend data",
    );
  }

  async setLocation(location: string): Promise<void> {
    if (this.isSuppressed()) return;
    // Section 21.6: the raw stage identifier, never a translated label.
    this.setRequiredValue(
      ELEMENT.LESSON_LOCATION,
      location,
      "LMSSetValue rejected the lesson location",
    );
  }

  async setScore(score: number): Promise<void> {
    if (this.isSuppressed()) return;
    const clamped = Math.max(SCORE_MINIMUM, Math.min(SCORE_MAXIMUM, Math.round(score)));
    this.setRequiredValue(
      ELEMENT.SCORE_MIN,
      String(SCORE_MINIMUM),
      "LMSSetValue rejected the minimum score",
    );
    this.setRequiredValue(
      ELEMENT.SCORE_MAX,
      String(SCORE_MAXIMUM),
      "LMSSetValue rejected the maximum score",
    );
    this.setRequiredValue(
      ELEMENT.SCORE_RAW,
      String(clamped),
      "LMSSetValue rejected the learner score",
    );
  }

  async setCompletion(status: CompletionStatus): Promise<void> {
    if (this.isSuppressed()) return;
    this.setRequiredValue(
      ELEMENT.LESSON_STATUS,
      status,
      "LMSSetValue rejected the completion status",
    );
  }

  async recordInteraction(interaction: PlatformInteraction): Promise<void> {
    if (this.isSuppressed()) return;
    if (this.interactionIndex === null) {
      throw new ScormCommunicationError(
        "LMSGetValue did not return a valid interaction count",
        this.lastErrorCode(),
        "LMSGetValue",
      );
    }
    // Individual interaction records are write-only, but their read-only
    // collection count lets a resumed attempt append without overwriting.
    const index = this.interactionIndex;
    const prefix = `cmi.interactions.${index}`;
    this.setRequiredValue(
      `${prefix}.id`,
      interaction.interactionId.slice(0, 255),
      "LMSSetValue rejected the interaction identifier",
    );
    this.setRequiredValue(
      `${prefix}.type`,
      interaction.type,
      "LMSSetValue rejected the interaction type",
    );
    this.setRequiredValue(
      `${prefix}.student_response`,
      interaction.learnerResponse.slice(0, 255),
      "LMSSetValue rejected the learner interaction response",
    );
    this.setRequiredValue(
      `${prefix}.result`,
      interaction.isCorrect ? "correct" : "wrong",
      "LMSSetValue rejected the interaction result",
    );
    this.setRequiredValue(
      `${prefix}.time`,
      toScormTime(interaction.scenarioTimestamp),
      "LMSSetValue rejected the interaction time",
    );
    this.interactionIndex += 1;
  }

  async commit(): Promise<void> {
    if (this.api === null) return;
    if (this.call("LMSCommit", () => this.api?.LMSCommit("")) !== "true") {
      this.diagnostics.push("LMSCommit failed; progress may not be stored.");
      throw new ScormCommunicationError(
        "LMSCommit failed; authoritative state was not stored",
        this.lastErrorCode(),
        "LMSCommit",
      );
    }
  }

  async finish(): Promise<void> {
    if (this.api === null) return;

    if (!this.isSuppressed()) {
      this.setRequiredValue(
        ELEMENT.SESSION_TIME,
        formatSessionTime(this.clock() - this.sessionStartedAt),
        "LMSSetValue rejected the session time",
      );

      // Section 21.9: suspend an unfinished attempt so the LMS offers resume;
      // clear the exit for a finished one.
      const status = this.getValue(ELEMENT.LESSON_STATUS);
      const isResolved =
        status === CompletionStatus.COMPLETED ||
        status === CompletionStatus.PASSED ||
        status === CompletionStatus.FAILED;
      this.setRequiredValue(
        ELEMENT.EXIT,
        isResolved ? "" : "suspend",
        "LMSSetValue rejected the exit state",
      );
    }

    await this.commit();
    if (this.call("LMSFinish", () => this.api?.LMSFinish("")) !== "true") {
      throw new ScormCommunicationError(
        "LMSFinish failed; the session remains open",
        this.lastErrorCode(),
        "LMSFinish",
      );
    }
    this.api = null;
  }

  /** Developer-mode diagnostics. Never shown to an ordinary learner. */
  getDiagnostics(): readonly string[] {
    return [...this.diagnostics];
  }

  private interactionIndex: number | null = null;

  private isSuppressed(): boolean {
    return this.api === null || (this.context !== null && isReadOnlyAttempt(this.context));
  }

  private readLearnerContext(): LearnerContext {
    const entry = this.getValue(ELEMENT.ENTRY);
    return {
      learnerId: this.getValue(ELEMENT.STUDENT_ID) || null,
      learnerName: this.getValue(ELEMENT.STUDENT_NAME) || null,
      lessonMode: parseEnum(this.getValue(ELEMENT.LESSON_MODE), LessonMode, LessonMode.NORMAL),
      credit: parseEnum(this.getValue(ELEMENT.CREDIT), CreditMode, CreditMode.CREDIT),
      isResumed: entry === "resume",
      previousStatus: parseEnum(
        this.getValue(ELEMENT.LESSON_STATUS),
        CompletionStatus,
        CompletionStatus.NOT_ATTEMPTED,
      ),
    };
  }

  private readInteractionCount(): number | null {
    const raw = this.getValue(ELEMENT.INTERACTIONS_COUNT);
    if (!/^\d+$/.test(raw)) {
      this.diagnostics.push(
        `LMSGetValue("${ELEMENT.INTERACTIONS_COUNT}") did not return a non-negative integer.`,
      );
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) {
      this.diagnostics.push(
        `LMSGetValue("${ELEMENT.INTERACTIONS_COUNT}") exceeded the supported integer range.`,
      );
      return null;
    }
    return parsed;
  }

  private getValue(element: string): string {
    if (this.api === null) return "";
    const value = this.call("LMSGetValue", () => this.api?.LMSGetValue(element)) ?? "";
    return value;
  }

  private setValue(element: string, value: string): boolean {
    if (this.api === null) return false;
    const result = this.call("LMSSetValue", () => this.api?.LMSSetValue(element, value));
    if (result !== "true") {
      const code = this.api.LMSGetLastError();
      this.diagnostics.push(
        `LMSSetValue("${element}") rejected with error ${code}` +
          (code === ScormErrorCode.INCORRECT_DATA_TYPE
            ? ` -- value length ${value.length} may exceed the element's limit.`
            : "."),
      );
      return false;
    }
    return true;
  }

  private setRequiredValue(
    element: string,
    value: string,
    failureMessage: string,
  ): void {
    if (!this.setValue(element, value)) {
      throw new ScormCommunicationError(
        failureMessage,
        this.lastErrorCode(),
        "LMSSetValue",
      );
    }
  }

  private lastErrorCode(): string | null {
    if (this.api === null) return null;
    const code = this.call("LMSGetLastError", () => this.api?.LMSGetLastError());
    return code === ScormErrorCode.NO_ERROR ? null : code;
  }

  /** Run an LMS call, converting any thrown error into a diagnostic. */
  private call(method: string, invoke: () => string | undefined): string | null {
    try {
      return invoke() ?? null;
    } catch (error) {
      this.diagnostics.push(
        `${method} threw: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

function parseEnum<T extends Record<string, string>>(
  raw: string,
  enumObject: T,
  fallback: T[keyof T],
): T[keyof T] {
  const match = Object.values(enumObject).find((candidate) => candidate === raw);
  return (match as T[keyof T] | undefined) ?? fallback;
}

/** SCORM 1.2 `cmi.interactions.n.time` is HH:MM:SS. */
function toScormTime(isoTimestamp: string): string {
  const match = /T(\d{2}):(\d{2}):(\d{2})/.exec(isoTimestamp);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : "00:00:00";
}

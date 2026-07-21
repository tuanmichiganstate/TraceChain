/**
 * The seam between the application and whatever learning platform is hosting
 * it (specification section 21.1). Two implementations exist: Scorm12Adapter
 * for Moodle, and StandalonePersistenceAdapter for development and for any
 * context where no SCORM API is reachable.
 *
 * The methods are asynchronous even though SCORM 1.2's API is synchronous, so
 * that a future server-backed or LTI adapter can be substituted without
 * changing any caller.
 */

/** SCORM 1.2 `cmi.core.lesson_status` vocabulary. The literal strings matter. */
export enum CompletionStatus {
  NOT_ATTEMPTED = "not attempted",
  BROWSED = "browsed",
  INCOMPLETE = "incomplete",
  COMPLETED = "completed",
  PASSED = "passed",
  FAILED = "failed",
}

/** SCORM 1.2 `cmi.core.lesson_mode`, read-only. */
export enum LessonMode {
  BROWSE = "browse",
  NORMAL = "normal",
  REVIEW = "review",
}

/** SCORM 1.2 `cmi.core.credit`, read-only. */
export enum CreditMode {
  CREDIT = "credit",
  NO_CREDIT = "no-credit",
}

export enum PlatformMode {
  SCORM_1_2 = "SCORM_1_2",
  STANDALONE = "STANDALONE",
}

export interface PlatformInitializationResult {
  readonly mode: PlatformMode;
  readonly isConnected: boolean;
  /**
   * The LMS launched this attempt for review or without credit, so nothing may
   * be written back.
   *
   * Carried here rather than left in `diagnostics`, which are developer-facing
   * and never rendered: suppressing the writes protects the learner's grade,
   * but only telling them stops an hour's work being discarded in silence.
   */
  readonly isReadOnly: boolean;
  /** Developer-facing only. Never rendered to a learner. */
  readonly diagnostics: readonly string[];
}

export interface LearnerContext {
  /**
   * Present so the application can tell attempts apart. It must never reach
   * the simulated ledger, a block, a hash, or any learner-visible record
   * (specification section 21.3).
   */
  readonly learnerId: string | null;
  /**
   * Supplied by the LMS and therefore untrusted input. React escapes it on
   * render; it must never be interpolated into markup.
   */
  readonly learnerName: string | null;
  readonly lessonMode: LessonMode;
  readonly credit: CreditMode;
  /** True when the LMS reports a previously suspended attempt. */
  readonly isResumed: boolean;
  readonly previousStatus: CompletionStatus;
}

export interface PlatformInteraction {
  readonly interactionId: string;
  readonly type: "choice" | "true-false" | "matching" | "sequencing";
  readonly learnerResponse: string;
  readonly isCorrect: boolean;
  readonly scenarioTimestamp: string;
}

/**
 * True when the attempt must not write score or status back to the LMS --
 * either the learner is reviewing a finished attempt, or the LMS has marked
 * the attempt as carrying no credit. Without this guard, relaunching a
 * completed activity overwrites a good score with a fresh zero.
 */
export function isReadOnlyAttempt(context: LearnerContext): boolean {
  return context.lessonMode === LessonMode.REVIEW || context.credit === CreditMode.NO_CREDIT;
}

export interface LearningPlatformAdapter {
  initialize(): Promise<PlatformInitializationResult>;
  getLearnerContext(): Promise<LearnerContext>;
  loadAttemptState(): Promise<string | null>;
  saveAttemptState(encodedState: string): Promise<void>;
  setLocation(location: string): Promise<void>;
  setScore(score: number): Promise<void>;
  setCompletion(status: CompletionStatus): Promise<void>;
  recordInteraction(interaction: PlatformInteraction): Promise<void>;
  commit(): Promise<void>;
  finish(): Promise<void>;
}

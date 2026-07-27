import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  auditRuntimeForAssignment,
  type AuditRuntimePackage,
} from "../../config/audit-runtime-loader";
import type {
  AuditConclusionSubmissionV1,
  AuditLearnerProjectionV1,
  AuditVariantAssignmentV1,
} from "../contracts/audit";
import type { AuditFindingInputV1 } from "./audit-run-types";
import {
  decodeTa2AuditSnapshot,
  emptyTa2AuditSnapshot,
  encodeTa2AuditSnapshot,
  inspectTa2AuditStoredHeader,
  type AuditCommandJournalEntry,
  type Ta2AuditCodecSchema,
  type Ta2AuditSnapshot,
} from "../../infrastructure/persistence/ta2-audit-codec";
import { BrowserAttemptSeedGenerator } from "../../domain/scenario/variant-bank";
import { Scorm12Adapter } from "../../infrastructure/scorm/scorm12-adapter";
import {
  CompletionStatus,
  type LearningPlatformAdapter,
} from "../../infrastructure/scorm/learning-platform-adapter";
import { StandalonePersistenceAdapter } from "../../infrastructure/persistence/standalone-adapter";
import { useTranslator } from "../../app/providers/locale-provider";
import { HostedAuditWorkspace } from "./hosted-audit-workspace";
import {
  auditVariantAssignmentForIndex,
  selectAuditVariantAssignment,
} from "./audit-variant-bank";
import {
  replayTa2AuditAttempt,
  type ReplayedAuditAttempt,
} from "./audit-scorm-replay";

interface ReadyAuditScormAttempt {
  readonly runtime: AuditRuntimePackage;
  readonly codecSchema: Ta2AuditCodecSchema;
  readonly snapshot: Ta2AuditSnapshot;
  readonly replay: ReplayedAuditAttempt;
  readonly isReadOnly: boolean;
}

function findingInput(value: unknown): AuditFindingInputV1 {
  return value as AuditFindingInputV1;
}

function conclusionInput(
  value: unknown,
): Omit<AuditConclusionSubmissionV1, "submittedAt"> {
  return value as Omit<
    AuditConclusionSubmissionV1,
    "submittedAt"
  >;
}

function commandEntry(
  input: Readonly<Record<string, unknown>>,
): AuditCommandJournalEntry {
  switch (input.commandType) {
    case "VIEW_AUDIT_SCOPE":
      return { operation: "VIEW_SCOPE" };
    case "INSPECT_AUDIT_EVIDENCE":
      return {
        operation: "INSPECT_EVIDENCE",
        evidenceId: String(input.evidenceId),
      };
    case "BOOKMARK_AUDIT_EVIDENCE":
      return {
        operation: "BOOKMARK_EVIDENCE",
        evidenceId: String(input.evidenceId),
      };
    case "INSPECT_AUDIT_SOURCE_RECORD":
      return {
        operation: "INSPECT_SOURCE_RECORD",
        sourceRecordId: String(input.sourceRecordId),
      };
    case "VIEW_AUDIT_HINT":
      return {
        operation: "VIEW_HINT",
        hintId: String(input.hintId),
      };
    case "SAVE_AUDIT_FINDING_DRAFT":
      return {
        operation: "SAVE_DRAFT",
        finding: findingInput(input.finding),
      };
    case "SUBMIT_AUDIT_FINDING":
      return {
        operation: "SUBMIT_FINDING",
        finding: findingInput(input.finding),
      };
    case "AMEND_AUDIT_FINDING":
      return {
        operation: "AMEND_FINDING",
        finding: findingInput(input.finding),
      };
    case "WITHDRAW_AUDIT_FINDING":
      return {
        operation: "WITHDRAW_FINDING",
        findingId: String(input.findingId),
      };
    case "SUBMIT_AUDIT_CONCLUSION":
      return {
        operation: "SUBMIT_CONCLUSION",
        conclusion: conclusionInput(input.conclusion),
      };
    default:
      throw new Error("Unsupported Audit SCORM command.");
  }
}

function nextFindingSequence(snapshot: Ta2AuditSnapshot): number {
  let maximum = 0;
  for (const entry of snapshot.commandJournal) {
    const findingId =
      entry.operation === "SAVE_DRAFT" ||
      entry.operation === "SUBMIT_FINDING" ||
      entry.operation === "AMEND_FINDING"
        ? entry.finding.findingId
        : entry.operation === "WITHDRAW_FINDING"
          ? entry.findingId
          : "";
    const match = /^F([1-9][0-9]?)$/u.exec(findingId);
    if (match?.[1] !== undefined) {
      maximum = Math.max(maximum, Number(match[1]));
    }
  }
  return maximum + 1;
}

async function initializeAdapter(
  runtime: AuditRuntimePackage,
): Promise<{
  readonly adapter: LearningPlatformAdapter;
  readonly isReadOnly: boolean;
  readonly assignmentSource:
    AuditVariantAssignmentV1["assignmentSource"];
}> {
  const scorm = new Scorm12Adapter();
  const initialized = await scorm.initialize();
  if (initialized.isConnected) {
    return {
      adapter: scorm,
      isReadOnly: initialized.isReadOnly,
      assignmentSource: "SCORM_ATTEMPT",
    };
  }
  const standalone = new StandalonePersistenceAdapter({
    appVersion: runtime.configurationHash,
    scenarioId: runtime.scenario.scenarioId,
  });
  const fallback = await standalone.initialize();
  return {
    adapter: standalone,
    isReadOnly: fallback.isReadOnly,
    assignmentSource: "STANDALONE_ATTEMPT",
  };
}

function codecSchemaFor(
  runtime: AuditRuntimePackage,
): Ta2AuditCodecSchema {
  return {
    configurationHash: runtime.configurationHash,
    packContentHash: runtime.pack.publication!.contentHash,
    scenarioId: runtime.scenario.scenarioId,
    scenarioVersion: runtime.scenario.version,
    auditCase: runtime.auditCase,
    ...(runtime.variantBank === null
      ? {}
      : { variantBank: runtime.variantBank }),
  };
}

export function AuditScormApp({
  runtime,
}: {
  readonly runtime: AuditRuntimePackage;
}): ReactNode {
  const t = useTranslator();
  const adapterRef = useRef<LearningPlatformAdapter | null>(null);
  const [attempt, setAttempt] =
    useState<ReadyAuditScormAttempt | null>(null);
  const [initializationFailed, setInitializationFailed] =
    useState(false);
  const [persistenceFailed, setPersistenceFailed] =
    useState(false);
  const [commandRejected, setCommandRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const attemptRef = useRef<ReadyAuditScormAttempt | null>(null);
  const findingSequenceRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    let activeAdapter: LearningPlatformAdapter | null = null;
    void (async () => {
      try {
        const initialized = await initializeAdapter(runtime);
        activeAdapter = initialized.adapter;
        const stored = await initialized.adapter.loadAttemptState();
        let selectedRuntime = runtime;
        let codecSchema = codecSchemaFor(selectedRuntime);
        let snapshot: Ta2AuditSnapshot;
        if (stored === null || stored.trim().length === 0) {
          const assignment =
            runtime.variantBank === null
              ? null
              : selectAuditVariantAssignment({
                  bank: runtime.variantBank,
                  attemptSeed:
                    new BrowserAttemptSeedGenerator().nextSeed(),
                  assignmentSource: initialized.assignmentSource,
                });
          selectedRuntime = auditRuntimeForAssignment(
            runtime,
            assignment,
          );
          codecSchema = codecSchemaFor(selectedRuntime);
          snapshot = emptyTa2AuditSnapshot(assignment);
          if (assignment !== null) {
            if (initialized.isReadOnly) {
              throw new Error(
                "A new Audit variant cannot be revealed in a read-only attempt.",
              );
            }
            const encoded = encodeTa2AuditSnapshot(
              snapshot,
              codecSchema,
            );
            await initialized.adapter.saveAttemptState(encoded);
            await initialized.adapter.setLocation("AUDIT_WORKPAPER");
            await initialized.adapter.setCompletion(
              CompletionStatus.INCOMPLETE,
            );
            await initialized.adapter.commit();
          }
        } else {
          const header = inspectTa2AuditStoredHeader(stored);
          if (
            header.configurationHash !== runtime.configurationHash ||
            header.packContentHash !==
              runtime.pack.publication!.contentHash
          ) {
            throw new Error(
              "Stored Audit progress belongs to another configuration or scenario pack.",
            );
          }
          const assignment =
            header.assignment === null
              ? null
              : runtime.variantBank === null
                ? (() => {
                    throw new Error(
                      "Stored Audit progress contains an unexpected variant assignment.",
                    );
                  })()
                : auditVariantAssignmentForIndex({
                    bank: runtime.variantBank,
                    variantIndex: header.assignment.variantIndex,
                    attemptSeed: header.assignment.attemptSeed,
                    assignmentSource:
                      header.assignment.assignmentSource,
                  });
          selectedRuntime = auditRuntimeForAssignment(
            runtime,
            assignment,
          );
          codecSchema = codecSchemaFor(selectedRuntime);
          snapshot = decodeTa2AuditSnapshot(stored, codecSchema);
        }
        const replay = await replayTa2AuditAttempt(
          selectedRuntime,
          snapshot,
        );
        if (cancelled) return;
        adapterRef.current = initialized.adapter;
        findingSequenceRef.current = nextFindingSequence(snapshot);
        const ready = {
          runtime: selectedRuntime,
          codecSchema,
          snapshot,
          replay,
          isReadOnly: initialized.isReadOnly,
        };
        attemptRef.current = ready;
        setAttempt(ready);
      } catch (error) {
        console.error(error);
        if (!cancelled) setInitializationFailed(true);
      }
    })();
    const finish = (): void => {
      void activeAdapter?.finish().catch((error: unknown) => {
        console.error(error);
      });
    };
    window.addEventListener("pagehide", finish);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", finish);
    };
  }, [runtime]);

  const createFindingId = useCallback((): string => {
    const sequence = findingSequenceRef.current;
    if (sequence > 99) {
      throw new Error("The bounded Audit finding ID range is exhausted.");
    }
    findingSequenceRef.current += 1;
    return `F${String(sequence)}`;
  }, []);

  const submit = useCallback(
    async (
      input: Readonly<Record<string, unknown>>,
    ): Promise<void> => {
      const run = async (): Promise<void> => {
        const current = attemptRef.current;
        if (
          current === null ||
          current.isReadOnly ||
          persistenceFailed
        ) {
          return;
        }
        setBusy(true);
        setCommandRejected(false);
        let persistenceStarted = false;
        try {
          const prospective: Ta2AuditSnapshot = {
            variantAssignment:
              current.snapshot.variantAssignment,
            commandJournal: [
              ...current.snapshot.commandJournal,
              commandEntry(input),
            ],
          };
          const encoded = encodeTa2AuditSnapshot(
            prospective,
            current.codecSchema,
          );
          const replay = await replayTa2AuditAttempt(
            current.runtime,
            prospective,
          );
          const adapter = adapterRef.current;
          if (adapter === null) {
            throw new Error("Audit persistence is not initialized.");
          }
          persistenceStarted = true;
          await adapter.saveAttemptState(encoded);
          await adapter.setLocation(
            replay.state.status === "completed"
              ? "AUDIT_COMPLETE"
              : "AUDIT_WORKPAPER",
          );
          const report = replay.projection.audit?.report;
          if (report === undefined) {
            await adapter.setCompletion(CompletionStatus.INCOMPLETE);
          } else {
            await adapter.setScore(report.score);
            await adapter.setCompletion(
              report.passed
                ? CompletionStatus.PASSED
                : CompletionStatus.FAILED,
            );
          }
          await adapter.commit();
          const ready = {
            runtime: current.runtime,
            codecSchema: current.codecSchema,
            snapshot: prospective,
            replay,
            isReadOnly: false,
          };
          attemptRef.current = ready;
          setAttempt(ready);
        } catch (error) {
          console.error(error);
          if (persistenceStarted) {
            setPersistenceFailed(true);
          } else {
            setCommandRejected(true);
          }
        } finally {
          setBusy(false);
        }
      };
      const scheduled = queueRef.current.then(run, run);
      queueRef.current = scheduled.then(
        () => undefined,
        () => undefined,
      );
      return scheduled;
    },
    [persistenceFailed],
  );

  if (initializationFailed) {
    return (
      <main className="start" id="main-content">
        <div className="start__inner">
          <section className="card">
            <h1>{t("errors.recoveryHeading")}</h1>
            <p>{t("errors.incompatibleAttempt")}</p>
            <p>{t("errors.newLmsAttempt")}</p>
          </section>
        </div>
      </main>
    );
  }
  if (attempt === null) {
    return (
      <main className="loading" id="main-content">
        <p aria-live="polite">{t("status.saving")}</p>
      </main>
    );
  }
  const audit = attempt.replay.projection
    .audit as AuditLearnerProjectionV1;
  return (
    <>
      {attempt.isReadOnly ? (
        <div className="notice notice--standalone" role="status">
          <p>{t("status.readOnly")}</p>
        </div>
      ) : null}
      {persistenceFailed ? (
        <div className="notice notice--standalone" role="alert">
          <p>{t("errors.scormCommunication")}</p>
        </div>
      ) : commandRejected ? (
        <div className="notice notice--standalone" role="alert">
          <p>{t("errors.domainValidation")}</p>
        </div>
      ) : null}
      <HostedAuditWorkspace
        audit={audit}
        completed={
          attempt.isReadOnly ||
          attempt.replay.state.status === "completed"
        }
        busy={busy || persistenceFailed}
        createFindingId={createFindingId}
        onSubmit={submit}
      />
    </>
  );
}

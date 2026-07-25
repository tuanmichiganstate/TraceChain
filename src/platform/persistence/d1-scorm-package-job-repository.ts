import type { Clock } from "../../domain/simulation/environment";
import type { ApplicationPrincipal } from "../hosted/access";
import type {
  CreateScormPackageJobRequest,
  CreateScormPackageJobResult,
  HostedScormPackageArtifactV1,
  ScormPackageJobV1,
} from "../contracts/scorm-package-job";
import type { D1DatabaseLike } from "./d1-types";

const FIND_BY_JOB = `SELECT *
  FROM scorm_package_jobs
  WHERE job_id = ?`;
const FIND_BY_COMMAND = `SELECT *
  FROM scorm_package_jobs
  WHERE creation_command_id = ?`;
const LIST_FOR_USER = `SELECT *
  FROM scorm_package_jobs
  WHERE requested_by_user_id = ?
  ORDER BY requested_at_utc DESC, job_id`;
const LIST_ALL = `SELECT *
  FROM scorm_package_jobs
  ORDER BY requested_at_utc DESC, job_id`;
const INSERT_COMPLETED = `INSERT INTO scorm_package_jobs (
    job_id,
    creation_command_id,
    preset_id,
    lifecycle_status,
    title,
    filename,
    artifact_key,
    sha256,
    size_bytes,
    release_build,
    configuration_hash,
    scenario_id,
    scenario_version,
    application_build_hash,
    source_commit,
    requested_at_utc,
    completed_at_utc,
    requested_by_user_id
  ) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

interface JobRow {
  readonly job_id: string;
  readonly creation_command_id: string;
  readonly preset_id: "guided" | "challenge" | "assessment";
  readonly lifecycle_status: "completed";
  readonly title: string;
  readonly filename: string;
  readonly artifact_key: string;
  readonly sha256: string;
  readonly size_bytes: number;
  readonly release_build: number;
  readonly configuration_hash: string;
  readonly scenario_id: string;
  readonly scenario_version: string;
  readonly application_build_hash: string;
  readonly source_commit: string;
  readonly requested_at_utc: string;
  readonly completed_at_utc: string;
  readonly requested_by_user_id: string;
}

function toJob(row: JobRow): ScormPackageJobV1 {
  return {
    schemaVersion: "1.0.0",
    jobId: row.job_id,
    presetId: row.preset_id,
    status: row.lifecycle_status,
    title: row.title,
    filename: row.filename,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    release: row.release_build === 1,
    configurationHash: row.configuration_hash,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    applicationBuildHash: row.application_build_hash,
    sourceCommit: row.source_commit,
    artifactKey: row.artifact_key,
    requestedAt: row.requested_at_utc,
    completedAt: row.completed_at_utc,
    requestedByUserId: row.requested_by_user_id,
  };
}

export class ScormPackageJobRepositoryError extends Error {
  constructor(
    readonly code:
      | "INVALID_PACKAGE_JOB"
      | "PACKAGE_JOB_CONFLICT"
      | "PACKAGE_JOB_NOT_FOUND"
      | "PACKAGE_JOB_STORAGE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ScormPackageJobRepositoryError";
  }
}

function validIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(value);
}

function validateArtifact(
  artifact: HostedScormPackageArtifactV1,
): void {
  if (
    !["guided", "challenge", "assessment"].includes(artifact.presetId) ||
    artifact.title.length < 1 ||
    artifact.title.length > 120 ||
    !artifact.filename.endsWith(".zip") ||
    !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
    !/^[a-f0-9]{64}$/u.test(artifact.configurationHash) ||
    !/^[a-f0-9]{64}$/u.test(artifact.applicationBuildHash) ||
    !Number.isSafeInteger(artifact.sizeBytes) ||
    artifact.sizeBytes < 1 ||
    !artifact.downloadPath.startsWith("/scorm-packages/")
  ) {
    throw new ScormPackageJobRepositoryError(
      "INVALID_PACKAGE_JOB",
      "The generated package artifact catalog entry is invalid.",
    );
  }
}

export class D1ScormPackageJobRepository {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly clock: Clock,
  ) {}

  async createCompleted(
    request: CreateScormPackageJobRequest,
    artifact: HostedScormPackageArtifactV1,
    artifactKey: string,
    principal: ApplicationPrincipal,
  ): Promise<CreateScormPackageJobResult> {
    validateArtifact(artifact);
    if (
      !validIdentifier(request.commandId) ||
      !validIdentifier(request.jobId) ||
      request.presetId !== artifact.presetId ||
      artifactKey !== `scorm-packages/${artifact.sha256}/${artifact.filename}`
    ) {
      throw new ScormPackageJobRepositoryError(
        "INVALID_PACKAGE_JOB",
        "Package job identity or artifact binding is invalid.",
      );
    }
    const replay = await this.database
      .prepare(FIND_BY_COMMAND)
      .bind(request.commandId)
      .first<JobRow>();
    if (replay !== null) {
      if (
        replay.job_id !== request.jobId ||
        replay.preset_id !== request.presetId
      ) {
        throw new ScormPackageJobRepositoryError(
          "PACKAGE_JOB_CONFLICT",
          "Package command ID is already bound to another request.",
        );
      }
      return { job: toJob(replay), wasIdempotentReplay: true };
    }
    const timestamp = this.clock.now();
    const result = await this.database
      .prepare(INSERT_COMPLETED)
      .bind(
        request.jobId,
        request.commandId,
        request.presetId,
        artifact.title,
        artifact.filename,
        artifactKey,
        artifact.sha256,
        artifact.sizeBytes,
        artifact.release ? 1 : 0,
        artifact.configurationHash,
        artifact.scenarioId,
        artifact.scenarioVersion,
        artifact.applicationBuildHash,
        artifact.sourceCommit,
        timestamp,
        timestamp,
        principal.userId,
      )
      .run();
    if (
      !result.success ||
      (result.meta?.changes !== undefined && result.meta.changes !== 1)
    ) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_STORAGE_FAILED",
        result.error ?? "Package job could not be saved.",
      );
    }
    const stored = await this.find(request.jobId);
    if (stored === null) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_STORAGE_FAILED",
        "Package job was not durably stored.",
      );
    }
    return { job: stored, wasIdempotentReplay: false };
  }

  async find(jobId: string): Promise<ScormPackageJobV1 | null> {
    const row = await this.database
      .prepare(FIND_BY_JOB)
      .bind(jobId)
      .first<JobRow>();
    return row === null ? null : toJob(row);
  }

  async list(
    principal: ApplicationPrincipal,
  ): Promise<readonly ScormPackageJobV1[]> {
    const administrator = principal.roles.includes("administrator");
    const result = administrator
      ? await this.database.prepare(LIST_ALL).all<JobRow>()
      : await this.database
          .prepare(LIST_FOR_USER)
          .bind(principal.userId)
          .all<JobRow>();
    if (!result.success) {
      throw new ScormPackageJobRepositoryError(
        "PACKAGE_JOB_STORAGE_FAILED",
        result.error ?? "Package jobs could not be listed.",
      );
    }
    return result.results.map(toJob);
  }
}

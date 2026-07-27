export class HostedRunCommandError extends Error {
  constructor(
    readonly code:
      | "RUN_ALREADY_EXISTS"
      | "RUN_NOT_FOUND"
      | "RUN_VERSION_CONFLICT"
      | "RUN_TIME_LIMIT_EXCEEDED"
      | "COMMAND_ID_REUSED"
      | "INVALID_COMMAND"
      | "WORKFLOW_PRECONDITION_FAILED"
      | "PACK_CONTRACT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "HostedRunCommandError";
  }
}

import type {
  CounterfactualComparisonV1,
  CounterfactualDecisionPointV1,
  CounterfactualReflectionResponseV1,
  CounterfactualReflectionV1,
  CounterfactualTimelineItemV1,
} from "../contracts/counterfactual";
import type { LearnerRunProjectionV1 } from "../contracts/run-events";

export interface CounterfactualPointViewV1
  extends CounterfactualDecisionPointV1 {
  readonly forkProjection: LearnerRunProjectionV1;
}

export type CounterfactualComparisonViewV1 =
  CounterfactualComparisonV1;

export type { CounterfactualTimelineItemV1 };

export interface CounterfactualExplorerApi {
  loadPoints(
    sourceRunId: string,
  ): Promise<readonly CounterfactualPointViewV1[]>;
  explore(
    sourceRunId: string,
    point: CounterfactualPointViewV1,
    commandIntent: Readonly<Record<string, unknown>>,
  ): Promise<CounterfactualComparisonViewV1>;
  continueBranch(
    counterfactualId: string,
    projection: LearnerRunProjectionV1,
    commandIntent: Readonly<Record<string, unknown>>,
  ): Promise<CounterfactualComparisonViewV1>;
  submitReflection(
    counterfactualId: string,
    response: CounterfactualReflectionResponseV1,
  ): Promise<CounterfactualReflectionV1>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class CounterfactualExplorerApiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CounterfactualExplorerApiError";
  }
}

async function requestJson<T>(
  fetcher: FetchLike,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T & {
    readonly error?: { readonly code?: string };
  };
  if (!response.ok) {
    throw new CounterfactualExplorerApiError(
      body.error?.code ??
        "COUNTERFACTUAL_EXPLORER_REQUEST_FAILED",
    );
  }
  return body;
}

function identifier(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function submitCompleteAndCompare(
  fetcher: FetchLike,
  branchRunId: string,
  commandId: string,
  expectedRunVersion: number,
  commandIntent: Readonly<Record<string, unknown>>,
): Promise<CounterfactualComparisonViewV1> {
  await requestJson(
    fetcher,
    `/api/v1/counterfactuals/${encodeURIComponent(branchRunId)}/commands`,
    {
      method: "POST",
      body: JSON.stringify({
        ...commandIntent,
        commandId,
        runId: branchRunId,
        expectedRunVersion,
      }),
    },
  );
  await requestJson(
    fetcher,
    `/api/v1/counterfactuals/${encodeURIComponent(branchRunId)}/complete`,
    {
      method: "POST",
      body: "{}",
    },
  );
  return (
    await requestJson<{
      readonly comparison:
        CounterfactualComparisonViewV1;
    }>(
      fetcher,
      `/api/v1/counterfactuals/${encodeURIComponent(branchRunId)}/comparison`,
    )
  ).comparison;
}

export function createCounterfactualExplorerApi(
  fetcher: FetchLike = globalThis.fetch.bind(globalThis),
): CounterfactualExplorerApi {
  return {
    async loadPoints(sourceRunId) {
      return (
        await requestJson<{
          readonly points:
            readonly CounterfactualPointViewV1[];
        }>(
          fetcher,
          `/api/v1/runs/${encodeURIComponent(sourceRunId)}/counterfactual-points`,
        )
      ).points;
    },
    async explore(sourceRunId, point, commandIntent) {
      const branchRunId = identifier("RUN_COUNTERFACTUAL");
      const interventionId = identifier(
        "COMMAND_COUNTERFACTUAL",
      );
      await requestJson(
        fetcher,
        `/api/v1/runs/${encodeURIComponent(sourceRunId)}/counterfactuals`,
        {
          method: "POST",
          body: JSON.stringify({
            branchRunId,
            forkSequenceNumber: point.forkSequenceNumber,
            forkNodeId: point.forkNodeId,
            interventionId,
          }),
        },
      );
      return submitCompleteAndCompare(
        fetcher,
        branchRunId,
        interventionId,
        0,
        commandIntent,
      );
    },
    async continueBranch(
      counterfactualId,
      projection,
      commandIntent,
    ) {
      return submitCompleteAndCompare(
        fetcher,
        counterfactualId,
        identifier("COMMAND_COUNTERFACTUAL_CONTINUATION"),
        projection.version,
        commandIntent,
      );
    },
    async submitReflection(counterfactualId, response) {
      return (
        await requestJson<{
          readonly reflection: CounterfactualReflectionV1;
        }>(
          fetcher,
          `/api/v1/counterfactuals/${encodeURIComponent(counterfactualId)}/reflection`,
          {
            method: "POST",
            body: JSON.stringify({
              reflectionId: identifier(
                "REFLECTION_COUNTERFACTUAL",
              ),
              response,
            }),
          },
        )
      ).reflection;
    },
  };
}

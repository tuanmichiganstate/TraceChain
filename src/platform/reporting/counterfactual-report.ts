import type {
  AssignmentCounterfactualReportEntryV1,
  AssignmentCounterfactualReportSummaryV1,
} from "../contracts/counterfactual";

function numericDimensionDifferences(
  branches: readonly AssignmentCounterfactualReportEntryV1[],
  dimensionId: string,
): readonly number[] {
  return branches
    .filter((branch) => branch.branchStatus === "COMPLETED")
    .flatMap((branch) => {
      const difference = branch.comparison?.dimensions.find(
        (dimension) => dimension.dimensionId === dimensionId,
      )?.difference;
      return typeof difference === "number" ? [difference] : [];
    });
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

export function createAssignmentCounterfactualReportSummary(
  branches: readonly AssignmentCounterfactualReportEntryV1[],
): AssignmentCounterfactualReportSummaryV1 {
  const branchesByForkNode = new Map<string, number>();
  for (const branch of branches) {
    branchesByForkNode.set(
      branch.metadata.forkNodeId,
      (branchesByForkNode.get(branch.metadata.forkNodeId) ?? 0) +
        1,
    );
  }

  return {
    totalBranches: branches.length,
    completedBranches: branches.filter(
      (branch) => branch.branchStatus === "COMPLETED",
    ).length,
    reflectedBranches: branches.filter(
      (branch) => branch.reflection !== null,
    ).length,
    decisionBranches: branches.filter(
      (branch) =>
        branch.metadata.counterfactualType === "DECISION",
    ).length,
    conditionBranches: branches.filter(
      (branch) =>
        branch.metadata.counterfactualType === "CONDITION",
    ).length,
    isolatedComparisons: branches.filter(
      (branch) =>
        branch.comparison?.classification ===
        "SINGLE_INTERVENTION",
    ).length,
    compoundComparisons: branches.filter(
      (branch) =>
        branch.comparison?.classification ===
        "EXPLORATORY_BRANCH",
    ).length,
    branchesByForkNode: [...branchesByForkNode]
      .map(([forkNodeId, branchCount]) => ({
        forkNodeId,
        branchCount,
      }))
      .sort(
        (left, right) =>
          right.branchCount - left.branchCount ||
          left.forkNodeId.localeCompare(right.forkNodeId),
      ),
    averageAcademicScoreDifference: average(
      numericDimensionDifferences(
        branches,
        "DIM_ACADEMIC_SCORE",
      ),
    ),
    averageProcessScoreDifference: average(
      numericDimensionDifferences(
        branches,
        "DIM_PROCESS_SCORE",
      ),
    ),
  };
}

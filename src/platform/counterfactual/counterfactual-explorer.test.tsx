import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../app/providers/locale-provider";
import type { LearnerRunProjectionV1 } from "../contracts/run-events";
import {
  CounterfactualExplorer,
} from "./counterfactual-explorer";
import type {
  CounterfactualComparisonViewV1,
  CounterfactualConditionPointViewV1,
  CounterfactualExplorerApi,
  CounterfactualPointViewV1,
} from "./counterfactual-api";

const discrepancyPrefix =
  "platformPack.standardCoffeeStage3.scenarios.SCN_COFFEE_STAGE3_FOUNDATION.nodes.NODE_DISCREPANCY_DECISION";

function projection(
  runId: string,
  permittedActionIds: readonly string[],
): LearnerRunProjectionV1 {
  return {
    schemaVersion: "1.0.0",
    runId,
    version: 12,
    roleId: "PROCESSOR_OPERATOR",
    businessState: [
      {
        recordId: "LOT_QUANTITY",
        value: { quantityKg: 100 },
      },
    ],
    ledgerState: { recordedQuantityKg: 1_000 },
    informationState: [
      {
        recordId: "EVID_QUANTITY_RECORD",
        value: {
          physicalQuantityKg: 100,
          ledgerQuantityKg: 1_000,
        },
      },
    ],
    policyState: [
      {
        recordId: "POL_APPEND_ONLY_CORRECTION",
        value: { overwritePermitted: false },
      },
    ],
    workflowState: {
      currentNodeId: "discrepancy-decision",
      completedNodeIds: ["certificate-decision"],
      permittedActionIds,
    },
  };
}

const point: CounterfactualPointViewV1 = {
  schemaVersion: "1.0.0",
  sourceRunId: "RUN_SOURCE_001",
  forkSequenceNumber: 20,
  forkNodeId: "NODE_DISCREPANCY_DECISION",
  decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
  originalDecisionEventId: "EVENT_ORIGINAL_DECISION",
  originalOptionIds: ["IGNORE", "UNKNOWN"],
  actorId: "ACTOR_PROCESSOR",
  organizationId: "ORG_PROCESSOR",
  roleId: "PROCESSOR_OPERATOR",
  title: {
    localizationKey:
      "platformPack.standardCoffeeStage3.counterfactual.discrepancy",
  },
  fields: [
    {
      fieldId: "action",
      prompt: {
        localizationKey: `${discrepancyPrefix}.fields.action.prompt`,
      },
      selection: "single",
      options: [
        {
          optionId: "IGNORE",
          authoredValue: "IGNORE",
          label: {
            localizationKey: `${discrepancyPrefix}.fields.action.options.IGNORE.label`,
          },
        },
        {
          optionId: "APPEND_CORRECTION",
          authoredValue: "APPEND_CORRECTION",
          label: {
            localizationKey: `${discrepancyPrefix}.fields.action.options.APPEND_CORRECTION.label`,
          },
        },
      ],
    },
    {
      fieldId: "causeCode",
      prompt: {
        localizationKey: `${discrepancyPrefix}.fields.causeCode.prompt`,
      },
      selection: "single",
      options: [
        {
          optionId: "UNKNOWN",
          authoredValue: "UNKNOWN",
          label: {
            localizationKey: `${discrepancyPrefix}.fields.causeCode.options.UNKNOWN.label`,
          },
        },
        {
          optionId: "UNIT_MISMATCH",
          authoredValue: "UNIT_MISMATCH",
          label: {
            localizationKey: `${discrepancyPrefix}.fields.causeCode.options.UNIT_MISMATCH.label`,
          },
        },
      ],
    },
  ],
  configuration: {
    enabled: true,
    availability: "AFTER_FEEDBACK_RELEASE",
    permittedCreators: ["LEARNER", "INSTRUCTOR"],
    allowedAlternativeOptionIds: [
      "IGNORE",
      "APPEND_CORRECTION",
      "UNKNOWN",
      "UNIT_MISMATCH",
    ],
    comparisonDimensionIds: [
      "DIM_ACADEMIC_SCORE",
      "DIM_CONSUMER_SAFETY",
    ],
    downstreamPolicy: "REUSE_BASELINE_WHERE_VALID",
    maxBranchesPerLearner: 3,
    reflectionRequired: true,
    localizationKey:
      "platformPack.standardCoffeeStage3.counterfactual.discrepancy",
  },
  forkProjection: projection("RUN_SOURCE_001", [
    "SUBMIT_DISCREPANCY_DECISION",
  ]),
};

const comparison: CounterfactualComparisonViewV1 = {
  schemaVersion: "1.0.0",
  interpretation:
    "ORIGINAL_ASSESSED_ALTERNATIVE_EXPLORATORY",
  counterfactualId: "RUN_COUNTERFACTUAL_001",
  sourceRunId: "RUN_SOURCE_001",
  counterfactualType: "DECISION",
  forkNodeId: "NODE_DISCREPANCY_DECISION",
  decisionId: "INT_DISCREPANCY_INITIAL_SUBMITTED",
  classification: "SINGLE_INTERVENTION",
  hindsightLimitation:
    "REFLECTIVE_EXPLORATION_AFTER_COMPLETED_ATTEMPT",
  originalAssessedResult: {
    decision: {
      action: "IGNORE",
      causeCode: "UNKNOWN",
    },
    officialGradePreserved: true,
    projection: projection("RUN_SOURCE_001", []),
  },
  alternativeExploratoryResult: {
    decision: {
      action: "APPEND_CORRECTION",
      causeCode: "UNKNOWN",
    },
    officialGradeChanged: false,
    projection: {
      ...projection("RUN_COUNTERFACTUAL_001", []),
      businessState: [
        {
          recordId: "LOT_QUANTITY",
          value: { quantityKg: 100, correctionAppended: true },
        },
      ],
    },
  },
  informationAvailableWhenDecisionWasMade:
    point.forkProjection.informationState,
  informationRevealedLaterRecordIds: [
    "EVID_CORRECTION_AUDIT",
  ],
  timelines: {
    original: [
      {
        sequenceNumber: 21,
        eventId: "EVENT_ORIGINAL_DECISION",
        eventType: "DECISION_SUBMITTED",
        occurredAt: "2026-07-25T05:00:00.000Z",
        causationId: "COMMAND_ORIGINAL",
      },
    ],
    alternative: [
      {
        sequenceNumber: 1,
        eventId: "EVENT_ALTERNATIVE_DECISION",
        eventType: "DECISION_SUBMITTED",
        occurredAt: "2026-07-25T06:00:00.000Z",
        causationId: "COMMAND_ALTERNATIVE",
      },
    ],
  },
  differences: {
    changedBusinessRecordIds: ["LOT_QUANTITY"],
    ledgerChanged: true,
    workflowNodeChanged: false,
    attribution: "DOWNSTREAM_STATE_EFFECT",
  },
  dimensions: [
    {
      dimensionId: "DIM_ACADEMIC_SCORE",
      title: {
        localizationKey:
          "platformPack.standardCoffeeStage3.counterfactual.dimensions.academicScore.title",
      },
      description: {
        localizationKey:
          "platformPack.standardCoffeeStage3.counterfactual.dimensions.academicScore.description",
      },
      originalValue: 72,
      alternativeValue: 82,
      difference: 10,
      evaluationStatus: "EVALUATED",
      attribution: "DIRECT_INTERVENTION_EFFECT",
    },
  ],
};

const conditionPoint: CounterfactualConditionPointViewV1 = {
  schemaVersion: "1.0.0",
  sourceRunId: "RUN_SOURCE_001",
  forkSequenceNumber: 8,
  forkNodeId: "NODE_CERTIFICATE_DECISION",
  decisionId: "INT_CERTIFICATE_INITIAL_SUBMITTED",
  originalDecisionEventId: "EVENT_CERTIFICATE_DECISION",
  originalOptionIds: [
    "VALID",
    "RECOGNIZED",
    "AUTHORIZED",
    "HASH_ON_CHAIN",
    "CONTINUE",
  ],
  actorId: "ACTOR_CERTIFIER",
  organizationId: "ORG_CERTIFICATION_BODY",
  roleId: "CERTIFICATION_OFFICER",
  title: {
    localizationKey:
      "counterfactual.condition.certificateSigner.title",
  },
  originalConditionValueId: "AUTHORIZED_CERTIFIER",
  configuration: {
    enabled: true,
    conditionId: "CONDITION_CERTIFICATE_SIGNER_CONTEXT",
    availability: "AFTER_FEEDBACK_RELEASE",
    permittedCreators: ["LEARNER", "INSTRUCTOR"],
    forkNodeId: "NODE_CERTIFICATE_DECISION",
    runtimeConditionKey: "COFFEE_CASE_VARIANT",
    allowedValues: [
      {
        conditionValueId: "AUTHORIZED_CERTIFIER",
        runtimeValue: "authorized-certifier",
        label: {
          localizationKey:
            "counterfactual.condition.certificateSigner.authorized",
        },
      },
      {
        conditionValueId: "UNAUTHORIZED_TRANSPORTER",
        runtimeValue: "unauthorized-transporter",
        label: {
          localizationKey:
            "counterfactual.condition.certificateSigner.unauthorized",
        },
      },
    ],
    affectsInformationBeforeFork: true,
    comparisonDimensionIds: ["DIM_ACADEMIC_SCORE"],
    maxBranchesPerLearner: 2,
    reflectionRequired: true,
    localizationKey:
      "counterfactual.condition.certificateSigner.title",
  },
  forkProjection: projection("RUN_SOURCE_001", [
    "SUBMIT_CERTIFICATE_DECISION",
  ]),
};

describe("counterfactual explorer", () => {
  it("runs a changed decision against the reconstructed context and saves reflection", async () => {
    const api: CounterfactualExplorerApi = {
      loadPoints: vi.fn().mockResolvedValue({
        decisions: [point],
        conditions: [],
      }),
      explore: vi.fn().mockResolvedValue(comparison),
      exploreCondition: vi.fn(),
      continueBranch: vi.fn().mockResolvedValue(comparison),
      submitReflection: vi.fn().mockResolvedValue({
        schemaVersion: "1.0.0",
        reflectionId: "REFLECTION_001",
        branchRunId: comparison.counterfactualId,
        response: {
          evidenceThatMattered: "The physical count.",
          reasonForDifference: "The correction retained history.",
          foreseeableConsequences: "Audit quality could improve.",
          laterInformation: "The audit record appeared later.",
          revisedDecisionRule: "Never overwrite history.",
        },
        submittedByUserId: "USER_LEARNER_001",
        submittedAt: "2026-07-25T07:00:00.000Z",
      }),
    };
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <CounterfactualExplorer
          api={api}
          sourceRunId="RUN_SOURCE_001"
        />
      </LocaleProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Choose a decision to explore",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Compare another discrepancy response",
      }),
    );

    expect(
      screen.getByText("EVID_QUANTITY_RECORD"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("POL_APPEND_ONLY_CORRECTION"),
    ).toBeInTheDocument();
    const runButton = screen.getByRole("button", {
      name: "Run alternative branch",
    });
    expect(runButton).toBeDisabled();

    await user.click(
      screen.getByRole("radio", {
        name: "Append a linked correction",
      }),
    );
    expect(runButton).toBeEnabled();
    await user.click(runButton);

    expect(api.explore).toHaveBeenCalledWith(
      "RUN_SOURCE_001",
      point,
      expect.objectContaining({
        commandType: "SUBMIT_DISCREPANCY_DECISION",
        decision: {
          action: "APPEND_CORRECTION",
          causeCode: "UNKNOWN",
        },
      }),
    );
    expect(
      await screen.findByText(
        "The original and alternative paths are ready to compare.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Original" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Alternative" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The original score, completion status, ratings, and competency evidence remain unchanged. The alternative is ungraded.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Download comparison JSON",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/counterfactuals/RUN_COUNTERFACTUAL_001/export.json",
    );
    expect(
      screen.getByRole("link", {
        name: "Download comparison CSV",
      }),
    ).toHaveAttribute(
      "href",
      "/api/v1/counterfactuals/RUN_COUNTERFACTUAL_001/export.csv",
    );

    const reflection = screen
      .getByRole("heading", {
        name: "Reflect on the comparison",
      })
      .closest("form");
    if (reflection === null) {
      throw new Error("Expected the reflection form.");
    }
    const answers = [
      "The physical count.",
      "The correction retained history.",
      "Audit quality could improve.",
      "The audit record appeared later.",
      "Never overwrite history.",
    ];
    const textboxes = within(reflection).getAllByRole("textbox");
    for (const [index, textbox] of textboxes.entries()) {
      await user.type(textbox, answers[index] ?? "");
    }
    await user.click(
      within(reflection).getByRole("button", {
        name: "Save reflection",
      }),
    );

    expect(api.submitReflection).toHaveBeenCalledWith(
      comparison.counterfactualId,
      {
        evidenceThatMattered: answers[0],
        reasonForDifference: answers[1],
        foreseeableConsequences: answers[2],
        laterInformation: answers[3],
        revisedDecisionRule: answers[4],
      },
    );
    expect(
      await screen.findByText(
        "Reflection saved. It is practice evidence and does not change the official grade.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for a real later command when automatic replay diverges", async () => {
    const pausedProjection = projection(
      "RUN_COUNTERFACTUAL_001",
      ["INVESTIGATE_DISCREPANCY"],
    );
    const pausedComparison: CounterfactualComparisonViewV1 = {
      ...comparison,
      classification: "EXPLORATORY_BRANCH",
      alternativeExploratoryResult: {
        ...comparison.alternativeExploratoryResult,
        projection: pausedProjection,
      },
    };
    const continueBranch = vi
      .fn()
      .mockResolvedValue(comparison);
    const api: CounterfactualExplorerApi = {
      loadPoints: vi.fn().mockResolvedValue({
        decisions: [point],
        conditions: [],
      }),
      explore: vi.fn().mockResolvedValue(pausedComparison),
      exploreCondition: vi.fn(),
      continueBranch,
      submitReflection: vi.fn(),
    };
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <CounterfactualExplorer
          api={api}
          sourceRunId="RUN_SOURCE_001"
          renderContinuation={({ onSubmit }) => (
            <button
              type="button"
              onClick={() =>
                void onSubmit({
                  commandType: "INVESTIGATE_DISCREPANCY",
                })
              }
            >
              Complete later decision
            </button>
          )}
        />
      </LocaleProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Choose a decision to explore",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Compare another discrepancy response",
      }),
    );
    await user.click(
      screen.getByRole("radio", {
        name: "Append a linked correction",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Run alternative branch",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Continue the alternative path",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Complete later decision",
      }),
    );
    expect(continueBranch).toHaveBeenCalledWith(
      "RUN_COUNTERFACTUAL_001",
      pausedProjection,
      {
        commandType: "INVESTIGATE_DISCREPANCY",
      },
    );
    expect(
      await screen.findByRole("heading", {
        name: "Reflect on the comparison",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the original decision while exploring an authored condition", async () => {
    const conditionComparison: CounterfactualComparisonViewV1 = {
      ...comparison,
      counterfactualId: "RUN_COUNTERFACTUAL_CONDITION",
      counterfactualType: "CONDITION",
      forkNodeId: conditionPoint.forkNodeId,
      decisionId: conditionPoint.decisionId,
      conditionChange: {
        conditionId:
          conditionPoint.configuration.conditionId,
        originalValueId: "AUTHORIZED_CERTIFIER",
        alternativeValueId: "UNAUTHORIZED_TRANSPORTER",
        affectsInformationBeforeFork: true,
      },
      alternativeExploratoryResult: {
        ...comparison.alternativeExploratoryResult,
        decision: comparison.originalAssessedResult.decision,
      },
      differences: {
        ...comparison.differences,
        attribution: "CONDITION_OVERRIDE_EFFECT",
      },
      dimensions: comparison.dimensions.map((dimension) => ({
        ...dimension,
        attribution: "CONDITION_OVERRIDE_EFFECT",
      })),
    };
    const api: CounterfactualExplorerApi = {
      loadPoints: vi.fn().mockResolvedValue({
        decisions: [],
        conditions: [conditionPoint],
      }),
      explore: vi.fn(),
      exploreCondition: vi
        .fn()
        .mockResolvedValue(conditionComparison),
      continueBranch: vi.fn(),
      submitReflection: vi.fn(),
    };
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <CounterfactualExplorer
          api={api}
          sourceRunId="RUN_SOURCE_001"
        />
      </LocaleProvider>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Choose a decision to explore",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Change the certificate signer context",
      }),
    );

    expect(
      screen.getByText(
        "The original learner decision is kept unchanged. Select one author-approved scenario condition to change.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: /Recognized, authorized certifier/u,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("radio", {
        name: "Recognized transporter without certificate authority",
      }),
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", {
        name: "Run condition comparison",
      }),
    );

    expect(api.exploreCondition).toHaveBeenCalledWith(
      "RUN_SOURCE_001",
      conditionPoint,
      "UNAUTHORIZED_TRANSPORTER",
    );
    expect(
      await screen.findByText(
        "Condition changed: AUTHORIZED_CERTIFIER → UNAUTHORIZED_TRANSPORTER. The learner decision stayed the same.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is the same decision under different visible evidence.",
      ),
    ).toBeInTheDocument();
  });
});

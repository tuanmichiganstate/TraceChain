import packJson from "../../../scenario-packs/standard-coffee-stage3/tracechain.pack.json";
import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/tracechain.pack.json";
import auditPackJson from "../../../scenario-packs/guided-coffee-audit/tracechain.pack.json";
import practiceAuditPackJson from "../../../scenario-packs/practice-coffee-audit/tracechain.pack.json";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import en from "../../locales/en.json";
import vi from "../../locales/vi.json";
import type { ScenarioPackV1 } from "../contracts/scenario-pack";
import { validateScenarioPack } from "./validation";

const validate = (value: unknown) =>
  validateScenarioPack(value, {
    localizationCatalogs: { en, vi },
  });

function validPack(): ScenarioPackV1 {
  const result = validate(structuredClone(packJson));
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return result.pack;
}

describe("scenario-pack validation", () => {
  it("requires every policy to provide a localized learner statement", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        policies: Array<{
          learnerStatement?: unknown;
        }>;
      }>;
    };
    delete invalid.scenarios[0]!.policies[0]!.learnerStatement;

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "EXPECTED_OBJECT",
          path: "$.scenarios[0].policies[0].learnerStatement",
        }),
      );
    }
  });

  it("accepts separately authored learner and assessment evidence metadata", () => {
    const enriched = structuredClone(pharmaceuticalPackJson) as unknown as {
      scenarios: Array<{
        evidenceItems: Array<Record<string, unknown>>;
      }>;
    };
    for (const scenario of enriched.scenarios) {
      for (const evidence of scenario.evidenceItems) {
        evidence.learnerMetadata = {
          signatureStatus: "NOT_CHECKED",
          ledgerStatus: "OFF_CHAIN",
          completeness: "UNKNOWN",
          access: {
            classification: "ROLE_RESTRICTED",
            acquisitionMode: "AVAILABLE",
            delayMinutes: 0,
            costUnits: 0,
          },
        };
        evidence.assessmentMetadata = {
          reliability: "NOT_ASSESSED",
          contentStatus: "NOT_ASSESSED",
          limitationCodes: [],
          hiddenConditionReferences: [],
        };
      }
    }

    const result = validateScenarioPack(enriched);

    expect(
      result.isValid,
      result.isValid ? "" : JSON.stringify(result.issues, null, 2),
    ).toBe(true);
  });

  it("requires both evidence metadata views in the active schema", () => {
    const missing = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        evidenceItems: Array<{
          learnerMetadata?: unknown;
          assessmentMetadata?: unknown;
        }>;
      }>;
    };
    delete missing.scenarios[0]!.evidenceItems[0]!.learnerMetadata;
    delete missing.scenarios[1]!.evidenceItems[0]!
      .assessmentMetadata;

    const result = validateScenarioPack(missing);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "EXPECTED_OBJECT",
            path:
              "$.scenarios[0].evidenceItems[0].learnerMetadata",
          }),
          expect.objectContaining({
            code: "EXPECTED_OBJECT",
            path:
              "$.scenarios[1].evidenceItems[0].assessmentMetadata",
          }),
        ]),
      );
    }
  });

  it("rejects acquisition costs on evidence authored as immediately available", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        evidenceItems: Array<{
          learnerMetadata: {
            access: {
              acquisitionMode: string;
              delayMinutes: number;
              costUnits: number;
            };
          };
        }>;
      }>;
    };
    invalid.scenarios[0]!.evidenceItems[0]!.learnerMetadata
      .access.costUnits = 1;

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "AVAILABLE_EVIDENCE_HAS_ACQUISITION_COST",
          path:
            "$.scenarios[0].evidenceItems[0].learnerMetadata.access",
        }),
      );
    }
  });

  it("requires request-required evidence to be offered by the workflow", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        scenarioId: string;
        nodes: Array<{
          nodeType: string;
          evidenceIds?: string[];
        }>;
      }>;
    };
    const scenario = invalid.scenarios.find(
      (candidate) =>
        candidate.scenarioId ===
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
    );
    const release = scenario?.nodes.find(
      (node) =>
        node.nodeType === "EVIDENCE_RELEASE" &&
        node.evidenceIds?.includes(
          "EVID_PHARMA_TRANSFER_STABILITY",
        ),
    );
    if (release?.evidenceIds === undefined) {
      throw new Error("Expected the investigation evidence node.");
    }
    release.evidenceIds = release.evidenceIds.filter(
      (evidenceId) =>
        evidenceId !== "EVID_PHARMA_TRANSFER_STABILITY",
    );

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "REQUEST_REQUIRED_EVIDENCE_NOT_OFFERED",
        }),
      );
    }
  });

  it("requires an authored mode that permits evidence requests", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        scenarioId: string;
        modeConfigurations: Array<{
          allowEvidenceRequests: boolean;
        }>;
      }>;
    };
    const scenario = invalid.scenarios.find(
      (candidate) =>
        candidate.scenarioId ===
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
    );
    if (scenario === undefined) {
      throw new Error("Expected the pharmaceutical transfer case.");
    }
    scenario.modeConfigurations.forEach((configuration) => {
      configuration.allowEvidenceRequests = false;
    });

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "REQUEST_REQUIRED_EVIDENCE_DISABLED",
        }),
      );
    }
  });

  it("requires evidence-request permission references to use a supported authorization policy", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        scenarioId: string;
        evidenceItems: Array<{
          evidenceId: string;
          learnerMetadata: {
            access: {
              permissionPolicyId?: string;
            };
          };
        }>;
      }>;
    };
    const scenario = invalid.scenarios.find(
      (candidate) =>
        candidate.scenarioId ===
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
    );
    const evidence = scenario?.evidenceItems.find(
      (candidate) =>
        candidate.evidenceId ===
        "EVID_PHARMA_TRANSFER_STABILITY",
    );
    if (evidence === undefined) {
      throw new Error("Expected request-required stability evidence.");
    }
    evidence.learnerMetadata.access.permissionPolicyId =
      "POLICY_PHARMA_TRANSFER_DISPOSITION";

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_EVIDENCE_REQUEST_PERMISSION_POLICY",
        }),
      );
    }
  });

  it("rejects assessment metadata that names an unknown hidden condition", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: Array<{
        evidenceItems: Array<{
          assessmentMetadata: {
            hiddenConditionReferences: string[];
          };
        }>;
      }>;
    };
    invalid.scenarios[0]!.evidenceItems[0]!.assessmentMetadata
      .hiddenConditionReferences = ["conditionNotAuthored"];

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "UNKNOWN_HIDDEN_CONDITION_REFERENCE",
          path:
            "$.scenarios[0].evidenceItems[0].assessmentMetadata.hiddenConditionReferences[0]",
        }),
      );
    }
  });

  it("accepts the Guided Audit case and rejects insufficient authored finding evidence", () => {
    const valid = validateScenarioPack(
      structuredClone(auditPackJson),
    );
    expect(valid.isValid).toBe(true);

    const invalid = structuredClone(auditPackJson) as unknown as {
      scenarios: Array<{
        auditCase: {
          findingDefinitions: Array<{
            requiredEvidenceIds: string[];
          }>;
        };
      }>;
    };
    invalid.scenarios[0]!.auditCase.findingDefinitions[0]!
      .requiredEvidenceIds = ["EVID_NOT_IN_CASE"];
    const result = validateScenarioPack(invalid);
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INSUFFICIENT_AUDIT_FINDING_EVIDENCE",
        }),
      );
    }
  });

  it("rejects duplicate Audit finding and decoy identifiers and unexplained decoys", () => {
    const invalid = structuredClone(auditPackJson) as unknown as {
      localizationCatalogs: Record<string, Record<string, string>>;
      scenarios: Array<{
        auditCase: {
          findingDefinitions: Array<{
            findingDefinitionId: string;
          }>;
          decoyDefinitions: Array<{
            decoyDefinitionId: string;
            explanation: { localizationKey: string };
          }>;
        };
      }>;
    };
    const auditCase = invalid.scenarios[0]!.auditCase;
    auditCase.findingDefinitions[1]!.findingDefinitionId =
      auditCase.findingDefinitions[0]!.findingDefinitionId;
    auditCase.decoyDefinitions[1]!.decoyDefinitionId =
      auditCase.decoyDefinitions[0]!.decoyDefinitionId;
    const explanationKey =
      auditCase.decoyDefinitions[0]!.explanation.localizationKey;
    invalid.localizationCatalogs.en![explanationKey] = "";

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "DUPLICATE_AUDIT_FINDING_ID",
          }),
          expect.objectContaining({
            code: "DUPLICATE_AUDIT_DECOY_ID",
          }),
          expect.objectContaining({
            code: "MISSING_LOCALIZATION_KEY",
          }),
        ]),
      );
    }
  });

  it("accepts the bounded Practice Audit case", () => {
    const result = validateScenarioPack(
      structuredClone(practiceAuditPackJson),
    );

    expect(
      result.isValid,
      result.isValid ? "" : JSON.stringify(result.issues, null, 2),
    ).toBe(true);
    if (result.isValid) {
      const scenario = result.pack.scenarios[0]!;
      expect(scenario.scenarioId).toBe(
        "SCN_PRACTICE_COFFEE_AUDIT",
      );
      expect(scenario.auditCase?.supportProfiles).toEqual([
        "PRACTICE",
      ]);
      expect(scenario.auditCase?.inputLimits).toMatchObject({
        maximumDrafts: 1,
        maximumDraftRecords: 1,
        maximumFindingRecords: 6,
      });
    }
  });
  it("validates the bilingual native coffee pack", () => {
    const result = validate(structuredClone(packJson));

    expect(
      result.isValid,
      result.isValid ? "" : JSON.stringify(result.issues, null, 2),
    ).toBe(true);
    expect(result.checkedCount).toBeGreaterThan(2_000);
    if (result.isValid) {
      const competencies =
        result.pack.competencyFrameworks[0]?.competencies ?? [];
      expect(competencies.map((item) => item.competencyId)).toEqual([
        "BC1",
        "BC2",
        "BC3",
        "BC4",
        "BC5",
        "BC6",
        "BC7",
        "BC8",
        "PC1",
        "PC2",
        "PC3",
        "PC4",
        "PC5",
        "PC6",
        "PC7",
        "PC8",
        "PC9",
        "PC10",
      ]);
    }
  });

  it("binds each coffee staff profile to approved local portrait media", () => {
    const pack = validPack();
    const scenario = pack.scenarios[0]!;

    expect(pack.portraitAssets).toHaveLength(7);
    expect(scenario.staffProfiles).toHaveLength(7);
    for (const profile of scenario.staffProfiles) {
      expect(
        pack.portraitAssets.some(
          (asset) => asset.assetId === profile.portraitAssetId,
        ),
      ).toBe(true);
      expect(profile.fictional).toBe(true);
    }
  });

  it("rejects a missing staff localization key", () => {
    const invalid = structuredClone(packJson);
    invalid.scenarios[0]!.staffProfiles[0]!.displayName.localizationKey =
      "staff.missing.name";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_LOCALIZATION_KEY",
          path: "$.scenarios[0].staffProfiles[0].displayName.localizationKey",
        }),
      ]),
    );
  });

  it("rejects remote portrait media", () => {
    const invalid = structuredClone(packJson);
    invalid.portraitAssets[0]!.filePath =
      "https://example.test/staff.webp";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_PORTRAIT_PATH",
          path: "$.portraitAssets[0].filePath",
        }),
      ]),
    );
  });

  it("rejects a portrait hash that disagrees with the asset manifest", () => {
    const invalid = structuredClone(packJson);
    invalid.portraitAssets[0]!.sha256 = "0".repeat(64);

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PORTRAIT_ASSET_HASH_MISMATCH",
        }),
      ]),
    );
  });

  it("validates a self-localized disciplinary starter without source catalog changes", () => {
    const result = validateScenarioPack(
      structuredClone(pharmaceuticalPackJson),
    );

    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.pack.manifest.domain).toBe(
        "pharmaceutical-cold-chain",
      );
      expect(
        result.pack.competencyFrameworks[0]?.competencies[0]
          ?.competencyId,
      ).toBe("PHARMA.COLD_CHAIN");
      expect(
        result.pack.scenarios.map((scenario) => scenario.scenarioId),
      ).toEqual([
        "SCN_PHARMA_COLD_CHAIN_STARTER",
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
      ]);
      expect(result.pack.localizationCatalogs?.vi).toBeDefined();
    }
  });

  it("returns path-specific diagnostics for missing locale content", () => {
    const invalid = structuredClone(packJson) as {
      manifest: { title: { localizationKey: string } };
    };
    invalid.manifest.title.localizationKey = "platformPack.missing.title";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "MISSING_LOCALIZATION_KEY",
          path: "$.manifest.title.localizationKey",
        }),
      );
    }
  });

  it("requires exactly one published configuration for every supported mode", () => {
    const invalid = structuredClone(packJson);
    const scenario = invalid.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    scenario.modeConfigurations =
      scenario.modeConfigurations.filter(
        (configuration) => configuration.mode !== "sandbox",
      );

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "MODE_CONFIGURATION_MISMATCH",
          path: "$.scenarios[0].modeConfigurations",
        }),
      );
    }
  });

  it("rejects missing authored mode contracts", () => {
    const invalid = structuredClone(pharmaceuticalPackJson) as unknown as {
      scenarios: {
        modeConfigurations?: unknown;
        outcomeModels?: unknown;
      }[];
    };
    const scenario = invalid.scenarios[0];
    if (scenario === undefined) throw new Error("Expected scenario.");
    delete scenario.modeConfigurations;
    delete scenario.outcomeModels;

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$.scenarios[0].modeConfigurations",
          }),
          expect.objectContaining({
            path: "$.scenarios[0].outcomeModels",
          }),
        ]),
      );
    }
  });

  it("rejects the superseded pack schema instead of migrating it", () => {
    const superseded = structuredClone(packJson) as {
      schemaVersion: string;
    };
    superseded.schemaVersion = "1.3.0";

    const result = validate(superseded);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "UNSUPPORTED_SCHEMA_VERSION",
          path: "$.schemaVersion",
        }),
      );
    }
  });

  it("rejects non-positive weighted outcome probabilities", () => {
    const invalid = structuredClone(packJson);
    const scenario = invalid.scenarios[0];
    const model = scenario?.outcomeModels[0];
    if (
      scenario === undefined ||
      model === undefined ||
      model.distribution !== "weighted-categorical"
    ) {
      throw new Error("Expected weighted certificate outcome model.");
    }
    const outcome = model.outcomes[0];
    if (outcome === undefined) throw new Error("Expected outcome.");
    outcome.weight = 0;

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "NUMBER_BELOW_MINIMUM",
          path: "$.scenarios[0].outcomeModels[0].outcomes[0].weight",
        }),
      );
    }
  });

  it("rejects inconsistent structured decision response bounds", () => {
    const invalid = structuredClone(packJson);
    const decisionNode = invalid.scenarios[0]?.nodes.find(
      (node) =>
        node.nodeType === "DECISION" &&
        node.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (
      decisionNode === undefined ||
      decisionNode.nodeType !== "DECISION" ||
      decisionNode.structuredResponse === undefined
    ) {
      throw new Error("Expected structured certificate decision.");
    }
    decisionNode.structuredResponse.evidenceCitations.minimumItems = 2;
    decisionNode.structuredResponse.evidenceCitations.maximumItems = 1;

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_DECISION_RESPONSE_RANGE",
          path:
            "$.scenarios[0].nodes[2].structuredResponse.evidenceCitations",
        }),
      );
    }
  });

  it("rejects inconsistent policy-citation bounds", () => {
    const invalid = structuredClone(packJson);
    const decisionNode = invalid.scenarios[0]?.nodes.find(
      (node) =>
        node.nodeType === "DECISION" &&
        node.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (
      decisionNode === undefined ||
      decisionNode.nodeType !== "DECISION" ||
      decisionNode.structuredResponse === undefined
    ) {
      throw new Error("Expected structured certificate decision.");
    }
    decisionNode.structuredResponse.policyCitations.minimumItems = 2;
    decisionNode.structuredResponse.policyCitations.maximumItems = 1;

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_DECISION_RESPONSE_RANGE",
          path:
            "$.scenarios[0].nodes[2].structuredResponse.policyCitations",
        }),
      );
    }
  });

  it("accepts authored counterfactual eligibility and comparison dimensions", () => {
    const eligible = structuredClone(packJson);
    const scenario = eligible.scenarios[0];
    const decision = scenario?.nodes.find(
      (node) =>
        node.nodeType === "DECISION" &&
        node.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (scenario === undefined || decision === undefined) {
      throw new Error("Expected certificate decision.");
    }

    const result = validate(eligible);

    expect(
      result.isValid,
      result.isValid ? "" : JSON.stringify(result.issues, null, 2),
    ).toBe(true);
    expect(
      scenario.counterfactualComparisonDimensions.map(
        (dimension) => dimension.dimensionId,
      ),
    ).toContain("DIM_CONSUMER_SAFETY");
    expect(decision.counterfactual).toMatchObject({
      enabled: true,
      availability: "AFTER_FEEDBACK_RELEASE",
      downstreamPolicy: "REUSE_BASELINE_WHERE_VALID",
    });
    expect(scenario.counterfactualConditions).toContainEqual(
      expect.objectContaining({
        conditionId: "CONDITION_CERTIFICATE_SIGNER_CONTEXT",
        runtimeConditionKey: "COFFEE_CASE_VARIANT",
        affectsInformationBeforeFork: true,
      }),
    );
  });

  it("rejects counterfactual references outside the authored decision contract", () => {
    const invalid = structuredClone(packJson) as unknown as {
      scenarios: {
        counterfactualComparisonDimensions: unknown[];
        nodes: {
          nodeType: string;
          decisionId?: string;
          counterfactual?: unknown;
        }[];
      }[];
    };
    const scenario = invalid.scenarios[0];
    const decision = scenario?.nodes.find(
      (node) =>
        node.nodeType === "DECISION" &&
        node.decisionId === "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
    if (scenario === undefined || decision === undefined) {
      throw new Error("Expected certificate decision.");
    }
    decision.counterfactual = {
      enabled: true,
      availability: "AFTER_RUN_COMPLETION",
      permittedCreators: ["LEARNER"],
      allowedAlternativeOptionIds: ["NOT_AN_AUTHORED_OPTION"],
      comparisonDimensionIds: ["DIM_UNKNOWN"],
      downstreamPolicy: "REUSE_BASELINE_WHERE_VALID",
      localizationKey:
        "platformPack.standardCoffeeStage3.counterfactual.certificate",
    };

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "UNKNOWN_COUNTERFACTUAL_ALTERNATIVE",
          }),
          expect.objectContaining({
            code: "UNKNOWN_COUNTERFACTUAL_COMPARISON_DIMENSION",
          }),
        ]),
      );
    }
  });

  it("rejects decision effects for undeclared counterfactual metrics", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: {
        scenarioId: string;
        nodes: {
          nodeType: string;
          fields?: {
            options: {
              professionalConsequenceEffects?: Record<string, number>;
            }[];
          }[];
        }[];
      }[];
    };
    const scenario = invalid.scenarios.find(
      (candidate) =>
        candidate.scenarioId ===
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
    );
    const option = scenario?.nodes
      .find((node) => node.nodeType === "DECISION")
      ?.fields?.[0]?.options[0];
    if (option === undefined) {
      throw new Error("Expected a transfer decision option.");
    }
    option.professionalConsequenceEffects = {
      PHARMA_UNDECLARED_METRIC: 1,
    };

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "UNKNOWN_PROFESSIONAL_CONSEQUENCE_METRIC",
        }),
      );
    }
  });

  it("rejects instructor incidents outside authored scenario boundaries", () => {
    const invalid = structuredClone(
      pharmaceuticalPackJson,
    ) as unknown as {
      scenarios: {
        scenarioId: string;
        instructorIncidents: {
          evidenceIds: string[];
          releaseAtNodeIds: string[];
          professionalConsequenceEffects: Record<string, number>;
        }[];
      }[];
    };
    const incident = invalid.scenarios.find(
      (candidate) =>
        candidate.scenarioId ===
        "SCN_PHARMA_COLD_CHAIN_TRANSFER",
    )?.instructorIncidents[0];
    if (incident === undefined) {
      throw new Error("Expected an authored instructor incident.");
    }
    incident.evidenceIds = ["EVIDENCE_NOT_AUTHORED"];
    incident.releaseAtNodeIds = ["NODE_NOT_AUTHORED"];
    incident.professionalConsequenceEffects = {
      METRIC_NOT_AUTHORED: 1,
    };

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "UNKNOWN_EVIDENCE_REFERENCE",
          }),
          expect.objectContaining({
            code: "UNKNOWN_NODE_REFERENCE",
          }),
          expect.objectContaining({
            code: "UNKNOWN_PROFESSIONAL_CONSEQUENCE_METRIC",
          }),
        ]),
      );
    }
  });

  it("rejects arbitrary counterfactual condition paths", () => {
    const invalid = structuredClone(packJson) as unknown as {
      scenarios: {
        counterfactualConditions: {
          runtimeConditionKey: string;
        }[];
      }[];
    };
    const condition =
      invalid.scenarios[0]?.counterfactualConditions[0];
    if (condition === undefined) {
      throw new Error("Expected certificate condition.");
    }
    condition.runtimeConditionKey = "actualState.secret";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_COUNTERFACTUAL_CONDITION_KEY",
        }),
      );
    }
  });

  it("rejects unsafe automated-evidence field paths", () => {
    const invalid = structuredClone(packJson);
    const inspectionRule = invalid.evidenceRules.find(
      (rule) =>
        rule.evidenceRuleId === "RULE_CERTIFICATE_INSPECTED",
    );
    if (inspectionRule === undefined) {
      throw new Error("Expected the certificate inspection rule.");
    }
    inspectionRule.fieldPath = "__proto__.evidenceId";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "INVALID_EVIDENCE_FIELD_PATH",
          path: "$.evidenceRules[0].fieldPath",
        }),
      );
    }
  });

  it("rejects unknown competency references", () => {
    const invalid = structuredClone(packJson) as {
      scenarios: {
        competencyTargets: {
          competencyId: string;
          indicatorIds: string[];
        }[];
      }[];
    };
    const firstTarget = invalid.scenarios[0]?.competencyTargets[0];
    if (firstTarget === undefined) throw new Error("Fixture target missing.");
    firstTarget.competencyId = "BC99";
    firstTarget.indicatorIds = ["BC99.PI1"];

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        "UNKNOWN_COMPETENCY_REFERENCE",
      );
      expect(result.issues.map((issue) => issue.code)).toContain(
        "UNKNOWN_INDICATOR_REFERENCE",
      );
    }
  });

  it("detects unreachable workflow nodes and missing completion paths", () => {
    const invalid = structuredClone(packJson) as {
      scenarios: { nodes: { transitions: unknown[] }[] }[];
    };
    const entryNode = invalid.scenarios[0]?.nodes[0];
    if (entryNode === undefined) throw new Error("Fixture entry node missing.");
    entryNode.transitions = [];

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        "UNREACHABLE_NODE",
      );
      expect(result.issues.map((issue) => issue.code)).toContain(
        "MISSING_COMPLETION_PATH",
      );
    }
  });

  it("rejects executable content in imported data", () => {
    const invalid = structuredClone(packJson) as {
      scenarios: {
        policies: { configuration: Record<string, unknown> }[];
      }[];
    };
    const configuration = invalid.scenarios[0]?.policies[0]?.configuration;
    if (configuration === undefined) {
      throw new Error("Fixture policy missing.");
    }
    configuration.script = "return true";

    const result = validate(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "EXECUTABLE_CONTENT_FORBIDDEN",
          path:
            "$.scenarios[0].policies[0].configuration.script",
        }),
      );
    }
  });

  it("binds the native runtime to the current coffee domain contract", () => {
    const pack = validPack();
    const scenario = pack.scenarios[0];
    const runtime = scenario?.hostedRuntime;
    expect(runtime).toBeDefined();
    if (
      scenario === undefined ||
      runtime === undefined ||
      runtime.runtimeId !== "tracechain-coffee-v2"
    ) return;

    expect(runtime.domainScenarioId).toBe(coffeeScenario.scenarioId);
    expect(runtime.domainScenarioVersion).toBe(
      coffeeScenario.scenarioVersion,
    );
    expect(
      coffeeScenario.stages.some(
        (stage) => stage.stageId === runtime.entryStageId,
      ),
    ).toBe(true);
    for (const binding of runtime.actionBindings) {
      expect(
        coffeeScenario.runtime.learnerCommandTemplates[
          binding.domainActionId
        ],
      ).toBeDefined();
    }
    expect(
      coffeeCryptographicRuntime.authorizationPolicies.policies.some(
        (policy) => policy.authorizationPolicyId === "AUTH_ISSUE_CERTIFICATE",
      ),
    ).toBe(true);
    expect(coffeeScenario.decisionIds).toContain(
      "INT_CERTIFICATE_INITIAL_SUBMITTED",
    );
  });
});

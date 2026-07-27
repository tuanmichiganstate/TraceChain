import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("published scenario-pack JSON Schema", () => {
  it("is valid JSON with a stable versioned identity", () => {
    const path = resolve(
      process.cwd(),
      "schemas/tracechain-scenario-pack-v1.schema.json",
    );
    const schema = JSON.parse(readFileSync(path, "utf8")) as {
      $schema?: string;
      $id?: string;
      title?: string;
      properties?: Record<string, unknown>;
      $defs: {
        scenario: {
          required: readonly string[];
        };
      };
    };

    expect(schema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(schema.$id).toContain("tracechain-scenario-pack-v1");
    expect(schema.title).toBe("TraceChain Scenario Pack V1.9");
    expect(schema.properties).toHaveProperty("schemaVersion");
    expect(schema.properties).toHaveProperty("scenarios");
    expect(schema.properties).toHaveProperty("auditVariantBanks");
    expect(schema.$defs.scenario.required).toEqual(
      expect.arrayContaining([
        "modeConfigurations",
        "outcomeModels",
        "counterfactualComparisonDimensions",
        "counterfactualConditions",
      ]),
    );
    expect(schema.properties).toHaveProperty("competencyFrameworks");
    expect(schema.properties).not.toHaveProperty("curriculumCrosswalks");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("published Technical Laboratory JSON Schema", () => {
  it("publishes the fixed seven-module V1 contract", () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "schemas/tracechain-technical-lab-pack-v1.schema.json",
        ),
        "utf8",
      ),
    ) as {
      $schema?: string;
      $id?: string;
      title?: string;
      required?: readonly string[];
      $defs?: {
        pack?: {
          properties?: {
            moduleIds?: { const?: readonly string[] };
          };
        };
        module?: {
          properties?: {
            rendererId?: { enum?: readonly string[] };
          };
        };
      };
    };

    expect(schema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(schema.$id).toContain(
      "tracechain-technical-lab-pack-v1",
    );
    expect(schema.title).toBe(
      "TraceChain Technical Laboratory Pack V1",
    );
    expect(schema.required).toEqual([
      "pack",
      "modules",
      "fixtures",
      "localizationCatalogs",
    ]);
    expect(
      schema.$defs?.pack?.properties?.moduleIds?.const,
    ).toEqual(["TL1", "TL2", "TL3", "TL4", "TL5", "TL6", "TL7"]);
    expect(
      schema.$defs?.module?.properties?.rendererId?.enum,
    ).toHaveLength(7);
  });
});

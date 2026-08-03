import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("published curriculum-overlay JSON Schema", () => {
  it("publishes the direct-upgrade V2 ownership contract", () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "schemas/simuledger-curriculum-overlay-v2.schema.json",
        ),
        "utf8",
      ),
    ) as {
      title?: string;
      properties?: Record<string, unknown>;
      required?: readonly string[];
    };

    expect(schema.title).toBe(
      "SimuLedger Curriculum Crosswalk Overlay V2",
    );
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "owner",
        "simuLedgerFrameworks",
        "externalFramework",
        "mappings",
      ]),
    );
    expect(schema.properties).toHaveProperty("status");
    expect(schema.properties).toHaveProperty("adoptedBy");
  });
});

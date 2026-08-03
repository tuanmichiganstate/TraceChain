import courseOverlayJson from "../../../curriculum-overlays/pharmaceutical-pilot-course.overlay.json";
import programOverlayJson from "../../../curriculum-overlays/pharmaceutical-pilot-program.overlay.json";
import pharmaceuticalPackJson from "../../../scenario-packs/pharmaceutical-cold-chain/simuledger.pack.json";
import coffeePackJson from "../../../scenario-packs/standard-coffee-stage3/simuledger.pack.json";
import type {
  CurriculumCrosswalkOverlayV2,
} from "../contracts/curriculum-crosswalk";
import type { ScenarioPackV2 } from "../contracts/scenario-pack";
import { validateScenarioPack } from "../scenario-packs/validation";
import {
  adoptedCurriculumOverlaysForPack,
  curriculumOverlayCompatibilityIssues,
  validateCurriculumOverlay,
} from "./validation";

function pack(value: unknown): ScenarioPackV2 {
  const result = validateScenarioPack(value);
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return result.pack;
}

function overlay(value: unknown): CurriculumCrosswalkOverlayV2 {
  const result = validateCurriculumOverlay(value);
  if (!result.isValid) {
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  }
  return result.overlay;
}

describe("curriculum overlay validation", () => {
  it("validates independent adopted course and program overlays", () => {
    const course = validateCurriculumOverlay(
      structuredClone(courseOverlayJson),
    );
    const program = validateCurriculumOverlay(
      structuredClone(programOverlayJson),
    );

    expect(
      course.isValid,
      course.isValid ? "" : JSON.stringify(course.issues, null, 2),
    ).toBe(true);
    expect(
      program.isValid,
      program.isValid ? "" : JSON.stringify(program.issues, null, 2),
    ).toBe(true);
    if (course.isValid && program.isValid) {
      expect(course.overlay.owner.ownerType).toBe("COURSE");
      expect(program.overlay.owner.ownerType).toBe("PROGRAM");
      expect(
        program.overlay.mappings.some(
          (mapping) => mapping.alignment === "CONTEXTUAL",
        ),
      ).toBe(true);
    }
  });

  it("binds overlays to exact SimuLedger framework versions without pack ownership", () => {
    const pharmaceutical = pack(
      structuredClone(pharmaceuticalPackJson),
    );
    const coffee = pack(structuredClone(coffeePackJson));
    const overlays = [
      overlay(structuredClone(courseOverlayJson)),
      overlay(structuredClone(programOverlayJson)),
    ];

    expect(
      adoptedCurriculumOverlaysForPack(overlays, pharmaceutical).map(
        (candidate) => candidate.overlayId,
      ),
    ).toEqual([
      "OVERLAY_PHARMA_PILOT_COURSE",
      "OVERLAY_PHARMA_PILOT_PROGRAM",
    ]);
    expect(adoptedCurriculumOverlaysForPack(overlays, coffee)).toEqual([]);
  });

  it("rejects mappings outside the exact supported framework version", () => {
    const invalid = structuredClone(
      courseOverlayJson,
    ) as unknown as CurriculumCrosswalkOverlayV2;
    const mutable = invalid as unknown as {
      mappings: { indicatorId: string }[];
    };
    const first = mutable.mappings[0];
    if (first === undefined) throw new Error("Expected a mapping.");
    first.indicatorId = "PHARMA.UNKNOWN.PI1";

    expect(
      curriculumOverlayCompatibilityIssues(
        overlay(invalid),
        pack(structuredClone(pharmaceuticalPackJson)),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_SIMULEDGER_INDICATOR",
        path: "$.mappings[0].indicatorId",
      }),
    );
  });

  it("requires explicit adoption evidence before an overlay is reportable", () => {
    const invalid = structuredClone(courseOverlayJson) as {
      status: string;
      adoptedAt?: string;
      adoptedBy?: string;
    };
    invalid.status = "DRAFT";

    const result = validateCurriculumOverlay(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "INVALID_ADOPTION_TIMESTAMP",
            path: "$.adoptedAt",
          }),
          expect.objectContaining({
            code: "INVALID_ADOPTION_AUTHORITY",
            path: "$.adoptedBy",
          }),
        ]),
      );
    }
  });

  it("rejects the removed pack-owned crosswalk field", () => {
    const invalid = structuredClone(pharmaceuticalPackJson) as unknown as {
      curriculumCrosswalks?: unknown[];
    };
    invalid.curriculumCrosswalks = [];

    const result = validateScenarioPack(invalid);

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "UNKNOWN_PROPERTY",
          path: "$.curriculumCrosswalks",
        }),
      );
    }
  });
});

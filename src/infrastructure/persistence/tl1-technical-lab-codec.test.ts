import { describe, expect, it } from "vitest";
import { hashConfiguration } from "../../config/hash";
import { TECHNICAL_LAB_PRESET } from "../../config/presets";
import {
  TECHNICAL_LAB_SUSPEND_DATA_LIMIT,
} from "../../technical-lab/persistence-size";
import { permissionedFoundationsLabBundle } from "../../technical-lab/permissioned-foundations-pack";
import type {
  TechnicalLabActionJournalEntry,
  TechnicalLabResponseJournalEntry,
  TechnicalLabSnapshot,
} from "../../technical-lab/engine";
import {
  decodeTl1TechnicalLabSnapshot,
  encodeTl1TechnicalLabSnapshot,
  inspectTl1TechnicalLabStoredHeader,
  technicalLabBundleContentHash,
  type Tl1TechnicalLabCodecSchema,
} from "./tl1-technical-lab-codec";

const schema: Tl1TechnicalLabCodecSchema = {
  configurationHash: hashConfiguration(TECHNICAL_LAB_PRESET),
  bundle: permissionedFoundationsLabBundle,
};

function worstCaseSnapshot(): TechnicalLabSnapshot {
  const actionJournal: TechnicalLabActionJournalEntry[] = [];
  permissionedFoundationsLabBundle.modules.forEach(
    (module, moduleIndex) => {
      module.experimentDefinitions.forEach(
        (experiment, experimentIndex) => {
          experiment.steps.forEach((step, stepIndex) => {
            for (
              let occurrenceIndex = 0;
              occurrenceIndex < step.maximumOccurrences;
              occurrenceIndex += 1
            ) {
              actionJournal.push({
                moduleIndex,
                experimentIndex,
                stepIndex,
                occurrenceIndex,
                operandA:
                  step.actionType === "EDIT_INPUT" ? 255 : 65_535,
                operandB: 1_114_111,
              });
            }
          });
        },
      );
    },
  );
  const responseJournal: TechnicalLabResponseJournalEntry[] =
    permissionedFoundationsLabBundle.modules.flatMap(
      (_module, moduleIndex) =>
        (["INTERPRETATION", "APPLICATION"] as const).flatMap(
          (kind) =>
            [1, 2, 3].map((attemptNumber) => ({
              moduleIndex,
              kind,
              optionIndex: 2,
              attemptNumber,
            })),
        ),
    );
  return {
    currentModuleIndex:
      permissionedFoundationsLabBundle.modules.length - 1,
    actionJournal,
    responseJournal,
    hintModuleIndexes:
      permissionedFoundationsLabBundle.modules.map(
        (_module, index) => index,
      ),
  };
}

describe("TL1 Technical Laboratory compact codec", () => {
  it("round-trips compact replay inputs without computed evidence", () => {
    const snapshot = worstCaseSnapshot();
    const encoded = encodeTl1TechnicalLabSnapshot(snapshot, schema);
    expect(encoded.startsWith("TL1.")).toBe(true);
    expect(encoded).not.toMatch(/[a-f0-9]{128}/u);
    expect(
      decodeTl1TechnicalLabSnapshot(encoded, schema),
    ).toEqual(snapshot);
    expect(inspectTl1TechnicalLabStoredHeader(encoded)).toEqual({
      configurationHash: schema.configurationHash,
      bundleContentHash: technicalLabBundleContentHash(
        schema.bundle,
      ),
      labPackId: schema.bundle.pack.labPackId,
      labPackVersion: schema.bundle.pack.labPackVersion,
    });
  });

  it("proves the actual authored worst case remains under 3,800 characters", () => {
    const encoded = encodeTl1TechnicalLabSnapshot(
      worstCaseSnapshot(),
      schema,
    );
    expect(encoded.length).toBeLessThanOrEqual(
      TECHNICAL_LAB_SUSPEND_DATA_LIMIT,
    );
  });

  it("uses exact configuration and content hashes as compatibility boundaries", () => {
    const encoded = encodeTl1TechnicalLabSnapshot(
      worstCaseSnapshot(),
      schema,
    );
    expect(() =>
      decodeTl1TechnicalLabSnapshot(encoded, {
        ...schema,
        configurationHash: "f".repeat(64),
      }),
    ).toThrow("another configuration or pack");
    const changedBundle = {
      ...schema.bundle,
      fixtures: [
        {
          ...schema.bundle.fixtures[0]!,
          initialInput: { content: "changed" },
        },
        ...schema.bundle.fixtures.slice(1),
      ],
    };
    expect(() =>
      decodeTl1TechnicalLabSnapshot(encoded, {
        ...schema,
        bundle: changedBundle,
      }),
    ).toThrow("another configuration or pack");
  });
});

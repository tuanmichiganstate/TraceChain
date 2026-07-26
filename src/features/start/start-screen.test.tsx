import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { StartScreen } from "./start-screen";
import { LocaleProvider } from "../../app/providers/locale-provider";
import { ScenarioProvider } from "../../app/providers/scenario-provider";
import { SimulationProvider } from "../../app/providers/simulation-provider";
import { installMockScormApi, MockScorm12Api } from "../../../test/scorm-mock/mock-scorm-api";
import { createTranslator } from "../../localization/i18n";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";

/**
 * The opening screen is the only place a learner is told what this is and how
 * the marks work, and it is read before anything is at stake. Emphasis inside
 * those sentences is applied in the component -- `t()` returns a string -- so
 * it is worth a test that the emphasis lands on the term and nowhere else, and
 * that the sentence survives if it ever stops containing it.
 */
function StartUnderTest(): React.ReactElement {
  return (
    <LocaleProvider>
      <ScenarioProvider scenario={coffeeScenario}>
        <SimulationProvider>
          <StartScreen />
        </SimulationProvider>
      </ScenarioProvider>
    </LocaleProvider>
  );
}

const vi = createTranslator("vi");
const en = createTranslator("en");

describe("the start screen notices", () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installMockScormApi(new MockScorm12Api());
    window.localStorage.clear();
  });

  afterEach(() => uninstall());

  it("labels the simulation notice and keeps its sentence intact", async () => {
    render(<StartUnderTest />);

    const label = await screen.findByText(vi("app.simulationNoticeLabel"));
    expect(label.tagName).toBe("STRONG");
    // The label and the sentence are separate keys, so the paragraph is only
    // right if the two read as one line.
    expect(label.closest("p")?.textContent).toBe(
      `${vi("app.simulationNoticeLabel")} ${vi("app.simulationNotice")}`,
    );
  });

  it("emphasises the permissioned term without altering the sentence around it", async () => {
    render(<StartUnderTest />);

    const term = await screen.findByText(vi("app.permissionedTerm"));
    expect(term.tagName).toBe("STRONG");
    const paragraph = term.closest("p") as HTMLElement;
    // Nothing is duplicated, dropped, or re-spaced by being split in three.
    expect(paragraph.textContent).toBe(vi("app.permissionedNotice"));
    expect(paragraph.querySelectorAll("strong")).toHaveLength(1);
  });

  it("keeps the term inside the sentence in both catalogues", () => {
    // If a translation ever rephrases the term, the sentence still renders --
    // unemphasised rather than broken -- but the emphasis is silently lost, so
    // the catalogues are checked rather than trusted.
    for (const t of [vi, en]) {
      expect(t("app.permissionedNotice")).toContain(t("app.permissionedTerm"));
    }
  });

  it("states every learning objective it has a key for", async () => {
    render(<StartUnderTest />);
    await screen.findByText(vi("start.objectivesHeading"));

    const objectives = [...document.querySelectorAll(".start__objectives li")].map(
      (item) => item.textContent,
    );
    expect(objectives).toEqual([1, 2, 3, 4, 5, 6].map((n) => vi(`start.objective${n}`)));
  });

  it("discloses that the people shown in the scenario are fictional", async () => {
    render(<StartUnderTest />);

    expect(
      await screen.findByText(vi("app.fictionalStaffNotice")),
    ).toBeInTheDocument();
    expect(en("app.fictionalStaffNotice")).toMatch(/fictional/iu);
  });
});

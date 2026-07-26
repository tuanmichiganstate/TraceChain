import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationProvider } from "../app/providers/configuration-provider";
import { LocaleProvider } from "../app/providers/locale-provider";
import { ScenarioProvider } from "../app/providers/scenario-provider";
import { SimulationProvider } from "../app/providers/simulation-provider";
import { hashConfiguration } from "../config/hash";
import { CHALLENGE_PRESET, GUIDED_PRESET } from "../config/presets";
import { ScenarioStageId } from "../domain/types/enums";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import { ActorId } from "../scenarios/coffee-traceability/organizations";
import { StaffProfileId } from "../scenarios/coffee-traceability/staff-profiles";
import {
  ActiveRolePresence,
  EvidenceAuthorIdentity,
  RoleHandoffPanel,
  StaffIdentityCard,
  StaffPortrait,
} from "./staff-presence";

function ScenarioFrame({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <LocaleProvider locale="en">
      <ScenarioProvider scenario={coffeeScenario}>
        {children}
      </ScenarioProvider>
    </LocaleProvider>
  );
}

describe("scenario-driven staff presence", () => {
  it("shows professional identity while keeping a decorative portrait silent", () => {
    const { container } = render(
      <ScenarioFrame>
        <StaffIdentityCard
          staffProfileId={StaffProfileId.CERTIFICATION_OFFICER}
        />
      </ScenarioFrame>,
    );

    expect(
      screen.getByRole("region", { name: "You are acting as" }),
    ).toHaveAttribute(
      "data-staff-profile-id",
      StaffProfileId.CERTIFICATION_OFFICER,
    );
    expect(screen.getByText("Trần Minh Anh")).toBeInTheDocument();
    expect(screen.getByText("Certification Officer")).toBeInTheDocument();
    expect(
      screen.getByText("Agricultural Certification Centre"),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("keeps identity visible through a portrait-load failure", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container } = render(
      <ScenarioFrame>
        <StaffIdentityCard staffProfileId={StaffProfileId.PRODUCER_MANAGER} />
      </ScenarioFrame>,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("TM")).toHaveClass("staff-portrait--fallback");
    expect(screen.getByText("Nguyễn Thị Mai")).toBeInTheDocument();
    expect(screen.getByText("Farm Production Manager")).toBeInTheDocument();
    expect(warning).toHaveBeenCalledWith(
      '[staff] Could not load portrait "media/staff/producer-manager.webp"',
    );
    warning.mockRestore();
  });

  it("supports an informative standalone portrait with reserved dimensions", () => {
    const profile = coffeeScenario.staffProfiles.find(
      (candidate) =>
        candidate.staffProfileId === StaffProfileId.PROCESSING_MANAGER,
    )!;
    render(
      <ScenarioFrame>
        <StaffPortrait profile={profile} size="compact" informative />
      </ScenarioFrame>,
    );

    const portrait = screen.getByRole("img", {
      name: "Fictional portrait of Lê Thu Hà in a coffee processing plant",
    });
    expect(portrait).toHaveAttribute("width", "48");
    expect(portrait).toHaveAttribute("height", "60");
  });

  it("labels both people in an organizational handoff without cryptographic claims", () => {
    render(
      <ScenarioFrame>
        <RoleHandoffPanel
          fromActorId={ActorId.PRODUCER_MANAGER}
          toActorId={ActorId.LOGISTICS_COORDINATOR}
          explanatoryTextKey="staff.handoff.custodyHelp"
        />
      </ScenarioFrame>,
    );

    expect(
      screen.getByRole("region", { name: "From" }),
    ).toHaveTextContent("Nguyễn Thị Mai");
    expect(
      screen.getByRole("region", { name: "To" }),
    ).toHaveTextContent("Phạm Quốc Huy");
    expect(screen.queryByText(/signature|key|cryptographic/iu)).not.toBeInTheDocument();
  });

  it("attributes an authored record to the matching fictional staff profile", () => {
    render(
      <ScenarioFrame>
        <EvidenceAuthorIdentity evidenceId="DOC_SHIPPING_MANIFEST_001" />
      </ScenarioFrame>,
    );

    expect(
      screen.getByRole("region", { name: "Record prepared by" }),
    ).toHaveTextContent("Bùi Gia Linh");
  });

  it("shows responsibility guidance in Guided but omits it in Challenge", async () => {
    const responsibility =
      "Register the physical coffee lot accurately before its first ledger transaction.";
    const renderMode = (configuration: typeof GUIDED_PRESET) =>
      render(
        <LocaleProvider locale="en">
          <ConfigurationProvider
            configuration={configuration}
            configurationHash={hashConfiguration(configuration)}
          >
            <ScenarioProvider scenario={coffeeScenario}>
              <SimulationProvider>
                <ActiveRolePresence stageId={ScenarioStageId.CREATE_BATCH} />
              </SimulationProvider>
            </ScenarioProvider>
          </ConfigurationProvider>
        </LocaleProvider>,
      );

    await act(async () => {
      renderMode(GUIDED_PRESET);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(screen.getByText(responsibility)).toBeInTheDocument();
    cleanup();

    await act(async () => {
      renderMode(CHALLENGE_PRESET);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(screen.queryByText(responsibility)).not.toBeInTheDocument();
    expect(screen.getByText("Nguyễn Thị Mai")).toBeInTheDocument();
  });
});

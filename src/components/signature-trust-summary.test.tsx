import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "../app/providers/locale-provider";
import { ScenarioProvider } from "../app/providers/scenario-provider";
import { GUIDED_PRESET } from "../config/presets";
import { hashConfiguration } from "../config/hash";
import { issueCertificateCommand } from "../scenarios/coffee-traceability/commands";
import { coffeeCryptographicRuntime } from "../scenarios/coffee-traceability/cryptographic-runtime";
import {
  ActorId,
  OrganizationId,
} from "../scenarios/coffee-traceability/organizations";
import { coffeeScenario } from "../scenarios/coffee-traceability/scenario";
import type {
  DomainSimulationCommand,
  TrustedExecutionContext,
} from "../domain/simulation/types";
import { NobleEd25519Provider } from "../crypto/signatures/noble-ed25519-provider";
import { signAndVerifyCommand } from "../crypto/signatures/signing-service";
import type { SignatureTrustEvidence } from "../crypto/signatures/types";
import { SignatureTrustSummary } from "./signature-trust-summary";

let evidence: SignatureTrustEvidence;

beforeAll(async () => {
  const trusted: TrustedExecutionContext = {
    contextId: "CTX_LOGISTICS",
    actorId: ActorId.LOGISTICS_COORDINATOR,
    organizationId: OrganizationId.LOGISTICS_PROVIDER,
    roleId: "LOGISTICS_COORDINATOR",
  };
  const payload = issueCertificateCommand();
  const command: DomainSimulationCommand = {
    metadata: {
      commandId: "CMD_UI_001",
      sessionId: "SES_UI_001",
      actorId: trusted.actorId,
      organizationId: trusted.organizationId,
      roleId: trusted.roleId,
      submittedAt: payload.scenarioTimestamp,
      expectedStateVersions: { [payload.assetId]: 2 },
    },
    payload,
  };
  evidence = (
    await signAndVerifyCommand({
      command,
      trustedContext: trusted,
      configurationHash: hashConfiguration(GUIDED_PRESET),
      scenarioId: coffeeScenario.scenarioId,
      scenarioVersion: coffeeScenario.scenarioVersion,
      runtime: coffeeCryptographicRuntime,
      provider: new NobleEd25519Provider(),
    })
  ).evidence;
});

function renderSummary(locale: "vi" | "en" = "vi") {
  return render(
    <LocaleProvider locale={locale}>
      <ScenarioProvider scenario={coffeeScenario}>
        <SignatureTrustSummary evidence={evidence} />
      </ScenarioProvider>
    </LocaleProvider>,
  );
}

describe("signature trust summary", () => {
  it("distinguishes genuine validity, recognized identity, authorization, and truth", () => {
    renderSummary();

    expect(screen.getByText("Công ty Vận tải Liên Việt")).toBeInTheDocument();
    expect(screen.getByText("Hợp lệ")).toBeInTheDocument();
    expect(screen.getByText("Được công nhận")).toBeInTheDocument();
    expect(
      screen.getByText("Không được phép thực hiện hành động này"),
    ).toBeInTheDocument();
    expect(screen.getByText("Không áp dụng")).toBeInTheDocument();
    expect(
      screen.getByText(/không chứng minh tuyên bố ban đầu là đúng/),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /Chữ ký hợp lệ.*không có quyền/,
    );
  });

  it("keeps private material out of the UI and exposes one named evidence-copy control", () => {
    const rendered = renderSummary();
    const privateKey =
      coffeeCryptographicRuntime.signingKeys.keys.find(
        (key) => key.keyId === evidence.signature.keyId,
      )?.privateKeyPkcs8Base64Url;

    expect(privateKey).toBeDefined();
    expect(rendered.container.textContent).not.toContain(privateKey);
    expect(rendered.container.innerHTML).not.toContain(privateKey);
    expect(rendered.container.textContent).not.toContain(
      evidence.signature.signatureBase64Url,
    );
    expect(
      screen.getByRole("button", {
        name: "Sao chép gói bằng chứng xác minh",
      }),
    ).toBeInTheDocument();
  });

  it("provides the same compact evidence structure in English", () => {
    renderSummary("en");

    expect(
      screen.getByRole("heading", { name: "Identity and authorization" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByText("Recognized")).toBeInTheDocument();
    expect(
      screen.getByText("Not permitted for this action"),
    ).toBeInTheDocument();
  });
});

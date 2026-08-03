import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { hashConfiguration } from "../../config/hash";
import { GUIDED_PRESET } from "../../config/presets";
import { issueCertificateCommand } from "../../scenarios/coffee-traceability/commands";
import { coffeeCryptographicRuntime } from "../../scenarios/coffee-traceability/cryptographic-runtime";
import {
  ActorId,
  OrganizationId,
} from "../../scenarios/coffee-traceability/organizations";
import { coffeeScenario } from "../../scenarios/coffee-traceability/scenario";
import type {
  DomainSimulationCommand,
  TrustedExecutionContext,
} from "../../domain/simulation/types";
import { NobleEd25519Provider } from "./noble-ed25519-provider";
import {
  signAndVerifyCommand,
  verificationBundleFromEvidence,
} from "./signing-service";

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "simuledger-signature-evidence-"),
);

afterAll(() => {
  rmSync(temporaryDirectory, { force: true, recursive: true });
});

async function bundle() {
  const trusted: TrustedExecutionContext = {
    contextId: "CTX_CERTIFIER",
    actorId: ActorId.CERTIFICATION_OFFICER,
    organizationId: OrganizationId.CERTIFICATION_BODY,
    roleId: "CERTIFICATION_OFFICER",
  };
  const payload = issueCertificateCommand();
  const command: DomainSimulationCommand = {
    metadata: {
      commandId: "CMD_INDEPENDENT_001",
      sessionId: "SES_INDEPENDENT_001",
      actorId: trusted.actorId,
      organizationId: trusted.organizationId,
      roleId: trusted.roleId,
      submittedAt: payload.scenarioTimestamp,
      expectedStateVersions: {
        [payload.assetId]: 3,
      },
    },
    payload,
  };
  const result = await signAndVerifyCommand({
    command,
    trustedContext: trusted,
    configurationHash: hashConfiguration(GUIDED_PRESET),
    scenarioId: coffeeScenario.scenarioId,
    scenarioVersion: coffeeScenario.scenarioVersion,
    runtime: coffeeCryptographicRuntime,
    provider: new NobleEd25519Provider(),
  });
  return verificationBundleFromEvidence(result.evidence);
}

function verify(path: string) {
  return spawnSync(
    process.execPath,
    [
      resolve(process.cwd(), "scripts/verify-signature-evidence.mjs"),
      path,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
}

describe("independent signature-evidence verifier", () => {
  it("verifies application evidence with Node's independent Ed25519 implementation", async () => {
    const path = join(temporaryDirectory, "valid-bundle.json");
    writeFileSync(path, `${JSON.stringify(await bundle(), null, 2)}\n`);

    const result = verify(path);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /Signature evidence verified: Ed25519 signature valid/,
    );
  });

  it("exits nonzero when the proposal is changed", async () => {
    const evidence = await bundle();
    const path = join(temporaryDirectory, "modified-bundle.json");
    writeFileSync(
      path,
      `${JSON.stringify(
        {
          ...evidence,
          proposal: {
            ...evidence.proposal,
            commandType: `${evidence.proposal.commandType}!`,
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = verify(path);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Proposal digest does not match/);
  });
});

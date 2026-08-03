// @vitest-environment node

import {
  exportJWK,
  generateKeyPair,
  jwtVerify,
} from "jose";
import { describe, expect, it } from "vitest";
import {
  FixedClock,
  SequenceIdGenerator,
} from "../../domain/simulation/environment";
import {
  LTI_AGS_SCORE_SCOPE,
  type LtiAgsScoreV1,
  type LtiPlatformRegistrationV1,
} from "../contracts/lti";
import type {
  ActiveLtiAgsContext,
} from "../persistence/d1-lti-authentication-repository";
import type {
  CreateLtiAgsScoreDeliveryInput,
  LtiAgsDeliveryRepository,
  LtiAgsScoreDeliveryRecord,
} from "../persistence/d1-lti-ags-repository";
import { deliverLtiAgsScore } from "./lti-ags";

const clock = new FixedClock("2026-07-28T09:30:00.000Z");
const registration: LtiPlatformRegistrationV1 = {
  schemaVersion: "1.0.0",
  registrationId: "MOODLE_DEMO",
  issuer: "https://moodle.example",
  clientId: "SIMULEDGER_CLIENT",
  deploymentId: "SIMULEDGER_DEPLOYMENT",
  authorizationEndpoint:
    "https://moodle.example/mod/lti/auth.php",
  jwksUri: "https://moodle.example/mod/lti/certs.php",
  tokenEndpoint: "https://moodle.example/mod/lti/token.php",
};
const context: ActiveLtiAgsContext = {
  registrationId: "MOODLE_DEMO",
  platformUserId: "MOODLE_LEARNER_77",
  assignmentId: "ASSIGNMENT_001",
  endpoint: {
    lineItemUrl:
      "https://moodle.example/mod/lti/services.php/42/lineitems/7?type_id=3",
    scopes: [LTI_AGS_SCORE_SCOPE],
  },
};

function withStatus(
  record: LtiAgsScoreDeliveryRecord,
  status: LtiAgsScoreDeliveryRecord["status"],
): LtiAgsScoreDeliveryRecord {
  return {
    ...record,
    status,
    ...(status === "delivered"
      ? { deliveredAt: clock.now() }
      : {}),
  };
}

class MemoryDeliveryRepository
  implements LtiAgsDeliveryRepository {
  record: LtiAgsScoreDeliveryRecord | null = null;

  async createOrFind(
    input: CreateLtiAgsScoreDeliveryInput,
  ): Promise<LtiAgsScoreDeliveryRecord> {
    this.record ??= {
      schemaVersion: "1.0.0",
      deliveryId: input.deliveryId,
      runId: input.runId,
      assignmentId: input.assignmentId,
      registrationId: input.registrationId,
      platformUserId: input.platformUserId,
      lineItemUrl: input.lineItemUrl,
      score: input.score,
      status: "pending",
      attemptCount: 0,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    };
    return this.record;
  }

  async claim() {
    this.record = {
      ...this.record!,
      status: "delivering",
      attemptCount: this.record!.attemptCount + 1,
      lastAttemptAt: clock.now(),
    };
    return { delivery: this.record, wasClaimed: true };
  }

  async markDelivered(): Promise<LtiAgsScoreDeliveryRecord> {
    this.record = withStatus(this.record!, "delivered");
    return this.record;
  }

  async markFailed(
    _deliveryId: string,
    error: unknown,
  ): Promise<LtiAgsScoreDeliveryRecord> {
    this.record = {
      ...withStatus(this.record!, "failed"),
      lastError:
        error instanceof Error ? error.message : String(error),
    };
    return this.record;
  }

  async find(): Promise<LtiAgsScoreDeliveryRecord | null> {
    return this.record;
  }
}

describe("LTI Assignment and Grade Services", () => {
  it("uses private_key_jwt and sends one independently verified final score", async () => {
    const { publicKey, privateKey } = await generateKeyPair(
      "RS256",
      { extractable: true },
    );
    const privateJwk = {
      ...(await exportJWK(privateKey)),
      kid: "SIMULEDGER_TOOL_KEY",
      alg: "RS256",
      use: "sig",
    };
    const requests: {
      readonly url: string;
      readonly init?: RequestInit;
    }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : input;
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      if (url === registration.tokenEndpoint) {
        const form = new URLSearchParams(String(init?.body));
        expect(form.get("grant_type")).toBe("client_credentials");
        expect(form.get("scope")).toBe(LTI_AGS_SCORE_SCOPE);
        const assertion = form.get("client_assertion")!;
        const verified = await jwtVerify(assertion, publicKey, {
          algorithms: ["RS256"],
          issuer: registration.clientId,
          audience: registration.tokenEndpoint,
          currentDate: new Date(clock.now()),
        });
        expect(verified.payload.sub).toBe(registration.clientId);
        expect(verified.payload.jti).toBe("LTI_AGS_JTI_000001");
        return Response.json({
          access_token: "OPAQUE_MOODLE_ACCESS_TOKEN",
          token_type: "Bearer",
          scope: LTI_AGS_SCORE_SCOPE,
          expires_in: 3600,
        });
      }
      expect(url).toBe(
        "https://moodle.example/mod/lti/services.php/42/lineitems/7/scores?type_id=3",
      );
      expect(init?.headers).toEqual({
        authorization: "Bearer OPAQUE_MOODLE_ACCESS_TOKEN",
        "content-type": "application/vnd.ims.lis.v1.score+json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        userId: "MOODLE_LEARNER_77",
        timestamp: "2026-07-28T09:15:00.000Z",
        activityProgress: "Completed",
        gradingProgress: "FullyGraded",
        scoreGiven: 82,
        scoreMaximum: 100,
      } satisfies LtiAgsScoreV1);
      return new Response(null, { status: 204 });
    };
    const repository = new MemoryDeliveryRepository();
    const first = await deliverLtiAgsScore({
      runId: "RUN_001",
      completedAt: "2026-07-28T09:15:00.000Z",
      grade: {
        gradingProgress: "FullyGraded",
        scoreGiven: 82,
        scoreMaximum: 100,
      },
      context,
      registration,
      privateJwk,
      repository,
      clock,
      ids: new SequenceIdGenerator(),
      fetcher,
    });
    expect(repository.record?.lastError).toBeUndefined();
    expect(first).toMatchObject({
      status: "delivered",
      attemptCount: 1,
    });

    const repeated = await deliverLtiAgsScore({
      runId: "RUN_001",
      completedAt: "2026-07-28T09:15:00.000Z",
      grade: {
        gradingProgress: "FullyGraded",
        scoreGiven: 82,
        scoreMaximum: 100,
      },
      context,
      registration,
      privateJwk,
      repository,
      clock,
      ids: new SequenceIdGenerator(),
      fetcher,
    });
    expect(repeated.status).toBe("delivered");
    expect(requests).toHaveLength(2);
  });

  it("reports completion without inventing a grade for manual evidence review", async () => {
    const { privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const privateJwk = {
      ...(await exportJWK(privateKey)),
      kid: "SIMULEDGER_TOOL_KEY",
      alg: "RS256",
      use: "sig",
    };
    const repository = new MemoryDeliveryRepository();
    const bodies: LtiAgsScoreV1[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : input;
      if (url === registration.tokenEndpoint) {
        return Response.json({
          access_token: "ACCESS_TOKEN",
          token_type: "bearer",
        });
      }
      bodies.push(JSON.parse(String(init?.body)) as LtiAgsScoreV1);
      return new Response(null, { status: 204 });
    };

    await deliverLtiAgsScore({
      runId: "RUN_MANUAL",
      completedAt: "2026-07-28T09:20:00.000Z",
      grade: { gradingProgress: "PendingManual" },
      context,
      registration,
      privateJwk,
      repository,
      clock,
      ids: new SequenceIdGenerator(),
      fetcher,
    });

    expect(bodies).toEqual([
      {
        userId: "MOODLE_LEARNER_77",
        timestamp: "2026-07-28T09:20:00.000Z",
        activityProgress: "Completed",
        gradingProgress: "PendingManual",
      },
    ]);
  });

  it("retains a failed delivery for an idempotent retry", async () => {
    const { privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const repository = new MemoryDeliveryRepository();
    const failed = await deliverLtiAgsScore({
      runId: "RUN_FAILED",
      completedAt: "2026-07-28T09:25:00.000Z",
      grade: {
        gradingProgress: "FullyGraded",
        scoreGiven: 70,
        scoreMaximum: 100,
      },
      context,
      registration,
      privateJwk: {
        ...(await exportJWK(privateKey)),
        kid: "SIMULEDGER_TOOL_KEY",
        alg: "RS256",
        use: "sig",
      },
      repository,
      clock,
      ids: new SequenceIdGenerator(),
      fetcher: async () =>
        new Response("Unavailable", { status: 503 }),
    });

    expect(failed).toMatchObject({
      status: "failed",
      attemptCount: 1,
    });
    expect(repository.record?.lastError).toContain("503");
    expect(repository.record?.lastError).not.toContain(
      "ACCESS_TOKEN",
    );
  });
});

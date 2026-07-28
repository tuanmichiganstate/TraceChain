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
  LTI_LEARNER_ROLE,
  LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
  type LtiPlatformRegistrationV1,
} from "../contracts/lti";
import type {
  ActiveLtiNrpsContext,
} from "../persistence/d1-lti-authentication-repository";
import {
  fetchLtiNrpsRoster,
  LtiNrpsError,
} from "./lti-nrps";

const clock = new FixedClock("2026-07-28T10:00:00.000Z");
const registration: LtiPlatformRegistrationV1 = {
  schemaVersion: "1.0.0",
  registrationId: "MOODLE_DEMO",
  issuer: "https://moodle.example",
  clientId: "TRACECHAIN_CLIENT",
  deploymentId: "TRACECHAIN_DEPLOYMENT",
  authorizationEndpoint:
    "https://moodle.example/mod/lti/auth.php",
  jwksUri: "https://moodle.example/mod/lti/certs.php",
  tokenEndpoint: "https://moodle.example/mod/lti/token.php",
};
const context: ActiveLtiNrpsContext = {
  registrationId: "MOODLE_DEMO",
  issuer: "https://moodle.example",
  clientId: "TRACECHAIN_CLIENT",
  deploymentId: "TRACECHAIN_DEPLOYMENT",
  contextId: "COURSE_ACCOUNTING_101",
  endpoint: {
    contextMembershipsUrl:
      "https://moodle.example/mod/lti/services.php/memberships?course=42",
    serviceVersions: ["2.0"],
  },
};

describe("LTI Names and Role Provisioning Services", () => {
  it("uses the readonly scope and validates a bounded paginated learner roster", async () => {
    const { publicKey, privateKey } = await generateKeyPair(
      "RS256",
      { extractable: true },
    );
    const privateJwk = {
      ...(await exportJWK(privateKey)),
      kid: "TRACECHAIN_TOOL_KEY",
      alg: "RS256",
      use: "sig",
    };
    const requestedUrls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : input;
      requestedUrls.push(url);
      if (url === registration.tokenEndpoint) {
        const form = new URLSearchParams(String(init?.body));
        expect(form.get("scope")).toBe(
          LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
        );
        const verified = await jwtVerify(
          form.get("client_assertion")!,
          publicKey,
          {
            algorithms: ["RS256"],
            issuer: registration.clientId,
            audience: registration.tokenEndpoint,
            currentDate: new Date(clock.now()),
          },
        );
        expect(verified.payload.sub).toBe(registration.clientId);
        expect(verified.payload.jti).toBe(
          "LTI_NRPS_JTI_000001",
        );
        return Response.json({
          access_token: "OPAQUE_NRPS_TOKEN",
          token_type: "Bearer",
          scope: LTI_NRPS_CONTEXT_MEMBERSHIP_SCOPE,
        });
      }
      expect(init?.method).toBe("GET");
      expect(init?.headers).toEqual({
        accept:
          "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
        authorization: "Bearer OPAQUE_NRPS_TOKEN",
      });
      if (url.includes("page=2")) {
        return Response.json(
          {
            id: url,
            context: { id: context.contextId },
            members: [
              {
                user_id: "MOODLE_LEARNER_INACTIVE",
                status: "Inactive",
                name: "Inactive learner",
                roles: [LTI_LEARNER_ROLE],
              },
            ],
          },
          {
            headers: {
              "content-type":
                "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
            },
          },
        );
      }
      const initial = new URL(url);
      expect(initial.searchParams.get("course")).toBe("42");
      expect(initial.searchParams.get("role")).toBe("Learner");
      expect(initial.searchParams.get("limit")).toBe("100");
      return Response.json(
        {
          id: url,
          context: { id: context.contextId },
          members: [
            {
              user_id: "MOODLE_LEARNER_1",
              status: "Active",
              name: "Nguyễn An",
              email: "an@example.edu",
              roles: [LTI_LEARNER_ROLE],
            },
            {
              user_id: "MOODLE_LEARNER_2",
              given_name: "Bình",
              family_name: "Trần",
              roles: ["Learner"],
            },
          ],
        },
        {
          headers: {
            "content-type":
              "application/vnd.ims.lti-nrps.v2.membershipcontainer+json; charset=utf-8",
            link:
              '<https://moodle.example/mod/lti/services.php/memberships?course=42&page=2>; rel="next"',
          },
        },
      );
    };

    const snapshot = await fetchLtiNrpsRoster({
      context,
      registration,
      privateJwk,
      clock,
      ids: new SequenceIdGenerator(),
      fetcher,
    });

    expect(requestedUrls).toHaveLength(3);
    expect(snapshot).toEqual({
      pageCount: 2,
      members: [
        {
          platformUserId: "MOODLE_LEARNER_1",
          status: "active",
          roles: [LTI_LEARNER_ROLE],
          displayName: "Nguyễn An",
          email: "an@example.edu",
        },
        {
          platformUserId: "MOODLE_LEARNER_2",
          status: "active",
          roles: ["Learner"],
          displayName: "Bình Trần",
        },
        {
          platformUserId: "MOODLE_LEARNER_INACTIVE",
          status: "inactive",
          roles: [LTI_LEARNER_ROLE],
          displayName: "Inactive learner",
        },
      ],
    });
  });

  it("rejects cross-origin pagination before disclosing the access token", async () => {
    const { privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    let attackerRequested = false;
    const fetcher: typeof fetch = async (input) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : input;
      if (url === registration.tokenEndpoint) {
        return Response.json({
          access_token: "SECRET_ACCESS_TOKEN",
          token_type: "Bearer",
        });
      }
      if (url.startsWith("https://attacker.example")) {
        attackerRequested = true;
      }
      return Response.json(
        {
          id: url,
          context: { id: context.contextId },
          members: [],
        },
        {
          headers: {
            "content-type":
              "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
            link:
              '<https://attacker.example/steal>; rel="next"',
          },
        },
      );
    };

    await expect(
      fetchLtiNrpsRoster({
        context,
        registration,
        privateJwk: {
          ...(await exportJWK(privateKey)),
          kid: "TRACECHAIN_TOOL_KEY",
          alg: "RS256",
          use: "sig",
        },
        clock,
        ids: new SequenceIdGenerator(),
        fetcher,
      }),
    ).rejects.toEqual(
      expect.objectContaining<
        Partial<LtiNrpsError>
      >({
        code: "LTI_NRPS_RESPONSE_INVALID",
      }),
    );
    expect(attackerRequested).toBe(false);
  });
});

# LTI 1.3 instructor workspace V1

Status: implemented locally; not registered in Moodle and not deployed.

## Purpose and boundary

TraceChain can accept a Moodle LTI 1.3 Resource Link launch and open the
existing hosted `/instructor` workspace as the authenticated Moodle
instructor. The launch reuses the same hosted application, API, D1 database,
assignment model, simulation engine, reporting services, and static client
assets. It does not create a second instructor application.

This increment implements LTI 1.3 Core launch only:

- OpenID Connect login initiation;
- signed `id_token` verification against the registered Moodle JWKS;
- one-use state and nonce validation;
- exact issuer, client, deployment, context, resource-link, and role checks;
- automatic creation of a TraceChain external instructor identity;
- an eight-hour, server-side, HTTP-only instructor session;
- course-context binding for assignments, runs, and counterfactual records;
- return-to-Moodle and TraceChain-session sign-out controls.

It deliberately does not implement:

- Names and Role Provisioning Services (NRPS);
- Assignment and Grade Services (AGS);
- Deep Linking;
- a hosted learner LTI launch;
- access to Moodle SCORM attempt data;
- automatic SCORM upload or activity creation;
- dynamic LTI registration;
- Google sign-in;
- a separate instructor deployment.

Moodle continues to own its SCORM attempts, grades, completion, and activity
availability. TraceChain LTI launch authenticates the hosted instructor
workspace; it does not turn a SCORM package into an instructor module.

## Why one hosted site remains appropriate

The public student pages and static application shell are unchanged. LTI uses
separate endpoints and a separate session cookie:

```text
/api/lti/v1/login
/api/lti/v1/launch
/api/lti/v1/jwks
/api/lti/v1/logout
```

The existing direct Sites-authenticated session remains available. An LTI
session grants only the TraceChain `instructor` role and carries one Moodle
course context. It never grants learner, author, rater, or administrator
authority. Protected API operations still authorize the resolved principal at
the worker and repository boundaries.

A separate instructor host would add cross-origin cookies, duplicated
deployment configuration, and another release surface without strengthening
the current authorization boundary. Reconsider separate hosts only if a later
institutional deployment requires distinct branding, retention, regional
hosting, or independent operational ownership.

## Moodle manual registration

Register TraceChain as an LTI 1.3 External tool in Moodle. Use a new-window
launch; embedded launches are not supported because modern browsers may block
third-party cookies.

For a deployment at `https://tracechain.example`, provide Moodle with:

| Moodle field | Value |
|---|---|
| Tool URL / redirect URI | `https://tracechain.example/api/lti/v1/launch` |
| Initiate login URL | `https://tracechain.example/api/lti/v1/login` |
| Public keyset URL | `https://tracechain.example/api/lti/v1/jwks` |
| Default launch container | New window |

After registration, Moodle supplies the platform issuer, client ID, deployment
ID, authentication endpoint, token endpoint, and public-keyset URL. Copy those
values exactly into the server-owned registration configuration. The issuer is
an exact identifier: do not add or remove a trailing slash.

Moodle must send the standard LTI Instructor role. Name and email claims are
useful display metadata but are not trusted as the durable identity. TraceChain
keys the identity by:

```text
issuer + client ID + deployment ID + subject
```

## Server configuration

`TRACECHAIN_LTI_REGISTRATIONS_JSON` contains one to sixteen registrations:

```json
[
  {
    "registrationId": "MOODLE_PRODUCTION",
    "issuer": "https://moodle.example.edu",
    "clientId": "123",
    "deploymentId": "456",
    "authorizationEndpoint": "https://moodle.example.edu/mod/lti/auth.php",
    "jwksUri": "https://moodle.example.edu/mod/lti/certs.php",
    "tokenEndpoint": "https://moodle.example.edu/mod/lti/token.php"
  }
]
```

`TRACECHAIN_LTI_TOOL_JWKS_JSON` contains the public tool keyset Moodle records:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "TRACECHAIN_TOOL_KEY_2026_01",
      "use": "sig",
      "alg": "RS256",
      "n": "PUBLIC_MODULUS_BASE64URL",
      "e": "AQAB"
    }
  ]
}
```

Only public JWK members are accepted. Private RSA or symmetric key material is
rejected by configuration validation. V1 does not yet call an LTI service that
requires TraceChain to sign an outbound token, but Moodle registration still
expects a stable public keyset URL.

For automated tests and isolated local development, a registration may contain
an inline `platformJwks` public keyset. Hosted registrations should use
Moodle's `jwksUri` so key rotation remains effective.

## Launch and session flow

```text
Moodle External tool
  -> GET or POST /api/lti/v1/login
  -> one-use hashed state and nonce stored in D1
  -> redirect to Moodle authorization endpoint
  -> Moodle form-posts signed id_token to /api/lti/v1/launch
  -> TraceChain verifies RS256 token and LTI claims
  -> instructor identity and course context stored server-side
  -> Secure, HttpOnly, SameSite=Lax session cookie
  -> /instructor
```

The launch token must contain:

- exact registered issuer and client audience;
- `sub`, `iat`, `exp`, and matching nonce;
- LTI version `1.3.0`;
- message type `LtiResourceLinkRequest`;
- exact deployment ID;
- the full LTI Instructor role;
- context ID;
- resource-link ID.

An unknown, expired, replayed, incorrectly signed, learner-only, or
cross-deployment launch fails closed. The UI gives a localized recovery message
and asks the user to reopen the Moodle activity.

## Course context and data authority

Assignments created during an LTI session receive their Moodle issuer, client,
deployment, context, and resource-link identity from the verified server
session. A request body cannot assert or replace that context.

An LTI instructor session may read or mutate an assignment, run, or
counterfactual branch only when it resolves to the same Moodle issuer, client,
deployment, and course context. A different course receives a generic access
denial.

NRPS is deferred, so Moodle does not yet provision the course roster.
TraceChain's existing deployment-level learner roster remains the source for
hosted assignment selection. This is suitable only for the current
single-institution pre-release deployment; it is not a claim of Moodle
enrolment synchronization or multi-tenant isolation. Add NRPS before relying
on Moodle course membership as the learner roster.

LTI-created external identities are excluded from the email-based access
administration list because their durable identifier is not an email address.
Their active/disabled state is still checked at every session resolution.
Dedicated external-identity administration is deferred.

## Persistence

The current fresh-install D1 schema adds:

- `lti_login_states`;
- `external_user_identities`;
- `lti_sessions`;
- Moodle context columns on `assignments`.

Only hashed login state, nonce, and session tokens are stored. ID tokens are
not persisted.

TraceChain has a pre-release no-migration policy. Before deploying this schema,
the runtime schema guard compares the exact schema marker, atomically discards
an absent or non-current development schema, and installs the current schema
from scratch. Do not add compatibility readers or a migration chain for
obsolete development rows.

## Acceptance checklist

Before enabling a real Moodle registration:

1. Run `npm run quality`.
2. Run the complete Playwright project matrix.
3. Confirm the pre-release hosted D1 database reset to the current exact schema.
4. Configure the two LTI environment variables server-side.
5. Confirm the JWKS endpoint exposes public material only.
6. Register the tool manually in Moodle with a new-window launch.
7. Launch as a Moodle teacher and confirm the course title.
8. Confirm a learner-role launch is rejected.
9. Confirm a replayed state is rejected.
10. Confirm another Moodle course cannot open the first course's assignment.
11. Confirm return-to-Moodle and sign-out behavior.
12. Confirm `/learner` and SCORM activities behave exactly as before.

This repository change does not perform those deployment steps automatically.

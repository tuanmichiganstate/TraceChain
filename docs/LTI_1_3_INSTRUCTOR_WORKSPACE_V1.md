# LTI 1.3 Core and Deep Linking V3

Status: implemented locally; Deep Linking has not been registered in Moodle or
deployed.

## Purpose and boundary

TraceChain accepts Moodle LTI 1.3 Resource Link launches for the existing
hosted `/instructor` and `/learner` workspaces and Deep Linking requests for
course assignment selection. Every launch reuses the same hosted application,
API, D1 database, assignment model, simulation engine, reporting services, and
static client assets. LTI does not create a parallel application or
authentication system.

The implementation supports LTI 1.3 Core launch plus a bounded LTI Deep
Linking 2.0 content-selection flow:

- OpenID Connect login initiation;
- signed `id_token` verification against the registered Moodle JWKS;
- one-use state and nonce validation;
- exact issuer, client, deployment, context, resource-link, and role checks;
- automatic creation of a durable external instructor or learner identity;
- an eight-hour server-side HTTP-only session carrying exactly one TraceChain
  application role;
- course-context binding for instructor assignments, runs, and
  counterfactual records;
- exact assignment binding for each learner session;
- automatic learner enrollment only after a valid assignment launch;
- selection of one active assignment already bound to the verified Moodle
  course;
- an RS256-signed `LtiDeepLinkingResponse` containing one
  `ltiResourceLink` and its server-authored assignment custom parameter;
- an empty signed response when the instructor cancels; and
- localized launch recovery plus instructor return-to-Moodle and sign-out
  controls.

It deliberately does not implement:

- Names and Role Provisioning Services (NRPS);
- Assignment and Grade Services (AGS);
- access to Moodle SCORM attempt data;
- automatic SCORM upload or activity creation;
- dynamic LTI registration;
- Google sign-in; or
- a separate instructor deployment.

Moodle continues to own activity availability, enrolment rules, SCORM
attempts, grades, and completion. TraceChain LTI launch authenticates access to
the hosted platform. It does not turn a SCORM package into an instructor
module, synchronize a Moodle roster, or return a grade.

## Why one hosted site remains appropriate

The public student pages and static application shell are unchanged. LTI uses
separate endpoints and a separate session cookie:

```text
/api/lti/v1/login
/api/lti/v1/launch
/api/lti/v1/jwks
/api/lti/v1/logout
/api/lti/v1/deep-links/assignments
/api/lti/v1/deep-links/response
```

The existing direct Sites-authenticated session remains available. An LTI
session grants either `instructor` or `learner`, never a union of platform
roles. An instructor session carries one Moodle course context. A learner
session carries that course context and one exact TraceChain assignment ID.
Neither launch infers author, rater, or administrator authority.

Protected API operations authorize the resolved principal again at the worker
and repository boundaries. A separate instructor host would add cross-origin
cookies, duplicated deployment configuration, and another release surface
without strengthening these authorization checks.

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
| Content selection URL | `https://tracechain.example/api/lti/v1/launch` |
| Default launch container | New window |

After registration, Moodle supplies the platform issuer, client ID, deployment
ID, authentication endpoint, token endpoint, and public-keyset URL. Copy those
values exactly into the server-owned registration configuration. The issuer is
an exact identifier: do not add or remove a trailing slash.

Name and email claims are optional display metadata. They are not trusted as
the durable identity. TraceChain keys each external identity by:

```text
issuer + client ID + deployment ID + subject
```

### Instructor activity

The instructor resource link must send the standard full LTI Instructor role.
It needs no assignment custom parameter and opens `/instructor`.

### Learner activity through Deep Linking

First create the TraceChain assignment through the course's instructor
activity. Then add a Moodle External tool activity and use Moodle's
**Select content** action. TraceChain shows only active assignments already
bound to that verified course. Selecting one returns an LTI resource link with
this signed custom property:

```text
tracechain_assignment_id=ASSIGNMENT_ID
```

Moodle stores that property with the resource link and sends it back in the
signed custom claim on later launches. Moodle must send the standard full LTI
Learner role to a learner. The assignment identifier is never accepted from a
browser query parameter or ordinary API request.

Keep one stable TraceChain assignment ID per Moodle activity. A successful
Deep Linking response does not force Moodle to save the activity; the
instructor may still cancel Moodle's activity form.

Manual custom-parameter entry remains usable for isolated development, but
Deep Linking is the supported instructor workflow.

An LTI instructor may create a course-bound assignment without selecting a
deployment-level learner roster. The first valid learner launch creates or
resolves the learner's durable external identity and idempotently enrolls it
into only that assignment.

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
rejected by this public-key configuration.

`TRACECHAIN_LTI_TOOL_PRIVATE_JWK_JSON` contains the one RSA private key used to
sign Deep Linking responses. Store it as a deployment secret, never in a
runtime file or committed environment file. Its `kid`, `n`, and `e` values must
match one RS256 signing key in the public keyset:

```json
{
  "kty": "RSA",
  "kid": "TRACECHAIN_TOOL_KEY_2026_01",
  "use": "sig",
  "alg": "RS256",
  "n": "PUBLIC_MODULUS_BASE64URL",
  "e": "AQAB",
  "d": "PRIVATE_EXPONENT_BASE64URL",
  "p": "PRIVATE_PRIME_P_BASE64URL",
  "q": "PRIVATE_PRIME_Q_BASE64URL",
  "dp": "PRIVATE_DP_BASE64URL",
  "dq": "PRIVATE_DQ_BASE64URL",
  "qi": "PRIVATE_QI_BASE64URL"
}
```

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
  -> Instructor:
       provision instructor identity
       bind verified course context
       open /instructor
  -> Learner:
       read assignment ID from the verified custom claim
       resolve the exact course-bound assignment
       provision learner identity and assignment membership
       bind the session to that assignment
       open /learner?assignmentId=...
  -> Deep Linking instructor:
       validate deep_linking_settings
       bind a purpose-limited session to the course
       list active assignments from that exact course
       return one signed ltiResourceLink or an empty cancellation
  -> Secure, HttpOnly, SameSite=Lax session cookie
```

Every launch token must contain:

- exact registered issuer and client audience;
- `sub`, `iat`, `exp`, and matching nonce;
- LTI version `1.3.0`;
- a supported Core or Deep Linking message type;
- exact deployment ID;
- a supported full LTI Instructor or Learner role;
- context ID; and
- a resource-link ID for `LtiResourceLinkRequest`.

A learner resource-link launch additionally requires a bounded
`tracechain_assignment_id` value in the standard LTI custom claim.

A Deep Linking request additionally requires:

- message type `LtiDeepLinkingRequest`;
- the full Instructor role;
- a same-platform `deep_link_return_url`;
- `ltiResourceLink` among the accepted content types; and
- `window` among the accepted presentation targets.

The response is a short-lived RS256 Tool JWT. It returns Moodle's opaque
`data` claim unchanged, binds the exact deployment, and includes one assignment
custom property. The exact signed response is stored with the one-time
selection, so an identical retry returns the identical JWT even if assignment
metadata or the active signing key changes afterward.

Unknown, expired, replayed, incorrectly signed, cross-deployment, unsupported
role, missing-assignment, and cross-course launches fail closed. Learner
assignment failures open `/learner` with a localized recovery message; no
learner identity, membership, or session is created before the course and
assignment checks pass.

## Course and assignment authority

Assignments created during an LTI instructor session receive their Moodle
issuer, client, deployment, context, and instructor resource-link identity
from the verified server session. A request body cannot assert or replace that
context.

An LTI instructor session may read or mutate an assignment, run, or
counterfactual branch only when it resolves to the same Moodle issuer, client,
deployment, and course context.

An LTI learner session is narrower:

- the signed custom claim selects one assignment;
- the assignment must already belong to the same verified Moodle course;
- the verified learner identity is enrolled idempotently in that assignment;
- the session stores that assignment ID server-side;
- the learner assignment list is filtered to that ID; and
- requests for another assignment are rejected even when it belongs to the
  same course.

An LTI Deep Linking session is narrower than either workspace:

- it may list only active assignments in its exact course context;
- it cannot use ordinary instructor APIs;
- it may select one assignment or cancel;
- a repeated identical submission returns the same signed response; and
- a different submission after completion is rejected.

The learner resource-link ID is verified and preserved in the launch context.
It is expected to differ from the instructor resource-link ID that originally
created the assignment. The signed custom claim supplies the exact assignment
binding.

NRPS remains deferred. TraceChain therefore does not import the Moodle course
roster. Automatic membership means only that Moodle sent a valid Learner
launch for this registered deployment, course, resource link, and assignment
parameter. Moodle remains responsible for controlling who can open that
activity.

LTI-created external identities are excluded from the email-based access
administration list because their durable identifier is not an email address.
Their active or disabled state is checked whenever a session is resolved.
Dedicated external-identity administration is deferred.

## Persistence

The current fresh-install D1 schema contains:

- `lti_login_states`;
- `external_user_identities`;
- `lti_sessions`, including launch purpose, the exact application role,
  optional learner assignment binding, bounded Deep Linking settings, and
  exactly-once selection state plus the signed response needed for an exact
  retry;
- Moodle context columns on `assignments`; and
- the existing `assignment_learners` relation used for idempotent LTI learner
  enrollment.

Only hashed login state, nonce, and session tokens are stored. ID tokens are
not persisted.

TraceChain has a pre-release no-migration policy. Before deployment, the
runtime schema guard compares the exact schema marker, discards an absent or
non-current development schema, and installs the current schema from scratch.
Do not add compatibility readers or a migration chain for obsolete
development rows.

## Acceptance checklist

Before enabling real Moodle learner activities:

1. Run `npm run quality`.
2. Run the complete Playwright project matrix.
3. Confirm the pre-release hosted D1 database resets to the current schema.
4. Configure all three LTI environment variables server-side.
5. Confirm the JWKS endpoint exposes public material only.
6. Register the tool manually with new-window launch.
7. Launch the instructor activity and confirm the course title.
8. Create a course-bound assignment, optionally with an empty initial roster.
9. Use **Select content** and confirm that only active assignments from this
   Moodle course appear.
10. Select the assignment and confirm Moodle receives a signed resource link
    with the exact assignment custom parameter.
11. Save the activity, launch as an enrolled Moodle learner, and confirm the
    exact assignment.
12. Confirm a second learner launch is idempotent.
13. Confirm Deep Linking cancellation returns no content item.
14. Confirm a second identical Deep Linking response is byte-identical.
15. Confirm another assignment and another Moodle course are denied.
16. Confirm a missing learner custom parameter fails with localized recovery.
17. Confirm a replayed state and invalid platform or tool signature are
    rejected.
18. Confirm instructor return-to-Moodle and sign-out behavior.
19. Confirm direct hosted sessions and SCORM activities behave as before.

This repository change does not perform registration or deployment
automatically.

# LTI 1.3 Core, Author Launch, Deep Linking, AGS, and NRPS V6

Status: implemented in the application. The Scenario Author launch remains
inactive until its exact Moodle resource-link ID is added to the server-owned
registration and that configuration is deployed.

## Purpose and boundary

SimuLedger accepts Moodle LTI 1.3 Resource Link launches for the existing
hosted `/instructor`, `/author`, and `/learner` workspaces and Deep Linking
requests for course assignment selection. Every launch reuses the same hosted
application, API, D1 database, assignment model, simulation engine, reporting
services, and static client assets. LTI does not create a parallel application
or authentication system.

The implementation supports LTI 1.3 Core launch, a bounded LTI Deep Linking
2.0 content-selection flow, final Assignment and Grade Services 2.0 outcome
return, and an instructor-initiated Names and Role Provisioning Services 2.0
course-roster synchronization:

- OpenID Connect login initiation;
- signed `id_token` verification against the registered Moodle JWKS;
- one-use state and nonce validation;
- exact issuer, client, deployment, context, resource-link, and role checks;
- automatic creation of a durable external instructor or learner identity;
- an eight-hour server-side HTTP-only session carrying exactly one SimuLedger
  application role;
- a server-allowlisted Scenario Author resource link that converts a verified
  full Instructor launch into one session-scoped `scenario-author` principal;
- course-context binding for instructor assignments, runs, and
  counterfactual records;
- exact assignment binding for each learner session;
- automatic learner enrollment only after a valid assignment launch;
- selection of one active assignment already bound to the verified Moodle
  course;
- an RS256-signed `LtiDeepLinkingResponse` containing one
  `ltiResourceLink` and its server-authored assignment custom parameter;
- a 100-point line item in that resource link only when Moodle declares
  `accept_lineitem: true`;
- validation of the signed AGS line-item URL and granted scopes on the learner
  resource-link launch;
- OAuth 2.0 client-credentials access using a short-lived RS256
  `private_key_jwt`;
- validation of the signed NRPS service claim on an instructor resource-link
  launch;
- a bounded, paginated roster read using only the NRPS
  `contextmembership.readonly` scope;
- atomic replacement of the exact launched course's current learner
  membership projection;
- optional Moodle names and email addresses treated as display metadata rather
  than identity;
- one durable, idempotent final score-delivery record per hosted run;
- final completion and existing academic-score return for Coffee, Audit, and
  Technical Laboratory runs;
- completed generic evidence-based runs reported as `PendingManual` without
  inventing an automatic score;
- an empty signed response when the instructor cancels; and
- localized launch recovery plus instructor and author return-to-Moodle and
  sign-out controls.

It deliberately does not implement:

- automatic or scheduled roster synchronization;
- Moodle role writes or enrolment changes;
- AGS line-item creation or update outside the Deep Linking response;
- interim score, manual-rubric grade, or multiple-attempt aggregation
  services;
- access to Moodle SCORM attempt data;
- automatic SCORM upload or activity creation;
- dynamic LTI registration;
- Google sign-in; or
- a separate instructor deployment.

Moodle continues to own activity availability, enrolment rules, attempt
aggregation, and the gradebook. SimuLedger authenticates hosted-platform
access and returns one run's final completion and available score to the exact
line item supplied by Moodle. NRPS imports a read-only snapshot only after the
instructor requests synchronization from the launched course. It does not turn
a SCORM package into an instructor module, alter Moodle enrolments, or read
Moodle SCORM attempts.

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
/api/lti/v1/nrps/sync
```

The existing direct Sites-authenticated session remains available. An ordinary
LTI session grants either `instructor` or `learner`, never a union of platform
roles. An instructor session carries one Moodle course context. A learner
session carries that course context and one exact SimuLedger assignment ID.
Neither ordinary launch infers author, rater, or administrator authority.

One separately configured resource link may grant session-scoped
`scenario-author` authority. SimuLedger requires both the standard full LTI
Instructor role and an exact resource-link ID listed in the server-owned
registration. A custom parameter, query parameter, launch name, or client
request cannot grant this role. The resulting principal has only
`scenario-author`; it does not inherit instructor, rater, learner, or
administrator access.

Protected API operations authorize the resolved principal again at the worker
and repository boundaries. A separate instructor host would add cross-origin
cookies, duplicated deployment configuration, and another release surface
without strengthening these authorization checks.

## Moodle manual registration

Register SimuLedger as an LTI 1.3 External tool in Moodle. Use a new-window
launch; embedded launches are not supported because modern browsers may block
third-party cookies.

For a deployment at `https://simuledger.example`, provide Moodle with:

| Moodle field | Value |
|---|---|
| Tool URL / redirect URI | `https://simuledger.example/api/lti/v1/launch` |
| Initiate login URL | `https://simuledger.example/api/lti/v1/login` |
| Public keyset URL | `https://simuledger.example/api/lti/v1/jwks` |
| Content selection URL | `https://simuledger.example/api/lti/v1/launch` |
| Default launch container | New window |

After registration, Moodle supplies the platform issuer, client ID, deployment
ID, authentication endpoint, token endpoint, and public-keyset URL. Copy those
values exactly into the server-owned registration configuration. The issuer is
an exact identifier: do not add or remove a trailing slash.

The token endpoint is optional only when neither AGS nor NRPS is used. A
learner launch that grants the AGS score scope cannot deliver an outcome, and
an instructor launch that advertises NRPS cannot synchronize a roster, unless
the matching registration includes that endpoint and the tool private key is
configured. In Moodle, enable the Names and Role Provisioning service and its
read-only context-membership scope for the tool.

Name and email claims are optional display metadata. They are not trusted as
the durable identity. SimuLedger keys each external identity by:

```text
issuer + client ID + deployment ID + subject
```

### Instructor activity

The instructor resource link must send the standard full LTI Instructor role.
It needs no assignment custom parameter and opens `/instructor`. When Moodle
includes the standard signed NRPS claim with service version `2.0`, the
assignment form offers an explicit **Synchronize Moodle roster** action. The
action reads the launched course only; opening the instructor workspace does
not synchronize automatically.

### Scenario Author activity

Create a separate Moodle External tool activity for scenario authoring. It
uses the same tool registration and launch endpoint as the instructor
activity, but its exact signed resource-link ID must be present in the matching
server registration's `scenarioAuthorResourceLinkIds`.

The activity must send the standard full LTI Instructor role. Moodle controls
who may open the activity through its course role and activity-access rules.
SimuLedger then applies its own narrower checks:

- the issuer, client, deployment, course, role, and resource-link claims must
  pass the normal signed launch validation;
- the resource-link ID must match the server allowlist exactly;
- the launch opens `/author`;
- the session receives only `scenario-author`;
- NRPS is not retained because authoring does not need a learner roster; and
- `/instructor` assignment data and `/admin` remain forbidden.

Do not use a custom parameter such as
`simuledger_workspace=scenario-author` as authorization. SimuLedger ignores it
for privilege decisions.

To obtain the opaque resource-link ID safely:

1. Create and launch the new Moodle activity once as a full Instructor before
   allowlisting it.
2. In the launched SimuLedger tab, open `/api/v1/session`.
3. Copy `learningContext.resourceLinkId`, which came from the verified signed
   launch.
4. Add that exact value to `scenarioAuthorResourceLinkIds` in the matching
   server registration.
5. Apply the runtime configuration and launch the activity again.

The same resource-link ID may not be guessed from the Moodle activity title.
Any Instructor who can launch an allowlisted activity receives Scenario Author
authority for that session, so Moodle access to this activity must be
restricted intentionally.

### Learner activity through Deep Linking

First create the SimuLedger assignment through the course's instructor
activity. Then add a Moodle External tool activity and use Moodle's
**Select content** action. SimuLedger shows only active assignments already
bound to that verified course. Selecting one returns an LTI resource link with
this signed custom property:

```text
simuledger_assignment_id=ASSIGNMENT_ID
```

Moodle stores that property with the resource link and sends it back in the
signed custom claim on later launches. Moodle must send the standard full LTI
Learner role to a learner. The assignment identifier is never accepted from a
browser query parameter or ordinary API request.

Keep one stable SimuLedger assignment ID per Moodle activity. A successful
Deep Linking response does not force Moodle to save the activity; the
instructor may still cancel Moodle's activity form.

Manual custom-parameter entry remains usable for isolated development, but
Deep Linking is the supported instructor workflow.

An LTI instructor may create a course-bound assignment without selecting a
deployment-level learner roster. The first valid learner launch creates or
resolves the learner's durable external identity and idempotently enrolls it
into only that assignment.

## Server configuration

`SIMULEDGER_LTI_REGISTRATIONS_JSON` contains one to sixteen registrations:

```json
[
  {
    "registrationId": "MOODLE_PRODUCTION",
    "issuer": "https://moodle.example.edu",
    "clientId": "123",
    "deploymentId": "456",
    "authorizationEndpoint": "https://moodle.example.edu/mod/lti/auth.php",
    "jwksUri": "https://moodle.example.edu/mod/lti/certs.php",
    "tokenEndpoint": "https://moodle.example.edu/mod/lti/token.php",
    "scenarioAuthorResourceLinkIds": [
      "OPAQUE_RESOURCE_LINK_ID_FROM_VERIFIED_LAUNCH"
    ]
  }
]
```

`scenarioAuthorResourceLinkIds` is optional, bounded to 32 unique values, and
defaults to no Moodle author access. Removing an ID revokes author authority
from existing LTI sessions on their next API request because the live
server-owned registration is rechecked.

`SIMULEDGER_LTI_TOOL_JWKS_JSON` contains the public tool keyset Moodle records:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "SIMULEDGER_TOOL_KEY_2026_01",
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

`SIMULEDGER_LTI_TOOL_PRIVATE_JWK_JSON` contains the one RSA private key used to
sign Deep Linking responses and AGS or NRPS OAuth client assertions. Store it
as a deployment secret, never in a runtime file or committed environment file.
Its `kid`, `n`, and `e` values must match one RS256 signing key in the public
keyset:

```json
{
  "kty": "RSA",
  "kid": "SIMULEDGER_TOOL_KEY_2026_01",
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
  -> SimuLedger verifies RS256 token and LTI claims
  -> Instructor:
       provision instructor identity
       bind verified course context
       retain a valid signed NRPS endpoint when Moodle supplies one
       open /instructor
  -> Allowlisted Scenario Author resource link:
       require the verified full Instructor role
       provision the same base external instructor identity
       suppress NRPS because authoring does not use a roster
       resolve each API request to only scenario-author
       open /author
  -> Instructor-initiated roster synchronization:
       obtain a token for contextmembership.readonly with private_key_jwt
       read the exact course learner snapshot through bounded pagination
       atomically update that course's current membership projection
       offer active synchronized learners in the assignment form
  -> Learner:
       read assignment ID from the verified custom claim
       validate the optional AGS endpoint and exact granted scopes
       resolve the exact course-bound assignment
       provision learner identity and assignment membership
       bind the session to that assignment
       open /learner?assignmentId=...
  -> Deep Linking instructor:
       validate deep_linking_settings
       bind a purpose-limited session to the course
       list active assignments from that exact course
       return one signed ltiResourceLink, with a line item when accepted,
       or an empty cancellation
  -> Completed learner run:
       reconstruct the existing authoritative score
       store one exact pending AGS payload
       obtain a scoped OAuth access token with private_key_jwt
       POST the score to the Moodle line item's /scores endpoint
       mark the durable delivery delivered or failed for retry
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
`simuledger_assignment_id` value in the standard LTI custom claim.

When Moodle supplies the standard AGS endpoint claim, SimuLedger validates:

- a bounded absolute `lineitem` URL;
- the exact Moodle issuer origin;
- HTTPS, except for explicit local loopback development;
- no URL credentials or fragment; and
- a bounded scope list.

Only the exact
`https://purl.imsglobal.org/spec/lti-ags/scope/score` grant enables passback.
The platform user ID in the score is the verified LTI `sub`; it never comes
from a learner request body.

When Moodle supplies the standard NRPS names-and-roles claim on an instructor
resource-link launch, SimuLedger validates:

- a bounded absolute `context_memberships_url`;
- the exact Moodle issuer origin;
- HTTPS, except for explicit local loopback development;
- no URL credentials or fragment;
- a bounded service-version list containing `2.0`; and
- the full Instructor role.

The endpoint is stored with the server-side session rather than accepted from
a synchronization request. The roster request uses only
`https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly`,
the NRPS membership-container media type, learner-role filtering, and bounded
pagination. Every returned container must match the exact launched context.

A Deep Linking request additionally requires:

- message type `LtiDeepLinkingRequest`;
- the full Instructor role;
- a same-platform `deep_link_return_url`;
- `ltiResourceLink` among the accepted content types; and
- `window` among the accepted presentation targets.

If `accept_lineitem` is true, the returned resource link declares one
100-point line item with the assignment ID as its stable `resourceId`. If the
setting is false or absent, no line-item object is returned.

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

NRPS synchronization is explicit and course-scoped:

- only an active instructor resource-link session carrying Moodle's valid
  signed NRPS claim may start it;
- the request supplies only an idempotency ID, never a course or service URL;
- the first successful response imports active and inactive Learner
  memberships as one complete snapshot;
- absent status means active, as required by NRPS, while explicitly inactive
  learners are not offered for new assignment selection;
- a later complete snapshot marks learners omitted from that same Moodle
  course inactive without changing another course or disabling their global
  application identity;
- optional names and email addresses improve the roster label but do not
  replace the durable issuer, client, deployment, and `sub` identity; and
- existing assignment rosters and historical runs remain unchanged;
  synchronization updates only the roster offered for subsequent assignment
  creation.

The synchronization is not a background job and does not write enrolment or
role data back to Moodle. A valid learner activity launch remains the authority
for entering its exact assignment and idempotently records that assignment
membership even if an instructor has not synchronized NRPS.

LTI-created external identities are excluded from the email-based access
administration list because their durable identifier is not an email address.
Their active or disabled state is checked whenever a session is resolved.
Dedicated external-identity administration is deferred.

## Final outcome return

SimuLedger posts only after the authoritative run event log contains
`RUN_COMPLETED`. Learner completion is never rolled back because Moodle is
temporarily unavailable.

The score payload uses the completion event's immutable timestamp:

```json
{
  "userId": "verified-lti-sub",
  "timestamp": "2026-07-28T09:15:00.000Z",
  "activityProgress": "Completed",
  "gradingProgress": "FullyGraded",
  "scoreGiven": 82,
  "scoreMaximum": 100
}
```

Coffee uses its existing academic scoring engine, Audit uses its existing
final audit report score, and Technical Laboratory uses its existing replay
score. No points, maxima, pass thresholds, or rubric judgments are added by
LTI. A generic hosted scenario currently produces evidence for manual review,
so its completion payload uses `gradingProgress: "PendingManual"` and omits
`scoreGiven` and `scoreMaximum`.

Before posting, the worker stores the exact payload, line-item URL, verified
platform subject, assignment, registration, and run in an outbox. A run has
one stable delivery identity. A repeated completion command returns the same
record and does not create another payload. Failed deliveries may be reclaimed
and retried; an abandoned in-progress claim becomes reclaimable after five
minutes. If Moodle accepted a score but the response was lost, retrying the
same payload and timestamp is safe because it represents the same final
result.

The OAuth access token is never stored or returned to the browser. The client
assertion uses `iss` and `sub` equal to the registered tool client ID, the
exact token endpoint as `aud`, a five-minute lifetime, and a fresh `jti`.

## Persistence

The current fresh-install D1 schema contains:

- `lti_login_states`;
- `external_user_identities`;
- `lti_sessions`, including launch purpose, the base LTI application role,
  optional learner assignment binding, bounded Deep Linking settings, and
  exactly-once selection state plus the signed response needed for an exact
  retry, together with the signed learner launch's optional AGS endpoint and
  scopes and the signed instructor launch's optional NRPS endpoint and service
  versions;
- `lti_ags_score_deliveries`, containing one bounded final payload and durable
  delivery state per hosted run;
- `lti_nrps_syncs`, containing each idempotent full-snapshot identity, source,
  hash, counts, performer, and timestamp;
- `lti_context_memberships`, containing the current exact-course membership
  projection and optional bounded display metadata;
- Moodle context columns on `assignments`; and
- the existing `assignment_learners` relation used for idempotent LTI learner
  enrollment.

Only hashed login state, nonce, and session tokens are stored. ID tokens are
not persisted. Scenario Author authority is not copied into a session row; the
worker rechecks the signed session context against the live server allowlist on
every API request.

SimuLedger has a pre-release no-migration policy. Before deployment, the
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
8. Confirm Moodle includes the NRPS 2.0 claim and the roster control appears.
9. Synchronize the roster and confirm that active learners from only this
   course are offered while inactive learners are excluded.
10. Repeat the same synchronization ID and confirm no second Moodle request or
    sync record is created.
11. Synchronize a later complete snapshot and confirm omitted learners become
    inactive only in this course without changing existing assignments.
12. Create a course-bound assignment from the synchronized roster.
13. Use **Select content** and confirm that only active assignments from this
   Moodle course appear.
14. Select the assignment and confirm Moodle receives a signed resource link
    with the exact assignment custom parameter.
15. Save the activity, launch as an enrolled Moodle learner, and confirm the
    exact assignment.
16. Confirm a second learner launch is idempotent.
17. Confirm a Moodle activity that accepts a line item receives the expected
    100-point item, and one that does not accept it receives none.
18. Confirm Deep Linking cancellation returns no content item.
19. Confirm a second identical Deep Linking response is byte-identical.
20. Confirm another assignment and another Moodle course are denied.
21. Confirm a missing learner custom parameter fails with localized recovery.
22. Confirm cross-origin AGS and NRPS URLs are rejected before identity
    provisioning.
23. Complete a Coffee, Audit, and Technical Laboratory run and confirm each
    existing score reaches the exact Moodle line item.
24. Complete a generic evidence-based run and confirm Moodle receives
    completion with grading pending manual review and no invented score.
25. Confirm an unavailable Moodle endpoint leaves a failed durable delivery
    and an identical retry reuses it.
26. Confirm a replayed state and invalid platform or tool signature are
    rejected.
27. Confirm instructor return-to-Moodle and sign-out behavior.
28. Create a separate Scenario Author activity, capture its verified
    `resourceLinkId`, and add only that ID to the server registration.
29. Confirm that activity opens `/author` with only the `scenario-author`
    role, and that return-to-Moodle and sign-out work.
30. Confirm an unlisted Instructor activity remains `/instructor`, even if it
    sends `simuledger_workspace=scenario-author`.
31. Confirm a learner launch, instructor assignment API, and administrator API
    are denied from the author session.
32. Confirm direct hosted sessions and SCORM activities behave as before.

This repository change does not perform registration or deployment
automatically.

# SimuLedger implementation plan: real digital signatures, authorization, and endorsement policies

Status: approved follow-on implementation specification
Implementation state: Increments A and B complete; all acceptance gates are
green as of 24 July 2026.
Prerequisite: the configurable Guided and Challenge simulation boundary remains
the foundation for this work

This plan implements genuine digital signing, signature verification,
authorization, and endorsement-policy evaluation in SimuLedger.

It extends the existing configurable Guided and Challenge simulation
architecture. It does not replace the current command/event model,
deterministic replay, SL1 journal, scenario engine, package generator, scoring
engine, or accepted-event versus audit-event separation.

Implement this work in two gated increments:

1. Digital signatures and authorization.
2. Endorsement policies.

Do not begin endorsement integration until the signature and authorization
increment is complete and all gates are green.

This work must not introduce:

- A backend.
- Real user authentication.
- Production PKI.
- A wallet.
- Cryptocurrency.
- Mining.
- Proof of work.
- Manual private-key management.
- Multi-user sessions.
- A graphical package builder.
- A generic policy-authoring UI.
- A new academic scoring system.
- New total points.

The cryptographic computations must be genuine. The organizational identities,
key custody, certificate authority, network, nodes, ordering, and consensus
remain explicitly educational simulations.

## 1. Product and learning objectives

After this release, learners should be able to distinguish:

1. Signature validity.
2. Recognized organizational identity.
3. Key status.
4. Authorization to perform an action.
5. Satisfaction of an endorsement policy.
6. State-version validity.
7. Truthfulness of the underlying business data.

The interface must make this distinction clear:

```text
Signature valid: Yes
Signer recognized: Yes
Signer authorized: No
Endorsement policy satisfied: Not applicable
Real-world statement proven true: No
```

The central learning message is:

> A valid digital signature shows that a particular educational key approved
> specific content and that the signed content has not changed. It does not
> automatically prove that the signer was authorized, that the required
> organizations agreed, or that the original business data were true.

## 2. Preserve current architecture

Retain these current boundaries:

- Commands represent attempted actions.
- Trusted execution context remains separate from command claims.
- Accepted domain events remain separate from rejected attempt-audit events.
- Only ledger mutation events enter blocks, hashes, ledger history, and
  asset-state projections.
- Simulation decision events may affect scoring, consequences, and reporting
  without pretending to be ledger transactions.
- Attempt audit events may affect feedback and reporting but never enter the
  ledger.
- State changes become visible only after prospective journal encoding and
  durable persistence succeed.
- SL1 stores compact replay inputs rather than redundant derived state.
- The same journal and scenario inputs must reproduce the same state, hashes,
  verification evidence, scores, consequences, and report.
- The application must remain operable without React or SCORM in headless
  tests.

Do not make React components perform signing, verification, authorization, or
policy evaluation directly.

## 3. Cryptographic algorithm and provider

Use Ed25519 for educational signatures.

Reasons for this project:

- Compact public keys and signatures.
- Deterministic signatures for identical key and message inputs.
- Suitable for deterministic replay.
- No per-signature random nonce that must be persisted.
- Independently verifiable outside the UI.

Introduce a provider interface:

```ts
interface SignatureProvider {
  readonly algorithm: "Ed25519";

  sign(
    privateKey: EducationalPrivateKey,
    message: Uint8Array
  ): Promise<Uint8Array>;

  verify(
    publicKey: EducationalPublicKey,
    message: Uint8Array,
    signature: Uint8Array
  ): Promise<boolean>;

  fingerprint(
    publicKey: EducationalPublicKey
  ): Promise<string>;
}
```

Primary implementation:

```text
WebCryptoEd25519Provider
```

Before integrating it into the simulation:

- Add a browser capability test for Chromium, Firefox, WebKit, and Mobile
  Safari.
- Add the same test in the Node test environment.
- Import a fixed educational key pair.
- Sign a fixed message.
- Verify the signature.
- Modify one byte and verify failure.
- Confirm the signature bytes are identical across repeated signing with the
  same key and message.

If native Ed25519 is not reliable across every supported project, use one
pinned, reviewed, cross-platform Ed25519 library behind the same interface.

Do not silently switch algorithms by browser.

Implementation decision: the native capability spike did not pass the
repository's WebKit and Mobile Safari authority. Increment A therefore uses
`@noble/ed25519@3.1.0` behind `SignatureProvider` in every supported
environment; the signed algorithm remains Ed25519.

All supported environments must produce evidence that the same independent
verifier can validate. The repository's actual Chromium, Firefox, WebKit, and
Mobile Safari matrix is the acceptance authority.

Relevant standards and implementation references:

- [Web Cryptography Level 2](https://www.w3.org/TR/webcrypto-2/) defines
  signing and verification operations and Ed25519.
- [WebKit Ed25519 implementation issue](https://bugs.webkit.org/show_bug.cgi?id=246145)
  records WebKit's implementation work.

## 4. Educational key model

Use versioned educational key fixtures.

Do not generate a new key pair during each learner attempt.

Define a model equivalent to:

```ts
interface EducationalIdentity {
  readonly organizationId: string;
  readonly recognized: boolean;
  readonly displayNameKey: string;
  readonly activeKeyIds: readonly string[];
}

interface EducationalKeyRecord {
  readonly keyId: string;
  readonly organizationId: string;
  readonly algorithm: "Ed25519";

  readonly publicKeySpkiBase64Url: string;
  readonly privateKeyPkcs8Base64Url: string;

  readonly status:
    | "ACTIVE"
    | "EXPIRED"
    | "REVOKED";

  readonly validFrom: string;
  readonly validUntil?: string;

  readonly educationalOnly: true;
}
```

Key requirements:

- Public and private educational keys are fixed, versioned fixtures.
- Public-key fingerprint is derived from the public key.
- `keyId` must remain stable.
- Key status is evaluated using the injected deterministic scenario clock.
- Private keys must never be shown in the learner UI.
- Private keys must never be described as secure production credentials.
- No educational key may be used for real authentication.
- Package documentation must state that the private keys are inspectable in the
  static educational package.

Use separate runtime files where consistent with the current package
architecture, for example:

```text
identity-registry.json
educational-signing-keys.json
authorization-policies.json
endorsement-policies.json
```

They must remain external to the static JavaScript application bundle so
Guided and Challenge packages continue to share identical application assets.

Hash all cryptographic runtime files and record their hashes in
`build-info.json` or the scenario package metadata.

## 5. Cryptographic authenticity disclosure

Add a concise learner-facing disclosure.

Vietnamese meaning:

```text
Các phép ký và kiểm tra chữ ký trong mô phỏng sử dụng thuật toán mật mã thật. Danh tính tổ chức, khóa ký và cơ chế cấp chứng thư được mô phỏng phục vụ học tập. Các khóa này không được dùng cho giao dịch thực tế.
```

English meaning:

```text
Signing and signature verification in this simulation use real cryptographic operations. Organizational identities, signing keys, and certificate issuance are simulated for learning. These keys must not be used for real transactions.
```

Do not describe the educational identities as legally verified,
institutionally issued, or production-secure.

## 6. Canonical proposal model

A signature must bind the exact proposed action, scenario, session, and state
versions.

Define a proposal model equivalent to:

```ts
interface TransactionProposalV1 {
  readonly domain: "SIMULEDGER_TRANSACTION_PROPOSAL_V1";

  readonly configurationHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly sessionId: string;

  readonly proposalId: string;
  readonly commandType: string;
  readonly commandPayload: unknown;

  readonly expectedStateVersions:
    Readonly<Record<string, number>>;

  readonly proposedAt: string;
}
```

Rules:

- Reuse the current canonical serializer.
- Reject unsupported numeric values and non-canonical structures using existing
  rules.
- Exclude signatures, endorsements, verification results, UI state, and
  commitment status from the canonical proposal.
- Include all state versions relevant to the action.
- Include the configuration and scenario identity to prevent cross-package
  reuse.
- Include the session ID to prevent cross-attempt reuse.
- Use the deterministic scenario clock.
- Compute:

```text
proposalCanonicalBytes
proposalDigest = SHA-256(proposalCanonicalBytes)
```

The SHA-256 proposal digest is the stable value displayed to learners and
shared by every endorsement.

## 7. Signature statement and envelope

Each organization signs a domain-separated statement referring to the proposal
digest.

```ts
interface SignatureStatementV1 {
  readonly domain: "SIMULEDGER_SIGNATURE_V1";
  readonly purpose:
    | "PROPOSAL_SUBMISSION"
    | "ENDORSEMENT";

  readonly proposalDigest: string;
  readonly sessionId: string;

  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;

  readonly signedAt: string;
}
```

Canonicalize the statement and sign its canonical bytes.

Store or derive an envelope equivalent to:

```ts
interface SignatureEnvelope {
  readonly algorithm: "Ed25519";
  readonly purpose:
    | "PROPOSAL_SUBMISSION"
    | "ENDORSEMENT";

  readonly proposalDigest: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;

  readonly signedAt: string;
  readonly signatureBase64Url: string;
}
```

Every verification must confirm:

- The signature is cryptographically valid.
- The key belongs to the claimed organization.
- The organization is recognized.
- The key is active at the deterministic signing time.
- The signature statement matches the session.
- The signature refers to the same proposal digest.
- The role matches the trusted execution context.
- The organization matches the trusted execution context.

Do not use a valid signature as proof of authorization.

## 8. Deterministic replay and compact persistence

Do not store redundant signature bytes in SL1 if they can be regenerated
exactly from:

- Command journal.
- Scenario identity registry.
- Fixed educational key fixture.
- Deterministic signing time.
- Trusted actor context.

Persist only the compact replay inputs required to reproduce:

- Active key ID or key index.
- Signer organization and role context, where not already present.
- Proposal or endorsement action opcode.
- Proposal ID.
- Endorse or decline decision.
- Deterministic timestamp input, where required.

On replay, regenerate:

- Canonical proposal.
- Proposal digest.
- Signature statements.
- Signature bytes.
- Verification results.
- Authorization results.
- Endorsement-policy results.
- Technical evidence model.

Add a worst-case SL1 size test with every permitted signature and endorsement
action.

The complete authored Guided and Challenge paths must remain below the current
internal suspend-data ceiling.

If deterministic regeneration is not possible in the selected provider, stop
and report the incompatibility before persisting full signatures.

Do not silently increase the SCORM size budget.

## 9. Authorization model

Authorization is scenario-authored and separate from identity recognition.

Define a model equivalent to:

```ts
interface AuthorizationPolicy {
  readonly authorizationPolicyId: string;

  readonly commandTypes: readonly string[];

  readonly allowedOrganizationIds:
    readonly string[];

  readonly allowedRoleIds:
    readonly string[];

  readonly signerOrganizationMustMatchActorOrganization:
    boolean;

  readonly localizationKey: string;
}
```

The scenario validator must confirm:

- Every referenced organization exists.
- Every referenced role exists.
- Every command type exists.
- No rule is empty unless explicitly defined as denying all.
- Every command that requires authorization has one applicable rule.
- Rules are deterministic.
- No arbitrary executable expression appears in scenario data.

Authorization evaluation must return structured evidence:

```ts
interface AuthorizationResult {
  readonly recognizedIdentity: boolean;
  readonly keyActive: boolean;
  readonly organizationAllowed: boolean;
  readonly roleAllowed: boolean;
  readonly contextMatches: boolean;
  readonly authorized: boolean;
  readonly failureRuleIds: readonly string[];
}
```

## 10. Signature and authorization pipeline

Extend the command pipeline without weakening the pure domain boundary.

Recommended flow:

```text
1. UI creates a business command request.
2. Orchestrator obtains trusted actor context.
3. Orchestrator constructs canonical proposal.
4. Signing service signs as the active organization.
5. Verification service verifies cryptographic evidence.
6. Authorization evaluator checks identity, key, organization, and role.
7. Endorsement evaluator runs when applicable.
8. Existing state-version and business validation runs.
9. Accepted or audit events are produced prospectively.
10. Prospective SL1 journal is encoded and persisted.
11. Only after persistence succeeds is the UI state published.
```

Do not let the UI manufacture a `verified: true` field.

Use a type or constructor boundary equivalent to:

```ts
type VerifiedCommandEnvelope =
  Brand<SignedCommandEnvelope, "VerifiedCommandEnvelope">;
```

Only the cryptographic verification service may produce it.

A future server must be able to run the same verification again.

## 11. Validation rule identifiers

Add stable validation rule IDs equivalent to:

```text
RULE_SIGNATURE_MISSING
RULE_SIGNATURE_INVALID
RULE_SIGNER_IDENTITY_UNKNOWN
RULE_SIGNING_KEY_EXPIRED
RULE_SIGNING_KEY_REVOKED
RULE_SIGNER_CONTEXT_MISMATCH
RULE_ORGANIZATION_NOT_AUTHORIZED
RULE_ROLE_NOT_AUTHORIZED

RULE_ENDORSEMENT_POLICY_NOT_SATISFIED
RULE_ENDORSEMENT_SIGNATURE_INVALID
RULE_ENDORSER_NOT_AUTHORIZED
RULE_ENDORSEMENT_PROPOSAL_MISMATCH
RULE_DUPLICATE_ENDORSER
RULE_ENDORSED_STATE_VERSION_STALE
```

These failures must generate attempt-audit evidence and learner-facing
feedback.

They must not:

- Create ledger mutations.
- Change asset versions.
- Enter a block.
- Affect existing block hashes.
- Appear as accepted transactions.

## 12. First learner-facing signature integration

Integrate signatures and authorization selectively.

Do not add a separate signing screen to every stage.

### Stage 3: Certificate

This is the principal teaching example.

Required cases:

1. Valid signature, recognized certifier, authorized action.
2. Valid signature, recognized transporter, unauthorized certificate action.
3. Unknown educational identity.
4. Modified signed proposal causing verification failure.

The main result should explain:

```text
Signature: Valid
Signer: Việt Logistics
Identity: Recognized
Authorization to issue certificate: Denied
Result: Transaction rejected
```

The learner should see that a cryptographically valid signature may still fail
authorization.

### Stage 9: Recall

Use the current trusted regulator handoff.

Required cases:

- Recall signed under unauthorized active role.
- Regulator handoff.
- Authorized regulator signature.
- Successful recall commitment.

The first unauthorized action remains an attempt-audit event. The later
authorized action remains a separate command and accepted event.

### Stage 8: Verification demonstration

Add an optional collapsed signature-tamper demonstration:

- Verify a signed transaction copy.
- Modify one character.
- Recompute the proposal digest.
- Verify that the original signature no longer matches.

Do not add new academic points for this demonstration.

## 13. Core UI design

Keep the existing transaction action and button labels.

Do not require learners to:

- Generate a key pair.
- Import a key.
- Enter a private key.
- Paste a signature.
- Select a cryptographic algorithm.
- Manage a wallet.
- Type a public key.

Show one compact component:

```text
Identity and authorization

Signature
Valid

Signer
Việt Logistics

Identity
Recognized

Authorization
Not permitted to issue certificates
```

Use a separate result for data truth:

```text
Does this prove the certificate information is true?
No. The signature proves approval of the signed content, not the truth of the original claim.
```

Provide an expandable section:

```text
View technical evidence
```

It may show:

- Algorithm.
- Proposal digest.
- Key ID.
- Public-key fingerprint.
- Shortened signature.
- Signed state versions.
- Verification result.

Do not show private-key material.

Do not place full keys or signatures in the main flow.

## 14. Accessible presentation

Requirements:

- Status must use text, not color alone.
- The compact result must use a logical reading order.
- Raw signature and public-key values must not be announced automatically.
- Long values must wrap safely at 320 px.
- Copy controls require accessible names.
- Dynamic verification results should be announced once.
- Technical evidence should use native disclosure behavior where practical.
- The focused control must not be hidden by the sticky header.
- The same component must work in Vietnamese and English.

Example live announcement:

```text
Chữ ký hợp lệ, nhưng Việt Logistics không có quyền cấp chứng nhận. Giao dịch bị từ chối.
```

## 15. Independent verification bundle

Add an optional technical-evidence export or copy action.

A verification bundle should contain:

```ts
interface SignatureVerificationBundleV1 {
  readonly schemaVersion: "1";
  readonly proposal: TransactionProposalV1;
  readonly proposalDigest: string;
  readonly signatureStatement: SignatureStatementV1;
  readonly signature: SignatureEnvelope;
  readonly publicKeySpkiBase64Url: string;
}
```

Add a developer verifier:

```text
npm run verify:signature-evidence -- <bundle.json>
```

The verifier must:

- Canonicalize the proposal.
- Recompute its digest.
- Reconstruct the signature statement.
- Verify the signature independently.
- Report mismatches clearly.
- Exit nonzero on failure.

Do not make evidence export a required learner action in Guided mode.

## 16. Signature and authorization scoring

Do not add new points.

Preserve:

- Total score: 100.
- Operational points: 39.
- Knowledge points: 61.
- Existing item IDs.
- Existing hint mappings.
- Existing mitigation ceilings.

Signature and authorization checks contribute to whether existing business
actions are accepted.

Examples:

- Certificate issuance still scores through the current certificate items.
- Recall authorization still scores through `INT_RECALL_COMMITTED`.
- Signature evidence does not create a new scorable item.

The causal report may add diagnostic explanations about:

- Signature validity.
- Identity recognition.
- Authorization.
- Governance quality.

Diagnostic dimensions remain non-grade outputs.

## 17. Signature increment acceptance gate

Complete all of the following before endorsement work begins:

- Ed25519 capability passes in every browser project.
- Fixed-key signing and verification pass.
- Known test vectors pass.
- Independent Node verification passes.
- Same key and message produce identical signatures.
- Proposal tampering invalidates the signature.
- Key substitution invalidates identity resolution.
- Unknown signer fails safely.
- Expired and revoked key status tests pass.
- Authorized and unauthorized role cases pass.
- Stage 3 UI is complete.
- Stage 9 authorization flow is complete.
- Stage 8 optional tamper inspection is complete.
- SL1 replay reproduces signature evidence exactly.
- Worst-case suspend data remains within the current limit.
- Guided and Challenge packages pass browser and Moodle acceptance.
- Existing behavior remains unchanged when `digitalSignatures` is disabled.
- Full `npm run quality` and Playwright matrix pass.

Do not start endorsement integration with a red gate.

Increment A gate record:

- `npm run quality` passed, including 536 unit/integration tests and 131/131
  SCORM package-verification checks.
- The complete Playwright matrix passed with 87 tests and five documented
  platform-specific skips across Chromium, Firefox, WebKit, and Mobile Safari.
- Guided and Challenge A each passed a real Moodle new-attempt,
  mid-signature-resume, authorization-handoff, final-report, completion, score,
  and gradebook walkthrough. Their completed SL1 payloads were 1,041 and 1,096
  characters.
- The authored worst cases, which fill every permitted journal entry and
  bounded text field, are 1,980 characters for Guided and 1,985 for Challenge
  A, below the unchanged 3,800-character internal ceiling.
- Both packages passed offline SCORM verification and share static application
  build hash
  `2f5fbbd021a350c50031885edf1580cb581f5b8271380a101260480d1b43a152`.

# Endorsement increment

## 18. Endorsement concept

An endorsement is a genuine signature by an organization over the exact same
proposal digest.

A policy answers:

> Which organizations must sign the same proposed action before it may be
> committed?

Endorsement is not:

- A checkbox without a signature.
- Authorization.
- A retry.
- A ledger transaction by itself.
- Proof that the business statement is true.
- Consensus for the whole network.

Individual endorsement collection is simulation history. The final committed
transaction may include an endorsement summary.

## 19. Endorsement model

Define:

```ts
interface EndorsementRecord {
  readonly endorsementId: string;
  readonly proposalId: string;
  readonly proposalDigest: string;

  readonly organizationId: string;
  readonly roleId: string;
  readonly keyId: string;

  readonly signature: SignatureEnvelope;
  readonly endorsedAt: string;
}
```

The endorser must sign the same proposal digest and expected state versions.

If the proposal changes:

- Generate a new proposal ID and digest.
- Preserve prior endorsements in history.
- Mark prior endorsements as no longer applicable.
- Require new endorsements.
- Do not silently transfer endorsements to the revised proposal.

## 20. Policy expression model

Support a constrained, serializable policy tree:

```ts
type EndorsementPolicyExpression =
  | {
      readonly kind: "SIGNED_BY";
      readonly organizationId: string;
    }
  | {
      readonly kind: "ALL_OF";
      readonly policies:
        readonly EndorsementPolicyExpression[];
    }
  | {
      readonly kind: "ANY_OF";
      readonly policies:
        readonly EndorsementPolicyExpression[];
    }
  | {
      readonly kind: "THRESHOLD";
      readonly required: number;
      readonly organizationIds:
        readonly string[];
    };

interface EndorsementPolicyDefinition {
  readonly endorsementPolicyId: string;
  readonly appliesToCommandTypes:
    readonly string[];

  readonly expression:
    EndorsementPolicyExpression;

  readonly localizationKey: string;
}
```

Do not support arbitrary JavaScript expressions in scenario files.

Scenario validation must reject:

- Unknown organizations.
- Empty `ALL_OF` or `ANY_OF`.
- Threshold below 1.
- Threshold greater than unique organization count.
- Duplicate organization IDs.
- Cyclic references.
- A policy that no permitted role can satisfy.
- Endorsement policies enabled without digital signatures.
- Command types with multiple ambiguous policies.

## 21. Endorsement evaluation

Return a structured result:

```ts
interface EndorsementEvaluation {
  readonly endorsementPolicyId: string;
  readonly satisfied: boolean;

  readonly validEndorsementIds:
    readonly string[];

  readonly invalidEndorsementIds:
    readonly string[];

  readonly missingOrganizationIds:
    readonly string[];

  readonly duplicateOrganizationIds:
    readonly string[];

  readonly proposalMismatchIds:
    readonly string[];

  readonly unauthorizedEndorserIds:
    readonly string[];
}
```

Rules:

- One organization counts at most once.
- Every counted endorsement must have a valid signature.
- Every counted endorsement must use a recognized, active key.
- The organization must be authorized to endorse that command type.
- Every endorsement must refer to the exact same proposal digest.
- Every endorsement must bind the same expected state versions.
- Endorsements do not override stale-state validation.
- A policy may be satisfied cryptographically and still fail later because the
  state changed before commitment.

## 22. Pending proposal lifecycle

Do not place a transaction in the ledger before its policy is satisfied.

Use a lifecycle equivalent to:

```text
Proposal created
Proposal signed by submitter
Endorsements collected
Policy evaluated
State versions revalidated
Transaction committed or rejected
```

Represent proposal and endorsement actions as simulation decision events, not
ledger mutation events.

Recommended commands:

```text
CREATE_TRANSACTION_PROPOSAL
ENDORSE_TRANSACTION_PROPOSAL
DECLINE_TRANSACTION_PROPOSAL
COMMIT_ENDORSED_TRANSACTION
REVISE_TRANSACTION_PROPOSAL
```

Requirements:

- Proposal creation creates no ledger mutation.
- Endorsement creates no ledger mutation.
- Declining creates an accepted business-decision event, not a fake
  endorsement.
- Invalid endorsement submission creates an attempt-audit event.
- Final commitment creates the existing ledger mutation event.
- The committed ledger transaction includes an endorsement summary or policy
  evidence reference.
- All state changes remain transactional with the current persistence adapter.

## 23. Single-learner role handoff

SimuLedger remains a single-learner SCORM simulation.

The learner sequentially acts for different organizations.

Use trusted scenario-controlled role handoff:

1. Learner creates a proposal under the submitting organization.
2. Initial proposal becomes read-only.
3. Scenario offers an authorized organizational handoff.
4. Learner reviews the exact proposal under the endorser role.
5. Learner endorses or declines.
6. The orchestrator creates signer metadata from trusted role context.
7. The policy evaluator updates.
8. Once satisfied, the learner commits the endorsed transaction.

The command payload must not contain a learner-entered organization identity.

Guided mode:

- Clearly names the required organization.
- Explains why its endorsement is needed.
- Shows policy progress.

Challenge mode:

- States that additional approval is required.
- Provides less guidance about the correct organization.
- Does not allow arbitrary identity claims.

## 24. First integrated endorsement policies

Implement two scenario-integrated policies.

### 24.1 Custody transfer

Policy:

```text
Current custodian AND receiving custodian
```

Purpose:

- Sender confirms release.
- Receiver confirms acceptance.
- The ledger does not treat a unilateral sender claim as completed custody
  transfer.

Flow:

1. Sender creates and signs the transfer proposal.
2. Receiver reviews the proposal.
3. Receiver endorses.
4. Policy becomes satisfied.
5. Current state version is rechecked.
6. Transfer commits.

### 24.2 Quantity correction

Policy:

```text
Producer AND Processor
```

Purpose:

- Producer confirms the original declaration and proposed correction.
- Processor confirms the quantity physically received or measured.
- Neither organization may unilaterally rewrite the effective quantity.

Flow:

1. Processor creates the correction proposal.
2. Processor signs it.
3. Producer reviews and endorses.
4. Policy becomes satisfied.
5. State version is rechecked.
6. Correction commits as the existing append-only correction transaction.

The proposal must retain:

- Original transaction reference.
- Original value.
- Corrected value.
- Reason.
- Expected asset version.

Do not require regulator endorsement in this first integrated release.

Support regulator-required and threshold policies in the policy engine and
tests, but defer their learner-facing scenario use.

## 25. Endorsement UI

Add a compact policy panel:

```text
Required approval

Producer
Signed and verified

Processor
Awaiting approval

Policy status
1 of 2 required organizations
```

When satisfied:

```text
Producer
Signed and verified

Processor
Signed and verified

Policy status
Requirements satisfied
```

Expandable technical evidence may show:

- Policy expression.
- Proposal digest.
- Endorser organization.
- Key ID.
- Public-key fingerprint.
- Signature verification.
- Signed state versions.

Do not show a large raw-signature table by default.

Do not present the policy as network consensus.

## 26. Proposal disagreement demonstration

Add a controlled test and optional technical explanation:

- Producer endorses proposal digest A.
- Processor attempts to endorse modified proposal digest B.
- Both individual signatures may be valid.
- The policy is not satisfied because the organizations approved different
  content.

Learner-facing explanation:

```text
Both signatures are valid, but the organizations signed different transaction contents. The endorsement requirement is not satisfied.
```

This should use the current canonical serialization and SHA-256 proposal
digest.

## 27. Stale-state demonstration

Add a deterministic integration test and, where pedagogically appropriate, a
Challenge consequence:

1. Required endorsements are collected for asset version 4.
2. Another accepted transaction changes the asset to version 5.
3. Endorsement policy remains cryptographically satisfied.
4. Final commitment fails stale-state validation.
5. A revised proposal and new endorsements are required.

This demonstrates that:

- Valid signatures are not enough.
- Authorization is not enough.
- Endorsement is not enough.
- State validity is checked at commitment.

Do not add a separate state-version laboratory in this release.

## 28. Endorsement scoring

Do not add new points.

Preserve the exact 100-point contract and 39/61 split.

For existing operational actions:

- The item earns its existing score only when the required endorsed transaction
  commits.
- Missing endorsement means the action is incomplete, not a new scored item.
- Invalid or unauthorized endorsement attempts may appear in the causal report
  and governance diagnostic.
- No new hint is added in this release.
- Existing hints retain their exact target IDs and score behavior.

Do not change the current correction mitigation cap or retry ladder without an
explicit product decision.

## 29. Causal report additions

Add non-grade report evidence for:

- Valid or invalid signature.
- Recognized or unknown identity.
- Authorized or unauthorized action.
- Endorsement policy selected by the scenario.
- Missing endorsements.
- Organizations that endorsed.
- Proposal disagreement.
- Stale endorsed proposal.
- Final commitment result.

Example:

```text
The processor proposed a quantity correction and both the processor and producer endorsed the same proposal. The transaction was committed after the policy and asset version were verified.
```

Or:

```text
The producer and processor produced valid signatures, but they signed different correction values. The endorsement policy was not satisfied and no correction entered the ledger.
```

## 30. Configuration and packaging

Use the existing configuration flags:

```ts
technicalFeatures: {
  digitalSignatures: boolean;
  endorsementPolicies: boolean;
}
```

Validation rules:

- `endorsementPolicies: true` requires `digitalSignatures: true`.
- Signatures require a valid identity registry and educational key fixture.
- Endorsements require applicable scenario policies.
- A package must not enable incomplete cryptographic content.
- Configuration and scenario hashes must cover identity, authorization, and
  endorsement-policy references.
- Package metadata must record the cryptographic evidence schema version.
- Guided and Challenge packages must continue sharing identical static
  application assets.

Enable digital signatures and endorsement policies in new versioned Guided and
Challenge package configurations after both increments pass acceptance.

Preserve tests proving behavior remains unchanged when both flags are disabled.

## 31. Package verifier additions

Extend the SCORM package verifier to check:

- Identity registry exists when signatures are enabled.
- Educational key fixture exists and is marked educational-only.
- Every public/private fixture pair matches.
- Every authorization policy references valid organizations and roles.
- Every endorsement policy passes scenario validation.
- Endorsements cannot be enabled without signatures.
- Cryptographic runtime files match recorded hashes.
- No private key appears in learner-facing HTML or locale files.
- Build metadata describes real versus simulated mechanisms accurately.
- Static application assets remain identical across Guided and Challenge
  packages.
- Offline signing and verification work without network access.

## 32. Testing requirements

### Cryptographic unit tests

- Ed25519 known-answer vectors.
- Repeated signing produces identical signatures.
- Valid signature verifies.
- Modified proposal fails.
- Modified signature fails.
- Wrong public key fails.
- Key fingerprint stable.
- Base64url encoding round-trips.
- Canonical proposal digest stable.
- Cross-environment independent verification.

### Identity and authorization tests

- Recognized active signer.
- Unknown signer.
- Expired key.
- Revoked key.
- Key belongs to another organization.
- Actor-context mismatch.
- Allowed organization and role.
- Allowed organization with wrong role.
- Wrong organization with allowed role.
- Valid signature but unauthorized action.
- Invalid signature but otherwise authorized action.

### Endorsement-policy tests

- `SIGNED_BY`.
- `ALL_OF`.
- `ANY_OF`.
- `THRESHOLD`.
- Duplicate signer counts once.
- Missing signer.
- Invalid signature excluded.
- Unauthorized endorser excluded.
- Proposal digest mismatch.
- State-version mismatch.
- Impossible policy rejected by scenario validation.
- Policy serialization deterministic.
- Policy explanation localization complete.

### Event and ledger tests

- Proposal and endorsement events never enter ledger projections.
- Attempt-audit events never enter ledger projections.
- Only final accepted transaction creates ledger mutations.
- Asset version increments exactly once.
- Rejected final commitment changes no asset state.
- Endorsement summary in committed transaction matches verified evidence.
- Existing block and transaction hashing remains correct.

### Replay and persistence tests

- Live and replayed signatures are byte-identical.
- Live and replayed policy results are identical.
- Journal stores compact replay inputs rather than redundant signatures.
- Worst-case state remains under the internal limit.
- Mid-proposal resume restores collected endorsements.
- Resume before final commit preserves pending policy state.
- Resume after commit does not duplicate events.
- Duplicate command delivery is idempotent.
- Configuration mismatch remains incompatible.

### UI and accessibility tests

- Compact trust summary.
- Expandable evidence panel.
- No private key displayed.
- Long signatures wrap at 320 px.
- Screen-reader announcement concise.
- Status not color-only.
- Keyboard role handoff.
- Guided policy progress.
- Challenge reduced guidance.
- Proposal mismatch explanation.
- Stale endorsement explanation.

### Browser matrix

Run all cryptographic and integrated flows in:

- Chromium.
- Firefox.
- WebKit.
- Mobile Safari.

Do not accept unit-test-only browser compatibility.

### Moodle acceptance

For Guided and Challenge packages:

- New attempt.
- Mid-signature resume.
- Mid-endorsement resume.
- Role handoff.
- Valid signature acceptance.
- Unauthorized valid signature rejection.
- Endorsement collection.
- Final commitment.
- Score reporting.
- Completion and success status.
- Review mode.
- Suspend-data bound.
- Offline package operation.

## 33. Incremental delivery sequence

### Increment A: Signature and authorization

1. Characterize current behavior with both flags disabled.
2. Add Ed25519 capability spike and provider interface.
3. Add fixed educational key fixtures and identity registry.
4. Add proposal and signature schemas.
5. Add canonical proposal digest.
6. Add signature generation and verification.
7. Add authorization policy model and evaluator.
8. Add validation rule IDs and audit outcomes.
9. Add compact trust-summary UI.
10. Integrate Stage 3.
11. Integrate Stage 9.
12. Add optional Stage 8 tamper verification.
13. Add independent evidence verifier.
14. Extend SL1 replay and size tests.
15. Extend package verification.
16. Run full quality, browser, SCORM, and Moodle gates.

Stop if any gate is red.

### Increment B: Endorsement policies

1. Add endorsement record model.
2. Add constrained policy-expression schema.
3. Add policy validator and evaluator.
4. Add pending proposal lifecycle.
5. Add endorsement role-handoff commands.
6. Integrate sender-and-receiver custody policy.
7. Integrate producer-and-processor correction policy.
8. Add proposal disagreement behavior.
9. Add stale endorsed-proposal behavior.
10. Add compact policy-progress UI.
11. Extend causal report.
12. Extend SL1 replay and size tests.
13. Extend package verification.
14. Run full quality, browser, SCORM, and Moodle gates.

Do not start a policy-authoring interface.

Increment B gate record:

- `npm run quality` passed, including 573 unit/integration tests and 143/143
  SCORM package-verification checks.
- The complete Playwright matrix passed with 91 tests and five documented
  platform-specific skips across Chromium, Firefox, WebKit, and Mobile Safari.
- Guided 2.2.0 and Challenge A 1.1.0 each passed a real Moodle new-attempt,
  mid-endorsement-resume, trusted role-handoff, genuine endorsement,
  policy-satisfaction, final-validation, and ledger-commit walkthrough. The
  common Moodle acceptance harness also passed byte-identical resume, score and
  status persistence, gradebook reporting, highest-attempt preservation, and a
  4,096-character storage-boundary round trip for each deployed package.
- The actual authored worst cases, which fill every permitted endorsement
  journal entry and bounded text field, are 2,281 characters for Guided and
  2,287 for Challenge A, below the unchanged 3,800-character internal ceiling.
- The exact 100-point contract remains unchanged: 39 operational points and 61
  knowledge points, with no new scorable item, hint target, or mitigation
  ceiling.
- Both offline-verified development packages share static application build
  hash
  `12b5420460403eb5d35aac1187e2ee5b6bfdbac2c8dbdcdc1180a762fc29c1f4`.
  Because the source tree was intentionally uncommitted during acceptance,
  their filenames carry `_NON_RELEASE` and their metadata marks them dirty,
  non-release artifacts.

## 34. Final acceptance criteria

The work is complete only when:

- Signature calculations are genuine and independently verifiable.
- The app clearly distinguishes identity, signature validity, authorization,
  endorsement, state validity, and data truth.
- Educational key custody is honestly described as simulated.
- No learner manually handles a private key.
- Existing business-first UI remains recognizable.
- Digital signatures do not add a mandatory extra screen to every transaction.
- Stage 3 demonstrates valid signature but unauthorized action.
- Stage 9 demonstrates regulator authorization.
- Custody transfer requires sender and receiver endorsement.
- Quantity correction requires producer and processor endorsement.
- Different proposal contents cannot satisfy one policy.
- Stale endorsed transactions cannot commit.
- Pending proposals and endorsements survive SCORM resume.
- Rejected evidence never enters the ledger.
- The exact 100-point and 39/61 scoring contract remains unchanged.
- Guided and Challenge packages share one static application build.
- Both packages work offline.
- All supported browsers pass.
- Moodle acceptance passes for both packages.
- Full `npm run quality` passes.

## 35. Explicitly deferred

Do not implement in this release:

- Production identities.
- Production PKI.
- Secure hardware keys.
- Real user authentication.
- Key passwords.
- Learner-generated key pairs.
- Key compromise scenario.
- Learner-facing key revocation workflow.
- Generic policy editor.
- Risk-based policy authoring UI.
- Regulator-required endorsement in the core scenario.
- Lecturer graphical builder.
- Technical-lab package.
- Multi-user backend.
- Real-time collaboration.
- Merkle tree.
- Proof of work.
- Mining.
- Cryptocurrency.

## Final implementation report

Report:

1. Starting commit.
2. Final commit.
3. Signature algorithm and provider.
4. Browser capability results.
5. Identity and key-fixture design.
6. Proposal canonicalization design.
7. Authorization policy model.
8. Integrated Stage 3 and Stage 9 behavior.
9. Endorsement policy model.
10. Custody-transfer policy behavior.
11. Quantity-correction policy behavior.
12. SL1 persistence and size impact.
13. Independent verification results.
14. Scoring confirmation.
15. Guided package results.
16. Challenge package results.
17. Browser matrix results.
18. Moodle acceptance results.
19. Files and documentation changed.
20. Remaining limitations.
21. Confirmation that no deferred feature was added.

This plan keeps the UI impact contained: automatic signing, one compact trust
summary, optional technical details, and focused endorsement steps only where
multi-organization approval has a clear business purpose.

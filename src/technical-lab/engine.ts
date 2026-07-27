import { evaluateEndorsementPolicy } from "../crypto/endorsements/policy-evaluator";
import {
  decodeBase64Url,
} from "../crypto/signatures/base64url";
import { NobleEd25519Provider } from "../crypto/signatures/noble-ed25519-provider";
import {
  canonicalBytes,
  proposalDigest,
} from "../crypto/signatures/proposal";
import {
  demonstrateSignatureTamper,
  signAndVerifyProposal,
} from "../crypto/signatures/signing-service";
import type {
  EndorsementPolicyDefinition,
  EndorsementRecord,
  CryptographicRuntime,
  SignatureTrustEvidence,
  TransactionProposalV1,
} from "../crypto/signatures/types";
import { canonicalize } from "../infrastructure/hashing/canonicalize";
import { sha256Hex } from "../infrastructure/hashing/sha256";
import { coffeeRuntime } from "../scenarios/coffee-traceability/runtime";
import type {
  TrustedExecutionContext,
} from "../domain/simulation/types";
import type {
  FirstTechnicalLabModuleId,
  TechnicalExperimentActionType,
  TechnicalLabCheckpointDefinition,
  TechnicalLabModuleDefinition,
  TechnicalLabPackBundle,
} from "./contracts";
import { TechnicalLabCommandType } from "./cryptographic-contract";

export interface TechnicalLabActionJournalEntry {
  readonly moduleIndex: number;
  readonly experimentIndex: number;
  readonly stepIndex: number;
  readonly occurrenceIndex: number;
  readonly operandA: number;
  readonly operandB: number;
}

export type TechnicalLabCheckpointKind =
  | "INTERPRETATION"
  | "APPLICATION";

export interface TechnicalLabResponseJournalEntry {
  readonly moduleIndex: number;
  readonly kind: TechnicalLabCheckpointKind;
  readonly optionIndex: number;
  readonly attemptNumber: number;
}

export interface TechnicalLabSnapshot {
  readonly currentModuleIndex: number;
  readonly actionJournal:
    readonly TechnicalLabActionJournalEntry[];
  readonly responseJournal:
    readonly TechnicalLabResponseJournalEntry[];
  readonly hintModuleIndexes: readonly number[];
}

export interface TechnicalLabExpectedAction {
  readonly moduleId: FirstTechnicalLabModuleId;
  readonly experimentIndex: number;
  readonly stepIndex: number;
  readonly occurrenceIndex: number;
  readonly actionType: TechnicalExperimentActionType;
}

export type TechnicalLabEvidenceStatus =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "NEUTRAL";

export interface TechnicalLabEvidenceField {
  readonly fieldId: string;
  readonly labelKey: string;
  readonly value: string | number | boolean;
  readonly status: TechnicalLabEvidenceStatus;
  readonly monospace?: boolean;
  readonly revealAfterActionCount: number;
}

export interface TechnicalLabModuleEvidence {
  readonly moduleId: FirstTechnicalLabModuleId;
  readonly fields: readonly TechnicalLabEvidenceField[];
}

export interface TechnicalLabCheckpointProjection {
  readonly definition: TechnicalLabCheckpointDefinition;
  readonly attempts: number;
  readonly selectedOptionId: string | null;
  readonly correct: boolean;
  readonly terminal: boolean;
  readonly earnedPoints: number;
  readonly maximumPoints: number;
  readonly hintCeilingApplied: boolean;
}

export interface TechnicalLabModuleProjection {
  readonly module: TechnicalLabModuleDefinition;
  readonly locked: boolean;
  readonly current: boolean;
  readonly experimentActionCount: number;
  readonly experimentActionMaximum: number;
  readonly experimentComplete: boolean;
  readonly interpretation: TechnicalLabCheckpointProjection;
  readonly application: TechnicalLabCheckpointProjection;
  readonly hintOpened: boolean;
  readonly complete: boolean;
  readonly score: number;
  readonly maximumScore: number;
  readonly evidence: TechnicalLabModuleEvidence | null;
}

export interface TechnicalLabScoreProjection {
  readonly experimentScore: number;
  readonly interpretationScore: number;
  readonly applicationScore: number;
  readonly totalScore: number;
  readonly maximumScore: 100;
  readonly passScore: number;
  readonly passed: boolean;
}

export interface TechnicalLabReplay {
  readonly snapshot: TechnicalLabSnapshot;
  readonly modules: readonly TechnicalLabModuleProjection[];
  readonly score: TechnicalLabScoreProjection;
  readonly complete: boolean;
  readonly expectedAction: TechnicalLabExpectedAction | null;
}

export interface TechnicalLabEngineRuntime {
  readonly configurationHash: string;
  readonly bundle: TechnicalLabPackBundle;
  readonly cryptographicRuntime: CryptographicRuntime;
}

const SESSION_ID = "SES_TECHNICAL_LAB_V1";
const FIXED_TIME = "2026-01-15T04:00:00.000Z";
const LAB_SCENARIO_ID =
  "LAB_PERMISSIONED_BLOCKCHAIN_FOUNDATIONS";
const LAB_SCENARIO_VERSION = "1.0.0";

export function emptyTechnicalLabSnapshot(): TechnicalLabSnapshot {
  return {
    currentModuleIndex: 0,
    actionJournal: [],
    responseJournal: [],
    hintModuleIndexes: [],
  };
}

function trusted(contextId: string): TrustedExecutionContext {
  const context = coffeeRuntime.trustedContexts.find(
    (candidate) => candidate.contextId === contextId,
  );
  if (context === undefined) {
    throw new Error(
      `Technical Laboratory trusted context "${contextId}" is missing`,
    );
  }
  return context;
}

function fixtureFor(
  bundle: TechnicalLabPackBundle,
  moduleId: FirstTechnicalLabModuleId,
) {
  const fixture = bundle.fixtures.find(
    (candidate) => candidate.fixtureId === `${moduleId}_FIXTURE`,
  );
  if (fixture === undefined) {
    throw new Error(`Fixture for "${moduleId}" is missing`);
  }
  return fixture;
}

function proposal(options: {
  readonly configurationHash: string;
  readonly proposalId: string;
  readonly commandType: string;
  readonly commandPayload: unknown;
  readonly expectedStateVersions?: Readonly<Record<string, number>>;
}): TransactionProposalV1 {
  return {
    domain: "TRACECHAIN_TRANSACTION_PROPOSAL_V1",
    configurationHash: options.configurationHash,
    scenarioId: LAB_SCENARIO_ID,
    scenarioVersion: LAB_SCENARIO_VERSION,
    sessionId: SESSION_ID,
    proposalId: options.proposalId,
    commandType: options.commandType,
    commandPayload: options.commandPayload,
    expectedStateVersions: options.expectedStateVersions ?? {},
    proposedAt: FIXED_TIME,
  };
}

function evidenceRecord(
  endorsementId: string,
  evidence: SignatureTrustEvidence,
): EndorsementRecord {
  return {
    endorsementId,
    proposalId: evidence.proposal.proposalId,
    proposalDigest: evidence.proposalDigest,
    organizationId: evidence.signature.organizationId,
    roleId: evidence.signature.roleId,
    keyId: evidence.signature.keyId,
    signature: evidence.signature,
    endorsedAt: evidence.signature.signedAt,
    verification: evidence,
  };
}

async function signProposal(
  cryptographicRuntime: CryptographicRuntime,
  value: TransactionProposalV1,
  contextId: string,
  authorizationCommandType: string,
  purpose: "PROPOSAL_SUBMISSION" | "ENDORSEMENT",
): Promise<SignatureTrustEvidence> {
  return signAndVerifyProposal({
    proposal: value,
    trustedContext: trusted(contextId),
    authorizationCommandType,
    signedAt: FIXED_TIME,
    purpose,
    runtime: cryptographicRuntime,
    provider: new NobleEd25519Provider(),
  });
}

function moduleActions(
  module: TechnicalLabModuleDefinition,
): readonly TechnicalLabExpectedAction[] {
  return module.experimentDefinitions.flatMap(
    (experiment, experimentIndex) =>
      experiment.steps.flatMap((step, stepIndex) =>
        Array.from(
          { length: step.maximumOccurrences },
          (_unused, occurrenceIndex) => ({
            moduleId: module.moduleId,
            experimentIndex,
            stepIndex,
            occurrenceIndex,
            actionType: step.actionType,
          }),
        ),
      ),
  );
}

function entriesForModule(
  snapshot: TechnicalLabSnapshot,
  moduleIndex: number,
): readonly TechnicalLabActionJournalEntry[] {
  return snapshot.actionJournal.filter(
    (entry) => entry.moduleIndex === moduleIndex,
  );
}

function responseEntries(
  snapshot: TechnicalLabSnapshot,
  moduleIndex: number,
  kind: TechnicalLabCheckpointKind,
): readonly TechnicalLabResponseJournalEntry[] {
  return snapshot.responseJournal.filter(
    (entry) =>
      entry.moduleIndex === moduleIndex && entry.kind === kind,
  );
}

function checkpointDefinition(
  module: TechnicalLabModuleDefinition,
  kind: TechnicalLabCheckpointKind,
): TechnicalLabCheckpointDefinition {
  return kind === "INTERPRETATION"
    ? module.interpretationItem
    : module.applicationItem;
}

function assertActionOperands(
  entry: Pick<
    TechnicalLabActionJournalEntry,
    "operandA" | "operandB"
  >,
  step: TechnicalLabModuleDefinition["experimentDefinitions"][number]["steps"][number],
): void {
  if (step.actionType !== "EDIT_INPUT") {
    if (entry.operandA !== 0 || entry.operandB !== 0) {
      throw new Error(
        "Only a bounded edit action may carry laboratory operands",
      );
    }
    return;
  }
  if (
    !Number.isInteger(entry.operandA) ||
    entry.operandA < 0 ||
    entry.operandA >=
      (step.editConstraint?.maximumInputUtf8Bytes ?? 0) ||
    !Number.isInteger(entry.operandB) ||
    entry.operandB < 0 ||
    entry.operandB > 1_114_111 ||
    (entry.operandB >= 0xd800 && entry.operandB <= 0xdfff)
  ) {
    throw new Error(
      "The bounded laboratory input edit is invalid",
    );
  }
}

function allocationFor(
  bundle: TechnicalLabPackBundle,
  moduleId: FirstTechnicalLabModuleId,
) {
  const allocation =
    bundle.pack.scoringContract.moduleAllocations.find(
      (candidate) => candidate.moduleId === moduleId,
    );
  if (allocation === undefined) {
    throw new Error(`Score allocation for "${moduleId}" is missing`);
  }
  return allocation;
}

function checkpointProjection(options: {
  readonly snapshot: TechnicalLabSnapshot;
  readonly module: TechnicalLabModuleDefinition;
  readonly moduleIndex: number;
  readonly kind: TechnicalLabCheckpointKind;
  readonly maximumPoints: number;
}): TechnicalLabCheckpointProjection {
  const definition = checkpointDefinition(
    options.module,
    options.kind,
  );
  const responses = responseEntries(
    options.snapshot,
    options.moduleIndex,
    options.kind,
  );
  const last = responses.at(-1);
  const selectedOption =
    last === undefined
      ? undefined
      : definition.options[last.optionIndex];
  const correct =
    selectedOption?.optionId === definition.correctOptionId;
  const terminal =
    correct || responses.length >= definition.maximumAttempts;
  const hintCeilingApplied =
    options.kind === "INTERPRETATION" &&
    options.snapshot.hintModuleIndexes.includes(options.moduleIndex);
  const retryFraction =
    !correct
      ? 0
      : responses.length === 1
        ? 1
        : responses.length === 2
          ? 0.5
          : 0;
  const ceiling = hintCeilingApplied
    ? options.module.hint.maximumAwardFraction
    : 1;
  return {
    definition,
    attempts: responses.length,
    selectedOptionId: selectedOption?.optionId ?? null,
    correct,
    terminal,
    earnedPoints: Math.round(
      options.maximumPoints *
        Math.min(retryFraction, ceiling) *
        100,
    ) / 100,
    maximumPoints: options.maximumPoints,
    hintCeilingApplied,
  };
}

function bitDifference(first: string, second: string): number {
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    const left = Number.parseInt(first[index] ?? "0", 16);
    const right = Number.parseInt(second[index] ?? "0", 16);
    let xor = left ^ right;
    while (xor > 0) {
      difference += xor & 1;
      xor >>>= 1;
    }
  }
  return difference;
}

function mutatedContent(
  source: string,
  entry: TechnicalLabActionJournalEntry | undefined,
): string {
  const characters = [...source];
  const fallbackPosition = Math.max(0, characters.length - 1);
  const position = Math.min(
    fallbackPosition,
    Math.max(0, entry?.operandA ?? fallbackPosition),
  );
  const replacementCodePoint = entry?.operandB ?? 88;
  const replacement = String.fromCodePoint(replacementCodePoint);
  characters[position] =
    characters[position] === replacement ? "Y" : replacement;
  return characters.join("");
}

function field(
  fieldId: string,
  labelKey: string,
  value: string | number | boolean,
  revealAfterActionCount: number,
  status: TechnicalLabEvidenceStatus = "NEUTRAL",
  monospace = false,
): TechnicalLabEvidenceField {
  return {
    fieldId,
    labelKey,
    value,
    status,
    revealAfterActionCount,
    ...(monospace ? { monospace: true } : {}),
  };
}

async function tl1Evidence(
  runtime: TechnicalLabEngineRuntime,
  entries: readonly TechnicalLabActionJournalEntry[],
): Promise<TechnicalLabModuleEvidence> {
  const fixture = fixtureFor(runtime.bundle, "TL1");
  const source = String(fixture.initialInput.content);
  const changed = mutatedContent(
    source,
    entries.find((entry) => {
      const module = runtime.bundle.modules[0]!;
      return (
        module.experimentDefinitions[entry.experimentIndex]?.steps[
          entry.stepIndex
        ]?.actionType === "EDIT_INPUT"
      );
    }),
  );
  const originalDigest = sha256Hex(source);
  const changedDigest = sha256Hex(changed);
  return {
    moduleId: "TL1",
    fields: [
      field("originalInput", "technicalLab.evidence.originalInput", source, 1),
      field("originalDigest", "technicalLab.evidence.originalDigest", originalDigest, 2, "PASS", true),
      field("modifiedInput", "technicalLab.evidence.modifiedInput", changed, 3),
      field("modifiedDigest", "technicalLab.evidence.modifiedDigest", changedDigest, 4, "WARN", true),
      field("digestMatch", "technicalLab.evidence.digestMatch", originalDigest === changedDigest, 5, "FAIL"),
      field("differentBits", "technicalLab.evidence.differentBits", bitDifference(originalDigest, changedDigest), 5),
      field("originalIntegrity", "technicalLab.evidence.originalIntegrity", sha256Hex(source) === originalDigest, 5, "PASS"),
    ],
  };
}

async function tl2Evidence(
  runtime: TechnicalLabEngineRuntime,
): Promise<TechnicalLabModuleEvidence> {
  const fixture = fixtureFor(runtime.bundle, "TL2");
  const recordA = fixture.initialInput.recordA;
  const recordB = fixture.initialInput.recordB;
  const ordinaryA = JSON.stringify(recordA);
  const ordinaryB = JSON.stringify(recordB);
  const canonicalA = canonicalize(recordA);
  const canonicalB = canonicalize(recordB);
  let unsupportedRejected = false;
  try {
    canonicalize({ unsupported: Number.POSITIVE_INFINITY });
  } catch {
    unsupportedRejected = true;
  }
  return {
    moduleId: "TL2",
    fields: [
      field("ordinaryA", "technicalLab.evidence.ordinaryA", ordinaryA, 1, "NEUTRAL", true),
      field("ordinaryB", "technicalLab.evidence.ordinaryB", ordinaryB, 1, "NEUTRAL", true),
      field("ordinaryEqual", "technicalLab.evidence.ordinaryEqual", ordinaryA === ordinaryB, 2, "WARN"),
      field("canonicalA", "technicalLab.evidence.canonicalA", canonicalA, 3, "PASS", true),
      field("canonicalB", "technicalLab.evidence.canonicalB", canonicalB, 3, "PASS", true),
      field("canonicalDigestA", "technicalLab.evidence.canonicalDigestA", sha256Hex(canonicalA), 4, "PASS", true),
      field("canonicalDigestB", "technicalLab.evidence.canonicalDigestB", sha256Hex(canonicalB), 4, "PASS", true),
      field("canonicalEqual", "technicalLab.evidence.canonicalEqual", canonicalA === canonicalB, 5, "PASS"),
      field("unsupportedRejected", "technicalLab.evidence.unsupportedRejected", unsupportedRejected, 6, "PASS"),
    ],
  };
}

async function tl3Evidence(
  runtime: TechnicalLabEngineRuntime,
): Promise<TechnicalLabModuleEvidence> {
  const fixture = fixtureFor(runtime.bundle, "TL3");
  const value = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: String(fixture.initialInput.proposalId),
    commandType: TechnicalLabCommandType.TRANSFER_CUSTODY,
    commandPayload: {
      assetId: fixture.initialInput.assetId,
      toOrganizationId: "ORG_LOGISTICS_PROVIDER",
    },
    expectedStateVersions: {
      [String(fixture.initialInput.assetId)]: Number(
        fixture.initialInput.expectedStateVersion,
      ),
    },
  });
  const signed = await signProposal(
    runtime.cryptographicRuntime,
    value,
    "CTX_PRODUCER",
    TechnicalLabCommandType.TRANSFER_CUSTODY,
    "PROPOSAL_SUBMISSION",
  );
  const tamper = await demonstrateSignatureTamper({
    evidence: signed,
    provider: new NobleEd25519Provider(),
  });
  const processorKey =
    runtime.cryptographicRuntime.signingKeys.keys.find(
      (candidate) => candidate.keyId === "KEY_PROCESSOR_001",
    );
  if (processorKey === undefined) {
    throw new Error("The processor educational key is missing");
  }
  const wrongKeyValid = await new NobleEd25519Provider().verify(
    {
      algorithm: "Ed25519",
      spkiBase64Url: processorKey.publicKeySpkiBase64Url,
    },
    canonicalBytes(signed.signatureStatement),
    decodeBase64Url(signed.signature.signatureBase64Url),
  );
  return {
    moduleId: "TL3",
    fields: [
      field("proposal", "technicalLab.evidence.proposal", canonicalize(value), 1, "NEUTRAL", true),
      field("canonicalBytes", "technicalLab.evidence.canonicalBytes", signed.proposalCanonicalBytesBase64Url, 2, "NEUTRAL", true),
      field("proposalDigest", "technicalLab.evidence.proposalDigest", signed.proposalDigest, 3, "PASS", true),
      field("signature", "technicalLab.evidence.signature", signed.signature.signatureBase64Url, 4, "PASS", true),
      field("signatureValid", "technicalLab.evidence.signatureValid", signed.signatureValid, 5, "PASS"),
      field("keyFingerprint", "technicalLab.evidence.keyFingerprint", signed.publicKeyFingerprint ?? "", 5, "NEUTRAL", true),
      field("tamperedSignatureValid", "technicalLab.evidence.tamperedSignatureValid", tamper.modifiedProposalSignatureValid, 7, "FAIL"),
      field("wrongKeyValid", "technicalLab.evidence.wrongKeyValid", wrongKeyValid, 8, "FAIL"),
    ],
  };
}

async function tl4Evidence(
  runtime: TechnicalLabEngineRuntime,
): Promise<TechnicalLabModuleEvidence> {
  const value = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_PROPOSAL_CERTIFICATE_001",
    commandType: TechnicalLabCommandType.ISSUE_CERTIFICATE,
    commandPayload: {
      certificateId: "CERT-2026-014",
      assetId: "BAT-GREEN-001",
    },
  });
  const signed = await signProposal(
    runtime.cryptographicRuntime,
    value,
    "CTX_LOGISTICS",
    TechnicalLabCommandType.ISSUE_CERTIFICATE,
    "PROPOSAL_SUBMISSION",
  );
  return {
    moduleId: "TL4",
    fields: [
      field("proposalDigest", "technicalLab.evidence.proposalDigest", signed.proposalDigest, 1, "NEUTRAL", true),
      field("signatureValid", "technicalLab.evidence.signatureValid", signed.signatureValid, 2, "PASS"),
      field("signer", "technicalLab.evidence.signer", signed.signature.organizationId, 3),
      field("identityRecognized", "technicalLab.evidence.identityRecognized", signed.authorization.recognizedIdentity, 3, "PASS"),
      field("organizationAllowed", "technicalLab.evidence.organizationAllowed", signed.authorization.organizationAllowed, 4, "FAIL"),
      field("roleAllowed", "technicalLab.evidence.roleAllowed", signed.authorization.roleAllowed, 4, "FAIL"),
      field("authorized", "technicalLab.evidence.authorized", signed.authorization.authorized, 4, "FAIL"),
      field("commitResult", "technicalLab.evidence.commitResult", "REJECTED_UNAUTHORIZED", 5, "FAIL"),
      field("ledgerMutation", "technicalLab.evidence.ledgerMutation", false, 5, "PASS"),
    ],
  };
}

function policyById(
  cryptographicRuntime: CryptographicRuntime,
  endorsementPolicyId: string,
): EndorsementPolicyDefinition {
  const policy = cryptographicRuntime.endorsementPolicies.policies.find(
    (candidate) =>
      candidate.endorsementPolicyId === endorsementPolicyId,
  );
  if (policy === undefined) {
    throw new Error(
      `Technical Laboratory policy "${endorsementPolicyId}" is missing`,
    );
  }
  return policy;
}

async function endorsement(
  cryptographicRuntime: CryptographicRuntime,
  value: TransactionProposalV1,
  contextId: string,
  commandType: string,
  suffix: string,
): Promise<EndorsementRecord> {
  const evidence = await signProposal(
    cryptographicRuntime,
    value,
    contextId,
    `ENDORSE:${commandType}`,
    "ENDORSEMENT",
  );
  return evidenceRecord(
    `END_${value.proposalId}_${suffix}`,
    evidence,
  );
}

async function tl5Evidence(
  runtime: TechnicalLabEngineRuntime,
): Promise<TechnicalLabModuleEvidence> {
  const value = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_PROPOSAL_POLICY_001",
    commandType: TechnicalLabCommandType.POLICY_DEMO,
    commandPayload: {
      assetId: "BAT-GREEN-001",
      action: "REVIEW_SHARED_POLICY",
    },
    expectedStateVersions: { "BAT-GREEN-001": 4 },
  });
  const records = await Promise.all([
    endorsement(runtime.cryptographicRuntime, value, "CTX_PRODUCER", TechnicalLabCommandType.POLICY_DEMO, "PRODUCER"),
    endorsement(runtime.cryptographicRuntime, value, "CTX_PROCESSOR", TechnicalLabCommandType.POLICY_DEMO, "PROCESSOR"),
    endorsement(runtime.cryptographicRuntime, value, "CTX_CERTIFIER", TechnicalLabCommandType.POLICY_DEMO, "CERTIFIER"),
  ]);
  const policies: readonly EndorsementPolicyDefinition[] = [
    policyById(runtime.cryptographicRuntime, "LAB_SIGNED_BY_PRODUCER"),
    {
      ...policyById(runtime.cryptographicRuntime, "LAB_ALL_PRODUCER_PROCESSOR"),
      appliesToCommandTypes: [TechnicalLabCommandType.POLICY_DEMO],
    },
    policyById(runtime.cryptographicRuntime, "LAB_ANY_PRODUCER_CERTIFIER"),
    policyById(runtime.cryptographicRuntime, "LAB_THRESHOLD_TWO_OF_THREE"),
  ];
  const evaluations = policies.map((policy) =>
    evaluateEndorsementPolicy({
      policy,
      proposalId: value.proposalId,
      proposalDigest: proposalDigest(value),
      records,
    }),
  );
  return {
    moduleId: "TL5",
    fields: [
      field("proposalDigest", "technicalLab.evidence.proposalDigest", proposalDigest(value), 1, "NEUTRAL", true),
      field("producerSignature", "technicalLab.evidence.producerSignature", records[0]!.verification.signatureValid, 7, "PASS"),
      field("processorSignature", "technicalLab.evidence.processorSignature", records[1]!.verification.signatureValid, 7, "PASS"),
      field("certifierSignature", "technicalLab.evidence.certifierSignature", records[2]!.verification.signatureValid, 7, "PASS"),
      field("endorsementCount", "technicalLab.evidence.endorsementCount", records.length, 10, "PASS"),
      field("signedBySatisfied", "technicalLab.evidence.signedBySatisfied", evaluations[0]!.satisfied, 11, "PASS"),
      field("allOfSatisfied", "technicalLab.evidence.allOfSatisfied", evaluations[1]!.satisfied, 12, "PASS"),
      field("anyOfSatisfied", "technicalLab.evidence.anyOfSatisfied", evaluations[2]!.satisfied, 13, "PASS"),
      field("thresholdSatisfied", "technicalLab.evidence.thresholdSatisfied", evaluations[3]!.satisfied, 14, "PASS"),
    ],
  };
}

async function tl6Evidence(
  runtime: TechnicalLabEngineRuntime,
): Promise<TechnicalLabModuleEvidence> {
  const base = {
    assetId: "BAT-GREEN-001",
    reason: "CORRECT_DECLARED_QUANTITY",
  };
  const producerProposal = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_CORRECTION_PRODUCER_A",
    commandType: TechnicalLabCommandType.CORRECTION,
    commandPayload: { ...base, correctedQuantityKg: 100 },
    expectedStateVersions: { "BAT-GREEN-001": 4 },
  });
  const processorProposal = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_CORRECTION_PROCESSOR_B",
    commandType: TechnicalLabCommandType.CORRECTION,
    commandPayload: { ...base, correctedQuantityKg: 105 },
    expectedStateVersions: { "BAT-GREEN-001": 4 },
  });
  const producerRecord = await endorsement(
    runtime.cryptographicRuntime,
    producerProposal,
    "CTX_PRODUCER",
    TechnicalLabCommandType.CORRECTION,
    "PRODUCER",
  );
  const processorRecord = await endorsement(
    runtime.cryptographicRuntime,
    processorProposal,
    "CTX_PROCESSOR",
    TechnicalLabCommandType.CORRECTION,
    "PROCESSOR",
  );
  const policy = policyById(
    runtime.cryptographicRuntime,
    "LAB_ALL_PRODUCER_PROCESSOR",
  );
  const mismatchEvaluation = evaluateEndorsementPolicy({
    policy,
    proposalId: producerProposal.proposalId,
    proposalDigest: proposalDigest(producerProposal),
    records: [producerRecord, processorRecord],
  });
  const revisedProposal = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_CORRECTION_REVISED_C",
    commandType: TechnicalLabCommandType.CORRECTION,
    commandPayload: { ...base, correctedQuantityKg: 100 },
    expectedStateVersions: { "BAT-GREEN-001": 4 },
  });
  const revisedRecords = await Promise.all([
    endorsement(runtime.cryptographicRuntime, revisedProposal, "CTX_PRODUCER", TechnicalLabCommandType.CORRECTION, "REVISED_PRODUCER"),
    endorsement(runtime.cryptographicRuntime, revisedProposal, "CTX_PROCESSOR", TechnicalLabCommandType.CORRECTION, "REVISED_PROCESSOR"),
  ]);
  const revisedEvaluation = evaluateEndorsementPolicy({
    policy,
    proposalId: revisedProposal.proposalId,
    proposalDigest: proposalDigest(revisedProposal),
    records: revisedRecords,
  });
  return {
    moduleId: "TL6",
    fields: [
      field("producerDigest", "technicalLab.evidence.producerDigest", proposalDigest(producerProposal), 5, "NEUTRAL", true),
      field("processorDigest", "technicalLab.evidence.processorDigest", proposalDigest(processorProposal), 5, "NEUTRAL", true),
      field("producerSignature", "technicalLab.evidence.producerSignature", producerRecord.verification.signatureValid, 9, "PASS"),
      field("processorSignature", "technicalLab.evidence.processorSignature", processorRecord.verification.signatureValid, 9, "PASS"),
      field("sameProposal", "technicalLab.evidence.sameProposal", proposalDigest(producerProposal) === proposalDigest(processorProposal), 10, "FAIL"),
      field("mismatchPolicySatisfied", "technicalLab.evidence.policySatisfied", mismatchEvaluation.satisfied, 11, "FAIL"),
      field("revisedDigest", "technicalLab.evidence.revisedDigest", proposalDigest(revisedProposal), 13, "NEUTRAL", true),
      field("oldEndorsementsReused", "technicalLab.evidence.oldEndorsementsReused", false, 14, "PASS"),
      field("revisedPolicySatisfied", "technicalLab.evidence.revisedPolicySatisfied", revisedEvaluation.satisfied, 20, "PASS"),
    ],
  };
}

async function tl7Evidence(
  runtime: TechnicalLabEngineRuntime,
): Promise<TechnicalLabModuleEvidence> {
  const policy = policyById(
    runtime.cryptographicRuntime,
    "LAB_STATE_PRODUCER_PROCESSOR",
  );
  const staleProposal = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_STATE_CHANGE_V4",
    commandType: TechnicalLabCommandType.STATE_CHANGE,
    commandPayload: {
      assetId: "BAT-GREEN-001",
      action: "RELEASE_FOR_PROCESSING",
    },
    expectedStateVersions: { "BAT-GREEN-001": 4 },
  });
  const staleRecords = await Promise.all([
    endorsement(runtime.cryptographicRuntime, staleProposal, "CTX_PRODUCER", TechnicalLabCommandType.STATE_CHANGE, "V4_PRODUCER"),
    endorsement(runtime.cryptographicRuntime, staleProposal, "CTX_PROCESSOR", TechnicalLabCommandType.STATE_CHANGE, "V4_PROCESSOR"),
  ]);
  const staleEvaluation = evaluateEndorsementPolicy({
    policy,
    proposalId: staleProposal.proposalId,
    proposalDigest: proposalDigest(staleProposal),
    records: staleRecords,
  });
  const currentVersion = 5;
  const expectedVersion =
    staleProposal.expectedStateVersions["BAT-GREEN-001"]!;
  const stale = expectedVersion !== currentVersion;
  const revisedProposal = proposal({
    configurationHash: runtime.configurationHash,
    proposalId: "LAB_STATE_CHANGE_V5",
    commandType: TechnicalLabCommandType.STATE_CHANGE,
    commandPayload: staleProposal.commandPayload,
    expectedStateVersions: {
      "BAT-GREEN-001": currentVersion,
    },
  });
  const revisedRecords = await Promise.all([
    endorsement(runtime.cryptographicRuntime, revisedProposal, "CTX_PRODUCER", TechnicalLabCommandType.STATE_CHANGE, "V5_PRODUCER"),
    endorsement(runtime.cryptographicRuntime, revisedProposal, "CTX_PROCESSOR", TechnicalLabCommandType.STATE_CHANGE, "V5_PROCESSOR"),
  ]);
  const revisedEvaluation = evaluateEndorsementPolicy({
    policy,
    proposalId: revisedProposal.proposalId,
    proposalDigest: proposalDigest(revisedProposal),
    records: revisedRecords,
  });
  const revisedExpected =
    revisedProposal.expectedStateVersions["BAT-GREEN-001"]!;
  const revisedStateValid = revisedExpected === currentVersion;
  return {
    moduleId: "TL7",
    fields: [
      field("signatureValid", "technicalLab.evidence.signaturesValid", staleRecords.every((record) => record.verification.signatureValid), 5, "PASS"),
      field("authorized", "technicalLab.evidence.authorizationValid", staleRecords.every((record) => record.verification.authorization.authorized), 5, "PASS"),
      field("policySatisfied", "technicalLab.evidence.policySatisfied", staleEvaluation.satisfied, 8, "PASS"),
      field("expectedVersion", "technicalLab.evidence.expectedVersion", expectedVersion, 9),
      field("currentVersion", "technicalLab.evidence.currentVersion", currentVersion, 10),
      field("staleState", "technicalLab.evidence.staleState", stale, 11, "FAIL"),
      field("firstCommitResult", "technicalLab.evidence.firstCommitResult", "REJECTED_STALE", 12, "FAIL"),
      field("ledgerMutation", "technicalLab.evidence.ledgerMutation", false, 12, "PASS"),
      field("revisedDigest", "technicalLab.evidence.revisedDigest", proposalDigest(revisedProposal), 14, "NEUTRAL", true),
      field("revisedPolicySatisfied", "technicalLab.evidence.revisedPolicySatisfied", revisedEvaluation.satisfied, 20, "PASS"),
      field("revisedStateValid", "technicalLab.evidence.revisedStateValid", revisedStateValid, 21, "PASS"),
      field("finalCommitResult", "technicalLab.evidence.finalCommitResult", revisedStateValid && revisedEvaluation.satisfied ? "COMMITTED" : "REJECTED", 22, "PASS"),
      field("newVersion", "technicalLab.evidence.newVersion", revisedStateValid && revisedEvaluation.satisfied ? 6 : currentVersion, 22, "PASS"),
    ],
  };
}

async function moduleEvidence(
  runtime: TechnicalLabEngineRuntime,
  moduleId: FirstTechnicalLabModuleId,
  entries: readonly TechnicalLabActionJournalEntry[],
): Promise<TechnicalLabModuleEvidence> {
  switch (moduleId) {
    case "TL1":
      return tl1Evidence(runtime, entries);
    case "TL2":
      return tl2Evidence(runtime);
    case "TL3":
      return tl3Evidence(runtime);
    case "TL4":
      return tl4Evidence(runtime);
    case "TL5":
      return tl5Evidence(runtime);
    case "TL6":
      return tl6Evidence(runtime);
    case "TL7":
      return tl7Evidence(runtime);
  }
}

function expectedActionFor(
  snapshot: TechnicalLabSnapshot,
  bundle: TechnicalLabPackBundle,
): TechnicalLabExpectedAction | null {
  const module = bundle.modules[snapshot.currentModuleIndex];
  if (module === undefined) return null;
  const actions = moduleActions(module);
  const completed = entriesForModule(
    snapshot,
    snapshot.currentModuleIndex,
  ).length;
  return actions[completed] ?? null;
}

export function appendTechnicalLabAction(options: {
  readonly snapshot: TechnicalLabSnapshot;
  readonly bundle: TechnicalLabPackBundle;
  readonly actionType: TechnicalExperimentActionType;
  readonly operandA?: number;
  readonly operandB?: number;
}): TechnicalLabSnapshot {
  const expected = expectedActionFor(
    options.snapshot,
    options.bundle,
  );
  if (expected === null) {
    throw new Error("The current experiment has no pending action");
  }
  if (expected.actionType !== options.actionType) {
    throw new Error(
      `Expected ${expected.actionType}, received ${options.actionType}`,
    );
  }
  const moduleIndex = options.snapshot.currentModuleIndex;
  const module = options.bundle.modules[moduleIndex]!;
  const step =
    module.experimentDefinitions[expected.experimentIndex]!.steps[
      expected.stepIndex
    ]!;
  const operandA = options.operandA ?? 0;
  const operandB = options.operandB ?? 0;
  assertActionOperands({ operandA, operandB }, step);
  return {
    ...options.snapshot,
    actionJournal: [
      ...options.snapshot.actionJournal,
      {
        moduleIndex,
        experimentIndex: expected.experimentIndex,
        stepIndex: expected.stepIndex,
        occurrenceIndex: expected.occurrenceIndex,
        operandA,
        operandB,
      },
    ],
  };
}

export function appendTechnicalLabResponse(options: {
  readonly snapshot: TechnicalLabSnapshot;
  readonly bundle: TechnicalLabPackBundle;
  readonly kind: TechnicalLabCheckpointKind;
  readonly optionId: string;
}): TechnicalLabSnapshot {
  const moduleIndex = options.snapshot.currentModuleIndex;
  const module = options.bundle.modules[moduleIndex];
  if (module === undefined) {
    throw new Error("The current laboratory module is missing");
  }
  const actions = moduleActions(module);
  if (
    entriesForModule(options.snapshot, moduleIndex).length <
    actions.length
  ) {
    throw new Error(
      "Complete the genuine experiment before submitting the checkpoint",
    );
  }
  const definition = checkpointDefinition(module, options.kind);
  const prior = responseEntries(
    options.snapshot,
    moduleIndex,
    options.kind,
  );
  const priorCorrect = prior.some(
    (entry) =>
      definition.options[entry.optionIndex]?.optionId ===
      definition.correctOptionId,
  );
  if (
    priorCorrect ||
    prior.length >= definition.maximumAttempts
  ) {
    throw new Error("This checkpoint is already final");
  }
  const optionIndex = definition.options.findIndex(
    (option) => option.optionId === options.optionId,
  );
  if (optionIndex < 0) {
    throw new Error("The selected checkpoint option is not authored");
  }
  return {
    ...options.snapshot,
    responseJournal: [
      ...options.snapshot.responseJournal,
      {
        moduleIndex,
        kind: options.kind,
        optionIndex,
        attemptNumber: prior.length + 1,
      },
    ],
  };
}

export function openTechnicalLabHint(options: {
  readonly snapshot: TechnicalLabSnapshot;
  readonly bundle: TechnicalLabPackBundle;
}): TechnicalLabSnapshot {
  const moduleIndex = options.snapshot.currentModuleIndex;
  if (options.bundle.modules[moduleIndex] === undefined) {
    throw new Error("The current laboratory module is missing");
  }
  const module = options.bundle.modules[moduleIndex]!;
  if (
    entriesForModule(options.snapshot, moduleIndex).length !==
    moduleActions(module).length
  ) {
    throw new Error(
      "Complete the experiment before opening its hint",
    );
  }
  if (options.snapshot.hintModuleIndexes.includes(moduleIndex)) {
    return options.snapshot;
  }
  return {
    ...options.snapshot,
    hintModuleIndexes: [
      ...options.snapshot.hintModuleIndexes,
      moduleIndex,
    ],
  };
}

export function advanceTechnicalLabModule(options: {
  readonly replay: TechnicalLabReplay;
}): TechnicalLabSnapshot {
  const current =
    options.replay.modules[
      options.replay.snapshot.currentModuleIndex
    ];
  if (current === undefined || !current.complete) {
    throw new Error(
      "The current laboratory module is not complete",
    );
  }
  if (options.replay.complete) return options.replay.snapshot;
  return {
    ...options.replay.snapshot,
    currentModuleIndex:
      options.replay.snapshot.currentModuleIndex + 1,
  };
}

export async function replayTechnicalLab(
  runtime: TechnicalLabEngineRuntime,
  snapshot: TechnicalLabSnapshot,
): Promise<TechnicalLabReplay> {
  const moduleCount = runtime.bundle.modules.length;
  if (
    !Number.isInteger(snapshot.currentModuleIndex) ||
    snapshot.currentModuleIndex < 0 ||
    snapshot.currentModuleIndex >= moduleCount
  ) {
    throw new Error("Technical Laboratory progress is invalid");
  }
  for (const journal of [
    snapshot.actionJournal,
    snapshot.responseJournal,
  ]) {
    let previousModuleIndex = -1;
    for (const entry of journal) {
      if (
        !Number.isInteger(entry.moduleIndex) ||
        entry.moduleIndex < 0 ||
        entry.moduleIndex >= moduleCount ||
        entry.moduleIndex < previousModuleIndex
      ) {
        throw new Error(
          "Technical Laboratory journal order is invalid",
        );
      }
      previousModuleIndex = entry.moduleIndex;
    }
  }
  if (
    new Set(snapshot.hintModuleIndexes).size !==
      snapshot.hintModuleIndexes.length ||
    snapshot.hintModuleIndexes.some(
      (moduleIndex, index) =>
        !Number.isInteger(moduleIndex) ||
        moduleIndex < 0 ||
        moduleIndex >= moduleCount ||
        (index > 0 &&
          moduleIndex <=
            snapshot.hintModuleIndexes[index - 1]!),
    )
  ) {
    throw new Error(
      "Technical Laboratory hint history is invalid",
    );
  }
  const modules = await Promise.all(
    runtime.bundle.modules.map(async (module, moduleIndex) => {
      const allocation = allocationFor(
        runtime.bundle,
        module.moduleId,
      );
      const actions = moduleActions(module);
      const entries = entriesForModule(snapshot, moduleIndex);
      const experimentComplete = entries.length === actions.length;
      if (entries.length > actions.length) {
        throw new Error(
          `Technical Laboratory ${module.moduleId} has excess actions`,
        );
      }
      entries.forEach((entry, entryIndex) => {
        const expected = actions[entryIndex];
        const step =
          module.experimentDefinitions[
            entry.experimentIndex
          ]?.steps[entry.stepIndex];
        if (
          expected === undefined ||
          step === undefined ||
          entry.moduleIndex !== moduleIndex ||
          entry.experimentIndex !== expected.experimentIndex ||
          entry.stepIndex !== expected.stepIndex ||
          entry.occurrenceIndex !== expected.occurrenceIndex
        ) {
          throw new Error(
            `Technical Laboratory ${module.moduleId} action history is not replayable`,
          );
        }
        assertActionOperands(entry, step);
      });
      if (
        moduleIndex > snapshot.currentModuleIndex &&
        (entries.length > 0 ||
          responseEntries(
            snapshot,
            moduleIndex,
            "INTERPRETATION",
          ).length > 0 ||
          responseEntries(
            snapshot,
            moduleIndex,
            "APPLICATION",
          ).length > 0 ||
          snapshot.hintModuleIndexes.includes(moduleIndex))
      ) {
        throw new Error(
          "Technical Laboratory progress contains activity in a locked module",
        );
      }
      for (const kind of [
        "INTERPRETATION",
        "APPLICATION",
      ] as const) {
        const definition = checkpointDefinition(module, kind);
        const responses = responseEntries(
          snapshot,
          moduleIndex,
          kind,
        );
        if (
          responses.length > 0 &&
          !experimentComplete
        ) {
          throw new Error(
            `Technical Laboratory ${module.moduleId} checkpoint precedes its experiment`,
          );
        }
        let alreadyCorrect = false;
        responses.forEach((response, responseIndex) => {
          if (
            response.attemptNumber !== responseIndex + 1 ||
            response.optionIndex < 0 ||
            response.optionIndex >= definition.options.length ||
            responseIndex >= definition.maximumAttempts ||
            alreadyCorrect
          ) {
            throw new Error(
              `Technical Laboratory ${module.moduleId} checkpoint history is not replayable`,
            );
          }
          alreadyCorrect =
            definition.options[response.optionIndex]?.optionId ===
            definition.correctOptionId;
        });
      }
      if (
        snapshot.hintModuleIndexes.includes(moduleIndex) &&
        !experimentComplete
      ) {
        throw new Error(
          `Technical Laboratory ${module.moduleId} hint precedes its experiment`,
        );
      }
      const interpretation = checkpointProjection({
        snapshot,
        module,
        moduleIndex,
        kind: "INTERPRETATION",
        maximumPoints: allocation.interpretationPoints,
      });
      const application = checkpointProjection({
        snapshot,
        module,
        moduleIndex,
        kind: "APPLICATION",
        maximumPoints: allocation.applicationPoints,
      });
      const complete =
        experimentComplete &&
        interpretation.terminal &&
        application.terminal;
      const score =
        (experimentComplete ? allocation.experimentPoints : 0) +
        interpretation.earnedPoints +
        application.earnedPoints;
      const evidence =
        entries.length === 0
          ? null
          : await moduleEvidence(runtime, module.moduleId, entries);
      return {
        module,
        locked:
          moduleIndex >
          snapshot.currentModuleIndex,
        current: moduleIndex === snapshot.currentModuleIndex,
        experimentActionCount: entries.length,
        experimentActionMaximum: actions.length,
        experimentComplete,
        interpretation,
        application,
        hintOpened:
          snapshot.hintModuleIndexes.includes(moduleIndex),
        complete,
        score,
        maximumScore:
          allocation.experimentPoints +
          allocation.interpretationPoints +
          allocation.applicationPoints,
        evidence,
      } satisfies TechnicalLabModuleProjection;
    }),
  );
  for (let index = 0; index < snapshot.currentModuleIndex; index += 1) {
    if (modules[index]?.complete !== true) {
      throw new Error(
        "Technical Laboratory progress skipped an incomplete prerequisite",
      );
    }
  }
  const experimentScore = modules.reduce(
    (total, module) =>
      total +
      (module.experimentComplete
        ? allocationFor(runtime.bundle, module.module.moduleId)
            .experimentPoints
        : 0),
    0,
  );
  const interpretationScore = modules.reduce(
    (total, module) =>
      total + module.interpretation.earnedPoints,
    0,
  );
  const applicationScore = modules.reduce(
    (total, module) => total + module.application.earnedPoints,
    0,
  );
  const totalScore =
    experimentScore + interpretationScore + applicationScore;
  const complete = modules.every((module) => module.complete);
  return {
    snapshot,
    modules,
    score: {
      experimentScore,
      interpretationScore,
      applicationScore,
      totalScore,
      maximumScore: 100,
      passScore: runtime.bundle.pack.scoringContract.passScore,
      passed:
        complete &&
        totalScore >= runtime.bundle.pack.scoringContract.passScore,
    },
    complete,
    expectedAction: expectedActionFor(snapshot, runtime.bundle),
  };
}

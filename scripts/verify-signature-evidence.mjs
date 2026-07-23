#!/usr/bin/env node

/**
 * Independent verifier for a TraceChain signature-evidence bundle.
 *
 * This intentionally uses Node's crypto implementation rather than the
 * application's Ed25519 provider. Agreement therefore checks the serialized
 * evidence across an implementation boundary.
 */

import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function canonicalize(value, path = [], seen = new Set()) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite number at ${path.join(".") || "root"}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (
    value === undefined ||
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new Error(
      `Unsupported value at ${path.join(".") || "root"}`,
    );
  }
  if (seen.has(value)) {
    throw new Error(
      `Circular value at ${path.join(".") || "root"}`,
    );
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item, index) =>
          canonicalize(item, [...path, String(index)], seen),
        )
        .join(",")}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(
            value[key],
            [...path, key],
            seen,
          )}`,
      )
      .join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

function digest(value) {
  return createHash("sha256")
    .update(canonicalize(value), "utf8")
    .digest("hex");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function verifySignatureEvidenceBundle(bundle) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!isRecord(bundle)) {
    return { valid: false, errors: ["Evidence bundle must be an object"] };
  }
  if (bundle.schemaVersion !== "1") {
    fail("Unsupported signature-evidence schema version");
  }
  if (!isRecord(bundle.proposal)) {
    fail("proposal must be an object");
  }
  if (!isRecord(bundle.signatureStatement)) {
    fail("signatureStatement must be an object");
  }
  if (!isRecord(bundle.signature)) {
    fail("signature must be an object");
  }
  if (typeof bundle.publicKeySpkiBase64Url !== "string") {
    fail("publicKeySpkiBase64Url must be a string");
  }
  if (errors.length > 0) return { valid: false, errors };

  const proposal = bundle.proposal;
  const statement = bundle.signatureStatement;
  const signature = bundle.signature;
  if (proposal.domain !== "TRACECHAIN_TRANSACTION_PROPOSAL_V1") {
    fail("Proposal domain is invalid");
  }
  if (statement.domain !== "TRACECHAIN_SIGNATURE_V1") {
    fail("Signature-statement domain is invalid");
  }
  if (signature.algorithm !== "Ed25519") {
    fail("Signature algorithm is not Ed25519");
  }
  if (
    signature.purpose !== "PROPOSAL_SUBMISSION" &&
    signature.purpose !== "ENDORSEMENT"
  ) {
    fail("Signature purpose is invalid");
  }

  const calculatedDigest = digest(proposal);
  if (bundle.proposalDigest !== calculatedDigest) {
    fail("Proposal digest does not match the canonical proposal");
  }
  if (signature.proposalDigest !== calculatedDigest) {
    fail("Signature envelope refers to a different proposal digest");
  }

  const reconstructedStatement = {
    domain: "TRACECHAIN_SIGNATURE_V1",
    purpose: signature.purpose,
    proposalDigest: calculatedDigest,
    sessionId: proposal.sessionId,
    organizationId: signature.organizationId,
    roleId: signature.roleId,
    keyId: signature.keyId,
    signedAt: signature.signedAt,
  };
  if (canonicalize(statement) !== canonicalize(reconstructedStatement)) {
    fail(
      "Signature statement does not match the proposal and signature envelope",
    );
  }

  if (errors.length === 0) {
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(bundle.publicKeySpkiBase64Url, "base64url"),
        format: "der",
        type: "spki",
      });
      if (publicKey.asymmetricKeyType !== "ed25519") {
        fail("Public key is not Ed25519");
      } else {
        const verified = verifySignature(
          null,
          Buffer.from(canonicalize(reconstructedStatement), "utf8"),
          publicKey,
          Buffer.from(signature.signatureBase64Url, "base64url"),
        );
        if (!verified) fail("Ed25519 signature verification failed");
      }
    } catch (error) {
      fail(
        `Public key or signature could not be verified: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    proposalDigest: calculatedDigest,
  };
}

function main() {
  const inputPath = process.argv[2];
  if (inputPath === undefined || process.argv.length !== 3) {
    console.error(
      "Usage: npm run verify:signature-evidence -- <bundle.json>",
    );
    process.exitCode = 1;
    return;
  }
  let bundle;
  try {
    bundle = JSON.parse(
      readFileSync(resolve(process.cwd(), inputPath), "utf8"),
    );
  } catch (error) {
    console.error(
      `Signature evidence could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
    return;
  }
  const result = verifySignatureEvidenceBundle(bundle);
  if (!result.valid) {
    console.error("Signature evidence verification FAILED:");
    for (const error of result.errors) console.error(`  error  ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Signature evidence verified: Ed25519 signature valid for proposal ${result.proposalDigest}.`,
  );
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}

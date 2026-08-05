/*
<MODULE_CONTRACT>
<purpose>Validates the immutable closure and instrument plan of an HDRI quarterly capsule.</purpose>
<non-goals><item>Does not create network observations or rewrite a sealed manifest.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0025 introduces a single sealed capsule per quarter.</item>
  <item>Verify complete artifact closure before idempotent Ed25519 sealing or retry.</item>
  <item>Require frozen targets and signed stage seals for every required instrument in sealed capsules.</item>
  <item>RFC-0045: add optional legacy flag to skip stage closure and execution evidence checks for pre-RFC-0026 quarters.</item>
  <item>RFC-0044: add extractBatchIdsFromManifest and extractSourceLedgerHead helpers for quarter:init tool.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: a sealed capsule is verified before any caller may write inside its root

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import crypto from "node:crypto";
import {
  canonicalize,
  loadSigningKeyFromEnv,
  type SigningKeyConfig,
  type VerificationKey,
} from "@syrokomskyi/observatory-crypto";
import {
  assertCapsuleId,
  assertRelativeArtifactUri,
  type CapsuleId,
  type InstrumentId,
  KNOWN_INSTRUMENTS,
} from "./quarter-contracts.js";

export type CapsuleArtifact = Readonly<{
  stage:
    "frame" | "emit" | "identity" | "vault" | "methodology" | "publication" | "qc" | InstrumentId;
  uri: string;
  sha256: string;
  bytes: number;
}>;
export type InstrumentPlanEntry = Readonly<{
  instrument: InstrumentId;
  state: "required" | "disabled";
  reason: string | null;
}>;
export type QuarterCapsule = Readonly<{
  period: string;
  capsuleId: CapsuleId;
  state: "staging" | "candidate" | "sealed";
  instrumentPlan: readonly InstrumentPlanEntry[];
  artifacts: readonly CapsuleArtifact[];
  legacy?: boolean;
}>;
export type CapsuleSignature = Readonly<{
  schemaVersion: 1;
  algorithm: "ed25519";
  manifestSha256: string;
  signature: string;
  signedAt: string;
  signingKeyId: string;
  collectorId: string;
}>;

export const validateCapsule = (capsule: QuarterCapsule): void => {
  if (!/^\d{4}-q[1-4]$/.test(capsule.period))
    throw new Error(`Invalid HDRI period: ${capsule.period}`);
  assertCapsuleId(capsule.capsuleId);
  const plan = new Map(capsule.instrumentPlan.map((entry) => [entry.instrument, entry]));
  for (const required of KNOWN_INSTRUMENTS) {
    const entry = plan.get(required);
    if (!entry) throw new Error(`Capsule lacks instrument plan entry: ${required}`);
    if (entry.state === "disabled" && !entry.reason)
      throw new Error(`Disabled instrument requires reason: ${required}`);
  }
  for (const artifact of capsule.artifacts) {
    assertRelativeArtifactUri(artifact.uri);
    if (!artifact.sha256 || artifact.bytes < 0)
      throw new Error(`Invalid capsule artifact: ${artifact.uri}`);
  }
  if (
    capsule.state !== "staging" &&
    capsule.artifacts.some((artifact) => artifact.stage === "liveness") === false
  ) {
    throw new Error("Release candidate lacks required liveness artifact");
  }
  if (capsule.state !== "staging" && !capsule.legacy) {
    for (const required of [
      "frame",
      "emit",
      "identity",
      "vault",
      "methodology",
      "publication",
    ] as const) {
      if (!capsule.artifacts.some((artifact) => artifact.stage === required)) {
        throw new Error(`Sealed capsule lacks required ${required} closure`);
      }
    }
    for (const entry of capsule.instrumentPlan) {
      if (
        entry.state === "required" &&
        !capsule.artifacts.some((artifact) => artifact.stage === entry.instrument)
      ) {
        throw new Error(`Sealed capsule lacks required ${entry.instrument} artifact`);
      }
      if (entry.state === "required") {
        for (const evidenceUri of [
          `staging/targets/${entry.instrument}.json`,
          `staging/stage-seals/${entry.instrument}.json`,
        ]) {
          if (
            !capsule.artifacts.some(
              (artifact) => artifact.stage === "qc" && artifact.uri === evidenceUri,
            )
          ) {
            throw new Error(`Sealed capsule lacks required execution evidence: ${evidenceUri}`);
          }
        }
      }
    }
  }
};

const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

export const verifyQuarterCapsuleArtifacts = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<void> => {
  validateCapsule(capsule);
  for (const artifact of capsule.artifacts) {
    const filePath = path.join(capsuleDir, artifact.uri);
    const stat = await fs.stat(filePath);
    if (stat.size !== artifact.bytes || (await sha256File(filePath)) !== artifact.sha256) {
      throw new Error(`Capsule artifact failed closure verification: ${artifact.uri}`);
    }
  }
};

export const sealQuarterCapsule = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
  signingKey: SigningKeyConfig = loadSigningKeyFromEnv(),
): Promise<string> => {
  if (capsule.state !== "sealed")
    throw new Error("Only a sealed capsule manifest can be committed");
  await fs.mkdir(capsuleDir, { recursive: true });
  await verifyQuarterCapsuleArtifacts(capsuleDir, capsule);
  const target = path.join(capsuleDir, "capsule-manifest.json");
  const manifestBytes = `${JSON.stringify(capsule, null, 2)}\n`;
  try {
    const handle = await fs.open(target, "wx");
    try {
      await handle.writeFile(manifestBytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await fs.readFile(target, "utf8")) !== manifestBytes) {
      throw new Error("Quarter capsule is already sealed with a different manifest", {
        cause: error,
      });
    }
  }
  const payload = createHash("sha256").update(canonicalize(capsule), "utf8").digest();
  const signature: CapsuleSignature = {
    schemaVersion: 1,
    algorithm: "ed25519",
    manifestSha256: payload.toString("hex"),
    signature: crypto
      .sign(null, payload, crypto.createPrivateKey(signingKey.privateKeyPem))
      .toString("base64url"),
    signedAt: new Date().toISOString(),
    signingKeyId: signingKey.signingKeyId,
    collectorId: signingKey.collectorId,
  };
  const signaturePath = path.join(capsuleDir, "capsule-signature.json");
  const signatureBytes = `${JSON.stringify(signature, null, 2)}\n`;
  try {
    const handle = await fs.open(signaturePath, "wx");
    try {
      await handle.writeFile(signatureBytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await fs.readFile(signaturePath, "utf8")) as CapsuleSignature;
    if (
      !verifyQuarterCapsuleSignature(capsule, existing, {
        publicKeyPem: signingKey.publicKeyPem,
        signingKeyId: signingKey.signingKeyId,
      })
    )
      throw new Error("Existing quarter capsule signature is invalid or belongs to another key", {
        cause: error,
      });
  }
  return target;
};

export const verifyQuarterCapsuleSignature = (
  capsule: QuarterCapsule,
  signature: CapsuleSignature,
  verificationKey: VerificationKey,
): boolean => {
  if (signature.algorithm !== "ed25519" || signature.signingKeyId !== verificationKey.signingKeyId)
    return false;
  const payload = createHash("sha256").update(canonicalize(capsule), "utf8").digest();
  if (signature.manifestSha256 !== payload.toString("hex")) return false;
  return crypto.verify(
    null,
    payload,
    crypto.createPublicKey(verificationKey.publicKeyPem),
    Buffer.from(signature.signature, "base64url"),
  );
};

export const writeQuarterCapsuleStaging = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<string> => {
  if (capsule.state !== "staging") throw new Error("Staging writer requires state=staging");
  validateCapsule(capsule);
  await fs.mkdir(capsuleDir, { recursive: true });
  const target = path.join(capsuleDir, "capsule-staging.json");
  const bytes = `${JSON.stringify(capsule, null, 2)}\n`;
  try {
    const handle = await fs.open(target, "wx");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await fs.readFile(target, "utf8")) !== bytes) {
      throw new Error("Quarter capsule staging closure already exists with different bytes", {
        cause: error,
      });
    }
  }
  return target;
};

/**
 * Extracts batch IDs from segment artifacts in a capsule manifest.
 * Segment artifacts have stage "frame" and URIs like "source-ledger/segments/<batchId>.json".
 * Returns sorted unique batch IDs. Empty array if no segment artifacts exist.
 */
export const extractBatchIdsFromManifest = (capsule: QuarterCapsule): readonly string[] => {
  const batchIds = capsule.artifacts
    .filter((a) => a.stage === "frame" && a.uri.includes("source-ledger/segments/"))
    .map((a) => {
      const match = a.uri.match(/source-ledger\/segments\/(.+)\.json$/);
      return match ? match[1] : "";
    })
    .filter((id) => id.length > 0);
  return [...new Set(batchIds)].sort();
};

/**
 * Extracts the source ledger head and frame ID from the frame artifact in a capsule manifest.
 * The frame artifact has stage "frame" and is NOT a segment file.
 * Reads the frame JSON file and extracts the `ledgerHead` field from the FrozenFrame object.
 * Returns { ledgerHead, frameId } where frameId is the basename of the frame artifact URI.
 */
export const extractSourceLedgerHead = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<{ ledgerHead: string; frameId: string }> => {
  const frameArtifact = capsule.artifacts.find(
    (a) => a.stage === "frame" && !a.uri.includes("source-ledger/segments/"),
  );
  if (!frameArtifact) {
    throw new Error("Frame artifact not found in capsule manifest");
  }
  const framePath = path.join(capsuleDir, frameArtifact.uri);
  const frameRaw = await fs.readFile(framePath, "utf8");
  const frame = JSON.parse(frameRaw) as { ledgerHead?: string };
  if (!frame.ledgerHead) {
    throw new Error("Frame JSON does not contain ledgerHead field");
  }
  return { ledgerHead: frame.ledgerHead, frameId: path.basename(frameArtifact.uri) };
};

export const writeQuarterCapsuleCandidate = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<string> => {
  if (capsule.state !== "candidate") throw new Error("Candidate writer requires state=candidate");
  await verifyQuarterCapsuleArtifacts(capsuleDir, capsule);
  const target = path.join(capsuleDir, "capsule-candidate.json");
  const bytes = `${JSON.stringify(capsule, null, 2)}\n`;
  try {
    const handle = await fs.open(target, "wx");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await fs.readFile(target, "utf8")) !== bytes) {
      throw new Error("Quarter capsule candidate already exists with different bytes", {
        cause: error,
      });
    }
  }
  return target;
};

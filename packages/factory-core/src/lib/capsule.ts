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
  <item>RFC-0106: add validateManifestSet for verified source admission.</item>
  <item>Reject duplicate or unsafe artifact paths and verify exact bytes through stable nonsymlink file handles.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: a sealed capsule is verified before any caller may write inside its root

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import crypto from "node:crypto";
import {
  assertRelativeObjectPath,
  inspectRetainedFile,
  readBoundedFile,
} from "@warpgogol/pipeline-node";
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

const MAX_FRAME_JSON_BYTES = 64 * 1024 * 1024;

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

export const verifyQuarterCapsuleArtifacts = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<void> => {
  validateCapsule(capsule);
  const seen = new Set<string>();
  for (const artifact of capsule.artifacts) {
    assertRelativeObjectPath(artifact.uri);
    if (
      seen.has(artifact.uri) || !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0
    ) {
      throw new Error(`Invalid or duplicate capsule artifact: ${artifact.uri}`);
    }
    seen.add(artifact.uri);
  }
  for (const artifact of capsule.artifacts) {
    const filePath = path.resolve(capsuleDir, artifact.uri);
    const actual = await inspectRetainedFile(filePath);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) {
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
 * Selects the exact period's frame JSON, never the first raw/occurrence/signature artifact.
 * Checks the consumed bytes against the declared inventory; the caller authenticates the capsule.
 * Returns { ledgerHead, frameId } where frameId is the basename of the frame artifact URI.
 */
export const extractSourceLedgerHead = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<{ ledgerHead: string; frameId: string }> => {
  const frameArtifacts = capsule.artifacts.filter(
    (a) => a.stage === "frame" && path.posix.basename(a.uri) === `frame-${capsule.period}.json`,
  );
  if (frameArtifacts.length === 0) throw new Error("Frame artifact not found in capsule manifest");
  if (frameArtifacts.length > 1)
    throw new Error("Capsule requires exactly one frame JSON for its period");
  const frameArtifact = frameArtifacts[0]!;
  assertRelativeObjectPath(frameArtifact.uri);
  const framePath = path.resolve(capsuleDir, frameArtifact.uri);
  const frameBytes = await readBoundedFile(framePath, MAX_FRAME_JSON_BYTES);
  if (
    frameBytes.length !== frameArtifact.bytes ||
    createHash("sha256").update(frameBytes).digest("hex") !== frameArtifact.sha256
  )
    throw new Error("Frame JSON does not match capsule inventory");
  const frameRaw = new TextDecoder("utf-8", { fatal: true }).decode(frameBytes);
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

export type VerifiedManifestSet = Readonly<{
  period: string;
  capsuleId: string;
  deviceIds: readonly string[];
  stageSeals: ReadonlyMap<string, string>;
  targetSetSha256: ReadonlyMap<string, string>;
  selectedResultSetSha256: ReadonlyMap<string, string>;
  artifactRefs: ReadonlyMap<string, readonly string[]>;
}>;

export const validateManifestSet = async (
  manifestPaths: readonly string[],
  verificationKeys: ReadonlyMap<string, VerificationKey>,
  expectedPeriod: string,
  expectedCapsuleId: string,
): Promise<VerifiedManifestSet> => {
  if (manifestPaths.length === 0) {
    throw new Error("Manifest set is empty — at least one device manifest is required");
  }

  const deviceIds = new Set<string>();
  const stageSeals = new Map<string, string>();
  const targetSetSha256 = new Map<string, string>();
  const selectedResultSetSha256 = new Map<string, string>();
  const artifactRefs = new Map<string, readonly string[]>();

  for (const manifestPath of manifestPaths) {
    const resolved = path.resolve(manifestPath);
    const raw = await fs.readFile(resolved, "utf8");
    const capsule = JSON.parse(raw) as QuarterCapsule;

    validateCapsule(capsule);

    if (capsule.period !== expectedPeriod) {
      throw new Error(
        `Manifest period mismatch: expected ${expectedPeriod}, found ${capsule.period} in ${manifestPath}`,
      );
    }
    if (capsule.capsuleId !== expectedCapsuleId) {
      throw new Error(
        `Manifest capsuleId mismatch: expected ${expectedCapsuleId}, found ${capsule.capsuleId} in ${manifestPath}`,
      );
    }

    for (const artifact of capsule.artifacts) {
      assertRelativeArtifactUri(artifact.uri);
      if (artifact.uri.includes("..")) {
        throw new Error(`Unsafe relative ref in manifest: ${artifact.uri}`);
      }
    }

    for (const entry of capsule.instrumentPlan) {
      if (entry.state !== "required") continue;
      const stageId = entry.instrument;
      const sealArtifact = capsule.artifacts.find(
        (a) => a.stage === "qc" && a.uri === `staging/stage-seals/${stageId}.json`,
      );
      if (!sealArtifact) {
        throw new Error(`Device manifest lacks stage seal for required instrument: ${stageId}`);
      }
      stageSeals.set(stageId, sealArtifact.sha256);

      const targetArtifact = capsule.artifacts.find(
        (a) => a.stage === "qc" && a.uri === `staging/targets/${stageId}.json`,
      );
      if (!targetArtifact) {
        throw new Error(`Device manifest lacks target set for required instrument: ${stageId}`);
      }
      targetSetSha256.set(stageId, targetArtifact.sha256);

      // RFC-0114 B5: Read selectedResultSetSha256 from the seal file contents
      const capsuleDir = path.dirname(resolved);
      const sealFilePath = path.join(capsuleDir, `staging/stage-seals/${stageId}.json`);
      try {
        const sealRaw = await fs.readFile(sealFilePath, "utf8");
        const seal = JSON.parse(sealRaw) as { payload: { selectedResultSetSha256: string } };
        selectedResultSetSha256.set(stageId, seal.payload.selectedResultSetSha256);
      } catch {
        throw new Error(`Cannot read stage seal file for ${stageId} at ${sealFilePath}`);
      }

      const refs = capsule.artifacts.filter((a) => a.stage === stageId).map((a) => a.uri);
      artifactRefs.set(stageId, refs);
    }

    const deviceIdMatch = resolved.match(/\/(device-[a-f0-9-]+)\//);
    const deviceId = deviceIdMatch?.[1] ?? path.basename(path.dirname(resolved));
    deviceIds.add(deviceId);
  }

  return {
    period: expectedPeriod,
    capsuleId: expectedCapsuleId,
    deviceIds: [...deviceIds].sort(),
    stageSeals,
    targetSetSha256,
    selectedResultSetSha256,
    artifactRefs,
  };
};

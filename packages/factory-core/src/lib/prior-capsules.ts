/*
<MODULE_CONTRACT>
<purpose>Defines and verifies capsule-addressed prior-capsule references for cumulative source ledger discovery.</purpose>
<non-goals>
  <item>Does not scan raw folders or re-parse sealed segments.</item>
  <item>Does not modify or unseal sealed capsules.</item>
  <item>Does not perform frame freeze — that is the caller's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0030: introduce prior-capsules.json contract, LedgerDiscoveryResult, and verifyPriorCapsule.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: prior capsule segments are read-only references to sealed manifests

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalize, type VerificationKey } from "@syrokomskyi/observatory-crypto";
import {
  assertCapsuleId,
  type CapsuleId,
  type HdriPeriod,
  type SourceBatchId,
} from "./quarter-contracts.js";
import type { SignedLedgerManifest } from "./source-ledger-store.js";

// ── prior-capsules.json contract ───────────────────────────────────────────

export type PriorCapsuleEntry = Readonly<{
  period: HdriPeriod;
  capsuleId: CapsuleId;
  manifestPath: string;
  sourceLedgerHead: string;
  frameId: string;
  batchIds: readonly SourceBatchId[];
}>;

export type PriorCapsulesFile = Readonly<{
  schemaVersion: "1";
  currentPeriod: HdriPeriod;
  priorCapsules: readonly PriorCapsuleEntry[];
}>;

// ── Discovery result ──────────────────────────────────────────────────────

export type PriorCapsuleRef = Readonly<{
  capsuleId: CapsuleId;
  period: HdriPeriod;
  manifestPath: string;
  segmentHashes: readonly string[];
  batchIds: readonly SourceBatchId[];
}>;

export type LedgerDiscoveryResult = Readonly<{
  currentBatchIds: readonly SourceBatchId[];
  priorCapsuleSegments: readonly PriorCapsuleRef[];
  ledgerHead: string;
}>;

// ── Parsing ───────────────────────────────────────────────────────────────

export const parsePriorCapsulesFile = (raw: string): PriorCapsulesFile => {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.schemaVersion !== "1") {
    throw new Error(`prior-capsules.json: unsupported schemaVersion "${parsed.schemaVersion}"`);
  }
  const currentPeriodRaw: string = String(parsed.currentPeriod);
  if (!/^\d{4}-q[1-4]$/.test(currentPeriodRaw)) {
    throw new Error(`Invalid HDRI period: ${currentPeriodRaw}`);
  }
  const currentPeriod = currentPeriodRaw as HdriPeriod;
  const priorCapsulesRaw = parsed.priorCapsules;
  if (!Array.isArray(priorCapsulesRaw)) {
    throw new Error("prior-capsules.json: priorCapsules must be an array");
  }
  const priorCapsules = priorCapsulesRaw.map((entry, i) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`prior-capsules.json: priorCapsules[${i}] is not an object`);
    }
    const e = entry as Record<string, unknown>;
    const periodRaw: string = String(e.period);
    if (!/^\d{4}-q[1-4]$/.test(periodRaw)) {
      throw new Error(`Invalid HDRI period: ${periodRaw}`);
    }
    const period = periodRaw as HdriPeriod;
    const capsuleId: string = String(e.capsuleId);
    assertCapsuleId(capsuleId);
    if (typeof e.manifestPath !== "string" || e.manifestPath.length === 0) {
      throw new Error(
        `prior-capsules.json: priorCapsules[${i}].manifestPath must be a non-empty string`,
      );
    }
    if (typeof e.sourceLedgerHead !== "string") {
      throw new Error(`prior-capsules.json: priorCapsules[${i}].sourceLedgerHead must be a string`);
    }
    if (typeof e.frameId !== "string") {
      throw new Error(`prior-capsules.json: priorCapsules[${i}].frameId must be a string`);
    }
    const batchIds = Array.isArray(e.batchIds)
      ? e.batchIds.filter((b): b is string => typeof b === "string")
      : [];
    return {
      period,
      capsuleId,
      manifestPath: e.manifestPath as string,
      sourceLedgerHead: e.sourceLedgerHead as string,
      frameId: e.frameId as string,
      batchIds,
    } as PriorCapsuleEntry;
  });
  return { schemaVersion: "1", currentPeriod, priorCapsules };
};

// ── Reading ───────────────────────────────────────────────────────────────

export const readPriorCapsulesFile = async (stagingRoot: string): Promise<PriorCapsulesFile> => {
  const filePath = path.join(stagingRoot, "prior-capsules.json");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("prior-capsules.json not found. Run quarter:init first.", { cause: error });
    }
    throw error;
  }
  try {
    return parsePriorCapsulesFile(raw);
  } catch (error) {
    throw new Error(
      `prior-capsules.json: failed to parse — ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
};

// ── Verification ──────────────────────────────────────────────────────────

const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

export type PriorCapsuleVerificationResult = Readonly<{
  entry: PriorCapsuleEntry;
  manifestPath: string;
  batchIds: readonly SourceBatchId[];
  segmentHashes: readonly string[];
}>;

export const verifyPriorCapsule = async (
  entry: PriorCapsuleEntry,
  stagingRoot: string,
  verificationKeys: ReadonlyMap<string, VerificationKey>,
): Promise<PriorCapsuleVerificationResult> => {
  const manifestPath = path.resolve(stagingRoot, entry.manifestPath);

  // 1. Manifest existence
  let manifestBytes: Buffer;
  try {
    manifestBytes = await fs.readFile(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Sealed capsule not found: ${entry.manifestPath}`, { cause: error });
    }
    throw error;
  }

  // 2. Parse and verify manifest signature
  let manifest: SignedLedgerManifest<unknown>;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8")) as SignedLedgerManifest<unknown>;
  } catch (error) {
    throw new Error(`Prior capsule manifest is not valid JSON: ${entry.manifestPath}`, {
      cause: error,
    });
  }

  const key = verificationKeys.get(manifest.signingKeyId);
  if (!key) {
    throw new Error(`Prior capsule signature key not found: ${manifest.signingKeyId}`);
  }

  // Verify signature using the same envelope verification as source-ledger-store
  const payloadHash = createHash("sha256")
    .update(canonicalize(manifest.payload), "utf8")
    .digest("hex");
  if (payloadHash !== manifest.payloadSha256) {
    throw new Error(`Prior capsule manifest payload hash mismatch: ${entry.manifestPath}`);
  }

  const { signature: _sig, ...unsigned } = manifest;
  const envelopeDigest = createHash("sha256").update(canonicalize(unsigned), "utf8").digest();
  const signatureValid = crypto.verify(
    null,
    envelopeDigest,
    crypto.createPublicKey(key.publicKeyPem),
    Buffer.from(manifest.signature, "base64url"),
  );
  if (!signatureValid) {
    throw new Error(`Prior capsule signature invalid: ${entry.manifestPath}`);
  }

  // 3. Capsule state must be "sealed"
  const payload = manifest.payload as Record<string, unknown>;
  if (payload.state !== "sealed") {
    throw new Error(
      `Prior capsule is not sealed (state="${payload.state}"): ${entry.manifestPath}`,
    );
  }

  // 4. Segment hash verification — collect segment hashes from manifest artifacts
  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  const segmentArtifacts = artifacts.filter(
    (a: Record<string, unknown>) =>
      a.stage === "frame" && typeof a.uri === "string" && a.uri.includes("source-ledger/segments/"),
  );

  const segmentHashes: string[] = [];
  for (const artifact of segmentArtifacts) {
    const a = artifact as Record<string, unknown>;
    const uri = a.uri as string;
    const expectedSha256 = a.sha256 as string;
    // For prior capsules, segments are in the sealed capsule directory
    const resolvedPath = path.resolve(path.dirname(manifestPath), "..", uri);
    try {
      const actualSha256 = await sha256File(resolvedPath);
      if (actualSha256 !== expectedSha256) {
        throw new Error(
          `Segment hash mismatch for ${uri}: expected ${expectedSha256}, got ${actualSha256}`,
        );
      }
      segmentHashes.push(expectedSha256);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Prior capsule segment not found: ${uri}`, { cause: error });
      }
      throw error;
    }
  }

  return {
    entry,
    manifestPath,
    batchIds: entry.batchIds,
    segmentHashes,
  };
};

// ── Full discovery ────────────────────────────────────────────────────────

export const discoverPriorCapsules = async (
  stagingRoot: string,
  verificationKeys: ReadonlyMap<string, VerificationKey>,
): Promise<readonly PriorCapsuleRef[]> => {
  const priorCapsulesFile = await readPriorCapsulesFile(stagingRoot);

  if (priorCapsulesFile.priorCapsules.length === 0) {
    return [];
  }

  const refs: PriorCapsuleRef[] = [];
  for (const entry of priorCapsulesFile.priorCapsules) {
    const verified = await verifyPriorCapsule(entry, stagingRoot, verificationKeys);
    refs.push({
      capsuleId: verified.entry.capsuleId,
      period: verified.entry.period,
      manifestPath: verified.manifestPath,
      segmentHashes: verified.segmentHashes,
      batchIds: verified.batchIds,
    });
  }

  return refs;
};

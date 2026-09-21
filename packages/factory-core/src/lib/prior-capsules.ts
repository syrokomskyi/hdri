/*
<MODULE_CONTRACT>
<purpose>Defines and verifies capsule-addressed prior-capsule references for cumulative source ledger discovery.</purpose>
<non-goals>
  <item>Does not scan raw folders or re-parse sealed segments.</item>
  <item>Does not modify or unseal sealed capsules.</item>
  <item>Does not perform frame freeze — that is the caller's responsibility.</item>
  <item>Does not import source rows, certify scientific products or establish physical writer exclusion.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0030: introduce prior-capsules.json contract, LedgerDiscoveryResult, and verifyPriorCapsule.</item>
  <item>RFC-0112: add discoverQuarterRecord for cross-year Q4→Q1 predecessor resolution and gap/incomplete handling.</item>
  <item>Consume the actual detached capsule signature, authenticate its source closure and bind reference metadata and exact manifest bytes.</item>
  <item>Read discovery input once with strict bounds; reject conflicting, nonhistorical and wrong-operation references before archive I/O.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: prior capsule segments are read-only references to sealed manifests

import { createHash } from "node:crypto";
import path from "node:path";
import { canonicalize, type VerificationKey } from "@syrokomskyi/observatory-crypto";
import { assertRelativeObjectPath, readBoundedFile } from "@warpgogol/pipeline-node";
import {
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  type QuarterCapsule,
  type CapsuleSignature,
} from "./capsule.js";
import {
  assertCapsuleId,
  type CapsuleId,
  type HdriPeriod,
  type SourceBatchId,
} from "./quarter-contracts.js";
import type { QuarterRecordDraft } from "./quarter-record.js";
import { verifySourceClosure } from "./source-ledger-store.js";

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
  predecessorManifestSha256: string;
}>;

export type LedgerDiscoveryResult = Readonly<{
  currentBatchIds: readonly SourceBatchId[];
  priorCapsuleSegments: readonly PriorCapsuleRef[];
  ledgerHead: string;
}>;

// ── Parsing ───────────────────────────────────────────────────────────────

export const parsePriorCapsulesFile = (raw: string): PriorCapsulesFile => {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("prior-capsules.json: expected an object");
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
    if (!Array.isArray(e.batchIds) || e.batchIds.some((b) => typeof b !== "string" || !b))
      throw new Error(
        `prior-capsules.json: priorCapsules[${i}].batchIds must be an array of non-empty strings`,
      );
    const batchIds = e.batchIds as string[];
    for (const batchId of batchIds) {
      assertRelativeObjectPath(batchId);
      if (batchId.includes("/")) throw new Error("Prior batch ID must be a single path segment");
    }
    if (new Set(batchIds).size !== batchIds.length)
      throw new Error("prior-capsules.json: duplicate batch IDs");
    if (period >= currentPeriod)
      throw new Error("prior-capsules.json: prior period must precede currentPeriod");
    return {
      period,
      capsuleId,
      manifestPath: e.manifestPath as string,
      sourceLedgerHead: e.sourceLedgerHead as string,
      frameId: e.frameId as string,
      batchIds,
    } as PriorCapsuleEntry;
  });
  if (
    new Set(priorCapsules.map((e) => e.capsuleId)).size !== priorCapsules.length ||
    new Set(priorCapsules.map((e) => e.period)).size !== priorCapsules.length
  )
    throw new Error("prior-capsules.json: duplicate or conflicting prior capsule references");
  return { schemaVersion: "1", currentPeriod, priorCapsules };
};

// ── Reading ───────────────────────────────────────────────────────────────

export const readPriorCapsulesFile = async (stagingRoot: string): Promise<PriorCapsulesFile> => {
  const filePath = path.resolve(stagingRoot, "prior-capsules.json");
  const bytes = await readBoundedFile(filePath, 1024 * 1024);
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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

const MAX_CAPSULE_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_CAPSULE_SIGNATURE_BYTES = 64 * 1024;

export type PriorCapsuleVerificationResult = Readonly<{
  entry: PriorCapsuleEntry;
  manifestPath: string;
  batchIds: readonly SourceBatchId[];
  segmentHashes: readonly string[];
  predecessorManifestSha256: string;
}>;

export const verifyPriorCapsule = async (
  entry: PriorCapsuleEntry,
  stagingRoot: string,
  verificationKeys: ReadonlyMap<string, VerificationKey>,
): Promise<PriorCapsuleVerificationResult> => {
  // Detach caller-owned scope before the first asynchronous read.
  entry = { ...entry, batchIds: [...entry.batchIds] };
  const manifestPath = path.resolve(stagingRoot, entry.manifestPath);
  if (path.basename(manifestPath) !== "capsule-manifest.json")
    throw new Error("Prior capsule requires capsule-manifest.json");
  const capsuleDir = path.dirname(manifestPath);
  const manifestBytes = await readBoundedFile(manifestPath, MAX_CAPSULE_MANIFEST_BYTES);
  const decode = (bytes: Buffer): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const capsule = JSON.parse(decode(manifestBytes)) as QuarterCapsule;
  if (capsule.state !== "sealed") throw new Error("Prior capsule is not sealed");
  if (capsule.period !== entry.period || capsule.capsuleId !== entry.capsuleId)
    throw new Error("Prior capsule period or capsuleId mismatch");
  if (capsule.legacy !== undefined)
    throw new Error(
      "Prior capsule requires a preservation-verified conversion, not a legacy bypass",
    );
  const signature = JSON.parse(
    decode(
      await readBoundedFile(
        path.join(capsuleDir, "capsule-signature.json"),
        MAX_CAPSULE_SIGNATURE_BYTES,
      ),
    ),
  ) as CapsuleSignature;
  const key = verificationKeys.get(signature.signingKeyId);
  if (
    !key ||
    signature.schemaVersion !== 1 ||
    !verifyQuarterCapsuleSignature(capsule, signature, key)
  )
    throw new Error("Prior capsule signature invalid or untrusted");
  await verifyQuarterCapsuleArtifacts(capsuleDir, capsule);

  const suffix = `source-ledger/projections/frame-${entry.period}.manifest.json`;
  const frames = capsule.artifacts.filter(
    (a) => a.stage === "frame" && (a.uri === suffix || a.uri.endsWith(`/${suffix}`)),
  );
  // The current reference contract has one frame/head, not an implicit choice of device.
  if (frames.length !== 1)
    throw new Error("Prior capsule requires exactly one signed source frame");
  const ledgerPrefix = frames[0]!.uri.slice(
    0,
    -`projections/frame-${entry.period}.manifest.json`.length,
  );
  const closure = await verifySourceClosure(
    path.join(capsuleDir, ledgerPrefix),
    entry.period,
    verificationKeys,
  );
  const artifacts = new Map(capsule.artifacts.map((a) => [a.uri, a]));
  for (const [relative, sha256] of closure.artifactSha256) {
    const artifact = artifacts.get(`${ledgerPrefix}${relative}`);
    if (!artifact || artifact.stage !== "frame" || artifact.sha256 !== sha256)
      throw new Error(`Prior source closure is not bound to capsule: ${relative}`);
  }
  const batchIds = [...closure.frame.includedBatchIds];
  if (
    canonicalize([...entry.batchIds].sort()) !== canonicalize(batchIds) ||
    entry.sourceLedgerHead !== closure.frame.ledgerHead ||
    entry.frameId !== `frame-${entry.period}.json`
  )
    throw new Error("Prior capsule source metadata mismatch");
  const segmentHashes = batchIds.map((id) => closure.artifactSha256.get(`segments/${id}.json`)!);

  return {
    entry,
    manifestPath,
    batchIds,
    segmentHashes,
    predecessorManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
  };
};

// ── Full discovery ────────────────────────────────────────────────────────

export const discoverPriorCapsules = async (
  input: PriorCapsulesFile,
  stagingRoot: string,
  verificationKeys: ReadonlyMap<string, VerificationKey>,
  expectedPeriod: HdriPeriod,
): Promise<readonly PriorCapsuleRef[]> => {
  // Validate and detach programmatic input; never reopen the discovery file after preflight.
  const priorCapsulesFile = parsePriorCapsulesFile(JSON.stringify(input));
  if (priorCapsulesFile.currentPeriod !== expectedPeriod)
    throw new Error("prior-capsules.json: currentPeriod does not match the requested operation");

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
      predecessorManifestSha256: verified.predecessorManifestSha256,
    });
  }

  return refs;
};

// ── Quarter record discovery (RFC-0112) ───────────────────────────────────

export const computePredecessorPeriod = (period: string): string => {
  const match = /^(\d{4})-q([1-4])$/.exec(period);
  if (!match) {
    throw new Error(`Invalid HDRI period: ${period}`);
  }
  const year = parseInt(match[1]!, 10);
  const quarter = parseInt(match[2]!, 10);
  if (quarter === 1) {
    return `${year - 1}-q4`;
  }
  return `${year}-q${quarter - 1}`;
};

export const discoverQuarterRecord = (
  priorCapsules: PriorCapsulesFile,
  period: string,
): QuarterRecordDraft => {
  if (!/^\d{4}-q[1-4]$/.test(period)) {
    throw new Error(`Invalid HDRI period: ${period}`);
  }

  const predecessorPeriod = computePredecessorPeriod(period);

  const predecessorEntry = priorCapsules.priorCapsules.find((e) => e.period === predecessorPeriod);

  if (!predecessorEntry) {
    return {
      schema: "hdri-quarter-record@1",
      period,
      capsuleId: "",
      predecessorPeriod,
      predecessorManifestSha256: null,
      collection: "gap",
      publication: "pending",
      checkpointSha256: null,
      gapDecisionSha256: null,
    };
  }

  return {
    schema: "hdri-quarter-record@1",
    period,
    capsuleId: "",
    predecessorPeriod: predecessorEntry.period,
    predecessorManifestSha256: predecessorEntry.sourceLedgerHead,
    collection: "scheduled",
    publication: "pending",
    checkpointSha256: null,
    gapDecisionSha256: null,
  };
};

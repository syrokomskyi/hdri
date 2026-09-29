/*
<MODULE_CONTRACT>
<purpose>Validates the immutable closure and instrument plan of an HDRI quarterly capsule.</purpose>
<non-goals><item>Does not create network observations or rewrite a sealed manifest.</item></non-goals>
</MODULE_CONTRACT>
<KEY_DECISIONS><item>Only explicit availability-only@1 omits derived Observatory identity and vault stages; raw collection closure, scope and signatures remain mandatory.</item></KEY_DECISIONS>
<CHANGE_SUMMARY>
  <history>RFC-0025, RFC-0044, RFC-0045, RFC-0106</history>
  <item>RFC-0115: verify complete safe artifact bytes and required stage evidence before candidate writing or signing.</item>
  <item>RFC-0128: append-only staging manifest — createQuarterCapsuleStaging at quarter-open, appendCapsuleSealArtifacts at seal-time, deviceId carried in the manifest.</item>
  <item>RFC-0115: operator-approved availability-only profile retains raw closure without requiring unused derived identity/vault stages.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: a sealed capsule is verified before any caller may write inside its root

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { readCapsuleInventoryPart, type CapsuleInventoryPart } from "./capsule-inventory.js";
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
  sealStagesFor,
  type CapsuleId,
  type InstrumentId,
  type WorkKey,
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
  artifactInventories?: readonly CapsuleInventoryPart[];
  /** Explicit aggregate-only release; omission retains the complete Observatory contract. */
  releaseProfile?: "availability-only@1";
  // RFC-0128: self-describing device identity. Optional in the schema (sealed
  // Q2 manifests predate it) but REQUIRED for the admission path —
  // validateManifestSet throws when absent.
  deviceId?: string;
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

export const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

export const validateCapsule = (capsule: QuarterCapsule): void => {
  if (capsule.releaseProfile !== undefined && capsule.releaseProfile !== "availability-only@1")
    throw new Error("Unknown capsule release profile");
  if (capsule.releaseProfile && (capsule.legacy || !capsule.deviceId))
    throw new Error("Availability release requires a nonlegacy device-bound capsule");
  if (capsule.artifactInventories !== undefined &&
      (!Array.isArray(capsule.artifactInventories) || capsule.artifactInventories.length > 16384))
    throw new Error("Invalid or oversized capsule inventory references");
  if (!/^\d{4}-q[1-4]$/.test(capsule.period))
    throw new Error(`Invalid HDRI period: ${capsule.period}`);
  assertCapsuleId(capsule.capsuleId);
  if (capsule.deviceId !== undefined && capsule.deviceId.trim().length === 0)
    throw new Error("Capsule deviceId must be a non-empty string when present");
  const plan = new Map(capsule.instrumentPlan.map((entry) => [entry.instrument, entry]));
  if (capsule.releaseProfile === "availability-only@1" && plan.get("liveness")?.state !== "required")
    throw new Error("Availability release requires the liveness instrument");
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
    const requiredStages: readonly CapsuleArtifact["stage"][] = capsule.releaseProfile === "availability-only@1"
      ? ["frame", "emit", "methodology", "publication"]
      : ["frame", "emit", "identity", "vault", "methodology", "publication"];
    for (const required of requiredStages) {
      if (!capsule.artifacts.some((artifact) => artifact.stage === required)) {
        throw new Error(`Sealed capsule lacks required ${required} closure`);
      }
    }
    if (capsule.releaseProfile === "availability-only@1") {
      for (const [stage, uri] of [
        ["methodology", "artifacts/methodology/publication-scope.yaml"],
        ["publication", "artifacts/publication/public-manifest.json"],
        ["publication", "artifacts/publication/availability.json"],
        ["publication", "artifacts/publication/availability.csv"],
      ] as const) {
        if (!capsule.artifacts.some(artifact => artifact.stage === stage && artifact.uri === uri))
          throw new Error(`Availability release lacks required closure: ${uri}`);
      }
      const publicUris = new Set(["artifacts/publication/public-manifest.json",
        "artifacts/publication/availability.json", "artifacts/publication/availability.csv"]);
      if (capsule.artifacts.some(artifact => artifact.stage === "publication" && !publicUris.has(artifact.uri)))
        throw new Error("Availability release contains excluded publication artifacts");
    }
    for (const entry of capsule.instrumentPlan) {
      if (
        entry.state === "required" &&
        !capsule.artifacts.some((artifact) => artifact.stage === entry.instrument)
      ) {
        throw new Error(`Sealed capsule lacks required ${entry.instrument} artifact`);
      }
      if (entry.state === "required") {
        for (const evidenceUri of sealStagesFor(entry.instrument).flatMap(stage => [
          `staging/targets/${stage}.json`,
          `staging/stage-seals/${stage}.json`,
        ])) {
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
      seen.has(artifact.uri) ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 0
    ) {
      throw new Error(`Invalid or duplicate capsule artifact: ${artifact.uri}`);
    }
    seen.add(artifact.uri);
  }
  for await (const artifact of iterateCapsuleArtifacts(capsuleDir, capsule)) {
    const filePath = path.resolve(capsuleDir, artifact.uri);
    const actual = await inspectRetainedFile(filePath);
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) {
      throw new Error(`Capsule artifact failed closure verification: ${artifact.uri}`);
    }
  }
};

/** Includes authenticated inventory parts themselves so replicas retain the complete closure. */
export async function* iterateCapsuleArtifacts(
  capsuleDir: string,
  capsule: QuarterCapsule,
): AsyncGenerator<CapsuleArtifact> {
  const seen = new Set<string>();
  for (const artifact of capsule.artifacts) {
    if (seen.has(artifact.uri)) throw new Error(`Duplicate capsule artifact: ${artifact.uri}`);
    seen.add(artifact.uri);
    yield artifact;
  }
  for (const part of capsule.artifactInventories ?? []) {
    if (seen.has(part.uri)) throw new Error(`Duplicate capsule inventory: ${part.uri}`);
    const entries = await readCapsuleInventoryPart(capsuleDir, part);
    seen.add(part.uri);
    yield part;
    for (const artifact of entries) {
      if (seen.has(artifact.uri)) throw new Error(`Duplicate capsule artifact: ${artifact.uri}`);
      seen.add(artifact.uri);
      yield artifact;
    }
  }
}

/** Commit bounded inventory references atomically; retries must preserve their exact identity. */
export async function appendCapsuleInventoryParts(
  capsuleDir: string,
  parts: readonly CapsuleInventoryPart[],
): Promise<void> {
  const capsule = await readStagingManifest(capsuleDir);
  if (capsule.artifactInventories) {
    if (canonicalize(capsule.artifactInventories) !== canonicalize(parts))
      throw new Error("Capsule inventory retry changed its committed parts");
  }
  const next = { ...capsule, artifactInventories: parts };
  for await (const _artifact of iterateCapsuleArtifacts(capsuleDir, next)) {
    // Exhaust authenticated parts and enforce unique ownership before committing references.
  }
  if (!capsule.artifactInventories) await writeStagingManifestAtomic(capsuleDir, next);
}

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

/**
 * RFC-0128: creates the empty declared staging container at quarter-open.
 * The manifest starts with no artifacts; each stage's seal operation appends
 * its admission entries via appendCapsuleSealArtifacts.
 * Idempotent: an existing file with identical bytes is accepted.
 */
export const createQuarterCapsuleStaging = async (
  capsuleDir: string,
  identity: Readonly<{ period: string; capsuleId: CapsuleId; deviceId: string }>,
  instrumentPlan: readonly InstrumentPlanEntry[],
): Promise<string> => {
  const capsule: QuarterCapsule = {
    period: identity.period,
    capsuleId: identity.capsuleId,
    deviceId: identity.deviceId,
    state: "staging",
    instrumentPlan,
    artifacts: [],
  };
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
      throw new Error("Quarter capsule staging manifest already exists with different bytes", {
        cause: error,
      });
    }
  }
  return target;
};

const readStagingManifest = async (capsuleDir: string): Promise<QuarterCapsule> => {
  const target = path.join(capsuleDir, "capsule-staging.json");
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`capsule-staging.json not found in ${capsuleDir} — run quarter:init first`, {
        cause: error,
      });
    }
    throw error;
  }
  const capsule = JSON.parse(raw) as QuarterCapsule;
  if (capsule.state !== "staging") {
    throw new Error(`capsule-staging.json is not a staging manifest (state=${capsule.state})`);
  }
  validateCapsule(capsule);
  return capsule;
};

const writeStagingManifestAtomic = async (
  capsuleDir: string,
  capsule: QuarterCapsule,
): Promise<void> => {
  const target = path.join(capsuleDir, "capsule-staging.json");
  const bytes = `${JSON.stringify(capsule, null, 2)}\n`;
  const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  // fsync before rename — the manifest is an integrity index that must survive
  // a host crash; parity with createQuarterCapsuleStaging's handle.sync().
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, target);
};

/**
 * RFC-0128: atomically appends artifact entries to the staging manifest.
 * Append-only: existing entries are never rewritten or removed. An entry whose
 * `uri` is already present must carry identical sha256/bytes (mismatch throws),
 * so a seal retry after a mid-append crash is a no-op.
 * Fails fast when capsule-staging.json does not exist.
 */
export const appendCapsuleArtifacts = async (
  capsuleDir: string,
  entries: readonly CapsuleArtifact[],
): Promise<void> => {
  if (entries.length === 0) return;
  const capsule = await readStagingManifest(capsuleDir);
  const byUri = new Map(capsule.artifacts.map((a) => [a.uri, a]));
  const added: CapsuleArtifact[] = [];
  for (const entry of entries) {
    assertRelativeArtifactUri(entry.uri);
    const existing = byUri.get(entry.uri);
    if (existing) {
      if (existing.sha256 !== entry.sha256 || existing.bytes !== entry.bytes) {
        throw new Error(
          `Staging manifest entry conflict for ${entry.uri}: existing sha256=${existing.sha256} bytes=${existing.bytes}, new sha256=${entry.sha256} bytes=${entry.bytes}`,
        );
      }
      continue;
    }
    added.push(entry);
    byUri.set(entry.uri, entry);
  }
  if (added.length === 0) return;
  const next: QuarterCapsule = { ...capsule, artifacts: [...capsule.artifacts, ...added] };
  validateCapsule(next);
  await writeStagingManifestAtomic(capsuleDir, next);
};

/**
 * RFC-0128: seal-time append of one stage's admission-relevant artifacts
 * (seal artifact + target-set artifact + declared output artifacts).
 * Entries must belong to the stage (`stage === stageId`) or be its qc evidence
 * under `staging/`.
 */
// RFC-0128: a stage seals under its WorkKey stageId, but its retained capsule
// artifacts live under the instrument namespace that owns the output — e.g.
// homepage-capture/detected-page-capture both retain into artifacts/profile/.
const STAGE_OUTPUT_NAMESPACE: Partial<Record<WorkKey["stageId"], CapsuleArtifact["stage"]>> = {
  "homepage-capture": "profile",
  "detected-page-capture": "profile",
};

export const appendCapsuleSealArtifacts = async (
  capsuleDir: string,
  stageId: WorkKey["stageId"],
  entries: readonly CapsuleArtifact[],
): Promise<void> => {
  const outputNamespace = STAGE_OUTPUT_NAMESPACE[stageId] ?? stageId;
  for (const entry of entries) {
    const isStageOutput = entry.stage === outputNamespace;
    const isStageEvidence =
      entry.stage === "qc" &&
      (entry.uri === `staging/stage-seals/${stageId}.json` ||
        entry.uri === `staging/targets/${stageId}.json`);
    if (!isStageOutput && !isStageEvidence) {
      throw new Error(
        `Stage ${stageId} seal append received an artifact outside its scope: ${entry.uri} (stage=${entry.stage})`,
      );
    }
  }
  await appendCapsuleArtifacts(capsuleDir, entries);
};

/**
 * RFC-0128: snapshots a finalized stage SQLite database into the capsule at
 * seal-time and returns its manifest entry. The capsule artifact must exist
 * when its manifest entry does — manifest entries never point at
 * not-yet-written files.
 * Idempotent: an existing destination is integrity-checked and re-hashed, never
 * re-backed-up (the first seal's bytes are the sealed bytes).
 */
export const snapshotCapsuleDbArtifact = async (
  capsuleDir: string,
  stage: InstrumentId,
  deviceId: string,
  sourceDbPath: string,
): Promise<CapsuleArtifact> => {
  const uri = `artifacts/${stage}/${deviceId}/${path.basename(sourceDbPath)}`;
  const destination = path.join(capsuleDir, uri);
  const integrityOk = (dbPath: string, readonly: boolean): boolean => {
    const db = new Database(dbPath, { readonly, fileMustExist: true });
    try {
      const rows = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
      return rows.every((row) => row.integrity_check === "ok");
    } finally {
      db.close();
    }
  };
  try {
    await fs.stat(destination);
    if (!integrityOk(destination, true)) {
      throw new Error(`SQLite capsule snapshot failed integrity_check: ${uri}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!integrityOk(sourceDbPath, true)) {
      throw new Error(`SQLite source failed integrity_check: ${sourceDbPath}`);
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const sourceDb = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
    try {
      await sourceDb.backup(destination);
    } finally {
      sourceDb.close();
    }
    if (!integrityOk(destination, true)) {
      throw new Error(`SQLite capsule snapshot failed integrity_check: ${uri}`);
    }
  }
  const stat = await fs.stat(destination);
  return { stage, uri, sha256: await sha256File(destination), bytes: stat.size };
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

    // RFC-0128: every manifest entry's sha256/bytes must match the referenced
    // file — the manifest is an integrity index, not a claim list.
    const capsuleDir = path.dirname(resolved);
    await verifyQuarterCapsuleArtifacts(capsuleDir, capsule);

    for (const entry of capsule.instrumentPlan) {
      if (entry.state !== "required") continue;
      // RFC-0128: an instrument may seal under finer-grained stage ids —
      // profile is delivered by homepage-capture + detected-page-capture.
      for (const stageId of sealStagesFor(entry.instrument)) {
        const sealArtifact = capsule.artifacts.find(
          (a) => a.stage === "qc" && a.uri === `staging/stage-seals/${stageId}.json`,
        );
        if (!sealArtifact) {
          throw new Error(
            `Device manifest lacks stage seal for required instrument: ${entry.instrument} (stage ${stageId})`,
          );
        }
        stageSeals.set(stageId, sealArtifact.sha256);

        const targetArtifact = capsule.artifacts.find(
          (a) => a.stage === "qc" && a.uri === `staging/targets/${stageId}.json`,
        );
        if (!targetArtifact) {
          throw new Error(
            `Device manifest lacks target set for required instrument: ${entry.instrument} (stage ${stageId})`,
          );
        }
        targetSetSha256.set(stageId, targetArtifact.sha256);

        // RFC-0114 B5: Read selectedResultSetSha256 from the seal file contents
        const sealFilePath = path.join(capsuleDir, `staging/stage-seals/${stageId}.json`);
        try {
          const sealRaw = await fs.readFile(sealFilePath, "utf8");
          const seal = JSON.parse(sealRaw) as { payload: { selectedResultSetSha256: string } };
          selectedResultSetSha256.set(stageId, seal.payload.selectedResultSetSha256);
        } catch {
          throw new Error(`Cannot read stage seal file for ${stageId} at ${sealFilePath}`);
        }

        const outputNamespace = STAGE_OUTPUT_NAMESPACE[stageId] ?? stageId;
        const refs = capsule.artifacts.filter((a) => a.stage === outputNamespace).map((a) => a.uri);
        artifactRefs.set(stageId, refs);
      }
    }

    // RFC-0128: deviceId comes from the manifest field, never from path shape.
    if (!capsule.deviceId) {
      throw new Error(
        `Device manifest lacks required deviceId field: ${manifestPath} — regenerate it via quarter:init (RFC-0128)`,
      );
    }
    deviceIds.add(capsule.deviceId);
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

/*
<MODULE_CONTRACT>
<purpose>Persists immutable source batch manifests and rebuilds a deterministic ledger head.</purpose>
<non-goals><item>Does not parse source content or mutate accepted segments.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Add atomic Ed25519-signed batch and frame manifests with deterministic ledger rebuild.</item>
  <item>Authenticate complete provenance envelopes and verify transitive frame closure before publication.</item>
  <item>Verify historical included-set heads and copy snapshot-hashed artifacts without a preflight race.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: accepted source and frame manifests are immutable signed envelopes

import crypto, { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalize, loadSigningKeyFromEnv, type SigningKeyConfig, type VerificationKey } from "@syrokomskyi/observatory-crypto";
import { assertFrozenFrameIntegrity, type FrozenFrame } from "./source-ledger.js";
import type { SourceBatchManifest } from "./quarter-contracts.js";

export type VerificationKeySource = VerificationKey | ReadonlyMap<string, VerificationKey>;

const resolveVerificationKey = (
  source: VerificationKeySource,
  signingKeyId: string,
): VerificationKey | undefined => source instanceof Map
  ? source.get(signingKeyId)
  : "signingKeyId" in source && source.signingKeyId === signingKeyId ? source : undefined;

const canonicalManifest = (manifest: SourceBatchManifest): string =>
  canonicalize({
    ...manifest,
    files: [...manifest.files].sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
  });

export type SignedLedgerManifest<T> = Readonly<{
  schemaVersion: 1;
  payload: T;
  payloadSha256: string;
  signature: string;
  signedAt: string;
  signingKeyId: string;
  collectorId: string;
}>;

const ledgerEnvelopePayload = <T>(envelope: Omit<SignedLedgerManifest<T>, "signature">): Buffer =>
  createHash("sha256").update(canonicalize(envelope), "utf8").digest();

const signLedgerPayload = <T>(payload: T, key: SigningKeyConfig): SignedLedgerManifest<T> => {
  const payloadSha256 = createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
  const unsigned = {
    schemaVersion: 1,
    payload,
    payloadSha256,
    signedAt: new Date().toISOString(),
    signingKeyId: key.signingKeyId,
    collectorId: key.collectorId,
  } as const;
  return {
    ...unsigned,
    signature: crypto.sign(null, ledgerEnvelopePayload(unsigned), crypto.createPrivateKey(key.privateKeyPem)).toString("base64url"),
  };
};

const commitImmutableBytes = async (target: string, bytes: string): Promise<"created" | "exists"> => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(temp, "wx");
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.link(temp, target);
    return "created";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return "exists";
  } finally {
    await fs.unlink(temp).catch(() => undefined);
  }
};

const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

export const copyVerifiedArtifact = async (
  source: string,
  destination: string,
  expectedSha256: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.copyFile(source, temp, fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE);
    const copiedHash = await sha256File(temp);
    if (copiedHash !== expectedSha256) {
      throw new Error(`Immutable artifact closure hash mismatch: ${path.basename(source)}`);
    }
    try {
      await fs.link(temp, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    await fs.unlink(temp).catch(() => undefined);
  }
  const actual = await sha256File(destination);
  if (actual !== expectedSha256) throw new Error(`Immutable artifact closure hash mismatch: ${path.basename(source)}`);
};

export const verifySignedLedgerManifest = <T>(
  envelope: SignedLedgerManifest<T>,
  key: VerificationKey,
): boolean => {
  if (envelope.schemaVersion !== 1 || envelope.signingKeyId !== key.signingKeyId) return false;
  const collectorId = "collectorId" in key ? key.collectorId : undefined;
  if (!envelope.collectorId || (collectorId && envelope.collectorId !== collectorId)) return false;
  const digest = createHash("sha256").update(canonicalize(envelope.payload), "utf8").digest("hex");
  if (digest !== envelope.payloadSha256) return false;
  const { signature: _signature, ...unsigned } = envelope;
  return crypto.verify(
    null,
    ledgerEnvelopePayload(unsigned),
    crypto.createPublicKey(key.publicKeyPem),
    Buffer.from(envelope.signature, "base64url"),
  );
};

export const sealSourceBatch = async (
  ledgerDir: string,
  manifest: SourceBatchManifest,
  signingKey: SigningKeyConfig = loadSigningKeyFromEnv(),
  verificationKeys: VerificationKeySource = signingKey,
): Promise<"sealed" | "already-sealed"> => {
  const segmentsDir = path.join(ledgerDir, "segments");
  const target = path.join(segmentsDir, `${manifest.batchId}.json`);
  const envelope = signLedgerPayload({
    ...manifest,
    files: [...manifest.files].sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
  }, signingKey);
  const bytes = `${canonicalize(envelope)}\n`;
  if (await commitImmutableBytes(target, bytes) === "created") {
    return "sealed";
  }
  const existing = JSON.parse(await fs.readFile(target, "utf8")) as SignedLedgerManifest<SourceBatchManifest>;
  if (canonicalManifest(existing.payload) !== canonicalManifest(manifest)) {
    throw new Error(`Source batch ${manifest.batchId} is already sealed with different bytes`);
  }
  const verificationKey = resolveVerificationKey(verificationKeys, existing.signingKeyId);
  if (!verificationKey || !verifySignedLedgerManifest(existing, verificationKey)) throw new Error(`Source batch ${manifest.batchId} signature is invalid`);
  return "already-sealed";
};

export const checkSourceBatch = async (
  ledgerDir: string,
  manifest: SourceBatchManifest,
  verificationKeys: VerificationKeySource = loadSigningKeyFromEnv(),
): Promise<"new" | "already-sealed"> => {
  const target = path.join(ledgerDir, "segments", `${manifest.batchId}.json`);
  try {
    const existing = JSON.parse(await fs.readFile(target, "utf8")) as SignedLedgerManifest<SourceBatchManifest>;
    if (canonicalManifest(existing.payload) !== canonicalManifest(manifest)) {
      throw new Error(`Source batch ${manifest.batchId} is already sealed with different bytes`);
    }
    const verificationKey = resolveVerificationKey(verificationKeys, existing.signingKeyId);
    if (!verificationKey || !verifySignedLedgerManifest(existing, verificationKey)) {
      throw new Error(`Source batch ${manifest.batchId} signature is invalid`);
    }
    return "already-sealed";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "new";
    throw error;
  }
};

export const sealFrameManifest = async (
  ledgerDir: string,
  frame: FrozenFrame,
  signingKey: SigningKeyConfig = loadSigningKeyFromEnv(),
  verificationKeys: VerificationKeySource = signingKey,
): Promise<string> => {
  assertFrozenFrameIntegrity(frame);
  const target = path.join(ledgerDir, "projections", `frame-${frame.period}.manifest.json`);
  const bytes = `${canonicalize(signLedgerPayload(frame, signingKey))}\n`;
  if (await commitImmutableBytes(target, bytes) === "exists") {
    const existing = JSON.parse(await fs.readFile(target, "utf8")) as SignedLedgerManifest<FrozenFrame>;
    const verificationKey = resolveVerificationKey(verificationKeys, existing.signingKeyId);
    if (canonicalize(existing.payload) !== canonicalize(frame) || !verificationKey || !verifySignedLedgerManifest(existing, verificationKey)) {
      throw new Error(`Frame ${frame.period} is already sealed with different or invalid bytes`);
    }
  }
  return target;
};

export const rebuildLedgerHead = async (ledgerDir: string, includedBatchIds?: readonly string[]): Promise<string> => {
  const segmentsDir = path.join(ledgerDir, "segments");
  const names = includedBatchIds
    ? [...new Set(includedBatchIds)].sort().map((batchId) => `${batchId}.json`)
    : (await fs.readdir(segmentsDir)).filter((name) => name.endsWith(".json")).sort();
  const hash = createHash("sha256").update("hdri:source-ledger:v1\0");
  for (const name of names) {
    hash.update(name).update("\0").update(await fs.readFile(path.join(segmentsDir, name))).update("\0");
  }
  return hash.digest("hex");
};

export const readSourceBatchManifests = async (
  ledgerDir: string,
  verificationKeys: VerificationKeySource = loadSigningKeyFromEnv(),
): Promise<SourceBatchManifest[]> => {
  const segmentsDir = path.join(ledgerDir, "segments");
  const names = (await fs.readdir(segmentsDir)).filter((name) => name.endsWith(".json")).sort();
  const manifests: SourceBatchManifest[] = [];
  for (const name of names) {
    const envelope = JSON.parse(await fs.readFile(path.join(segmentsDir, name), "utf8")) as SignedLedgerManifest<SourceBatchManifest>;
    const verificationKey = resolveVerificationKey(verificationKeys, envelope.signingKeyId);
    if (!verificationKey || !verifySignedLedgerManifest(envelope, verificationKey)) throw new Error(`Source ledger segment signature is invalid: ${name}`);
    manifests.push(envelope.payload);
  }
  return manifests;
};

export const verifySourceClosure = async (
  ledgerDir: string,
  period: string,
  verificationKeys: VerificationKeySource = loadSigningKeyFromEnv(),
): Promise<Readonly<{
  frame: FrozenFrame;
  manifests: readonly SourceBatchManifest[];
  artifactSha256: ReadonlyMap<string, string>;
}>> => {
  const frameManifestPath = path.join(ledgerDir, "projections", `frame-${period}.manifest.json`);
  const frameManifestBytes = await fs.readFile(frameManifestPath);
  const envelope = JSON.parse(frameManifestBytes.toString("utf8")) as SignedLedgerManifest<FrozenFrame>;
  const verificationKey = resolveVerificationKey(verificationKeys, envelope.signingKeyId);
  if (!verificationKey || !verifySignedLedgerManifest(envelope, verificationKey)) {
    throw new Error(`Frame ${period} signature is invalid`);
  }
  if (envelope.payload.period !== period) throw new Error(`Frame ${period} period mismatch`);
  assertFrozenFrameIntegrity(envelope.payload);
  const artifactSha256 = new Map<string, string>();
  artifactSha256.set(`projections/frame-${period}.manifest.json`, createHash("sha256").update(frameManifestBytes).digest("hex"));
  const manifests: SourceBatchManifest[] = [];
  for (const batchId of envelope.payload.includedBatchIds) {
    const relative = `segments/${batchId}.json`;
    const bytes = await fs.readFile(path.join(ledgerDir, relative));
    const segment = JSON.parse(bytes.toString("utf8")) as SignedLedgerManifest<SourceBatchManifest>;
    const segmentKey = resolveVerificationKey(verificationKeys, segment.signingKeyId);
    if (!segmentKey || !verifySignedLedgerManifest(segment, segmentKey)) throw new Error(`Source ledger segment signature is invalid: ${batchId}.json`);
    if (segment.payload.batchId !== batchId) throw new Error(`Source ledger segment identity mismatch: ${batchId}.json`);
    manifests.push(segment.payload);
    artifactSha256.set(relative, createHash("sha256").update(bytes).digest("hex"));
  }
  const ledgerHead = await rebuildLedgerHead(ledgerDir, envelope.payload.includedBatchIds);
  if (ledgerHead !== envelope.payload.ledgerHead) throw new Error(`Frame ${period} ledger head mismatch`);
  const occurrencePath = path.join(ledgerDir, "projections", `source-occurrences-${period}.ndjson`);
  const occurrenceSha256 = await sha256File(occurrencePath);
  if (occurrenceSha256 !== envelope.payload.occurrenceProjectionSha256) {
    throw new Error(`Frame ${period} occurrence projection mismatch`);
  }
  artifactSha256.set(`projections/source-occurrences-${period}.ndjson`, occurrenceSha256);
  const framePath = path.join(ledgerDir, "projections", `frame-${period}.json`);
  const frameBytes = await fs.readFile(framePath);
  const frame = JSON.parse(frameBytes.toString("utf8")) as FrozenFrame;
  if (canonicalize(frame) !== canonicalize(envelope.payload)) throw new Error(`Frame ${period} payload mismatch`);
  artifactSha256.set(`projections/frame-${period}.json`, createHash("sha256").update(frameBytes).digest("hex"));
  const batchIds = manifests.map((manifest) => manifest.batchId).sort();
  if (canonicalize(batchIds) !== canonicalize([...frame.includedBatchIds].sort())) {
    throw new Error(`Frame ${period} included batch set mismatch`);
  }
  return { frame, manifests, artifactSha256 };
};

export const publishFrozenFrameProjection = async (
  ledgerDir: string,
  frame: FrozenFrame,
  occurrenceTempPath: string,
  signingKey: SigningKeyConfig = loadSigningKeyFromEnv(),
  verificationKeys: VerificationKeySource = signingKey,
): Promise<void> => {
  assertFrozenFrameIntegrity(frame);
  const projectionDir = path.join(ledgerDir, "projections");
  const occurrenceSha256 = await sha256File(occurrenceTempPath);
  if (occurrenceSha256 !== frame.occurrenceProjectionSha256) throw new Error("Frozen frame occurrence hash does not match projection bytes");
  const frameBytes = `${JSON.stringify(frame, null, 2)}\n`;
  const occurrencePath = path.join(projectionDir, `source-occurrences-${frame.period}.ndjson`);
  const framePath = path.join(projectionDir, `frame-${frame.period}.json`);
  try {
    if (await sha256File(occurrencePath) !== occurrenceSha256) {
      throw new Error(`Frozen source occurrence projection conflicts for ${frame.period}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    if (await fs.readFile(framePath, "utf8") !== frameBytes) {
      throw new Error(`Frozen source frame projection conflicts for ${frame.period}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await sealFrameManifest(ledgerDir, frame, signingKey, verificationKeys);
  await copyVerifiedArtifact(occurrenceTempPath, occurrencePath, occurrenceSha256);
  if (await commitImmutableBytes(framePath, frameBytes) === "exists" && await fs.readFile(framePath, "utf8") !== frameBytes) {
    throw new Error(`Frozen source frame projection conflicts for ${frame.period}`);
  }
};

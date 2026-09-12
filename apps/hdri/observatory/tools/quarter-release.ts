/*
<MODULE_CONTRACT>
<purpose>Performs the HDRI scientific release: reads a ReleaseInput manifest, builds a ReleaseEnvelope, replicates sealed artifacts with resumable copy, creates a PublicationAttestation, and atomically publishes the public archive.</purpose>
<non-goals>
  <item>Does not validate evidence — use quarter:validate first.</item>
  <item>Does not seal the capsule — use SealCapsuleGogol first.</item>
  <item>Does not waive gates, mutate prior releases or collect new observations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Block unqualified direct releases before copying artifacts or loading signing keys.</item>
  <item>RFC-0031: split combined validate+seal+release into release-only. Validation moved to quarter:validate, sealing moved to SealCapsuleGogol.</item>
  <item>RFC-0109: replace --capsule/--validation/--replica-config/--vault-dir/--public-archive-dir with --release-input manifest. Build ReleaseEnvelope, resumable copy with read-back verify, validate replica independence, create PublicationAttestation, atomic publish. Remove QuarterReleaseManifest — forward-only replacement.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import crypto, { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { evaluateProgramGate, verifyQuarterCapsuleArtifacts, type QuarterCapsule } from "@syrokomskyi/factory-core";
import { canonicalize, loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";
import {
  createPublicationAttestation,
  createReleaseEnvelope,
  resumeReplicaCopy,
  sha256Directory,
  sha256File,
  validateReplicaIndependence,
  verifyAttestationDelivery,
  verifyReleaseEnvelope,
  type ReleaseEnvelope,
  type ReleaseInput,
  type ReplicaReceipt,
} from "../run/release/release-contract";

type ReplicaConfig = Readonly<{
  replicaId: string;
  failureDomain: string;
  mediaId: string;
  credentialBoundary: string;
  destinationDir: string;
}>;

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const releaseInputPath = arg("--release-input");
if (!releaseInputPath) throw new Error("--release-input <manifest> is required");

const releaseInput = JSON.parse(
  await fs.readFile(path.resolve(releaseInputPath), "utf8"),
) as ReleaseInput;

if (releaseInput.schema !== "hdri-release-input@1") {
  throw new Error("Release input manifest has wrong schema");
}

const capsuleManifestPath = path.resolve(releaseInput.capsuleManifestPath);
if (path.basename(capsuleManifestPath) !== "capsule-manifest.json") {
  throw new Error("Release input must point to capsule-manifest.json (sealed capsule)");
}
const capsuleDir = path.dirname(capsuleManifestPath);
const vaultDir = path.resolve(releaseInput.vaultDir);
const publicArchiveRoot = path.resolve(releaseInput.publicArchiveRoot);
const publicManifestPath = path.resolve(releaseInput.publicManifestPath);
const rebuildReceiptPath = path.resolve(releaseInput.rebuildReceiptPath);
const replicaConfigPath = path.resolve(releaseInput.replicaConfigPath);

const sealedCapsule = JSON.parse(await fs.readFile(capsuleManifestPath, "utf8")) as QuarterCapsule;
if (sealedCapsule.state !== "sealed") throw new Error("Release requires a sealed capsule manifest");
// @ai-invariant: A sealed measurement capsule alone does not authorize publication.
const gate = evaluateProgramGate({
  operation: "publish",
  period: sealedCapsule.period,
  preservationRef: null,
  collectionReadinessRef: null,
  publicationReadinessRef: null,
});
if (gate.status === "blocked") {
  throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
}
await verifyQuarterCapsuleArtifacts(capsuleDir, sealedCapsule);

const replicaConfig = JSON.parse(await fs.readFile(replicaConfigPath, "utf8")) as ReplicaConfig[];
if (replicaConfig.length < 2)
  throw new Error("At least two offsite replica destinations are required");
const destinationRoots = replicaConfig.map((item) => path.resolve(item.destinationDir));
if (
  replicaConfig.some(
    (item) =>
      !item.replicaId.trim() ||
      !item.failureDomain.trim() ||
      !item.mediaId.trim() ||
      !item.credentialBoundary.trim(),
  ) ||
  new Set(replicaConfig.map((item) => item.replicaId)).size !== replicaConfig.length ||
  new Set(replicaConfig.map((item) => item.failureDomain)).size !== replicaConfig.length ||
  new Set(replicaConfig.map((item) => item.credentialBoundary)).size !== replicaConfig.length ||
  new Set(destinationRoots).size !== replicaConfig.length ||
  destinationRoots.some(
    (root) => root === capsuleDir || root.startsWith(`${capsuleDir}${path.sep}`),
  ) ||
  destinationRoots.some((root, index) =>
    destinationRoots.some(
      (other, otherIndex) =>
        index !== otherIndex &&
        (root.startsWith(`${other}${path.sep}`) || other.startsWith(`${root}${path.sep}`)),
    ),
  )
) {
  throw new Error(
    "Replica configuration must declare distinct failure domains, credential boundaries, and destinations",
  );
}

// --- Build ReleaseEnvelope ---

const measurementCapsuleSha256 = await sha256File(capsuleManifestPath);
const scientificInputSha256 = await sha256File(path.join(capsuleDir, "capsule-candidate.json"));
const publicManifestSha256 = await sha256File(publicManifestPath);
const rebuildReceiptSha256 = await sha256File(rebuildReceiptPath);

// Build inventory from capsule artifacts
const inventory: ReleaseEnvelope["inventory"] = [];
for (const artifact of sealedCapsule.artifacts) {
  const access = artifact.stage === "publication" ? ("public" as const) : ("internal" as const);
  inventory.push({
    uri: artifact.uri,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    access,
  });
}
// Add capsule manifest, candidate, and signature to inventory
inventory.push({
  uri: "capsule-manifest.json",
  sha256: measurementCapsuleSha256,
  bytes: (await fs.stat(capsuleManifestPath)).size,
  access: "internal",
});
inventory.push({
  uri: "capsule-candidate.json",
  sha256: scientificInputSha256,
  bytes: (await fs.stat(path.join(capsuleDir, "capsule-candidate.json"))).size,
  access: "internal",
});
const capsuleSigPath = path.join(capsuleDir, "capsule-signature.json");
inventory.push({
  uri: "capsule-signature.json",
  sha256: await sha256File(capsuleSigPath),
  bytes: (await fs.stat(capsuleSigPath)).size,
  access: "internal",
});

// Key bundle hash — hash of signing key public PEM
const signingKey = loadSigningKeyFromEnv();
const keyBundleSha256 = createHash("sha256").update(signingKey.publicKeyPem).digest("hex");

const envelope = createReleaseEnvelope(
  sealedCapsule.capsuleId,
  sealedCapsule.period,
  measurementCapsuleSha256,
  scientificInputSha256,
  inventory,
  publicManifestSha256,
  rebuildReceiptSha256,
  keyBundleSha256,
);

// --- Verify envelope acyclicity ---
const envelopeViolations = verifyReleaseEnvelope(envelope);
if (envelopeViolations.length > 0) {
  throw new Error(`Release envelope verification failed: ${envelopeViolations.join(", ")}`);
}

const envelopeSha256 = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");

// --- Resumable replica copy ---
const replicaReceipts: ReplicaReceipt[] = [];
for (let i = 0; i < replicaConfig.length; i++) {
  const config = replicaConfig[i]!;
  const destinationDir = path.join(
    destinationRoots[i]!,
    sealedCapsule.period,
    sealedCapsule.capsuleId,
  );
  const result = await resumeReplicaCopy(capsuleDir, destinationDir, inventory);
  replicaReceipts.push({
    schema: "hdri-replica-receipt@1",
    replicaId: config.replicaId,
    failureDomain: config.failureDomain,
    mediaId: config.mediaId,
    credentialBoundary: config.credentialBoundary,
    envelopeSha256,
    closureDigest: result.closureDigest,
    verifiedBytes: result.verifiedBytes,
    verifiedObjects: result.verifiedObjects,
    verifiedAt: new Date().toISOString(),
  });
}

// --- Validate replica independence ---
const independenceViolations = validateReplicaIndependence(replicaReceipts);
if (independenceViolations.length > 0) {
  throw new Error(`Replica independence validation failed: ${independenceViolations.join(", ")}`);
}

// --- Write replica receipts ---
const releaseQcDir = path.join(capsuleDir, "artifacts", "qc", "release");
const replicaReceiptsPath = path.join(releaseQcDir, "replica-receipts.json");
await fs.mkdir(path.dirname(replicaReceiptsPath), { recursive: true });
const replicaReceiptsBytes = `${JSON.stringify(replicaReceipts, null, 2)}\n`;
try {
  await fs.writeFile(replicaReceiptsPath, replicaReceiptsBytes, { flag: "wx" });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  const existing = await fs.readFile(replicaReceiptsPath, "utf8");
  if (existing !== replicaReceiptsBytes) {
    throw new Error(`Replica receipts conflict: ${replicaReceiptsPath}`);
  }
}

// --- Create PublicationAttestation ---
const replicaReceiptSha256s = [await sha256File(replicaReceiptsPath)];
const attestationSignature = crypto
  .sign(
    null,
    createHash("sha256")
      .update(
        canonicalize({
          schema: "hdri-publication-attestation@1",
          releaseId: envelope.releaseId,
          envelopeSha256,
          replicaReceiptSha256s,
          attestedAt: new Date().toISOString(),
          signingKeyId: signingKey.signingKeyId,
        }),
      )
      .digest(),
    crypto.createPrivateKey(signingKey.privateKeyPem),
  )
  .toString("base64url");

const attestation = createPublicationAttestation(
  envelope,
  replicaReceiptSha256s,
  signingKey.signingKeyId,
  attestationSignature,
);

// --- Copy attestation + receipts to each destination ---
for (let i = 0; i < destinationRoots.length; i++) {
  const destinationCapsule = path.join(
    destinationRoots[i]!,
    sealedCapsule.period,
    sealedCapsule.capsuleId,
  );
  const attestationPath = path.join(destinationCapsule, "publication-attestation.json");
  const attestationBytes = `${JSON.stringify(attestation, null, 2)}\n`;
  await fs.mkdir(path.dirname(attestationPath), { recursive: true });
  try {
    await fs.writeFile(attestationPath, attestationBytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.readFile(attestationPath);
    if (!existing.equals(Buffer.from(attestationBytes))) {
      throw new Error(`Attestation conflicts at ${attestationPath}`);
    }
  }
  const receiptsTarget = path.join(destinationCapsule, "replica-receipts.json");
  try {
    await fs.writeFile(receiptsTarget, await fs.readFile(replicaReceiptsPath), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

// --- Verify attestation delivery ---
const deliveryViolations = await verifyAttestationDelivery(
  attestation,
  destinationRoots.map((root) => path.join(root, sealedCapsule.period, sealedCapsule.capsuleId)),
);
if (deliveryViolations.length > 0) {
  throw new Error(`Attestation delivery verification failed: ${deliveryViolations.join(", ")}`);
}

// --- Write envelope to vault ---
const envelopePath = path.join(
  vaultDir,
  "releases",
  `period=${sealedCapsule.period}`,
  `${sealedCapsule.capsuleId}.json`,
);
const envelopeBytes = `${JSON.stringify(envelope, null, 2)}\n`;
await fs.mkdir(path.dirname(envelopePath), { recursive: true });
try {
  await fs.writeFile(envelopePath, envelopeBytes, { flag: "wx" });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  const existing = await fs.readFile(envelopePath, "utf8");
  if (existing !== envelopeBytes) {
    throw new Error(`Release envelope conflicts: ${envelopePath}`);
  }
}

// --- Atomically expose public archive ---
const publicArchiveDir = path.join(
  publicArchiveRoot,
  sealedCapsule.period,
  sealedCapsule.capsuleId,
);
const publicTemp = `${publicArchiveDir}.${process.pid}.${crypto.randomUUID()}.tmp`;
await fs.mkdir(publicTemp, { recursive: true });
for (const artifact of sealedCapsule.artifacts.filter((item) => item.stage === "publication")) {
  const relative = path.relative("artifacts/publication", artifact.uri);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Publication artifact escapes its release root: ${artifact.uri}`);
  }
  const destination = path.join(publicTemp, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(capsuleDir, artifact.uri), destination);
}
const publicArchiveHash = await sha256Directory(publicTemp);
await fs.mkdir(path.dirname(publicArchiveDir), { recursive: true });
try {
  await fs.rename(publicTemp, publicArchiveDir);
} catch (error) {
  if (
    (error as NodeJS.ErrnoException).code !== "EEXIST" &&
    (error as NodeJS.ErrnoException).code !== "ENOTEMPTY"
  )
    throw error;
  if ((await sha256Directory(publicArchiveDir)) !== publicArchiveHash)
    throw new Error("Existing public archive conflicts with release");
  await fs.rm(publicTemp, { recursive: true, force: true });
}

process.stdout.write(
  `${JSON.stringify(
    {
      command: "hdri.quarter.release",
      status: "pass",
      releaseId: envelope.releaseId,
      envelopeSha256,
      replicasVerified: replicaReceipts.length,
      attestationDelivered: deliveryViolations.length === 0,
    },
    null,
    2,
  )}\n`,
);

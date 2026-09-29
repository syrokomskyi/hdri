/*
<MODULE_CONTRACT>
<purpose>Performs the HDRI scientific release: reads a ReleaseInput manifest, builds a ReleaseEnvelope, replicates sealed artifacts with resumable copy, creates a PublicationAttestation, and atomically publishes the public archive.</purpose>
<non-goals>
  <item>Does not produce scientific evidence; rechecks required reports and binding before release effects.</item>
  <item>Does not seal the capsule — use SealCapsuleGogol first.</item>
  <item>Does not waive gates, mutate prior releases or collect new observations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Use one attestation timestamp for signing and persisted evidence.</item>
  <item>Block unqualified direct releases before copying artifacts or loading signing keys.</item>
  <item>RFC-0031: split combined validate+seal+release into release-only. Validation moved to quarter:validate, sealing moved to SealCapsuleGogol.</item>
  <item>RFC-0109: replace --capsule/--validation/--replica-config/--vault-dir/--public-archive-dir with --release-input manifest. Build ReleaseEnvelope, resumable copy with read-back verify, validate replica independence, create PublicationAttestation, atomic publish. Remove QuarterReleaseManifest — forward-only replacement.</item>
  <item>RFC-0115: verify capsule signature, public closure, retained report requirements including the Q3 classification decision, and reconstruction before effects.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import crypto, { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  evaluateProgramGate,
  loadAdmissionInputFromFiles,
  verifyAdmissionDomainEvidence,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterCapsuleSignature,
  type CapsuleSignature,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import { canonicalize, loadSigningKeyFromEnv, loadVerificationKeys, getTransparencyKeysDir } from "@syrokomskyi/observatory-crypto";
import { acquirePidLock } from "@syrokomskyi/utils";
import { archiveReleaseToR2 } from "../run/release/local-r2-archive";
import { validateLocalR2Config } from "../run/release/local-r2-policy";
import { putVerifiedR2Object } from "../run/release/r2-transport";
import { retainPublicationAttestation } from "../run/release/durable-attestation";
import { verifyPublicationClosure } from "../run/release/publication-closure";
import { verifyAvailabilityRebuildReceipt } from "../run/release/availability-rebuild";
import {
  createReleaseEnvelope,
  resumeReplicaCopy,
  sha256Directory,
  sha256File,
  validateReplicaIndependence,
  verifyAttestationDelivery,
  verifyReleaseEnvelope,
  readScientificReports,
  verifyRebuildReceiptBinding,
  type RebuildReceipt,
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
const admissionInputPath = arg("--admission-input");
const admissionEvidenceRoot = arg("--admission-evidence-root");
const admissionTrustedKeysPath = arg("--admission-trusted-keys");

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
const gate = evaluateProgramGate(
  await loadAdmissionInputFromFiles({
    admissionInputPath,
    evidenceRoot: admissionEvidenceRoot,
    trustedKeysPath: admissionTrustedKeysPath,
    trustedKeysSha256: process.env.HDRI_OPERATIONAL_ADMISSION_TRUST_SHA256,
    requiredEvidenceClass: "operational",
    verifyDomainEvidence: verifyAdmissionDomainEvidence,
    expected: {
      period: sealedCapsule.period,
      capsuleId: sealedCapsule.capsuleId,
      operation: "publish",
    },
  }),
);
if (gate.status === "blocked") {
  throw new Error(`ProgramGate blocked: ${gate.blockerCodes.join(", ")}`);
}
const capsuleSignature = JSON.parse(await fs.readFile(path.join(capsuleDir, "capsule-signature.json"), "utf8")) as CapsuleSignature;
const verificationKeys = await loadVerificationKeys(getTransparencyKeysDir());
const capsuleKey = verificationKeys.get(capsuleSignature.signingKeyId);
if (!capsuleKey || !verifyQuarterCapsuleSignature(sealedCapsule, capsuleSignature, capsuleKey))
  throw new Error("RELEASE_CAPSULE_SIGNATURE_INVALID");
await verifyQuarterCapsuleArtifacts(capsuleDir, sealedCapsule);
const publicationClosure = await verifyPublicationClosure(capsuleDir, sealedCapsule, publicManifestPath);
await readScientificReports(path.resolve(releaseInput.evidenceDir), sealedCapsule, publicationClosure.requestedProducts, capsuleDir);
const rebuildReceipt = JSON.parse(await fs.readFile(rebuildReceiptPath, "utf8")) as RebuildReceipt;
if (sealedCapsule.releaseProfile === "availability-only@1")
  await verifyAvailabilityRebuildReceipt(capsuleDir, sealedCapsule, rebuildReceipt);
else if (rebuildReceipt.schema !== "hdri-independent-rebuild@1") throw new Error("Rebuild profile mismatch");
const rebuildViolations = verifyRebuildReceiptBinding(rebuildReceipt, await sha256File(capsuleManifestPath), publicationClosure.publicManifestSha256);
if (rebuildViolations.length) throw new Error(`RELEASE_REBUILD_BINDING_FAILED:${rebuildViolations.join(",")}`);

const replicaConfigBytes = await fs.readFile(replicaConfigPath);
const replicaConfiguration: unknown = JSON.parse(replicaConfigBytes.toString("utf8"));
const localR2 = Array.isArray(replicaConfiguration) ? null : await (async () => {
  if (!replicaConfiguration || typeof replicaConfiguration !== "object" ||
    !("policyPath" in replicaConfiguration) || typeof replicaConfiguration.policyPath !== "string")
    throw new Error("LOCAL_R2_CONFIG_INVALID");
  return validateLocalR2Config(replicaConfiguration, await fs.readFile(replicaConfiguration.policyPath), sealedCapsule.period);
})();

// --- RFC-0115: Freeze release intent before any external effects ---
const releaseIntentHash = createHash("sha256")
  .update(JSON.stringify(canonicalize({ releaseInput,
    replicaConfigSha256: createHash("sha256").update(replicaConfigBytes).digest("hex"),
    custodyPolicySha256: localR2?.policySha256 ?? null })))
  .digest("hex");
const releaseIntentDir = path.join(capsuleDir, "artifacts", "qc", "release");
await fs.mkdir(releaseIntentDir, { recursive: true });
const releaseIntentPath = path.join(releaseIntentDir, "release-intent.json");
const releaseIntentBytes = `${JSON.stringify(
  {
    schema: "hdri-release-intent@1",
    releaseIntentHash,
    period: sealedCapsule.period,
    capsuleId: sealedCapsule.capsuleId,
    frozenAt: new Date().toISOString(),
  },
  null,
  2,
)}\n`;
try {
  await fs.writeFile(releaseIntentPath, releaseIntentBytes, { flag: "wx" });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  const existing = JSON.parse(await fs.readFile(releaseIntentPath, "utf8"));
  if (existing.schema !== "hdri-release-intent@1" || existing.releaseIntentHash !== releaseIntentHash ||
    existing.period !== sealedCapsule.period || existing.capsuleId !== sealedCapsule.capsuleId ||
    typeof existing.frozenAt !== "string" || !Number.isFinite(Date.parse(existing.frozenAt))) {
    throw new Error(`Release intent conflict: ${releaseIntentPath}`);
  }
}

// --- RFC-0115: Durable transaction lock for concurrent release attempts ---
const lockHandle = await acquirePidLock(
  releaseIntentDir,
  { lockFileName: ".release-lock.json", timeoutMs: 30 * 60 * 1000 },
  "RELEASE_LOCK_VIOLATION",
);

try {
  const replicaConfig = localR2 ? [] : replicaConfiguration as ReplicaConfig[];
  if (!localR2 && replicaConfig.length < 2)
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

  // --- Acyclic closure order: M + K → S → P0/D/P → R → E → Ri → A ---
  // M = Measurement capsule, K = Key bundle, S = Scientific input,
  // P0 = Public products, D = Dashboard, P = Public archive,
  // R = Replicas, E = Envelope, Ri = Replica receipts/independence, A = Attestation

  // --- M: Measurement capsule ---
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
  for (const part of sealedCapsule.artifactInventories ?? []) {
    inventory.push({
      uri: part.uri,
      sha256: part.sha256,
      bytes: part.bytes,
      access: "internal",
      artifactInventory: part,
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

  // --- K: Key bundle ---
  // Reconstruction controls are downstream of the capsule and must survive archival too.
  const rebuildUri = path.relative(capsuleDir, rebuildReceiptPath).split(path.sep).join("/");
  if (!rebuildUri || rebuildUri.startsWith("../") || path.isAbsolute(rebuildUri))
    throw new Error("REBUILD_RECEIPT_MUST_BE_RETAINED_IN_CAPSULE_ROOT");
  if (!inventory.some(item => item.uri === rebuildUri)) inventory.push({ uri: rebuildUri,
    sha256: rebuildReceiptSha256, bytes: (await fs.stat(rebuildReceiptPath)).size, access: "internal" });

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

  // --- S: Scientific input (already verified via capsule artifacts) ---
  // --- P0/D/P: Public products, dashboard, public archive (staged below, published after pointer switch) ---
  // --- R: Replicas ---
  const localR2Archive = localR2 ? await archiveReleaseToR2({ capsuleDir,
    workRoot: localR2.localArchiveRoot, envelope, remotePrefix: localR2.remotePrefix,
    rcloneBinary: localR2.rcloneBinary }) : null;
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
  const independenceViolations = localR2Archive ? [] : validateReplicaIndependence(replicaReceipts);
  if (independenceViolations.length > 0) {
    throw new Error(`Replica independence validation failed: ${independenceViolations.join(", ")}`);
  }

  // --- Ri: Replica receipts (independence validation) ---
  const releaseQcDir = path.join(capsuleDir, "artifacts", "qc", "release");
  const replicaReceiptsPath = path.join(releaseQcDir, "replica-receipts.json");
  await fs.mkdir(path.dirname(replicaReceiptsPath), { recursive: true });
  const custodyRecords = localR2Archive ? [{ ...localR2Archive, custodyPolicySha256: localR2!.policySha256 }] : replicaReceipts;
  const replicaReceiptsBytes = `${JSON.stringify(custodyRecords, null, 2)}\n`;
  try {
    await fs.writeFile(replicaReceiptsPath, replicaReceiptsBytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.readFile(replicaReceiptsPath, "utf8");
    if (existing !== replicaReceiptsBytes) {
      throw new Error(`Replica receipts conflict: ${replicaReceiptsPath}`);
    }
  }

  // --- A: Attestation ---
  const replicaReceiptSha256s = [await sha256File(replicaReceiptsPath)];
  const attestation = await retainPublicationAttestation({
    file: path.join(releaseQcDir, "publication-attestation.json"),
    envelope, replicaReceiptSha256s,
    signingKeyId: signingKey.signingKeyId,
    publicKeyPem: signingKey.publicKeyPem,
    privateKeyPem: signingKey.privateKeyPem,
    ...(localR2 ? { custodyPolicySha256: localR2.policySha256 } : {}),
  });

  // New custody mode is explicit: one local content-addressed archive and one R2 archive,
  // not two invented offsite ReplicaReceipts. Deliver hash-addressed controls separately.
  const r2ControlResults: Awaited<ReturnType<typeof putVerifiedR2Object>>[] = [];
  if (localR2 && localR2Archive) {
    const controls = {
      "release-envelope": `${JSON.stringify(envelope, null, 2)}\n`,
      "custody-receipts": replicaReceiptsBytes,
      "publication-attestation": `${JSON.stringify(attestation, null, 2)}\n`,
    };
    const controlsRoot = path.join(localR2.localArchiveRoot, "controls", envelopeSha256);
    await fs.mkdir(controlsRoot, { recursive: true, mode: 0o700 });
    for (const [name, bytes] of Object.entries(controls)) {
      const hash = createHash("sha256").update(bytes).digest("hex");
      const file = path.join(controlsRoot, `${name}-${hash}.json`);
      try { await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (await fs.readFile(file, "utf8") !== bytes) throw new Error("R2_CONTROL_FILE_CONFLICT");
      }
      const handle = await fs.open(file, "r");
      try { await handle.sync(); } finally { await handle.close(); }
      r2ControlResults.push(await putVerifiedR2Object(file,
        `${localR2.remotePrefix}/${envelopeSha256}/controls/${name}-${hash}.json`, localR2.rcloneBinary));
    }
    const handle = await fs.open(controlsRoot, "r");
    try { await handle.sync(); } finally { await handle.close(); }
    for (const directory of [path.dirname(controlsRoot), localR2.localArchiveRoot]) {
      const parent = await fs.open(directory, "r");
      try { await parent.sync(); } finally { await parent.close(); }
    }
    if (r2ControlResults.length !== 3) throw new Error("R2_CONTROL_DELIVERY_INCOMPLETE");
  }

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

  // --- P: Public archive (atomic pointer switch with revalidation) ---
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

  // RFC-0115: Revalidation before pointer switch — verify destination custody and staged public bytes
  for (let i = 0; i < destinationRoots.length; i++) {
    const destCapsule = path.join(
      destinationRoots[i]!,
      sealedCapsule.period,
      sealedCapsule.capsuleId,
    );
    const destAttestation = path.join(destCapsule, "publication-attestation.json");
    try {
      await fs.access(destAttestation);
    } catch {
      throw new Error(`Revalidation failed: attestation missing at ${destAttestation}`);
    }
    const destReceipts = path.join(destCapsule, "replica-receipts.json");
    try {
      await fs.access(destReceipts);
    } catch {
      throw new Error(`Revalidation failed: replica receipts missing at ${destReceipts}`);
    }
  }
  // Verify staged public bytes match expected hashes
  for (const artifact of sealedCapsule.artifacts.filter((item) => item.stage === "publication")) {
    const relative = path.relative("artifacts/publication", artifact.uri);
    const stagedPath = path.join(publicTemp, relative);
    const stagedHash = await sha256File(stagedPath);
    if (stagedHash !== artifact.sha256) {
      throw new Error(`Revalidation failed: staged public bytes mismatch for ${artifact.uri}`);
    }
  }

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
        releaseIntentHash,
        replicasVerified: replicaReceipts.length,
        custodyMode: localR2 ? "local-plus-r2" : "independent-directory-replicas",
        copiesVerified: localR2Archive ? 2 : replicaReceipts.length,
        attestationDelivered: deliveryViolations.length === 0 && (!localR2 || r2ControlResults.length === 3),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await lockHandle.release();
}

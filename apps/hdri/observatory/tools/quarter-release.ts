/*
<MODULE_CONTRACT>
<purpose>Runs the sole HDRI scientific release transition: evidence validation, verified replication, final capsule seal and atomic public archive publication.</purpose>
<non-goals><item>Does not waive gates, mutate prior releases or collect new observations.</item></non-goals>
</MODULE_CONTRACT>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import crypto, { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  sealQuarterCapsule,
  verifyQuarterCapsuleArtifacts,
  verifyQuarterExecutionClosure,
  type CapsuleArtifact,
  type QuarterCapsule,
} from "@syrokomskyi/factory-core";
import {
  canonicalize,
  getTransparencyKeysDir,
  loadSigningKeyFromEnv,
  loadVerificationKeys,
} from "@syrokomskyi/observatory-crypto";
import {
  SCIENTIFIC_REPORTS,
  artifactForFile,
  readScientificReports,
  sha256Directory,
  sha256File,
  validateReleaseEvidence,
  type QuarterValidationReport,
  type RebuildReceipt,
  type ReplicaReceipt,
} from "../run/release/release-contract";

type ReplicaConfig = Readonly<{
  replicaId: string;
  mediaId: string;
  offsite: true;
  destinationDir: string;
}>;

type QuarterReleaseManifest = Readonly<{
  schemaVersion: "1";
  releaseId: string;
  period: string;
  state: "published";
  capsuleHash: string;
  vaultHead: string;
  methodologyHash: string;
  publicArchiveHash: string;
  validationReportHash: string;
  rebuildReportHash: string;
  replicaReceipts: readonly string[];
  publishedAt: string;
  supersedesReleaseId: string | null;
  signingKeyId: string;
  collectorId: string;
  signature: string;
}>;

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
for (const required of [
  "--candidate",
  "--evidence-dir",
  "--replica-config",
  "--vault-dir",
  "--public-archive-dir",
]) {
  if (!arg(required)) throw new Error(`${required} is required`);
}

const candidatePath = path.resolve(arg("--candidate")!);
if (path.basename(candidatePath) !== "capsule-candidate.json") {
  throw new Error("--candidate must point to capsule-candidate.json");
}
const capsuleDir = path.dirname(candidatePath);
const evidenceDir = path.resolve(arg("--evidence-dir")!);
const vaultDir = path.resolve(arg("--vault-dir")!);
const publicArchiveRoot = path.resolve(arg("--public-archive-dir")!);
const replicaConfig = JSON.parse(
  await fs.readFile(path.resolve(arg("--replica-config")!), "utf8"),
) as ReplicaConfig[];
const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8")) as QuarterCapsule;
if (candidate.state !== "candidate") throw new Error("Release requires capsule-candidate.json");
const candidateManifestSha256 = await sha256File(candidatePath);
await verifyQuarterCapsuleArtifacts(capsuleDir, candidate);
await verifyQuarterExecutionClosure(
  capsuleDir,
  candidate.instrumentPlan
    .filter((entry) => entry.state === "required")
    .map((entry) => entry.instrument),
  await loadVerificationKeys(getTransparencyKeysDir()),
);

if (replicaConfig.length < 2)
  throw new Error("At least two offsite replica destinations are required");
const destinationRoots = replicaConfig.map((item) => path.resolve(item.destinationDir));
if (
  replicaConfig.some(
    (item) => item.offsite !== true || !item.replicaId.trim() || !item.mediaId.trim(),
  ) ||
  new Set(replicaConfig.map((item) => item.replicaId)).size !== replicaConfig.length ||
  new Set(replicaConfig.map((item) => item.mediaId)).size < 2 ||
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
  throw new Error("Replica configuration must declare distinct offsite destinations and media");
}

const commitImmutable = async (target: string, bytes: Buffer | string): Promise<void> => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await fs.readFile(target);
    const expected = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (!existing.equals(expected))
      throw new Error(`Immutable release artifact conflicts: ${target}`);
  }
};

const commitImmutableFile = async (
  source: string,
  target: string,
  expectedSha256: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.copyFile(source, temp, fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE);
    if ((await sha256File(temp)) !== expectedSha256) {
      throw new Error(`Release source changed while copying: ${path.basename(source)}`);
    }
    try {
      await fs.link(temp, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
  if ((await sha256File(target)) !== expectedSha256) {
    throw new Error(`Immutable release artifact conflicts: ${target}`);
  }
};

const releaseQcDir = path.join(capsuleDir, "artifacts", "qc", "release");
await fs.mkdir(releaseQcDir, { recursive: true });
const reports = await readScientificReports(evidenceDir, candidate);
const artifacts: CapsuleArtifact[] = [...candidate.artifacts];
for (const filename of Object.keys(SCIENTIFIC_REPORTS)) {
  const uri = `artifacts/qc/release/${filename}`;
  await commitImmutable(
    path.join(capsuleDir, uri),
    await fs.readFile(path.join(evidenceDir, filename)),
  );
  artifacts.push(await artifactForFile(capsuleDir, uri));
}

const rebuildSource = path.join(capsuleDir, "release", "rebuild-receipt.json");
const rebuild = JSON.parse(await fs.readFile(rebuildSource, "utf8")) as RebuildReceipt;
await commitImmutable(
  path.join(releaseQcDir, "rebuild-receipt.json"),
  await fs.readFile(rebuildSource),
);
artifacts.push(await artifactForFile(capsuleDir, "artifacts/qc/release/rebuild-receipt.json"));

const releaseCandidate: QuarterCapsule = { ...candidate, artifacts };
const releaseCandidatePath = path.join(capsuleDir, "capsule-release-candidate.json");
await commitImmutable(releaseCandidatePath, `${JSON.stringify(releaseCandidate, null, 2)}\n`);

const copyArtifactSet = async (destinationRoot: string, capsule: QuarterCapsule): Promise<void> => {
  const destinationCapsule = path.join(destinationRoot, candidate.period, candidate.capsuleId);
  for (const artifact of capsule.artifacts) {
    const source = path.join(capsuleDir, artifact.uri);
    const destination = path.join(destinationCapsule, artifact.uri);
    await commitImmutableFile(source, destination, artifact.sha256);
  }
  await commitImmutable(
    path.join(destinationCapsule, "capsule-candidate.json"),
    await fs.readFile(candidatePath),
  );
  await commitImmutable(
    path.join(destinationCapsule, "capsule-release-candidate.json"),
    await fs.readFile(releaseCandidatePath),
  );
};

for (let index = 0; index < replicaConfig.length; index++) {
  const destinationRoot = destinationRoots[index]!;
  await copyArtifactSet(destinationRoot, releaseCandidate);
}
const replicaReceiptsPath = path.join(releaseQcDir, "replica-receipts.json");
let replicaReceipts: ReplicaReceipt[];
try {
  replicaReceipts = JSON.parse(await fs.readFile(replicaReceiptsPath, "utf8")) as ReplicaReceipt[];
  if (
    replicaReceipts.length !== replicaConfig.length ||
    replicaReceipts.some((receipt, index) => {
      const config = replicaConfig[index]!;
      return (
        receipt.period !== candidate.period ||
        receipt.capsuleId !== candidate.capsuleId ||
        receipt.replicaId !== config.replicaId ||
        receipt.mediaId !== config.mediaId ||
        receipt.destinationId !==
          createHash("sha256").update(destinationRoots[index]!).digest("hex") ||
        receipt.candidateManifestSha256 !== candidateManifestSha256 ||
        receipt.artifactCount !== releaseCandidate.artifacts.length ||
        receipt.status !== "pass" ||
        receipt.offsite !== true
      );
    })
  ) {
    throw new Error("Existing replica receipts do not match this immutable release");
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  replicaReceipts = replicaConfig.map((config, index) => ({
    schemaVersion: "1",
    period: candidate.period,
    capsuleId: candidate.capsuleId,
    replicaId: config.replicaId,
    mediaId: config.mediaId,
    offsite: true,
    destinationId: createHash("sha256").update(destinationRoots[index]!).digest("hex"),
    candidateManifestSha256,
    // releaseCandidate includes candidate artifacts + 8 scientific reports + 1 rebuild receipt.
    // +2 accounts for replica-receipts.json and validation-report.json added after this point.
    // This converges with release-contract.ts: capsule.artifacts.length + 8 reports + 3 (rebuild + replica + validation).
    artifactCount: releaseCandidate.artifacts.length + 2,
    verifiedAt: new Date().toISOString(),
    status: "pass",
  }));
  await commitImmutable(replicaReceiptsPath, `${JSON.stringify(replicaReceipts, null, 2)}\n`);
}
artifacts.push(await artifactForFile(capsuleDir, "artifacts/qc/release/replica-receipts.json"));

const computedValidation = validateReleaseEvidence(
  candidate,
  reports,
  rebuild,
  replicaReceipts,
  candidateManifestSha256,
);
if (computedValidation.status !== "pass") {
  throw new Error(`Quarter release validation failed: ${computedValidation.violations.join(", ")}`);
}
const validationPath = path.join(releaseQcDir, "validation-report.json");
let validation: QuarterValidationReport;
try {
  validation = JSON.parse(await fs.readFile(validationPath, "utf8")) as QuarterValidationReport;
  const expected = { ...computedValidation, checkedAt: validation.checkedAt };
  if (
    !Number.isFinite(Date.parse(validation.checkedAt)) ||
    JSON.stringify(validation) !== JSON.stringify(expected)
  ) {
    throw new Error("Existing validation report does not match this immutable release");
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  validation = computedValidation;
  await commitImmutable(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
}
artifacts.push(await artifactForFile(capsuleDir, "artifacts/qc/release/validation-report.json"));

const finalCapsule: QuarterCapsule = { ...candidate, state: "sealed", artifacts };
await sealQuarterCapsule(capsuleDir, finalCapsule);

const publicArchiveDir = path.join(publicArchiveRoot, candidate.period, candidate.capsuleId);
const publicTemp = `${publicArchiveDir}.${process.pid}.${crypto.randomUUID()}.tmp`;
await fs.mkdir(publicTemp, { recursive: true });
for (const artifact of finalCapsule.artifacts.filter((item) => item.stage === "publication")) {
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

const finalManifestPath = path.join(capsuleDir, "capsule-manifest.json");
const methodologyHash = createHash("sha256")
  .update(
    finalCapsule.artifacts
      .filter((item) => item.stage === "methodology")
      .map((item) => `${item.uri}\0${item.sha256}`)
      .sort()
      .join("\n"),
  )
  .digest("hex");
const vaultHead = await sha256File(path.join(vaultDir, "vault-manifest.json"));
const signingKey = loadSigningKeyFromEnv();
const unsignedBase = {
  schemaVersion: "1",
  releaseId: candidate.capsuleId,
  period: candidate.period,
  state: "published",
  capsuleHash: await sha256File(finalManifestPath),
  vaultHead,
  methodologyHash,
  publicArchiveHash,
  validationReportHash: await sha256File(path.join(releaseQcDir, "validation-report.json")),
  rebuildReportHash: await sha256File(path.join(releaseQcDir, "rebuild-receipt.json")),
  replicaReceipts: [await sha256File(path.join(releaseQcDir, "replica-receipts.json"))],
  supersedesReleaseId: arg("--supersedes") ?? null,
  signingKeyId: signingKey.signingKeyId,
  collectorId: signingKey.collectorId,
} as const;
const releasePath = path.join(
  vaultDir,
  "releases",
  `period=${candidate.period}`,
  `${candidate.capsuleId}.json`,
);
let releaseManifest: QuarterReleaseManifest;
try {
  releaseManifest = JSON.parse(await fs.readFile(releasePath, "utf8")) as QuarterReleaseManifest;
  const { signature, ...existingUnsigned } = releaseManifest;
  const expectedUnsigned = { ...unsignedBase, publishedAt: releaseManifest.publishedAt };
  if (
    !Number.isFinite(Date.parse(releaseManifest.publishedAt)) ||
    canonicalize(existingUnsigned) !== canonicalize(expectedUnsigned) ||
    !crypto.verify(
      null,
      createHash("sha256").update(canonicalize(existingUnsigned)).digest(),
      crypto.createPublicKey(signingKey.publicKeyPem),
      Buffer.from(signature, "base64url"),
    )
  ) {
    throw new Error("Existing release manifest is invalid or belongs to another release");
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  const unsigned = { ...unsignedBase, publishedAt: new Date().toISOString() };
  const signature = crypto
    .sign(
      null,
      createHash("sha256").update(canonicalize(unsigned)).digest(),
      crypto.createPrivateKey(signingKey.privateKeyPem),
    )
    .toString("base64url");
  releaseManifest = { ...unsigned, signature };
  await commitImmutable(releasePath, `${JSON.stringify(releaseManifest, null, 2)}\n`);
}

for (let index = 0; index < destinationRoots.length; index++) {
  const destinationCapsule = path.join(
    destinationRoots[index]!,
    candidate.period,
    candidate.capsuleId,
  );
  for (const name of ["capsule-manifest.json", "capsule-signature.json"]) {
    await commitImmutable(
      path.join(destinationCapsule, name),
      await fs.readFile(path.join(capsuleDir, name)),
    );
  }
  await commitImmutable(
    path.join(destinationCapsule, "release-manifest.json"),
    await fs.readFile(releasePath),
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      command: "hdri.quarter.release",
      status: "pass",
      period: candidate.period,
      capsuleId: candidate.capsuleId,
      publicArchiveHash,
      replicasVerified: replicaReceipts.length,
      releaseManifest: releasePath,
    },
    null,
    2,
  )}\n`,
);

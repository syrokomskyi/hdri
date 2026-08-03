/*
<MODULE_CONTRACT>
<purpose>Performs the HDRI scientific release: reads a passed QuarterValidationReport, replicates sealed artifacts, publishes the public archive, and signs the QuarterReleaseManifest.</purpose>
<non-goals>
  <item>Does not validate evidence — use quarter:validate first.</item>
  <item>Does not seal the capsule — use SealCapsuleGogol first.</item>
  <item>Does not waive gates, mutate prior releases or collect new observations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0031: split combined validate+seal+release into release-only. Validation moved to quarter:validate, sealing moved to SealCapsuleGogol.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import crypto, { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyQuarterCapsuleArtifacts, type QuarterCapsule } from "@syrokomskyi/factory-core";
import { canonicalize, loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";
import {
  sha256Directory,
  sha256File,
  type QuarterValidationReport,
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
  "--capsule",
  "--validation",
  "--replica-config",
  "--vault-dir",
  "--public-archive-dir",
]) {
  if (!arg(required)) throw new Error(`${required} is required`);
}

const capsuleManifestPath = path.resolve(arg("--capsule")!);
if (path.basename(capsuleManifestPath) !== "capsule-manifest.json") {
  throw new Error("--capsule must point to capsule-manifest.json (sealed capsule)");
}
const capsuleDir = path.dirname(capsuleManifestPath);
const validationPath = path.resolve(arg("--validation")!);
const vaultDir = path.resolve(arg("--vault-dir")!);
const publicArchiveRoot = path.resolve(arg("--public-archive-dir")!);
const replicaConfig = JSON.parse(
  await fs.readFile(path.resolve(arg("--replica-config")!), "utf8"),
) as ReplicaConfig[];

const sealedCapsule = JSON.parse(await fs.readFile(capsuleManifestPath, "utf8")) as QuarterCapsule;
if (sealedCapsule.state !== "sealed") throw new Error("Release requires a sealed capsule manifest");
await verifyQuarterCapsuleArtifacts(capsuleDir, sealedCapsule);

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
const candidateManifestPath = path.join(capsuleDir, "capsule-candidate.json");
const candidateManifestSha256 = await sha256File(candidateManifestPath);

const copyArtifactSet = async (destinationRoot: string): Promise<void> => {
  const destinationCapsule = path.join(
    destinationRoot,
    sealedCapsule.period,
    sealedCapsule.capsuleId,
  );
  for (const artifact of sealedCapsule.artifacts) {
    const source = path.join(capsuleDir, artifact.uri);
    const destination = path.join(destinationCapsule, artifact.uri);
    await commitImmutableFile(source, destination, artifact.sha256);
  }
  await commitImmutable(
    path.join(destinationCapsule, "capsule-manifest.json"),
    await fs.readFile(capsuleManifestPath),
  );
  await commitImmutable(
    path.join(destinationCapsule, "capsule-signature.json"),
    await fs.readFile(path.join(capsuleDir, "capsule-signature.json")),
  );
  await commitImmutable(
    path.join(destinationCapsule, "capsule-candidate.json"),
    await fs.readFile(candidateManifestPath),
  );
};

for (let index = 0; index < replicaConfig.length; index++) {
  await copyArtifactSet(destinationRoots[index]!);
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
        receipt.period !== sealedCapsule.period ||
        receipt.capsuleId !== sealedCapsule.capsuleId ||
        receipt.replicaId !== config.replicaId ||
        receipt.mediaId !== config.mediaId ||
        receipt.destinationId !==
          createHash("sha256").update(destinationRoots[index]!).digest("hex") ||
        receipt.candidateManifestSha256 !== candidateManifestSha256 ||
        receipt.artifactCount !== sealedCapsule.artifacts.length ||
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
    period: sealedCapsule.period,
    capsuleId: sealedCapsule.capsuleId,
    replicaId: config.replicaId,
    mediaId: config.mediaId,
    offsite: true,
    destinationId: createHash("sha256").update(destinationRoots[index]!).digest("hex"),
    candidateManifestSha256,
    artifactCount: sealedCapsule.artifacts.length,
    verifiedAt: new Date().toISOString(),
    status: "pass",
  }));
  await commitImmutable(replicaReceiptsPath, `${JSON.stringify(replicaReceipts, null, 2)}\n`);
}

// Re-validate now that replica receipts exist.
const { execFileSync } = await import("node:child_process");
execFileSync(
  process.execPath,
  [
    "--import",
    "tsx",
    path.join(import.meta.dirname, "quarter-validate.ts"),
    "--candidate",
    path.join(capsuleDir, "capsule-candidate.json"),
    "--evidence-dir",
    releaseQcDir,
  ],
  { stdio: "pipe" },
);
const validation = JSON.parse(await fs.readFile(validationPath, "utf8")) as QuarterValidationReport;
if (
  validation.schemaVersion !== "1" ||
  validation.period !== sealedCapsule.period ||
  validation.capsuleId !== sealedCapsule.capsuleId ||
  validation.status !== "pass"
) {
  throw new Error("Validation report must be a pass for this capsule");
}

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

const methodologyHash = createHash("sha256")
  .update(
    sealedCapsule.artifacts
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
  releaseId: sealedCapsule.capsuleId,
  period: sealedCapsule.period,
  state: "published",
  capsuleHash: await sha256File(capsuleManifestPath),
  vaultHead,
  methodologyHash,
  publicArchiveHash,
  validationReportHash: await sha256File(validationPath),
  rebuildReportHash: await sha256File(path.join(releaseQcDir, "rebuild-receipt.json")),
  replicaReceipts: [await sha256File(replicaReceiptsPath)],
  supersedesReleaseId: arg("--supersedes") ?? null,
  signingKeyId: signingKey.signingKeyId,
  collectorId: signingKey.collectorId,
} as const;
const releasePath = path.join(
  vaultDir,
  "releases",
  `period=${sealedCapsule.period}`,
  `${sealedCapsule.capsuleId}.json`,
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
    sealedCapsule.period,
    sealedCapsule.capsuleId,
  );
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
      period: sealedCapsule.period,
      capsuleId: sealedCapsule.capsuleId,
      publicArchiveHash,
      replicasVerified: replicaReceipts.length,
      releaseManifest: releasePath,
    },
    null,
    2,
  )}\n`,
);

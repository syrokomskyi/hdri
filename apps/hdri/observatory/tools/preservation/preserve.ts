/*
<MODULE_CONTRACT>
<purpose>Preservation coordinator: copies, replica verification, and content manifest signing.</purpose>
<non-goals>
  <item>Does not perform identity resolution or baseline conversion — see baseline-import.ts.</item>
  <item>Does not run database migrations or checkpoint original databases.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: preservation and replica coordinator.</item>
  <item>RFC-0100 review fix: DNA-8 — persist Ed25519 signature to disk; always check replica independence in verifyReplicas.</item>
  <item>RFC-0113 A1: SQLite snapshot via backup API; hash-once-copy-exact; per-destination receipts; manifest+signature at every destination; compare copies to original inventory; source/destination non-overlap; destination-level independence.</item>
</CHANGE_SUMMARY>
*/

import { createHash, sign as cryptoSign, createPrivateKey } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";
import { canonicalize, type SigningKeyConfig } from "@syrokomskyi/observatory-crypto";

import type { PreservationDiagnostic } from "./contracts.js";
import { acquirePreservationLock, sha256File, type InventoryEntry } from "./inventory.js";

// ---------------------------------------------------------------------------
// Replica metadata
// ---------------------------------------------------------------------------

export type ReplicaInfo = Readonly<{
  path: string;
  sha256: string;
  bytes: number;
  failureDomain: string;
  medium: string;
  credentialBoundary: string;
}>;

export type DestinationInfo = Readonly<{
  path: string;
  failureDomain: string;
  medium: string;
  credentialBoundary: string;
}>;

export type DestinationReceipt = Readonly<{
  schema: "hdri-destination-receipt@1";
  period: string;
  destination: DestinationInfo;
  objects: ReplicaInfo[];
  totalObjects: number;
  totalBytes: number;
  contentManifestSha256: string;
  signatureSha256: string;
}>;

// ---------------------------------------------------------------------------
// SQLite detection and consistent snapshot via backup API
// ---------------------------------------------------------------------------

const SQLITE_MAGIC = Buffer.from("SQLite format 3\x00", "utf8");

const isSqliteFile = async (filePath: string): Promise<boolean> => {
  try {
    const fd = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(16);
      await fd.read(buf, 0, 16, 0);
      return buf.subarray(0, 15).equals(SQLITE_MAGIC.subarray(0, 15));
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
};

const snapshotSqlite = async (sourcePath: string, snapshotDir: string): Promise<string> => {
  const snapshotPath = path.join(snapshotDir, path.basename(sourcePath));
  await fs.mkdir(snapshotDir, { recursive: true });
  const db = new Database(sourcePath, { readonly: true });
  await db.backup(snapshotPath);
  db.close();
  return snapshotPath;
};

// ---------------------------------------------------------------------------
// Copy with SHA-256 verification — hash source once, copy exact bytes, verify
// ---------------------------------------------------------------------------

export const copyWithVerification = async (
  source: string,
  dest: string,
  failureDomain: string,
  medium: string,
  credentialBoundary: string,
): Promise<ReplicaInfo> => {
  const sourceSha256 = await sha256File(source);
  const sourceStat = await fs.stat(source);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  const destSha256 = await sha256File(dest);
  if (destSha256 !== sourceSha256) {
    throw new Error(`Content digest mismatch after copy: ${source} → ${dest}`);
  }
  const destStat = await fs.stat(dest);
  if (destStat.size !== sourceStat.size) {
    throw new Error(`Size mismatch after copy: ${source} → ${dest}`);
  }
  return {
    path: dest,
    sha256: destSha256,
    bytes: destStat.size,
    failureDomain,
    medium,
    credentialBoundary,
  };
};

// ---------------------------------------------------------------------------
// Check destination independence — two destinations on one drive are not independent
// ---------------------------------------------------------------------------

export const checkDestinationIndependence = (destinations: DestinationInfo[]): void => {
  const failureDomains = new Set(destinations.map((d) => d.failureDomain));
  if (failureDomains.size < destinations.length) {
    throw new Error("UNVERIFIED_REPLICA: two destinations share the same failure domain");
  }
  const media = new Set(destinations.map((d) => d.medium));
  if (media.size < destinations.length) {
    throw new Error("UNVERIFIED_REPLICA: two destinations share the same medium");
  }
};

// ---------------------------------------------------------------------------
// Check source/destination non-overlap
// ---------------------------------------------------------------------------

export const checkSourceDestinationNonOverlap = (
  sourceRoot: string,
  destinations: string[],
): void => {
  const resolvedSource = path.resolve(sourceRoot);
  for (const dest of destinations) {
    const resolvedDest = path.resolve(dest);
    if (resolvedDest === resolvedSource || resolvedDest.startsWith(resolvedSource + path.sep)) {
      throw new Error(`Source/destination overlap: ${resolvedDest} is inside ${resolvedSource}`);
    }
    if (resolvedSource.startsWith(resolvedDest + path.sep)) {
      throw new Error(`Source/destination overlap: ${resolvedSource} is inside ${resolvedDest}`);
    }
  }
};

// ---------------------------------------------------------------------------
// Sign content manifest (Ed25519 detached signature)
// ---------------------------------------------------------------------------

export type ContentManifest = Readonly<{
  schema: "hdri-content-manifest@1";
  period: string;
  artifacts: InventoryEntry[];
}>;

export const signContentManifest = async (
  manifest: ContentManifest,
  signingKey: SigningKeyConfig,
): Promise<{ manifestSha256: string; signature: string }> => {
  const payload = createHash("sha256").update(canonicalize(manifest), "utf8").digest();
  const signature = cryptoSign(null, payload, createPrivateKey(signingKey.privateKeyPem)).toString(
    "base64url",
  );
  return { manifestSha256: payload.toString("hex"), signature };
};

// ---------------------------------------------------------------------------
// Preserve Q2 — orchestrate lock, inventory, copies, signing
// ---------------------------------------------------------------------------

export type PreserveQ2Options = {
  inventory: InventoryEntry[];
  archiveRoot: string;
  dryRun: boolean;
  signingKey: SigningKeyConfig;
  replicaDestinations: {
    dest: string;
    failureDomain: string;
    medium: string;
    credentialBoundary: string;
  }[];
};

// Backward-compat: check independence across a flat list of replica objects
export const checkReplicaIndependence = (replicas: ReplicaInfo[]): void => {
  const failureDomains = new Set(replicas.map((r) => r.failureDomain));
  if (failureDomains.size < replicas.length) {
    throw new Error("UNVERIFIED_REPLICA: two replicas share the same failure domain");
  }
  const media = new Set(replicas.map((r) => r.medium));
  if (media.size < replicas.length) {
    throw new Error("UNVERIFIED_REPLICA: two replicas share the same medium");
  }
};

export const preserveQ2 = async (opts: PreserveQ2Options): Promise<PreservationDiagnostic> => {
  const lock = await acquirePreservationLock(opts.archiveRoot);

  try {
    if (opts.dryRun) {
      return {
        schema: "hdri-preservation@1",
        operation: "preserve:q2",
        status: "pass",
        inputFingerprint: createHash("sha256")
          .update(opts.inventory.map((e) => e.sha256).join("\n"))
          .digest("hex"),
        evidenceRefs: [],
        violations: [],
      };
    }

    if (opts.inventory.length === 0) {
      throw new Error("Cannot preserve an empty inventory");
    }
    if (opts.replicaDestinations.length < 3) {
      throw new Error(
        `RFC-0100 requires at least 3 replicas, got ${opts.replicaDestinations.length}`,
      );
    }

    // Check source/destination non-overlap
    checkSourceDestinationNonOverlap(
      opts.archiveRoot,
      opts.replicaDestinations.map((d) => d.dest),
    );

    // Check destination independence
    const destInfos: DestinationInfo[] = opts.replicaDestinations.map((d) => ({
      path: d.dest,
      failureDomain: d.failureDomain,
      medium: d.medium,
      credentialBoundary: d.credentialBoundary,
    }));
    checkDestinationIndependence(destInfos);

    // Snapshot SQLite databases consistently, then hash-once-copy-exact
    const snapshotDir = path.join(opts.archiveRoot, ".snapshots");
    const snapshotPaths = new Map<string, string>(); // originalPath → snapshotPath
    for (const entry of opts.inventory) {
      if (await isSqliteFile(entry.absolutePath)) {
        const snapshotPath = await snapshotSqlite(entry.absolutePath, snapshotDir);
        snapshotPaths.set(entry.absolutePath, snapshotPath);
      }
    }

    // Sign content manifest (computed from original inventory hashes)
    const manifest: ContentManifest = {
      schema: "hdri-content-manifest@1",
      period: "2026-q2",
      artifacts: opts.inventory,
    };
    const { manifestSha256, signature } = await signContentManifest(manifest, opts.signingKey);
    const signatureSha256 = createHash("sha256").update(signature, "utf8").digest("hex");

    // Per-destination: copy all objects, emit receipt at each destination
    const allReceiptPaths: string[] = [];
    for (const dest of opts.replicaDestinations) {
      const destReplicas: ReplicaInfo[] = [];
      let totalBytes = 0;

      for (const entry of opts.inventory) {
        // Use snapshot if available, otherwise original
        const sourcePath = snapshotPaths.get(entry.absolutePath) ?? entry.absolutePath;
        const destPath = path.join(dest.dest, entry.role);
        const replica = await copyWithVerification(
          sourcePath,
          destPath,
          dest.failureDomain,
          dest.medium,
          dest.credentialBoundary,
        );
        destReplicas.push(replica);
        totalBytes += replica.bytes;
      }

      // Write manifest + signature at every destination
      const destManifestPath = path.join(dest.dest, "content-manifest.json");
      await fs.mkdir(dest.dest, { recursive: true });
      await fs.writeFile(destManifestPath, JSON.stringify(manifest, null, 2), "utf8");
      const destSigPath = path.join(dest.dest, "content-manifest.sig");
      await fs.writeFile(destSigPath, signature, "utf8");

      // Per-destination receipt
      const destReceipt: DestinationReceipt = {
        schema: "hdri-destination-receipt@1",
        period: "2026-q2",
        destination: {
          path: dest.dest,
          failureDomain: dest.failureDomain,
          medium: dest.medium,
          credentialBoundary: dest.credentialBoundary,
        },
        objects: destReplicas,
        totalObjects: destReplicas.length,
        totalBytes,
        contentManifestSha256: manifestSha256,
        signatureSha256,
      };
      const destReceiptPath = path.join(dest.dest, "destination-receipt.json");
      await fs.writeFile(destReceiptPath, JSON.stringify(destReceipt, null, 2), "utf8");
      allReceiptPaths.push(destReceiptPath);
    }

    // Also write a combined receipt at archive root for backward compat
    const allReplicas: ReplicaInfo[] = [];
    for (const dest of opts.replicaDestinations) {
      for (const entry of opts.inventory) {
        const destPath = path.join(dest.dest, entry.role);
        const sha256 = await sha256File(destPath);
        const stat = await fs.stat(destPath);
        allReplicas.push({
          path: destPath,
          sha256,
          bytes: stat.size,
          failureDomain: dest.failureDomain,
          medium: dest.medium,
          credentialBoundary: dest.credentialBoundary,
        });
      }
    }
    const legacyReceipt: DestinationReceipt = {
      schema: "hdri-destination-receipt@1",
      period: "2026-q2",
      destination: {
        path: opts.archiveRoot,
        failureDomain: "archive",
        medium: "local",
        credentialBoundary: "archive",
      },
      objects: allReplicas,
      totalObjects: allReplicas.length,
      totalBytes: allReplicas.reduce((sum, r) => sum + r.bytes, 0),
      contentManifestSha256: manifestSha256,
      signatureSha256,
    };
    const legacyReceiptPath = path.join(opts.archiveRoot, "replica-receipt.json");
    await fs.writeFile(legacyReceiptPath, JSON.stringify(legacyReceipt, null, 2), "utf8");
    allReceiptPaths.push(legacyReceiptPath);

    // Verify copies against original inventory
    for (const dest of opts.replicaDestinations) {
      for (const entry of opts.inventory) {
        const destPath = path.join(dest.dest, entry.role);
        const destSha256 = await sha256File(destPath);
        if (destSha256 !== entry.sha256) {
          throw new Error(
            `Copy verification failed: ${destPath} sha256 ${destSha256} != inventory ${entry.sha256}`,
          );
        }
      }
    }

    return {
      schema: "hdri-preservation@1",
      operation: "preserve:q2",
      status: "pass",
      inputFingerprint: manifestSha256,
      evidenceRefs: allReceiptPaths,
      violations: [],
    };
  } finally {
    await lock.release();
  }
};

// ---------------------------------------------------------------------------
// Verify replicas (AC-7: fewer than 3 independent complete copies → incomplete)
// ---------------------------------------------------------------------------

export type VerifyReplicasOptions = {
  archivePath: string;
  full: boolean;
  expectedReplicaCount: number;
};

export const verifyReplicas = async (
  opts: VerifyReplicasOptions,
): Promise<PreservationDiagnostic> => {
  const receiptPath = path.join(opts.archivePath, "replica-receipt.json");

  let receipt: DestinationReceipt;
  try {
    const raw = await fs.readFile(receiptPath, "utf8");
    receipt = JSON.parse(raw) as DestinationReceipt;
  } catch {
    return {
      schema: "hdri-preservation@1",
      operation: "preserve:verify",
      status: "incomplete",
      inputFingerprint: "",
      evidenceRefs: [],
      violations: [
        {
          code: "MISSING_EVIDENCE",
          message: "replica-receipt.json not found",
          artifactRef: receiptPath,
        },
      ],
    };
  }

  if (receipt.objects.length < opts.expectedReplicaCount) {
    return {
      schema: "hdri-preservation@1",
      operation: "preserve:verify",
      status: "incomplete",
      inputFingerprint: receipt.contentManifestSha256,
      evidenceRefs: [],
      violations: [
        {
          code: "UNVERIFIED_REPLICA",
          message: `Expected ${opts.expectedReplicaCount} replicas, found ${receipt.objects.length}`,
          artifactRef: receiptPath,
        },
      ],
    };
  }

  // Verify each replica's content digest (full mode) and independence (always)
  const violations: PreservationDiagnostic["violations"] = [];

  if (opts.full) {
    // Full mode: re-verify each replica's content digest on disk
    for (const replica of receipt.objects) {
      try {
        const actualSha256 = await sha256File(replica.path);
        if (actualSha256 !== replica.sha256) {
          violations.push({
            code: "UNVERIFIED_REPLICA",
            message: `Content digest mismatch for ${replica.path}`,
            artifactRef: replica.path,
          });
        }
      } catch {
        violations.push({
          code: "MISSING_EVIDENCE",
          message: `Replica file not found: ${replica.path}`,
          artifactRef: replica.path,
        });
      }
    }
  }

  // Independence is always required (AC-7: "three independent complete copies")
  try {
    checkReplicaIndependence(receipt.objects);
  } catch (error) {
    violations.push({
      code: "UNVERIFIED_REPLICA",
      message: error instanceof Error ? error.message : String(error),
      artifactRef: receiptPath,
    });
  }

  return {
    schema: "hdri-preservation@1",
    operation: "preserve:verify",
    status: violations.length === 0 ? "pass" : "incomplete",
    inputFingerprint: receipt.contentManifestSha256,
    evidenceRefs: [receiptPath],
    violations,
  };
};

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
</CHANGE_SUMMARY>
*/

import { createHash, sign as cryptoSign, createPrivateKey } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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

export type ReplicaReceipt = Readonly<{
  schema: "hdri-replica-receipt@1";
  period: string;
  replicas: ReplicaInfo[];
  contentManifestSha256: string;
  signatureSha256: string;
}>;

// ---------------------------------------------------------------------------
// Copy with SHA-256 verification
// ---------------------------------------------------------------------------

export const copyWithVerification = async (
  source: string,
  dest: string,
  failureDomain: string,
  medium: string,
  credentialBoundary: string,
): Promise<ReplicaInfo> => {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  const sha256 = await sha256File(dest);
  const stat = await fs.stat(dest);
  return { path: dest, sha256, bytes: stat.size, failureDomain, medium, credentialBoundary };
};

// ---------------------------------------------------------------------------
// Check replica independence — two paths on one drive are not independent
// ---------------------------------------------------------------------------

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

    // Copy primary + two independent replicas
    const replicas: ReplicaInfo[] = [];
    for (const dest of opts.replicaDestinations) {
      // For each destination, copy all inventory files
      for (const entry of opts.inventory) {
        const destPath = path.join(dest.dest, entry.role);
        const replica = await copyWithVerification(
          entry.absolutePath,
          destPath,
          dest.failureDomain,
          dest.medium,
          dest.credentialBoundary,
        );
        replicas.push(replica);
      }
    }

    checkReplicaIndependence(replicas);

    // Sign content manifest
    const manifest: ContentManifest = {
      schema: "hdri-content-manifest@1",
      period: "2026-q2",
      artifacts: opts.inventory,
    };
    const { manifestSha256, signature } = await signContentManifest(manifest, opts.signingKey);

    // Write replica receipt with actual signature
    const signaturePath = path.join(opts.archiveRoot, "content-manifest.sig");
    await fs.writeFile(signaturePath, signature, "utf8");
    const signatureSha256 = createHash("sha256").update(signature, "utf8").digest("hex");

    const receipt: ReplicaReceipt = {
      schema: "hdri-replica-receipt@1",
      period: "2026-q2",
      replicas,
      contentManifestSha256: manifestSha256,
      signatureSha256,
    };
    const receiptPath = path.join(opts.archiveRoot, "replica-receipt.json");
    await fs.mkdir(opts.archiveRoot, { recursive: true });
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");

    return {
      schema: "hdri-preservation@1",
      operation: "preserve:q2",
      status: "pass",
      inputFingerprint: manifestSha256,
      evidenceRefs: [receiptPath],
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

  let receipt: ReplicaReceipt;
  try {
    const raw = await fs.readFile(receiptPath, "utf8");
    receipt = JSON.parse(raw) as ReplicaReceipt;
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

  if (receipt.replicas.length < opts.expectedReplicaCount) {
    return {
      schema: "hdri-preservation@1",
      operation: "preserve:verify",
      status: "incomplete",
      inputFingerprint: receipt.contentManifestSha256,
      evidenceRefs: [],
      violations: [
        {
          code: "UNVERIFIED_REPLICA",
          message: `Expected ${opts.expectedReplicaCount} replicas, found ${receipt.replicas.length}`,
          artifactRef: receiptPath,
        },
      ],
    };
  }

  // Verify each replica's content digest (full mode) and independence (always)
  const violations: PreservationDiagnostic["violations"] = [];

  if (opts.full) {
    // Full mode: re-verify each replica's content digest on disk
    for (const replica of receipt.replicas) {
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
    checkReplicaIndependence(receipt.replicas);
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

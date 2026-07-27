/*
<MODULE_CONTRACT>
<purpose>Pure assembly + hashing for third-party-verifiable publication timestamps (finding 2).
ed25519 signatures prove *authorship* but the key holder could rewrite history and re-sign it;
a public index claiming an industry role needs immutability that a third party can verify without
trusting the operator. This module builds a canonical "publication record" pinning the sha256 of
the vault manifest + methodology index for a period, whose own hash is then anchored (OpenTimestamps
→ Bitcoin) by the CLI. Kept pure so the record shape + hashing are unit-tested without network.</purpose>
<non-goals>
  <item>No network, no OpenTimestamps calls, no filesystem writes — the CLI owns those.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Finding 2: publication-record assembly + hashing for OpenTimestamps anchoring.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import crypto from "node:crypto";
import fs from "node:fs";

export const PUBLICATION_RECORD_KIND = "observatory-publication-record" as const;
export const PUBLICATION_RECORD_VERSION = 1 as const;

/** One pinned artifact whose exact bytes must be provably unchanged after publication. */
export type PinnedFile = {
  /** Stable label, e.g. "vault-manifest" or "methodology-index". */
  readonly label: string;
  /** Path relative to the repo/vault root, forward-slashed (portable, human-checkable). */
  readonly relPath: string;
  readonly sha256: string;
  readonly bytes: number;
};

/**
 * The immutable fingerprint of one period's publication. Anchoring the sha256 of THIS record
 * (see {@link recordDigest}) with OpenTimestamps proves the manifest + methodology existed, in
 * exactly these bytes, at the anchored time — so a later silent rewrite is detectable by anyone.
 */
export type PublicationRecord = {
  readonly kind: typeof PUBLICATION_RECORD_KIND;
  readonly version: typeof PUBLICATION_RECORD_VERSION;
  readonly period: string;
  readonly publishedRunId: string;
  readonly createdAt: string;
  readonly files: readonly PinnedFile[];
};

/** Streaming sha256 (hex) of a file — bounded memory even for a large manifest. */
export function hashFile(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(absPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export type PublicationInput = {
  readonly period: string;
  readonly publishedRunId: string;
  /** Files to pin; each with a label, its vault/repo-relative path, and absolute path to hash. */
  readonly files: ReadonlyArray<{ label: string; relPath: string; absPath: string }>;
  /** Injectable for deterministic tests; defaults to now. */
  readonly createdAt?: string;
};

/** Hashes each pinned file and assembles the publication record. */
export async function buildPublicationRecord(input: PublicationInput): Promise<PublicationRecord> {
  const files: PinnedFile[] = [];
  for (const f of input.files) {
    const stat = await fs.promises.stat(f.absPath);
    files.push({
      label: f.label,
      relPath: f.relPath,
      sha256: await hashFile(f.absPath),
      bytes: stat.size,
    });
  }
  // Sort by label so the record is order-independent (stable digest regardless of input order).
  files.sort((a, b) => a.label.localeCompare(b.label));
  return {
    kind: PUBLICATION_RECORD_KIND,
    version: PUBLICATION_RECORD_VERSION,
    period: input.period,
    publishedRunId: input.publishedRunId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    files,
  };
}

/**
 * Deterministic UTF-8 bytes of a record — the exact payload written to disk AND fed to
 * OpenTimestamps, so the on-disk publication.json and the anchored digest can never disagree.
 * Pretty-printed with the field order fixed here (stable across runs and machines).
 */
export function canonicalRecordBytes(record: PublicationRecord): Buffer {
  const ordered = {
    kind: record.kind,
    version: record.version,
    period: record.period,
    publishedRunId: record.publishedRunId,
    createdAt: record.createdAt,
    files: record.files.map((f) => ({
      label: f.label,
      relPath: f.relPath,
      sha256: f.sha256,
      bytes: f.bytes,
    })),
  };
  return Buffer.from(JSON.stringify(ordered, null, 2) + "\n", "utf-8");
}

/** sha256 (hex) of a record's canonical bytes — the value anchored by OpenTimestamps. */
export function recordDigest(record: PublicationRecord): string {
  return crypto.createHash("sha256").update(canonicalRecordBytes(record)).digest("hex");
}

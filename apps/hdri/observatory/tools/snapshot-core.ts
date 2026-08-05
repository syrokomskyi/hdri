/*
<MODULE_CONTRACT>
<purpose>Pure checksum + manifest + verify logic for canonical observatory snapshots (WP6 durability).</purpose>
<non-goals>
  <item>No copying / DB backup — the CLI (snapshot-canonical.ts) does I/O and orchestration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP6: extracted so snapshot integrity is unit-testable.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: snapshot integrity is verified by SHA-256; never modify a frozen snapshot

import fs from "node:fs";
import fsp from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

export type SnapshotFileEntry = {
  /** Path relative to the snapshot root, forward-slashed (portable). */
  path: string;
  bytes: number;
  sha256: string;
  access?: "public" | "internal" | "restricted";
  role?: string;
};

export type SnapshotRunInfo = {
  run_id: string;
  period: string;
  codebook_version: string;
  publication_status: string | null;
};

export type SnapshotManifest = {
  kind: "observatory-canonical-snapshot";
  schemaVersion: 1;
  createdAt: string;
  year: number;
  /** Published runs captured in this snapshot (provenance). */
  publishedRuns: SnapshotRunInfo[];
  files: SnapshotFileEntry[];
};

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Build a manifest entry for `relPath` resolved against `rootDir`. */
export async function hashEntry(rootDir: string, relPath: string): Promise<SnapshotFileEntry> {
  const abs = path.join(rootDir, relPath);
  const stat = await fsp.stat(abs);
  return {
    path: relPath.split(path.sep).join("/"),
    bytes: stat.size,
    sha256: await sha256File(abs),
  };
}

export type VerifyResult = {
  ok: boolean;
  checked: number;
  mismatches: string[];
  missing: string[];
};

const resolveSnapshotEntry = (rootDir: string, relativePath: string): string => {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe snapshot manifest path: ${relativePath}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    throw new Error(`Snapshot entry escapes root: ${relativePath}`);
  }
  return resolved;
};

/** Re-hash every file listed in `manifest` under `rootDir` and compare. */
export async function verifyManifest(
  rootDir: string,
  manifest: SnapshotManifest,
): Promise<VerifyResult> {
  const mismatches: string[] = [];
  const missing: string[] = [];
  for (const entry of manifest.files) {
    let abs: string;
    try {
      abs = resolveSnapshotEntry(rootDir, entry.path);
    } catch {
      mismatches.push(entry.path);
      continue;
    }
    try {
      const stat = await fsp.stat(abs);
      if (stat.size !== entry.bytes) {
        mismatches.push(entry.path);
        continue;
      }
      const hash = await sha256File(abs);
      if (hash !== entry.sha256) mismatches.push(entry.path);
    } catch {
      missing.push(entry.path);
    }
  }
  return {
    ok: mismatches.length === 0 && missing.length === 0,
    checked: manifest.files.length,
    mismatches,
    missing,
  };
}

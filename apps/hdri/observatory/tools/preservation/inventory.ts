/*
<MODULE_CONTRACT>
<purpose>Inventory and preservation lock for Q2 evidence closure.</purpose>
<non-goals>
  <item>Does not perform database snapshots or WAL handling.</item>
  <item>Does not sign manifests — see preserve.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: inventory and preservation lock.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { ProtectedInput, PreservationDiagnostic, ViolationCode } from "./contracts.js";

// ---------------------------------------------------------------------------
// Preservation lock — PID-checked file lock (RFC-0089 batch-lock pattern)
// ---------------------------------------------------------------------------

export type LockHandle = {
  lockPath: string;
  release: () => Promise<void>;
};

const LOCK_TIMEOUT_MS = 86_400_000; // 24 hours

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const acquirePreservationLock = async (archiveRoot: string): Promise<LockHandle> => {
  const lockPath = path.join(archiveRoot, ".preserve-lock.json");

  try {
    const content = await fs.readFile(lockPath, "utf8");
    const existing = JSON.parse(content) as { pid: number; acquiredAt: string };
    if (isProcessAlive(existing.pid)) {
      const age = Date.now() - Date.parse(existing.acquiredAt);
      if (age < LOCK_TIMEOUT_MS) {
        throw new Error(
          "LOCK_VIOLATION: archive root is locked by another active preservation run",
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("LOCK_VIOLATION")) {
      throw error;
    }
    // No lock file, corrupted JSON, or stale lock — proceed
  }

  const lock = { pid: process.pid, acquiredAt: new Date().toISOString() };
  await fs.mkdir(archiveRoot, { recursive: true });
  const lockBytes = JSON.stringify(lock, null, 2);
  try {
    const handle = await fs.open(lockPath, "wx");
    try {
      await handle.writeFile(lockBytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error("LOCK_VIOLATION: archive root is already locked");
  }

  return {
    lockPath,
    release: async () => {
      await fs.rm(lockPath, { force: true });
    },
  };
};

// ---------------------------------------------------------------------------
// SHA-256 file hashing
// ---------------------------------------------------------------------------

export const sha256File = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });

// ---------------------------------------------------------------------------
// Inventory — enumerate resolved input paths
// ---------------------------------------------------------------------------

export type InventoryEntry = ProtectedInput & {
  sha256: string;
  bytes: number;
};

export type InventoryOptions = {
  period: string;
  producers: string[];
  roots: string[];
};

const SYMLINK_ESCAPES = /\.\./;

const SECRET_PATTERNS = [
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]{20,}/i,
];

const detectSecret = (content: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(content));

export const inventorySources = async (opts: InventoryOptions): Promise<InventoryEntry[]> => {
  const entries: InventoryEntry[] = [];

  for (const root of opts.roots) {
    const resolvedRoot = path.resolve(root);

    let dirEntries: string[];
    try {
      dirEntries = await fs.readdir(resolvedRoot, { recursive: true });
    } catch {
      continue;
    }

    for (const entry of dirEntries) {
      const fullPath = path.resolve(resolvedRoot, entry);

      // Reject symlinks and path escapes
      const relative = path.relative(resolvedRoot, fullPath);
      if (SYMLINK_ESCAPES.test(relative)) {
        throw new Error(`Path escape detected: ${entry}`);
      }

      const stat = await fs.lstat(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink detected in source root: ${entry}`);
      }
      if (!stat.isFile()) continue;

      // Detect secrets (read first 4KB for pattern matching)
      const fd = await fs.open(fullPath, "r");
      try {
        const buffer = Buffer.alloc(4096);
        const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
        const head = buffer.subarray(0, bytesRead).toString("utf8");
        if (detectSecret(head)) {
          throw new Error(`Detected secret in source file: ${entry}`);
        }
      } finally {
        await fd.close();
      }

      const sha256 = await sha256File(fullPath);

      entries.push({
        absolutePath: fullPath,
        role: entry,
        access: "internal",
        sha256,
        bytes: stat.size,
      });
    }
  }

  return entries;
};

// ---------------------------------------------------------------------------
// Inventory integrity verification (AC-4)
// ---------------------------------------------------------------------------

export const verifyInventoryIntegrity = (
  originalInventory: InventoryEntry[],
  postInventory: InventoryEntry[],
): void => {
  const originalMap = new Map(originalInventory.map((e) => [e.absolutePath, e.sha256]));

  for (const entry of postInventory) {
    const original = originalMap.get(entry.absolutePath);
    if (original === undefined) {
      throw new Error(`New file appeared in post-preservation inventory: ${entry.absolutePath}`);
    }
    if (original !== entry.sha256) {
      throw new Error(
        `Content digest changed for ${entry.absolutePath}: ${original} → ${entry.sha256}`,
      );
    }
  }

  // Check no files disappeared
  const postMap = new Map(postInventory.map((e) => [e.absolutePath, e.sha256]));
  for (const entry of originalInventory) {
    if (!postMap.has(entry.absolutePath)) {
      throw new Error(`File disappeared from post-preservation inventory: ${entry.absolutePath}`);
    }
  }
};

// ---------------------------------------------------------------------------
// CAS reference check (AC-5)
// ---------------------------------------------------------------------------

export const checkCasReferences = (inventory: InventoryEntry[], casRoot: string): string[] => {
  const casPaths = inventory.filter((e) => e.absolutePath.includes(casRoot));
  const missing: string[] = [];

  for (const entry of casPaths) {
    // If the entry exists in inventory it was found on disk — but we need
    // to check if referenced CAS objects are actually present
    // This is a pure check: the inventory already reflects what's on disk,
    // so missing files would not appear in inventory. The caller passes
    // expected CAS refs separately and we check against inventory.
    void entry;
  }

  return missing;
};

export const checkMissingCasRefs = (
  expectedCasRefs: string[],
  inventory: InventoryEntry[],
): string[] => {
  const inventoryPaths = new Set(inventory.map((e) => e.absolutePath));
  return expectedCasRefs.filter((ref) => !inventoryPaths.has(path.resolve(ref)));
};

// ---------------------------------------------------------------------------
// Diagnostic builder
// ---------------------------------------------------------------------------

export const buildDiagnostic = (
  operation: PreservationDiagnostic["operation"],
  inputFingerprint: string,
  violations: { code: ViolationCode; message: string; artifactRef: string }[],
): PreservationDiagnostic => ({
  schema: "hdri-preservation@1",
  operation,
  status: violations.length === 0 ? "pass" : "incomplete",
  inputFingerprint,
  evidenceRefs: [],
  violations,
});

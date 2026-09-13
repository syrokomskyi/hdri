/*
<MODULE_CONTRACT>
<purpose>Inventory exact Q2 source bytes with unique relative identities and fail-closed acquisition checks.</purpose>
<non-goals>
  <item>Does not perform database snapshots or WAL handling.</item>
  <item>Does not sign manifests — see preserve.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: inventory and preservation lock.</item>
  <item>RFC-0100 review fix: remove dead code, delegate lock to shared @syrokomskyi/utils acquirePidLock (DNA-3).</item>
  <item>Reject missing roots, duplicate identities and changed files; scan complete file streams for secrets.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { assertCanonicalFilePath, assertDisjointPaths, inspectRetainedFile } from "@warpgogol/pipeline-node";

import { acquirePidLock, type PidLockHandle } from "@syrokomskyi/utils";

import type { ProtectedInput } from "./contracts.js";
// @ai-invariant: Inventorying original evidence never creates locks, snapshots or any other source-side files.

// ---------------------------------------------------------------------------
// Preservation lock — delegates to shared PID-checked lock (DNA-3)
// ---------------------------------------------------------------------------

export type LockHandle = PidLockHandle;

const LOCK_TIMEOUT_MS = 86_400_000; // 24 hours

export const acquirePreservationLock = async (archiveRoot: string): Promise<LockHandle> =>
  acquirePidLock(
    archiveRoot,
    { lockFileName: ".preserve-lock.json", timeoutMs: LOCK_TIMEOUT_MS },
    "LOCK_VIOLATION",
  );

// ---------------------------------------------------------------------------
// SHA-256 file hashing
// ---------------------------------------------------------------------------

export const sha256File = async (filePath: string): Promise<string> =>
  (await inspectRetainedFile(filePath)).sha256;

// ---------------------------------------------------------------------------
// Inventory — enumerate resolved input paths
// ---------------------------------------------------------------------------

export type InventoryEntry = ProtectedInput & {
  sha256: string;
  bytes: number;
};

export type InventoryOptions = {
  roots: string[];
};

const SECRET_PATTERNS = [
  /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]{20,}/i,
];

const detectSecret = (content: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(content));

export const inventorySources = async (opts: InventoryOptions): Promise<InventoryEntry[]> => {
  const entries: InventoryEntry[] = [];
  if (!Array.isArray(opts.roots) || !opts.roots.length) throw new Error("SOURCE_ROOTS_REQUIRED");
  const roots = [...opts.roots].sort();
  for (const root of roots) {
    await assertCanonicalFilePath(root);
    if (root === path.parse(root).root || !(await fs.lstat(root)).isDirectory()) throw new Error("INVALID_SOURCE_ROOT");
  }
  assertDisjointPaths(roots);
  for (const [index, root] of roots.entries()) {
    const visit = async (relative: string): Promise<void> => {
      for (const name of (await fs.readdir(path.join(root, relative))).sort()) {
        const local = path.join(relative, name);
        const fullPath = path.join(root, local);
        await assertCanonicalFilePath(fullPath);
        const stat = await fs.lstat(fullPath);
        if (stat.isDirectory()) { await visit(local); continue; }
        if (!stat.isFile()) throw new Error("UNSUPPORTED_SOURCE_OBJECT");
        if (entries.length >= 1_000_000) throw new Error("SOURCE_OBJECT_LIMIT_EXCEEDED");
        let tail = "";
        const digest = await inspectRetainedFile(fullPath, chunk => {
          const text = tail + chunk.toString("utf8");
          if (detectSecret(text)) throw new Error(`Detected secret in source file: ${local}`);
          tail = text.slice(-256);
        });
        entries.push({ absolutePath: fullPath, role: `source-${String(index).padStart(4, "0")}/${local.split(path.sep).join("/")}`, access: "internal", ...digest });
      }
    };
    await visit("");
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

export const checkMissingCasRefs = (
  expectedCasRefs: string[],
  inventory: InventoryEntry[],
): string[] => {
  const inventoryPaths = new Set(inventory.map((e) => e.absolutePath));
  return expectedCasRefs.filter((ref) => !inventoryPaths.has(path.resolve(ref)));
};

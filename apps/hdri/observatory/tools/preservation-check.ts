/*
<MODULE_CONTRACT>
<purpose>Full-byte integrity scan of retained closure — read-only, never modifies sealed artifacts.</purpose>
<non-goals>
  <item>Does not write, repair, or modify any sealed artifact.</item>
  <item>Does not perform network operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Require an exact non-empty hash inventory; detect missing, unexpected, unsafe and symlinked objects without modifying the archive.</item>
  <item>RFC-0112: add preservation:check full-byte integrity scan tool.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "@syrokomskyi/observatory-vault";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

export type IntegrityReport = {
  schema: string;
  operation: string;
  status: string;
  archiveRoot: string;
  totalObjects: number;
  verifiedObjects: number;
  corruptedObjects: number;
  violations: string[];
};

// @ai-invariant: Only bytes matched to an exact expected path count as verified.
export const checkPreservation = async (
  archiveRoot: string,
  expectedHashes: unknown,
): Promise<IntegrityReport> => {
  const root = path.resolve(archiveRoot);
  const violations: string[] = [];
  const manifest = new Map<string, string>();
  if (!expectedHashes || typeof expectedHashes !== "object" || Array.isArray(expectedHashes)) {
    violations.push("INVALID_INVENTORY: expected a non-empty path-to-SHA256 object");
  } else {
    for (const [name, hash] of Object.entries(expectedHashes)) {
      if (
        !name || name.includes("\\") || name.includes("\0") ||
        path.posix.isAbsolute(name) || /^[A-Za-z]:/.test(name) ||
        name.split("/").some((part) => !part || part === "." || part === "..") ||
        typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)
      ) {
        violations.push(`INVALID_INVENTORY_ENTRY: ${name}`);
      } else {
        manifest.set(name, hash);
      }
    }
  }
  if (manifest.size === 0) violations.push("EMPTY_INVENTORY");
  let verified = 0;
  let corrupted = 0;
  let total = 0;
  const seen = new Set<string>();

  const scanDirectory = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else {
        total++;
        seen.add(relPath);
        const expected = manifest.get(relPath);
        if (!entry.isFile()) {
          corrupted++;
          violations.push(`UNSAFE_OBJECT: ${relPath}`);
          continue;
        }
        if (!expected) {
          corrupted++;
          violations.push(`UNEXPECTED_OBJECT: ${relPath}`);
          continue;
        }
        try {
          const actualSha256 = await sha256File(fullPath);
          if (actualSha256 !== expected) {
            corrupted++;
            violations.push(`HASH_MISMATCH: ${relPath}`);
          } else {
            verified++;
          }
        } catch {
          corrupted++;
          violations.push(`READ_ERROR: ${relPath}`);
        }
      }
    }
  };
  // Invalid policies must not trigger reads of arbitrarily selected archive paths.
  if (violations.length === 0) {
    try {
      const rootStat = await fs.lstat(root);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        violations.push("UNSAFE_ARCHIVE_ROOT");
      } else {
        await scanDirectory(root);
      }
    } catch {
      violations.push("ARCHIVE_READ_ERROR");
    }
    for (const name of manifest.keys()) {
      if (!seen.has(name)) {
        total++;
        corrupted++;
        violations.push(`MISSING_OBJECT: ${name}`);
      }
    }
  }
  return {
    schema: "hdri-preservation-check@1",
    operation: "preservation:check",
    status: violations.length > 0 ? "degraded" : "ok",
    archiveRoot: root,
    totalObjects: total,
    verifiedObjects: verified,
    corruptedObjects: corrupted,
    violations,
  };
};

const main = async (): Promise<void> => {
  const archiveRoot = arg("--archive-root");
  const policyFile = arg("--policy");
  const jsonOutput = hasFlag("--json");

  if (!archiveRoot || !policyFile) {
    throw new Error("Usage: preservation:check --archive-root <dir> --policy <file> [--json]");
  }

  const report = await checkPreservation(
    archiveRoot,
    JSON.parse(await fs.readFile(policyFile, "utf8")),
  );

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`preservation:check — ${report.status}`);
    console.log(`  Archive root: ${report.archiveRoot}`);
    console.log(`  Total objects: ${report.totalObjects}`);
    console.log(`  Verified: ${report.verifiedObjects}`);
    console.log(`  Corrupted: ${report.corruptedObjects}`);
    if (report.violations.length > 0) {
      console.log("  Violations:");
      for (const v of report.violations) {
        console.log(`    - ${v}`);
      }
    }
  }

  if (report.status !== "ok") process.exitCode = 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

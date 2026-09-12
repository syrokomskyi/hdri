/*
<MODULE_CONTRACT>
<purpose>Full-byte integrity scan of retained closure — read-only, never modifies sealed artifacts.</purpose>
<non-goals>
  <item>Does not write, repair, or modify any sealed artifact.</item>
  <item>Does not perform network operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0112: add preservation:check full-byte integrity scan tool.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import path from "node:path";
import { sha256File } from "@syrokomskyi/observatory-vault";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

type IntegrityReport = {
  schema: string;
  operation: string;
  status: string;
  archiveRoot: string;
  totalObjects: number;
  verifiedObjects: number;
  corruptedObjects: number;
  violations: string[];
};

const scanDirectory = async (
  dir: string,
  root: string,
  manifest: Map<string, string>,
  violations: string[],
): Promise<{ verified: number; corrupted: number; total: number }> => {
  let verified = 0;
  let corrupted = 0;
  let total = 0;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await scanDirectory(fullPath, root, manifest, violations);
      verified += sub.verified;
      corrupted += sub.corrupted;
      total += sub.total;
    } else if (entry.isFile()) {
      total++;
      const relPath = path.relative(root, fullPath);
      const expected = manifest.get(relPath) ?? manifest.get(entry.name);
      try {
        const actualSha256 = await sha256File(fullPath);
        if (expected && actualSha256 !== expected) {
          corrupted++;
          violations.push(
            `HASH_MISMATCH: ${relPath} (expected ${expected.slice(0, 16)}..., got ${actualSha256.slice(0, 16)}...)`,
          );
        } else {
          verified++;
        }
      } catch (error) {
        corrupted++;
        violations.push(
          `READ_ERROR: ${relPath} — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return { verified, corrupted, total };
};

const main = async (): Promise<void> => {
  const archiveRoot = arg("--archive-root");
  const policyFile = arg("--policy");
  const jsonOutput = hasFlag("--json");

  if (!archiveRoot) {
    console.error("Usage: preservation:check --archive-root <dir> [--policy <file>] [--json]");
    process.exit(1);
  }

  const resolvedRoot = path.resolve(archiveRoot);

  // Load policy file if provided (contains expected hashes)
  const manifest = new Map<string, string>();
  if (policyFile) {
    try {
      const raw = await fs.readFile(policyFile, "utf8");
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [name, hash] of Object.entries(parsed)) {
        manifest.set(name, hash);
      }
    } catch (error) {
      console.error(
        `Failed to load policy file: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }

  // Verify archive root exists
  try {
    await fs.access(resolvedRoot);
  } catch {
    console.error(`Archive root not found: ${resolvedRoot}`);
    process.exit(1);
  }

  const violations: string[] = [];
  const { verified, corrupted, total } = await scanDirectory(
    resolvedRoot,
    resolvedRoot,
    manifest,
    violations,
  );

  const report: IntegrityReport = {
    schema: "hdri-preservation-check@1",
    operation: "preservation:check",
    status: corrupted > 0 ? "degraded" : "ok",
    archiveRoot: resolvedRoot,
    totalObjects: total,
    verifiedObjects: verified,
    corruptedObjects: corrupted,
    violations,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`preservation:check — ${report.status}`);
    console.log(`  Archive root: ${resolvedRoot}`);
    console.log(`  Total objects: ${total}`);
    console.log(`  Verified: ${verified}`);
    console.log(`  Corrupted: ${corrupted}`);
    if (violations.length > 0) {
      console.log("  Violations:");
      for (const v of violations) {
        console.log(`    - ${v}`);
      }
    }
  }

  if (corrupted > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

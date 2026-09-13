/*
<MODULE_CONTRACT>
<purpose>Recurring custody continuity scanner — integrity scans against authenticated inventory, replica-lag checks (24h threshold for unsealed evidence), and restore drills with key verification.</purpose>
<non-goals>
  <item>Does not modify sealed artifacts or vault shards.</item>
  <item>Does not perform network operations.</item>
  <item>Does not rotate keys — it verifies them and reports rotation needs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 Step 10: Custody continuity scanner with integrity scan, replica-lag check, and restore drill capabilities.</item>
</CHANGE_SUMMARY>
*/

import "@syrokomskyi/observatory-crypto/auto-env";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sha256File } from "@syrokomskyi/observatory-vault";
import { getTransparencyKeysDir, loadVerificationKeys } from "@syrokomskyi/observatory-crypto";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

const SCAN_MODES = ["integrity", "replica-lag", "restore-drill"] as const;
type ScanMode = (typeof SCAN_MODES)[number];

const REPLICA_LAG_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CustodyScanReport {
  schema: string;
  operation: string;
  mode: ScanMode;
  status: string;
  checkedAt: string;
  violations: string[];
  details: Record<string, unknown>;
}

// --- Integrity scan ---

async function runIntegrityScan(
  archiveRoot: string,
  policyFile: string,
  manifestSha256: string | undefined,
): Promise<CustodyScanReport> {
  const root = path.resolve(archiveRoot);
  const violations: string[] = [];
  const details: Record<string, unknown> = {};

  // Authenticate policy manifest
  const policyBytes = await fs.readFile(policyFile, "utf8");
  if (manifestSha256) {
    const actualHash = createHash("sha256").update(policyBytes, "utf8").digest("hex");
    if (actualHash !== manifestSha256) {
      violations.push(`POLICY_MANIFEST_AUTH_FAILED: expected ${manifestSha256}, got ${actualHash}`);
      return {
        schema: "hdri-custody-scan@1",
        operation: "custody:scan",
        mode: "integrity",
        status: "degraded",
        checkedAt: new Date().toISOString(),
        violations,
        details,
      };
    }
  }

  const expectedHashes = JSON.parse(policyBytes) as Record<string, string>;
  const manifest = new Map<string, string>();
  for (const [name, hash] of Object.entries(expectedHashes)) {
    if (typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)) {
      manifest.set(name, hash);
    }
  }

  let verified = 0;
  let corrupted = 0;
  let total = 0;

  const scanDirectory = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).split(path.sep).join("/");
      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        total++;
        const expected = manifest.get(relPath);
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

  // Check for missing objects
  for (const name of manifest.keys()) {
    try {
      await fs.access(path.join(root, name));
    } catch {
      total++;
      corrupted++;
      violations.push(`MISSING_OBJECT: ${name}`);
    }
  }

  details.totalObjects = total;
  details.verifiedObjects = verified;
  details.corruptedObjects = corrupted;

  return {
    schema: "hdri-custody-scan@1",
    operation: "custody:scan",
    mode: "integrity",
    status: violations.length > 0 ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    violations,
    details,
  };
}

// --- Replica-lag check ---

interface ReplicaEntry {
  path: string;
  sha256: string;
  createdAt: string;
}

async function runReplicaLagCheck(archiveRoot: string): Promise<CustodyScanReport> {
  const root = path.resolve(archiveRoot);
  const violations: string[] = [];
  const details: Record<string, unknown> = {};
  const now = Date.now();

  // Find replica receipt files
  const receiptsDir = path.join(root, "replica-receipts");
  let receipts: string[] = [];
  try {
    receipts = await fs.readdir(receiptsDir);
  } catch {
    details.replicaReceiptsFound = 0;
    violations.push("NO_REPLICA_RECEIPTS_DIR");
    return {
      schema: "hdri-custody-scan@1",
      operation: "custody:scan",
      mode: "replica-lag",
      status: "degraded",
      checkedAt: new Date().toISOString(),
      violations,
      details,
    };
  }

  let checked = 0;
  let overdue = 0;
  const atRisk: string[] = [];

  for (const receiptFile of receipts) {
    if (!receiptFile.endsWith(".json")) continue;
    const receiptPath = path.join(receiptsDir, receiptFile);
    try {
      const raw = await fs.readFile(receiptPath, "utf8");
      const receipt = JSON.parse(raw) as ReplicaEntry;
      checked++;

      // Check if replica is older than threshold
      const createdMs = Date.parse(receipt.createdAt);
      if (Number.isNaN(createdMs)) {
        violations.push(`INVALID_TIMESTAMP: ${receiptFile}`);
        continue;
      }

      const ageMs = now - createdMs;
      if (ageMs > REPLICA_LAG_THRESHOLD_MS) {
        overdue++;
        atRisk.push(receipt.path);
        violations.push(
          `REPLICA_LAG_OVERDUE: ${receipt.path} (age: ${Math.floor(ageMs / 3600000)}h)`,
        );
      }

      // Verify replica hash matches
      try {
        const replicaPath = path.join(root, receipt.path);
        const actualHash = await sha256File(replicaPath);
        if (actualHash !== receipt.sha256) {
          violations.push(`REPLICA_HASH_MISMATCH: ${receipt.path}`);
        }
      } catch {
        violations.push(`REPLICA_MISSING: ${receipt.path}`);
      }
    } catch {
      violations.push(`RECEIPT_PARSE_ERROR: ${receiptFile}`);
    }
  }

  details.replicaReceiptsChecked = checked;
  details.overdueReplicas = overdue;
  details.atRiskPaths = atRisk;

  return {
    schema: "hdri-custody-scan@1",
    operation: "custody:scan",
    mode: "replica-lag",
    status: violations.length > 0 ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    violations,
    details,
  };
}

// --- Restore drill ---

async function runRestoreDrill(
  vaultRoot: string,
  keysDir: string | undefined,
): Promise<CustodyScanReport> {
  const root = path.resolve(vaultRoot);
  const violations: string[] = [];
  const details: Record<string, unknown> = {};

  // 1. Verify vault manifest exists and is readable
  const manifestPath = path.join(root, "vault-manifest.json");
  try {
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as { shards: unknown[] };
    details.shardCount = manifest.shards.length;
  } catch {
    violations.push("VAULT_MANIFEST_MISSING_OR_UNREADABLE");
    return {
      schema: "hdri-custody-scan@1",
      operation: "custody:scan",
      mode: "restore-drill",
      status: "degraded",
      checkedAt: new Date().toISOString(),
      violations,
      details,
    };
  }

  // 2. Verify all shard files exist and match manifest hashes
  let verifiedShards = 0;
  let missingShards = 0;
  try {
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw) as {
      shards: { path: string; sha256: string }[];
    };
    for (const shard of manifest.shards) {
      const shardPath = path.join(root, shard.path);
      try {
        const actualHash = await sha256File(shardPath);
        if (actualHash === shard.sha256) {
          verifiedShards++;
        } else {
          violations.push(`SHARD_HASH_MISMATCH: ${shard.path}`);
        }
      } catch {
        missingShards++;
        violations.push(`SHARD_MISSING: ${shard.path}`);
      }
    }
  } catch {
    violations.push("MANIFEST_PARSE_ERROR");
  }

  details.verifiedShards = verifiedShards;
  details.missingShards = missingShards;

  // 3. Verify signing keys are loadable
  const resolvedKeysDir = keysDir ?? getTransparencyKeysDir();
  try {
    const keyMap = await loadVerificationKeys(resolvedKeysDir);
    details.verificationKeysLoaded = keyMap.size;
    if (keyMap.size === 0) {
      violations.push("NO_VERIFICATION_KEYS_FOUND");
    }
  } catch (error) {
    violations.push(`KEY_LOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4. Check key rotation need (keys older than 90 days)
  try {
    const keyDirStat = await fs.stat(resolvedKeysDir);
    const keyAgeMs = Date.now() - keyDirStat.mtimeMs;
    if (keyAgeMs > 90 * 24 * 60 * 60 * 1000) {
      violations.push("KEY_ROTATION_OVERDUE: keys older than 90 days");
    }
    details.keysDirAgeMs = keyAgeMs;
  } catch {
    violations.push("KEYS_DIR_NOT_FOUND");
  }

  return {
    schema: "hdri-custody-scan@1",
    operation: "custody:scan",
    mode: "restore-drill",
    status: violations.length > 0 ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    violations,
    details,
  };
}

// --- Main ---

const main = async (): Promise<void> => {
  const modeArg = arg("--mode");
  const archiveRoot = arg("--archive-root");
  const policyFile = arg("--policy");
  const manifestSha256 = arg("--manifest-sha256");
  const keysDir = arg("--keys-dir");
  const jsonOutput = hasFlag("--json");

  if (!modeArg || !archiveRoot) {
    console.error(
      "Usage: custody:scan --mode <integrity|replica-lag|restore-drill> --archive-root <dir> [--policy <file>] [--manifest-sha256 <hash>] [--keys-dir <dir>] [--json]",
    );
    process.exit(1);
  }

  if (!SCAN_MODES.includes(modeArg as ScanMode)) {
    console.error(`Invalid mode: ${modeArg}. Expected one of: ${SCAN_MODES.join(", ")}`);
    process.exit(1);
  }

  const mode = modeArg as ScanMode;

  let report: CustodyScanReport;

  switch (mode) {
    case "integrity":
      if (!policyFile) {
        console.error("Integrity scan requires --policy <file>");
        process.exit(1);
      }
      report = await runIntegrityScan(archiveRoot, policyFile, manifestSha256);
      break;
    case "replica-lag":
      report = await runReplicaLagCheck(archiveRoot);
      break;
    case "restore-drill":
      report = await runRestoreDrill(archiveRoot, keysDir);
      break;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`custody:scan — ${report.status}`);
    console.log(`  Mode: ${report.mode}`);
    console.log(`  Checked at: ${report.checkedAt}`);
    if (Object.keys(report.details).length > 0) {
      for (const [key, value] of Object.entries(report.details)) {
        console.log(`  ${key}: ${value}`);
      }
    }
    if (report.violations.length > 0) {
      console.log("  Violations:");
      for (const v of report.violations) {
        console.log(`    - ${v}`);
      }
    }
  }

  if (report.status !== "ok") process.exitCode = 1;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

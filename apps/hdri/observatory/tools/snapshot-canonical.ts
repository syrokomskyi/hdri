/*
<MODULE_CONTRACT>
<purpose>Create / verify a consistent, checksummed snapshot of the canonical Q-quarter artifacts (WP6 durability).</purpose>
<non-goals>
  <item>Does not copy off-site — emit a self-contained, verifiable archive; the operator copies it to durable off-machine storage.</item>
  <item>Does not rebuild a DB — that is rebuild-from-vault (WP7).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP6: first protective step — a verifiable Q2 (and any year) snapshot before further system expansion.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: snapshot integrity is verified by SHA-256; never modify a frozen snapshot

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  hashEntry,
  verifyManifest,
  type SnapshotManifest,
  type SnapshotRunInfo,
} from "./snapshot-core";

const CWD = process.cwd();
const OUTPUT_DIR = path.join(CWD, ".output");
const DB_DIR = path.join(OUTPUT_DIR, "db");
const VAULT_DIR = path.join(OUTPUT_DIR, "vault");
const INPUT_DIR = path.join(CWD, ".input");
const KEYS_DIR = path.resolve(CWD, "..", "..", "transparency", "keys");
const SNAP_ROOT = path.join(OUTPUT_DIR, "snapshots");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(abs)));
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

async function copyInto(
  srcAbs: string,
  snapshotDir: string,
  relInSnapshot: string,
): Promise<string> {
  const dest = path.join(snapshotDir, relInSnapshot);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(srcAbs, dest);
  return relInSnapshot;
}

async function createSnapshot(year: number, outDir: string): Promise<void> {
  const dbPath = path.join(DB_DIR, `observatory_${year}.db`);
  if (!(await exists(dbPath))) {
    throw new Error(`No observatory DB for year ${year} at ${dbPath}`);
  }

  await fs.mkdir(outDir, { recursive: true });
  console.log(`📦 Canonical snapshot → ${outDir}`);
  const relPaths: string[] = [];

  // 1. Consistent DB copy via SQLite online backup (safe against the WAL).
  const dbDest = path.join(outDir, "db", `observatory_${year}.db`);
  await fs.mkdir(path.dirname(dbDest), { recursive: true });
  const src = new Database(dbPath, { readonly: true });
  const publishedRuns = src
    .prepare(
      `SELECT run_id, period, codebook_version, publication_status
       FROM pipeline_runs WHERE status='finished' AND publication_status='published'
       ORDER BY period`,
    )
    .all() as SnapshotRunInfo[];
  // Authoritative scoring codebook version (pipeline_runs may store the id).
  for (const r of publishedRuns) {
    const v = src
      .prepare(`SELECT codebook_version FROM scores WHERE run_id = ? LIMIT 1`)
      .get(r.run_id) as { codebook_version: string } | undefined;
    if (v?.codebook_version) r.codebook_version = v.codebook_version;
  }
  await src.backup(dbDest);
  src.close();
  relPaths.push(`db/observatory_${year}.db`);
  console.log(`  ✓ DB backed up (${publishedRuns.length} published run(s))`);

  // 2. Vault shards for this year (the signed source of truth).
  const vaultYearDir = path.join(VAULT_DIR, "observations", `year=${year}`);
  const vaultFiles = await walkFiles(vaultYearDir);
  for (const abs of vaultFiles) {
    const rel = path.join("vault", "observations", `year=${year}`, path.basename(abs));
    relPaths.push(await copyInto(abs, outDir, rel));
  }
  console.log(`  ✓ Vault shards: ${vaultFiles.length}`);

  // 3. Methodology inputs (frozen copy — needed to reproduce scores).
  for (const name of ["codebook.yaml", "ontology.yaml"]) {
    const abs = path.join(INPUT_DIR, name);
    if (await exists(abs)) relPaths.push(await copyInto(abs, outDir, path.join("input", name)));
  }

  // 4. Public verification keys.
  for (const abs of await walkFiles(KEYS_DIR)) {
    if (abs.endsWith(".pem")) {
      relPaths.push(await copyInto(abs, outDir, path.join("keys", path.basename(abs))));
    }
  }

  // 5. Checksummed manifest.
  const files = [];
  for (const rel of relPaths) files.push(await hashEntry(outDir, rel));
  const manifest: SnapshotManifest = {
    kind: "observatory-canonical-snapshot",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    year,
    publishedRuns,
    files,
  };
  await fs.writeFile(
    path.join(outDir, "snapshot-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  console.log(`  ✓ Manifest: ${files.length} files, ${(totalBytes / 1e9).toFixed(2)} GB`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✓ Snapshot complete: ${outDir}`);
  console.log("  Next: run `pnpm run verify:vault` to confirm signatures, then COPY this");
  console.log("  directory to durable off-machine storage (3-2-1). Verify later with:");
  console.log(`    pnpm run snapshot:verify -- "${outDir}"`);
}

async function verifySnapshot(dir: string): Promise<void> {
  const manifestPath = path.join(dir, "snapshot-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as SnapshotManifest;
  console.log(`🔎 Verifying snapshot: ${dir} (${manifest.files.length} files)`);
  const result = await verifyManifest(dir, manifest);
  if (result.ok) {
    console.log(`✓ OK — all ${result.checked} files match the manifest.`);
  } else {
    console.log(
      `❌ FAIL — ${result.mismatches.length} corrupted, ${result.missing.length} missing.`,
    );
    for (const m of result.mismatches) console.log(`  corrupted: ${m}`);
    for (const m of result.missing) console.log(`  missing:   ${m}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  // Positionals = argv entries that are not flags. Robust to the `--` separator
  // that `pnpm run … -- <dir>` injects (which otherwise gets read as a flag value).
  const positionals = process.argv.slice(2).filter((a) => !a.startsWith("-"));

  if (process.argv.includes("--verify")) {
    const dir = positionals[positionals.length - 1];
    if (!dir) {
      throw new Error('Usage: pnpm run snapshot:verify -- "<snapshot-dir>"');
    }
    await verifySnapshot(dir);
    return;
  }
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = argValue("--out") ?? path.join(SNAP_ROOT, `observatory-${year}-${stamp}`);
  await createSnapshot(year, outDir);
}

void main().catch((error: unknown) => {
  console.error("[snapshot-canonical] Failed:", error);
  process.exitCode = 1;
});

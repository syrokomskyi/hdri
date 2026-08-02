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
import crypto from "node:crypto";
import Database from "better-sqlite3";
import "@syrokomskyi/observatory-crypto/auto-env";
import { canonicalize, loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";
import { writeParquet } from "@syrokomskyi/observatory-vault";
import {
  hashEntry,
  sha256File,
  verifyManifest,
  type SnapshotManifest,
  type SnapshotRunInfo,
} from "./snapshot-core";

const CWD = process.cwd();
const OUTPUT_DIR = path.join(CWD, ".output");
const DB_DIR = path.join(OUTPUT_DIR, "db");
const VAULT_DIR = path.join(OUTPUT_DIR, "vault");
const INPUT_DIR = path.join(CWD, ".input");
const WORKSPACE_ROOT = path.resolve(CWD, "..", "..", "..");
const KEYS_DIR = path.resolve(CWD, "..", "..", "transparency", "keys");
const SNAP_ROOT = path.join(OUTPUT_DIR, "snapshots");
const FACTORY_DIR = path.resolve(CWD, "..", "factory");
const DASHBOARD_DIR = path.resolve(CWD, "..", "dashboard");

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
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) out.push(absolute);
    }
  }
  return out;
}

const isSqliteSidecar = (filePath: string): boolean =>
  filePath.endsWith(".db-wal") || filePath.endsWith(".db-shm");

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

async function signSnapshotManifest(dir: string, manifest: SnapshotManifest): Promise<void> {
  const signingKey = loadSigningKeyFromEnv();
  const manifestPayload = Buffer.from(canonicalize(manifest), "utf8");
  const signature = crypto.sign(
    null,
    crypto.createHash("sha256").update(manifestPayload).digest(),
    signingKey.privateKeyPem,
  );
  await fs.writeFile(
    path.join(dir, "snapshot-manifest.sig.json"),
    `${JSON.stringify({
      algorithm: "ed25519-sha256",
      signingKeyId: signingKey.signingKeyId,
      publicKeyPem: signingKey.publicKeyPem,
      signature: signature.toString("base64url"),
    }, null, 2)}\n`,
    "utf8",
  );
}

async function writeLegacyIdentityIndex(
  snapshotDir: string,
  observatoryDbPath: string,
  year: number,
): Promise<{ relativePath: string; rows: number }> {
  const registryCandidates = (await walkFiles(path.join(snapshotDir, "factory", "output")))
    .filter((file) => path.basename(file) === `registry_${year}.db`);
  if (registryCandidates.length !== 1) {
    throw new Error(
      `Expected exactly one preserved registry_${year}.db, found ${registryCandidates.length}`,
    );
  }

  const registry = new Database(registryCandidates[0]!, { readonly: true });
  const observatory = new Database(observatoryDbPath, { readonly: true });
  try {
    const identities = observatory
      .prepare(`SELECT provisional_id, canonical_id, domain, first_seen FROM asset_id_map`)
      .all() as Array<{
      provisional_id: string;
      canonical_id: string;
      domain: string;
      first_seen: string;
    }>;
    const byDomain = new Map(identities.map((row) => [row.domain, row]));
    const sites = registry.prepare(`SELECT id, domain FROM sites ORDER BY id`).all() as Array<{
      id: number;
      domain: string;
    }>;
    const unresolved = sites.filter((site) => !byDomain.has(site.domain));
    if (unresolved.length > 0) {
      throw new Error(`Identity recovery index has ${unresolved.length} unresolved registry sites`);
    }
    const rows = sites.map((site) => {
      const identity = byDomain.get(site.domain)!;
      return {
        legacy_site_id: site.id,
        domain: site.domain,
        provisional_asset_id: identity.provisional_id,
        canonical_asset_id: identity.canonical_id,
        first_seen: identity.first_seen,
      };
    });
    const relativePath = "index/legacy-site-identities.parquet";
    const outputPath = path.join(snapshotDir, relativePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await writeParquet(rows, outputPath);
    return { relativePath, rows: rows.length };
  } finally {
    observatory.close();
    registry.close();
  }
}

async function createSnapshot(year: number, outDir: string): Promise<void> {
  const dbPath = path.join(DB_DIR, `observatory_${year}.db`);
  if (!(await exists(dbPath))) {
    throw new Error(`No observatory DB for year ${year} at ${dbPath}`);
  }

  const protectedSources = [path.join(FACTORY_DIR, ".input")];
  for (const appDir of await fs.readdir(FACTORY_DIR, { withFileTypes: true })) {
    if (appDir.isDirectory()) protectedSources.push(path.join(FACTORY_DIR, appDir.name, ".output"));
  }
  const sourceBefore = new Map<string, { sha256: string; mtimeMs: number }>();
  for (const root of protectedSources) {
    for (const source of await walkFiles(root)) {
      if (isSqliteSidecar(source)) continue;
      const stat = await fs.stat(source);
      sourceBefore.set(source, { sha256: await sha256File(source), mtimeMs: stat.mtimeMs });
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  console.log(`📦 Canonical snapshot → ${outDir}`);
  const relPaths: string[] = [];
  const metadata = new Map<string, { access: "public" | "internal" | "restricted"; role: string }>();
  const retainTree = async (
    sourceRoot: string,
    destinationRoot: string,
    access: "public" | "internal" | "restricted",
    role: string,
  ): Promise<void> => {
    for (const source of await walkFiles(sourceRoot)) {
      if (isSqliteSidecar(source)) continue;
      const name = path.basename(source).toLowerCase();
      if (name === ".env" || name.includes("private") || source.includes(`${path.sep}signing-key${path.sep}`)) continue;
      const relative = path.join(destinationRoot, path.relative(sourceRoot, source));
      if (source.endsWith(".db")) {
        const destination = path.join(outDir, relative);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const sqlite = new Database(source, { readonly: true });
        const integrity = sqlite.pragma("integrity_check") as Array<{ integrity_check: string }>;
        if (integrity.some((row) => row.integrity_check !== "ok")) {
          sqlite.close();
          throw new Error(`SQLite integrity check failed: ${source}`);
        }
        await sqlite.backup(destination);
        sqlite.close();
        relPaths.push(relative);
      } else {
        relPaths.push(await copyInto(source, outDir, relative));
      }
      metadata.set(relative, { access, role });
    }
  };

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
    const rel = path.join("vault", "observations", `year=${year}`, path.relative(vaultYearDir, abs));
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

  // 5. Rebuild closure: retain the exact dependency declaration and lockfile
  // alongside the evidence, without copying secrets or mutable working output.
  for (const [source, destination] of [
    [path.join(WORKSPACE_ROOT, "package.json"), "rebuild/package.json"],
    [path.join(WORKSPACE_ROOT, "pnpm-lock.yaml"), "rebuild/pnpm-lock.yaml"],
  ] as const) {
    if (await exists(source)) relPaths.push(await copyInto(source, outDir, destination));
  }

  // 6. Full HDRI research closure. Sources are read only; copies retain their
  // original relative paths so future researchers can reconstruct provenance.
  await retainTree(path.join(FACTORY_DIR, ".input"), "factory/input", "restricted", "raw-source");
  for (const appDir of await fs.readdir(FACTORY_DIR, { withFileTypes: true })) {
    if (!appDir.isDirectory()) continue;
    const appOutput = path.join(FACTORY_DIR, appDir.name, ".output");
    if (await exists(appOutput)) {
      await retainTree(appOutput, path.join("factory/output", appDir.name), "internal", "factory-output");
    }
  }
  if (await exists(path.join(DASHBOARD_DIR, ".output"))) {
    await retainTree(path.join(DASHBOARD_DIR, ".output"), "dashboard/output", "public", "published-dashboard");
  }

  // 7. Explicit recovery bridge from transient Factory integer row ids to the
  // canonical UUID v7 identity already minted for every Q2 site.
  const identityIndex = await writeLegacyIdentityIndex(outDir, dbDest, year);
  relPaths.push(identityIndex.relativePath);
  metadata.set(identityIndex.relativePath, { access: "internal", role: "identity-recovery" });
  console.log(`  ✓ Identity recovery index: ${identityIndex.rows} rows`);

  const sourceIntegrity = [];
  for (const [source, before] of sourceBefore) {
      const after = await fs.stat(source);
      const afterSha256 = await sha256File(source);
      if (before.sha256 !== afterSha256 || before.mtimeMs !== after.mtimeMs) {
        throw new Error(`Source artifact changed while snapshotting: ${source}`);
      }
      sourceIntegrity.push({
        path: path.relative(path.resolve(FACTORY_DIR, ".."), source).replaceAll(path.sep, "/"),
        sha256: before.sha256,
        mtimeMs: before.mtimeMs,
      });
  }
  const sourceIntegrityPath = "source-integrity.json";
  await fs.writeFile(
    path.join(outDir, sourceIntegrityPath),
    `${JSON.stringify({ verifiedUnchanged: true, files: sourceIntegrity }, null, 2)}\n`,
    "utf8",
  );
  relPaths.push(sourceIntegrityPath);
  metadata.set(sourceIntegrityPath, { access: "internal", role: "source-integrity" });

  // 8. Checksummed manifest.
  const files = [];
  for (const rel of relPaths) {
    const entry = await hashEntry(outDir, rel);
    files.push({ ...entry, ...(metadata.get(rel) ?? { access: "internal" as const, role: "canonical" }) });
  }
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
  await signSnapshotManifest(outDir, manifest);

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
  const detached = JSON.parse(
    await fs.readFile(path.join(dir, "snapshot-manifest.sig.json"), "utf8"),
  ) as { publicKeyPem: string; signature: string };
  const signatureOk = crypto.verify(
    null,
    crypto.createHash("sha256").update(Buffer.from(canonicalize(manifest), "utf8")).digest(),
    detached.publicKeyPem,
    Buffer.from(detached.signature, "base64url"),
  );
  if (!signatureOk) throw new Error("Snapshot manifest signature is invalid");
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

  if (process.argv.includes("--sign-existing")) {
    const dir = positionals[positionals.length - 1];
    if (!dir) throw new Error("snapshot directory is required");
    const manifest = JSON.parse(
      await fs.readFile(path.join(dir, "snapshot-manifest.json"), "utf8"),
    ) as SnapshotManifest;
    await signSnapshotManifest(dir, manifest);
    return;
  }

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
  if (process.argv.includes("--dry-run")) {
    const roots = [
      path.join(FACTORY_DIR, ".input"),
      ...((await fs.readdir(FACTORY_DIR, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(FACTORY_DIR, entry.name, ".output"))),
      DB_DIR,
      VAULT_DIR,
      path.join(DASHBOARD_DIR, ".output"),
    ];
    let files = 0;
    let bytes = 0;
    for (const root of roots) {
      for (const file of await walkFiles(root)) {
        files++;
        bytes += (await fs.stat(file)).size;
      }
    }
    console.log(JSON.stringify({ year, mode: "dry-run", files, bytes, outDir, writesPerformed: false }, null, 2));
    return;
  }
  await createSnapshot(year, outDir);
}

void main().catch((error: unknown) => {
  console.error("[snapshot-canonical] Failed:", error);
  process.exitCode = 1;
});

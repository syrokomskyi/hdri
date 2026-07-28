/*
<MODULE_CONTRACT>
<purpose>CLI: anchor a period's publication with OpenTimestamps so its immutability is verifiable
by a third party, not just asserted by the key holder (finding 2). Builds a canonical publication
record pinning the sha256 of the vault manifest + methodology index, writes it under
transparency/timestamps/&lt;period&gt;/publication.json, and anchors that record's digest via
OpenTimestamps (→ Bitcoin) into publication.json.ots. --verify re-checks the pinned files and the
proof; --upgrade completes a pending proof once the Bitcoin attestation is available.</purpose>
<non-goals>
  <item>Does not mutate the vault, DB, or methodology store — reads them, writes only transparency/.</item>
  <item>Record assembly/hashing lives in timestamp-core.ts (pure, unit-tested); this owns I/O + network.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Finding 2: OpenTimestamps anchoring of the vault manifest + methodology index at publish.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: vault writes are append-only; never mutate or delete existing observations

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { VAULT_MANIFEST_FILENAME } from "@syrokomskyi/observatory-vault";
import { outputRootDir } from "../run/config";
import { METHODOLOGY_INDEX_FILENAME } from "./methodology-snapshot-core";
import {
  buildPublicationRecord,
  canonicalRecordBytes,
  hashFile,
  recordDigest,
  type PublicationRecord,
} from "./timestamp-core";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..", "..");

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function getObservatoryDbPath(): string {
  const explicit = argValue("--db");
  if (explicit) return path.resolve(explicit);
  const year = Number(argValue("--year") ?? new Date().getFullYear());
  return path.join(outputRootDir, "db", `observatory_${year}.db`);
}

/** Resolve the published run for the target period (or the newest published run). */
function resolvePublished(period?: string): { runId: string; period: string } {
  const dbPath = getObservatoryDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Observatory DB not found: ${dbPath} (pass --db or --year)`);
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = period
      ? (db
          .prepare(
            `SELECT run_id, period FROM pipeline_runs
             WHERE publication_status = 'published' AND period = ? LIMIT 1`,
          )
          .get(period) as { run_id: string; period: string } | undefined)
      : (db
          .prepare(
            `SELECT run_id, period FROM pipeline_runs
             WHERE publication_status = 'published' ORDER BY period DESC LIMIT 1`,
          )
          .get() as { run_id: string; period: string } | undefined);
    if (!row) {
      throw new Error(
        period
          ? `No published run for period ${period}`
          : "No published runs found — publish (promote) before timestamping",
      );
    }
    return { runId: row.run_id, period: row.period };
  } finally {
    db.close();
  }
}

// ── OpenTimestamps adapters (dynamic import so the pure path never loads the lib) ─────────
type OtsModule = typeof import("opentimestamps");

async function loadOts(): Promise<OtsModule> {
  try {
    // The package is CommonJS: under ESM dynamic import its API lands on `.default`.
    const mod = await import("opentimestamps");
    return (mod as unknown as { default?: OtsModule }).default ?? mod;
  } catch {
    throw new Error(
      "opentimestamps is not installed. Run `pnpm install`, or pass --no-stamp to " +
        "write publication.json only and anchor it later.",
    );
  }
}

function detachedFromDigest(ots: OtsModule, digestHex: string) {
  return ots.DetachedTimestampFile.fromHash(new ots.Ops.OpSHA256(), Buffer.from(digestHex, "hex"));
}

async function stampDigest(digestHex: string): Promise<Buffer> {
  const ots = await loadOts();
  const detached = detachedFromDigest(ots, digestHex);
  await ots.stamp(detached);
  return Buffer.from(detached.serializeToBytes());
}

async function verifyProof(digestHex: string, otsBytes: Buffer): Promise<string> {
  const ots = await loadOts();
  const detachedOts = ots.DetachedTimestampFile.deserialize(otsBytes);
  const detachedOriginal = detachedFromDigest(ots, digestHex);
  const result = await ots.verify(detachedOts, detachedOriginal);
  if (!result || Object.keys(result).length === 0) {
    return "PENDING (not yet confirmed on Bitcoin — run --upgrade later)";
  }
  return `CONFIRMED: ${JSON.stringify(result)}`;
}

// ── Modes ─────────────────────────────────────────────────────────────────────────────────
function timestampDir(period: string): string {
  return path.join(repoRoot, "transparency", "timestamps", period);
}

async function create(period: string | undefined, stamp: boolean): Promise<void> {
  const published = resolvePublished(period);
  const vaultDir = path.resolve(argValue("--vault-dir") ?? path.join(outputRootDir, "vault"));
  const methodologyDir = path.resolve(
    argValue("--store-dir") ?? path.join(vaultDir, "methodology"),
  );

  const files = [
    {
      label: "vault-manifest",
      relPath: `vault/${VAULT_MANIFEST_FILENAME}`,
      absPath: path.join(vaultDir, VAULT_MANIFEST_FILENAME),
    },
    {
      label: "methodology-index",
      relPath: `vault/methodology/${METHODOLOGY_INDEX_FILENAME}`,
      absPath: path.join(methodologyDir, METHODOLOGY_INDEX_FILENAME),
    },
  ];
  for (const f of files) {
    if (!fs.existsSync(f.absPath)) {
      throw new Error(
        `Cannot timestamp: ${f.label} missing at ${f.absPath}. ` +
          "Run the pipeline + snapshot:methodology for this period first.",
      );
    }
  }

  const record = await buildPublicationRecord({
    period: published.period,
    publishedRunId: published.runId,
    files,
  });
  const digest = recordDigest(record);

  const outDir = timestampDir(published.period);
  await fsp.mkdir(outDir, { recursive: true });
  const recordPath = path.join(outDir, "publication.json");
  await fsp.writeFile(recordPath, canonicalRecordBytes(record), "utf-8");

  console.log(`   period:  ${published.period}`);
  console.log(`   run:     ${published.runId.slice(0, 8)}`);
  for (const f of record.files)
    console.log(`   pinned:  ${f.label} ${f.sha256.slice(0, 16)}… (${f.bytes} B)`);
  console.log(`   digest:  ${digest}`);
  console.log(`   record:  ${path.relative(repoRoot, recordPath)}`);

  if (!stamp) {
    console.log(
      "\n⏸  --no-stamp: wrote publication.json only. Anchor later by re-running without --no-stamp.",
    );
    return;
  }

  console.log("\n⏳ Anchoring digest with OpenTimestamps (contacting calendar servers)…");
  const otsBytes = await stampDigest(digest);
  const otsPath = recordPath + ".ots";
  await fsp.writeFile(otsPath, otsBytes);
  console.log(`✅ Wrote proof: ${path.relative(repoRoot, otsPath)}`);
  console.log(
    "   The proof is PENDING until the Bitcoin attestation lands (usually a few hours).\n" +
      "   Run `--upgrade` later, then commit publication.json + publication.json.ots to the public repo.",
  );
}

async function verify(period: string | undefined): Promise<void> {
  const published = resolvePublished(period);
  const outDir = timestampDir(published.period);
  const recordPath = path.join(outDir, "publication.json");
  const raw = await fsp.readFile(recordPath, "utf-8");
  const record = JSON.parse(raw) as PublicationRecord;

  // 1. Re-hash every pinned file against the record — catches a rewritten manifest/methodology.
  const vaultRoot = path.resolve(
    argValue("--vault-dir") ?? path.join(outputRootDir, "vault"),
    "..",
  );
  let mismatches = 0;
  for (const f of record.files) {
    const abs = path.join(vaultRoot, f.relPath);
    if (!fs.existsSync(abs)) {
      console.log(`   ❌ ${f.label}: MISSING at ${abs}`);
      mismatches++;
      continue;
    }
    const actual = await hashFile(abs);
    if (actual !== f.sha256) {
      console.log(`   ❌ ${f.label}: HASH MISMATCH — the file changed since publication`);
      mismatches++;
    } else {
      console.log(`   ✓ ${f.label}: unchanged`);
    }
  }

  // 2. Verify the record's own bytes match the digest we would anchor, then verify the proof.
  const digest = recordDigest(record);
  const otsPath = recordPath + ".ots";
  if (fs.existsSync(otsPath)) {
    const status = await verifyProof(digest, await fsp.readFile(otsPath));
    console.log(`   proof:   ${status}`);
  } else {
    console.log("   proof:   (no .ots yet — timestamp not anchored)");
  }

  if (mismatches > 0) {
    process.exitCode = 1;
    console.log(
      `\n❌ FAIL — ${mismatches} pinned file(s) no longer match the timestamped publication.`,
    );
  } else {
    console.log("\n✅ PASS — pinned files match the timestamped publication record.");
  }
}

async function upgrade(period: string | undefined): Promise<void> {
  const published = resolvePublished(period);
  const otsPath = path.join(timestampDir(published.period), "publication.json.ots");
  if (!fs.existsSync(otsPath)) throw new Error(`No proof to upgrade at ${otsPath}`);

  const ots = await loadOts();
  const detached = ots.DetachedTimestampFile.deserialize(await fsp.readFile(otsPath));
  const changed = await ots.upgrade(detached);
  if (changed) {
    await fsp.writeFile(otsPath, Buffer.from(detached.serializeToBytes()));
    console.log(
      `✅ Upgraded proof (Bitcoin attestation now embedded): ${path.relative(repoRoot, otsPath)}`,
    );
  } else {
    console.log(
      "⏳ Still pending — the Bitcoin attestation is not available yet. Try again later.",
    );
  }
}

async function main(): Promise<void> {
  const period = argValue("--period");
  console.log("🔗 Publication timestamping (OpenTimestamps) — finding 2");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (process.argv.includes("--verify")) return void (await verify(period));
  if (process.argv.includes("--upgrade")) return void (await upgrade(period));
  return void (await create(period, !process.argv.includes("--no-stamp")));
}

void main().catch((error: unknown) => {
  console.error("[timestamp-publication] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

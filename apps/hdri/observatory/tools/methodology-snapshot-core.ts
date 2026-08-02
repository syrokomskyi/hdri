/*
<MODULE_CONTRACT>
<purpose>Frozen per-period methodology snapshots (WP15): content-address the EXACT codebook +
ontology + population-frame that produced a published period into a durable store, verifiable
against the WP12 run_methodology hashes. WP12 froze the hashes; this freezes the CONTENT they
point at, so the DR runbook's "frozen inputs for the period" prerequisite is real and auditable.</purpose>
<non-goals>
  <item>Does not read the DB — the caller supplies sources + expected hashes from run_methodology.</item>
  <item>Does not compute the changelog — that is methodology-changelog-core.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>WP15: initial frozen per-period methodology snapshot store.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: publication is gated by k-anonymity enforcement; never publish suppressed groups

import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "@syrokomskyi/observatory-core";

export const METHODOLOGY_INDEX_FILENAME = "methodology-index.json";
export const METHODOLOGY_BLOBS_DIR = "blobs";

/** The methodology inputs that make a period's numbers reproducible. */
export type MethodologyRole = "codebook" | "ontology" | "frame";

const EXT_BY_ROLE: Record<MethodologyRole, string> = {
  codebook: "yaml",
  ontology: "yaml",
  frame: "json",
};

/** One frozen input, recorded in the index and stored under blobs/&lt;sha256&gt;.&lt;ext&gt;. */
export type MethodologyBlob = {
  role: MethodologyRole;
  /** Declared version (codebook/ontology); null for the frame (unversioned file). */
  version: string | null;
  sha256: string;
  bytes: number;
  /** Blob path relative to the store root, forward-slashed. */
  path: string;
};

/** All frozen inputs for one published period. */
export type MethodologyIndexEntry = {
  period: string;
  /** The WP12 methodology_hash (scoring identity) this snapshot belongs to. */
  methodologyHash: string;
  frozenAt: string;
  blobs: MethodologyBlob[];
};

export type MethodologyIndex = {
  readonly kind: "observatory-methodology-index";
  readonly schemaVersion: 1;
  updatedAt: string;
  entries: MethodologyIndexEntry[];
};

/** One input to freeze: its raw source, declared version, and the hash it MUST match. */
export type FreezeInput = {
  source: string;
  version: string | null;
  /** Expected sha256 (from run_methodology). Null → accept any (retroactive freeze, no reference). */
  expectedSha256: string | null;
};

export type FreezeInputs = {
  codebook: FreezeInput;
  ontology?: FreezeInput | null;
  frame?: FreezeInput | null;
};

export function emptyMethodologyIndex(): MethodologyIndex {
  return {
    kind: "observatory-methodology-index",
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

export function indexPath(storeDir: string): string {
  return path.join(storeDir, METHODOLOGY_INDEX_FILENAME);
}

export async function readMethodologyIndex(storeDir: string): Promise<MethodologyIndex> {
  try {
    const raw = await fs.readFile(indexPath(storeDir), "utf-8");
    const parsed = JSON.parse(raw) as MethodologyIndex;
    if (!Array.isArray(parsed.entries)) return emptyMethodologyIndex();
    return parsed;
  } catch {
    return emptyMethodologyIndex();
  }
}

export async function writeMethodologyIndex(
  storeDir: string,
  index: MethodologyIndex,
): Promise<void> {
  index.updatedAt = new Date().toISOString();
  index.entries.sort((a, b) => a.period.localeCompare(b.period));
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(indexPath(storeDir), JSON.stringify(index, null, 2), "utf-8");
}

export type FreezeResult = {
  period: string;
  blobs: MethodologyBlob[];
  /** Blobs newly written to disk this call (vs already present — content-addressed dedup). */
  written: number;
  /** True when the period already had an identical snapshot (no-op). */
  alreadyFrozen: boolean;
};

/**
 * Freezes one period's methodology inputs into the content-addressed store.
 *
 * - Each present input is hashed; if its `expectedSha256` is set and differs, the freeze THROWS
 *   (you cannot freeze content that did not produce the period — the guard against a mutated
 *   .input file being mis-attributed to a past period).
 * - Blobs are written to `blobs/<sha256>.<ext>`, skipped if already present (idempotent dedup:
 *   two periods sharing a byte-identical codebook store it once).
 * - The period → entry mapping is immutable: re-freezing a period with a DIFFERENT
 *   methodology_hash throws unless `force` is set; re-freezing the same is a no-op.
 */
export async function freezeMethodologySnapshot(
  storeDir: string,
  period: string,
  methodologyHash: string,
  inputs: FreezeInputs,
  opts: { force?: boolean } = {},
): Promise<FreezeResult> {
  const index = await readMethodologyIndex(storeDir);
  const existing = index.entries.find((e) => e.period === period);
  if (existing && existing.methodologyHash !== methodologyHash && !opts.force) {
    throw new Error(
      `period ${period} already frozen with methodology ${existing.methodologyHash.slice(0, 12)} ` +
        `!= ${methodologyHash.slice(0, 12)}; refusing to overwrite (pass force to override)`,
    );
  }

  const roleInputs: Array<[MethodologyRole, FreezeInput | null | undefined]> = [
    ["codebook", inputs.codebook],
    ["ontology", inputs.ontology],
    ["frame", inputs.frame],
  ];

  const blobs: MethodologyBlob[] = [];
  let written = 0;
  await fs.mkdir(path.join(storeDir, METHODOLOGY_BLOBS_DIR), { recursive: true });

  for (const [role, input] of roleInputs) {
    if (!input) continue;
    const hash = sha256(input.source);
    if (input.expectedSha256 && input.expectedSha256 !== hash) {
      throw new Error(
        `${role} content sha256 ${hash.slice(0, 12)} != expected ${input.expectedSha256.slice(0, 12)} ` +
          `for period ${period} — the .input file does not match what run_methodology recorded`,
      );
    }
    const rel = `${METHODOLOGY_BLOBS_DIR}/${hash}.${EXT_BY_ROLE[role]}`;
    const abs = path.join(storeDir, rel);
    const bytes = Buffer.byteLength(input.source, "utf-8");
    if (!(await fileExists(abs))) {
      await fs.writeFile(abs, input.source, "utf-8");
      written++;
    }
    blobs.push({ role, version: input.version, sha256: hash, bytes, path: rel });
  }

  const alreadyFrozen =
    !!existing &&
    existing.methodologyHash === methodologyHash &&
    sameBlobSet(existing.blobs, blobs);

  const entry: MethodologyIndexEntry = {
    period,
    methodologyHash,
    frozenAt: existing?.frozenAt ?? new Date().toISOString(),
    blobs,
  };
  const idx = index.entries.findIndex((e) => e.period === period);
  if (idx >= 0) index.entries[idx] = entry;
  else index.entries.push(entry);
  await writeMethodologyIndex(storeDir, index);

  return { period, blobs, written, alreadyFrozen };
}

export type StoreVerifyResult = {
  ok: boolean;
  checked: number;
  /** Recorded blobs with no file on disk. */
  missing: string[];
  /** Recorded blobs whose on-disk content no longer hashes to its recorded sha256. */
  corrupted: string[];
};

/**
 * Verifies every blob the index records is present and still hashes to its recorded sha256.
 * A content-addressed blob path IS its hash, so a mismatch means the file was tampered with.
 */
export async function verifyMethodologyStore(
  storeDir: string,
  index?: MethodologyIndex,
): Promise<StoreVerifyResult> {
  const idx = index ?? (await readMethodologyIndex(storeDir));
  const missing: string[] = [];
  const corrupted: string[] = [];
  let checked = 0;

  // De-dup by path — the same blob is shared across periods.
  const seen = new Set<string>();
  for (const entry of idx.entries) {
    for (const blob of entry.blobs) {
      if (seen.has(blob.path)) continue;
      seen.add(blob.path);
      checked++;
      const abs = path.join(storeDir, blob.path);
      try {
        const content = await fs.readFile(abs, "utf-8");
        if (sha256(content) !== blob.sha256) corrupted.push(blob.path);
      } catch {
        missing.push(blob.path);
      }
    }
  }

  return { ok: missing.length === 0 && corrupted.length === 0, checked, missing, corrupted };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function sameBlobSet(a: MethodologyBlob[], b: MethodologyBlob[]): boolean {
  if (a.length !== b.length) return false;
  const key = (x: MethodologyBlob): string => `${x.role}:${x.sha256}`;
  const setA = new Set(a.map(key));
  return b.every((x) => setA.has(key(x)));
}

/*
<MODULE_CONTRACT>
<purpose>Operator-authorized source exclusion binding (RFC-0115 B2). The 2026-09-15 review
authorized excluding the exact unresolved files pinned by the offline audit inventory. This
module materializes that authorization into an exact path/sha256/bytes artifact, verifies the
entire source closure and every listed file at admission time, and hands ParseSourcesGogol a
closed lookup so only those bytes may be skipped — no wildcard, no future-error waiver.</purpose>
<non-goals>
  <item>Does not decide which files deserve exclusion — the operator authorization does.</item>
  <item>Does not admit sources or seal batches — receipts record the exclusion, nothing more.</item>
  <item>Does not replace parser fixes — excluded files retain their audit disposition.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>B2: materialize the authorized 677-file exclusion set as a verifiable artifact bound to
  the pinned audit inventory, the entire source closure and the selected-exclusion closure.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { inspectRetainedFile } from "@warpgogol/pipeline-node";
import { sourceClosureSha256 } from "./source-audit.js";

export const SOURCE_EXCLUSIONS_SCHEMA = "hdri-source-exclusions@1";

/** Audit dispositions eligible for operator exclusion — nothing else may be waived. */
const EXCLUDABLE_DISPOSITIONS = new Set([
  "unrecognized",
  "error",
  "unsupported-extension",
]);

export type SourceExclusionEntry = {
  /** Batch-root-relative logical path (posix separators). */
  path: string;
  sha256: string;
  bytes: number;
  /** The disposition the offline audit assigned — retained as the original outcome. */
  auditDisposition: "unrecognized" | "error" | "unsupported-extension";
};

export type SourceExclusionsFile = {
  schema: typeof SOURCE_EXCLUSIONS_SCHEMA;
  /** Batch directory name this artifact applies to (e.g. "2026-q3-de-01"). */
  batch: string;
  /** Entire source closure digest recomputed from the live batch at generation time. */
  sourceSha256: string;
  /** sha256 of the pinned audit inventory (files.ndjson) this artifact derives from. */
  inventorySha256: string;
  /** sha256 of the pinned audit summary (summary.json). */
  summarySha256: string;
  /** Operator authorization reference (review document). */
  authorization: string;
  /** sha256 over the canonical JSON of the sorted exclusion entries — the selected closure. */
  exclusionsSha256: string;
  exclusions: SourceExclusionEntry[];
};

const sha256hex = (buf: Buffer | string): string =>
  createHash("sha256").update(buf).digest("hex");

const canonicalEntries = (entries: SourceExclusionEntry[]): string =>
  JSON.stringify(
    [...entries]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((e) => [e.path, e.sha256, e.bytes, e.auditDisposition]),
  );

export const exclusionsClosureSha256 = (entries: SourceExclusionEntry[]): string =>
  sha256hex(canonicalEntries(entries));

// ---------------------------------------------------------------------------
// Generation — build the artifact from a pinned audit inventory + live batch
// ---------------------------------------------------------------------------

export type BuildExclusionsOptions = {
  batchRoot: string;
  batchName: string;
  inventoryPath: string;
  summaryPath: string;
  authorization: string;
};

export const buildSourceExclusions = async (
  opts: BuildExclusionsOptions,
): Promise<SourceExclusionsFile> => {
  const inventoryBytes = await fs.readFile(opts.inventoryPath);
  const summaryBytes = await fs.readFile(opts.summaryPath);
  const summary = JSON.parse(summaryBytes.toString("utf-8")) as {
    sourceSha256?: string;
    dispositions?: Record<string, number>;
  };

  const exclusions: SourceExclusionEntry[] = [];
  const seen = new Set<string>();
  for (const line of inventoryBytes.toString("utf-8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      path?: string;
      sha256?: string;
      bytes?: number;
      disposition?: string;
    };
    if (!row.path || !row.sha256 || typeof row.bytes !== "number" || !row.disposition)
      throw new Error("INVALID_AUDIT_INVENTORY_ROW");
    if (!EXCLUDABLE_DISPOSITIONS.has(row.disposition)) continue;
    if (seen.has(row.path)) throw new Error(`DUPLICATE_EXCLUSION_PATH: ${row.path}`);
    seen.add(row.path);
    exclusions.push({
      path: row.path,
      sha256: row.sha256,
      bytes: row.bytes,
      auditDisposition: row.disposition as SourceExclusionEntry["auditDisposition"],
    });
  }
  if (exclusions.length === 0) throw new Error("EMPTY_EXCLUSION_SET");

  // Cross-check the selected count against the audited disposition tally.
  const declared = (summary.dispositions ?? {});
  const expected =
    (declared.unrecognized ?? 0) +
    (declared.error ?? 0) +
    (declared["unsupported-extension"] ?? 0);
  if (exclusions.length !== expected)
    throw new Error(
      `EXCLUSION_COUNT_MISMATCH: inventory yields ${exclusions.length}, summary declares ${expected}`,
    );

  // Bind the artifact to the exact audited source closure — drift since audit fails here.
  const closure = await sourceClosureSha256(opts.batchRoot);
  if (closure.sourceSha256 !== summary.sourceSha256)
    throw new Error("SOURCE_CLOSURE_CHANGED: batch no longer matches the audited input");

  // Every listed file must exist on disk with the pinned bytes.
  for (const entry of exclusions) {
    const digest = await inspectRetainedFile(path.join(opts.batchRoot, entry.path));
    if (digest.sha256 !== entry.sha256 || digest.bytes !== entry.bytes)
      throw new Error(`EXCLUSION_SOURCE_CHANGED: ${entry.path}`);
  }

  return {
    schema: SOURCE_EXCLUSIONS_SCHEMA,
    batch: opts.batchName,
    sourceSha256: closure.sourceSha256,
    inventorySha256: sha256hex(inventoryBytes),
    summarySha256: sha256hex(summaryBytes),
    authorization: opts.authorization,
    exclusionsSha256: exclusionsClosureSha256(exclusions),
    exclusions: exclusions.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
};

// ---------------------------------------------------------------------------
// Admission-time load + verify
// ---------------------------------------------------------------------------

const isHex64 = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

export const parseSourceExclusions = (raw: unknown): SourceExclusionsFile => {
  const doc = raw as Partial<SourceExclusionsFile>;
  if (!doc || typeof doc !== "object" || doc.schema !== SOURCE_EXCLUSIONS_SCHEMA)
    throw new Error("INVALID_SOURCE_EXCLUSIONS_SCHEMA");
  if (typeof doc.batch !== "string" || !doc.batch) throw new Error("INVALID_EXCLUSION_BATCH");
  for (const field of [
    "sourceSha256",
    "inventorySha256",
    "summarySha256",
    "exclusionsSha256",
  ] as const)
    if (!isHex64(doc[field])) throw new Error(`INVALID_EXCLUSION_FIELD: ${field}`);
  if (typeof doc.authorization !== "string" || !doc.authorization)
    throw new Error("INVALID_EXCLUSION_AUTHORIZATION");
  if (!Array.isArray(doc.exclusions) || doc.exclusions.length === 0)
    throw new Error("EMPTY_EXCLUSION_SET");
  for (const e of doc.exclusions) {
    if (
      !e ||
      typeof e.path !== "string" ||
      !e.path ||
      e.path.includes("..") ||
      path.posix.isAbsolute(e.path) ||
      !isHex64(e.sha256) ||
      typeof e.bytes !== "number" ||
      !EXCLUDABLE_DISPOSITIONS.has(e.auditDisposition)
    )
      throw new Error("INVALID_EXCLUSION_ENTRY");
  }
  const entries = doc.exclusions as SourceExclusionEntry[];
  if (exclusionsClosureSha256(entries) !== doc.exclusionsSha256)
    throw new Error("EXCLUSION_CLOSURE_MISMATCH: artifact entries were altered");
  return doc as SourceExclusionsFile;
};

/**
 * Loads and fully verifies the exclusion artifact for one batch. Returns null when no artifact
 * exists or the artifact targets a different batch (it is batch-scoped). Any mismatch — altered
 * artifact, drifted source closure, changed/missing listed file — fails closed.
 */
export const loadVerifiedSourceExclusions = async (
  artifactPath: string,
  batchName: string,
  batchRoot: string,
): Promise<Map<string, SourceExclusionEntry> | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(artifactPath, "utf-8");
  } catch {
    return null; // no artifact → no exclusions
  }
  const artifact = parseSourceExclusions(JSON.parse(raw));
  if (artifact.batch !== batchName) return null;

  const closure = await sourceClosureSha256(batchRoot);
  if (closure.sourceSha256 !== artifact.sourceSha256)
    throw new Error("SOURCE_CLOSURE_CHANGED: batch no longer matches the authorized audit");

  const map = new Map<string, SourceExclusionEntry>();
  for (const entry of artifact.exclusions) {
    const digest = await inspectRetainedFile(path.join(batchRoot, entry.path));
    if (digest.sha256 !== entry.sha256 || digest.bytes !== entry.bytes)
      throw new Error(`EXCLUSION_SOURCE_CHANGED: ${entry.path}`);
    map.set(entry.path, entry);
  }
  return map;
};

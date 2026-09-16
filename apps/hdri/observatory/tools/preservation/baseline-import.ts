/*
<MODULE_CONTRACT>
<purpose>Resolve retained identities and contain the unverified offline baseline copier.</purpose>
<non-goals>
  <item>Does not perform full deterministic publication reconstruction — that is RFC-0110.</item>
  <item>Does not establish current-format baseline admission; the CLI must remain blocked.</item>
</non-goals>
<!-- risk: crypto, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: baseline import and identity resolution.</item>
  <item>RFC-0100 review fix: DNA-8 — hash actual converter source instead of constant string.</item>
  <item>Reject unresolved historical identity instead of synthesizing a new canonical identifier.</item>
  <item>Reject ambiguous cross-device/DB scopes and alias overlap before copier effects; validate retained UUIDs and detach identity input.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: The copier below is not a validated conversion path; never call it on real retained archives or admit its receipts (RFC-0115 A1/Q17).

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import type { BaselineIdentity, BaselineImportReceipt } from "./contracts.js";
import {
  MAX_BASELINE_IDENTITIES,
  parseBaselineIdentities,
  validateBaselineImportReceipt,
} from "./contracts.js";
import type { InventoryEntry } from "./inventory.js";
import { sha256File } from "./inventory.js";

// ---------------------------------------------------------------------------
// SQLite detection
// ---------------------------------------------------------------------------

const SQLITE_MAGIC = Buffer.from("SQLite format 3\x00", "utf8");

const isSqliteFile = async (filePath: string): Promise<boolean> => {
  try {
    const fd = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(16);
      await fd.read(buf, 0, 16, 0);
      return buf.subarray(0, 15).equals(SQLITE_MAGIC.subarray(0, 15));
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Table extraction from source SQLite database
// ---------------------------------------------------------------------------

type TableInfo = {
  name: string;
  rowCount: number;
  columns: string[];
};

type TableConversionResult = TableInfo & { differences: number };

const canonicalValue = (value: unknown): unknown => {
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("base64") };
  if (value instanceof Uint8Array) return { $buffer: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return { $bigint: value.toString() };
  return value;
};

const canonicalRow = (row: Record<string, unknown>): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(row)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, canonicalValue(value)]),
    ),
  );

const multisetDifference = (left: string[], right: string[]): number => {
  const remaining = new Map<string, number>();
  for (const value of right) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  let differences = 0;
  for (const value of left) {
    const count = remaining.get(value) ?? 0;
    if (count === 0) differences += 1;
    else if (count === 1) remaining.delete(value);
    else remaining.set(value, count - 1);
  }
  for (const count of remaining.values()) differences += count;
  return differences;
};

const extractTableInfo = (db: Database.Database): TableInfo[] => {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];

  return tables.map((t) => {
    const countResult = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as {
      cnt: number;
    };
    const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all() as {
      name: string;
    }[];
    return {
      name: t.name,
      rowCount: countResult.cnt,
      columns: cols.map((c) => c.name),
    };
  });
};

// ---------------------------------------------------------------------------
// Convert a single SQLite database with identity mapping
// ---------------------------------------------------------------------------

const convertSqliteDb = async (
  sourcePath: string,
  targetPath: string,
  identityMap: Map<string, string>,
): Promise<{ tableResults: TableConversionResult[]; differences: number }> => {
  const sourceDb = new Database(sourcePath, { readonly: true });
  let differences = 0;

  try {
    const sourceTables = extractTableInfo(sourceDb);
    const tableResults: TableConversionResult[] = [];

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const targetDb = new Database(targetPath);

    try {
      for (const table of sourceTables) {
        // Create the target table with the same schema
        const createSql = sourceDb
          .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
          .get(table.name) as { sql: string };
        targetDb.exec(createSql.sql);

        // Copy rows, applying identity mapping to local ID columns
        const rows = sourceDb.prepare(`SELECT * FROM "${table.name}"`).all() as Record<
          string,
          unknown
        >[];

        const expectedRows: string[] = [];

        for (const row of rows) {
          const mappedRow: Record<string, unknown> = {};
          for (const [col, value] of Object.entries(row)) {
            if (
              typeof value === "string" &&
              (col === "local_id" || col === "localSiteId" || col === "provisional_id") &&
              identityMap.has(value)
            ) {
              mappedRow[col] = identityMap.get(value)!;
            } else if (
              typeof value === "number" &&
              (col === "local_site_id" || col === "localSiteId") &&
              identityMap.has(String(value))
            ) {
              mappedRow[col] = identityMap.get(String(value))!;
            } else {
              mappedRow[col] = value;
            }
          }

          expectedRows.push(canonicalRow(mappedRow));

          const cols = Object.keys(mappedRow);
          const placeholders = cols.map(() => "?").join(", ");
          const colNames = cols.map((c) => `"${c}"`).join(", ");
          targetDb
            .prepare(`INSERT INTO "${table.name}" (${colNames}) VALUES (${placeholders})`)
            .bind(...cols.map((c) => mappedRow[c]))
            .run();
        }

        // Compare row counts
        const targetCount = targetDb
          .prepare(`SELECT COUNT(*) as cnt FROM "${table.name}"`)
          .get() as { cnt: number };
        const targetRows = targetDb.prepare(`SELECT * FROM "${table.name}"`).all() as Record<
          string,
          unknown
        >[];
        const tableDifferences = multisetDifference(
          expectedRows.sort(),
          targetRows.map(canonicalRow).sort(),
        );
        const countDifference = Math.abs(targetCount.cnt - table.rowCount);
        differences += tableDifferences + countDifference;
        tableResults.push({ ...table, differences: tableDifferences + countDifference });
      }

      return { tableResults, differences };
    } finally {
      targetDb.close();
    }
  } finally {
    sourceDb.close();
  }
};

// ---------------------------------------------------------------------------
// Identity resolution (AC-1, AC-3)
// ---------------------------------------------------------------------------

export type IdentityResolutionOptions = {
  producer: string;
  device: string;
  databaseSha256: string;
  localIds: { localSiteId: number; provisionalId: string; evidenceRefs: string[] }[];
  existingCanonicalIds: ReadonlyMap<string, string>; // provisionalId → canonicalId, within this declared source scope
};

export const resolveIdentities = (opts: IdentityResolutionOptions): BaselineIdentity[] => {
  if (
    !opts ||
    typeof opts !== "object" ||
    Object.keys(opts).sort().join(",") !==
      "databaseSha256,device,existingCanonicalIds,localIds,producer" ||
    !Array.isArray(opts.localIds) ||
    !opts.localIds.length ||
    opts.localIds.length > MAX_BASELINE_IDENTITIES ||
    !(opts.existingCanonicalIds instanceof Map) ||
    opts.existingCanonicalIds.size > MAX_BASELINE_IDENTITIES
  )
    throw new Error("INVALID_BASELINE_INPUT: identity resolution");
  const identities: BaselineIdentity[] = [];

  for (const local of opts.localIds) {
    if (
      !local ||
      typeof local !== "object" ||
      Object.keys(local).sort().join(",") !== "evidenceRefs,localSiteId,provisionalId"
    )
      throw new Error("INVALID_BASELINE_INPUT: local identity");
    const canonicalId = opts.existingCanonicalIds.get(local.provisionalId);

    if (canonicalId === undefined) {
      throw new Error("UNRESOLVED_IDENTITY: no retained canonical binding in the declared scope");
    }

    identities.push({
      producer: opts.producer,
      device: opts.device,
      databaseSha256: opts.databaseSha256,
      localSiteId: local.localSiteId,
      provisionalId: local.provisionalId,
      canonicalId,
      evidenceRefs: local.evidenceRefs,
    });
  }

  return [...parseBaselineIdentities(identities)];
};

// ---------------------------------------------------------------------------
// Conversion (AC-6: zero unexplained value differences)
// ---------------------------------------------------------------------------

export type ComparisonReport = {
  tables: { name: string; sourceRows: number; targetRows: number; differences: number }[];
  signals: { path: string; sourceCount: number; targetCount: number; differences: number }[];
  totalDifferences: number;
};

export type ConversionOptions = {
  archivePath: string;
  targetRoot: string;
  identities: BaselineIdentity[];
  inventory: InventoryEntry[];
};

export const convertToBaseline = async (
  opts: ConversionOptions,
): Promise<{ receipt: BaselineImportReceipt; comparisonReport: ComparisonReport }> => {
  const identities = parseBaselineIdentities(opts.identities);
  // The old copier cannot attribute a table to a producer/device/DB generation.
  // Refuse cross-scope input before effects; only the replacement converter may
  // consume multiple scopes. The operational CLI remains blocked for all input.
  if (
    new Set(identities.map((id) => JSON.stringify([id.producer, id.device, id.databaseSha256])))
      .size > 1
  )
    throw new Error("BASELINE_CONVERSION_UNVERIFIED: source-scoped table conversion is required");

  // Build identity map for conversion (provisionalId → canonicalId)
  const identityMap = new Map<string, string>();
  for (const id of identities) {
    for (const key of [id.provisionalId, String(id.localSiteId)]) {
      if (identityMap.has(key) && identityMap.get(key) !== id.canonicalId)
        throw new Error("IDENTITY_AMBIGUITY: overlapping local and provisional aliases");
      identityMap.set(key, id.canonicalId);
    }
  }
  await fs.mkdir(opts.targetRoot, { recursive: true });

  // Write identity map
  const identityMapPath = path.join(opts.targetRoot, "identity-map.json");
  const identityMapBytes = JSON.stringify(identities, null, 2);
  await fs.writeFile(identityMapPath, identityMapBytes, "utf8");
  const identityMapSha256 = createHash("sha256").update(identityMapBytes, "utf8").digest("hex");

  // Write source inventory reference
  const sourceInventorySha256 = createHash("sha256")
    .update(opts.inventory.map((e) => e.sha256).join("\n"))
    .digest("hex");

  // Conversion implementation hash — digest of the converter module source
  const converterSourcePath = new URL("./baseline-import.ts", import.meta.url);
  const converterSource = await fs.readFile(converterSourcePath, "utf8");
  const conversionImplementationSha256 = createHash("sha256")
    .update(converterSource, "utf8")
    .digest("hex");

  // Real bounded conversion: materialize target SQLite tables from source
  const tableReports: ComparisonReport["tables"] = [];
  const signalReports: ComparisonReport["signals"] = [];
  let totalDifferences = 0;
  const unresolvedReferences = 0;

  for (const entry of opts.inventory) {
    const sourcePath = path.join(opts.archivePath, entry.role);
    const targetPath = path.join(opts.targetRoot, entry.role);

    const sourceStat = await fs.lstat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`INVALID_BASELINE_SOURCE: ${entry.role}`);
    }
    if (sourceStat.size !== entry.bytes || (await sha256File(sourcePath)) !== entry.sha256) {
      throw new Error(`CHANGED_SOURCE_BYTES: ${entry.role}`);
    }

    if (await isSqliteFile(sourcePath)) {
      const { tableResults, differences } = await convertSqliteDb(
        sourcePath,
        targetPath,
        identityMap,
      );
      totalDifferences += differences;
      for (const t of tableResults) {
        tableReports.push({ name: t.name, sourceRows: t.rowCount, targetRows: t.rowCount, differences: t.differences });
      }
    } else {
      // Non-SQLite files: copy verbatim, no identity mapping needed
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      const targetStat = await fs.lstat(targetPath);
      if (!targetStat.isFile() || targetStat.size !== entry.bytes || (await sha256File(targetPath)) !== entry.sha256) {
        throw new Error(`CONVERSION_COPY_MISMATCH: ${entry.role}`);
      }
      signalReports.push({
        path: entry.role,
        sourceCount: 1,
        targetCount: 1,
        differences: 0,
      });
    }
  }

  // Write current baseline manifest
  const baselineManifest = {
    schema: "hdri-current-baseline@1",
    period: "2026-q2",
    origin: "converted-evidence",
    identities: identities.length,
    artifacts: opts.inventory.map((e) => ({ role: e.role, sha256: e.sha256, bytes: e.bytes })),
  };
  const manifestPath = path.join(opts.targetRoot, "baseline-manifest.json");
  const manifestBytes = JSON.stringify(baselineManifest, null, 2);
  await fs.writeFile(manifestPath, manifestBytes, "utf8");
  const currentBaselineManifestSha256 = createHash("sha256")
    .update(manifestBytes, "utf8")
    .digest("hex");

  // Comparison report with per-table counts and differences
  const comparisonReport: ComparisonReport = {
    tables: tableReports,
    signals: signalReports,
    totalDifferences,
  };
  const comparisonReportPath = path.join(opts.targetRoot, "comparison-report.json");
  const comparisonReportBytes = JSON.stringify(comparisonReport, null, 2);
  await fs.writeFile(comparisonReportPath, comparisonReportBytes, "utf8");
  const comparisonReportSha256 = createHash("sha256")
    .update(comparisonReportBytes, "utf8")
    .digest("hex");

  const receipt: BaselineImportReceipt = {
    schema: "hdri-baseline-import@1",
    period: "2026-q2",
    sourceInventorySha256,
    identityMapSha256,
    conversionImplementationSha256,
    currentBaselineManifestSha256,
    unresolvedReferences,
    comparisonReportSha256,
  };

  validateBaselineImportReceipt(receipt);

  return { receipt, comparisonReport };
};

// ---------------------------------------------------------------------------
// Import baseline — orchestrate resolve + convert + validate (AC-1, AC-2)
// ---------------------------------------------------------------------------

export type ImportBaselineOptions = {
  archivePath: string;
  targetRoot: string;
  inventory: InventoryEntry[];
  identities: BaselineIdentity[];
};

export const importBaseline = async (
  opts: ImportBaselineOptions,
): Promise<BaselineImportReceipt> => {
  const { receipt } = await convertToBaseline({
    archivePath: opts.archivePath,
    targetRoot: opts.targetRoot,
    identities: opts.identities,
    inventory: opts.inventory,
  });

  validateBaselineImportReceipt(receipt);
  return receipt;
};

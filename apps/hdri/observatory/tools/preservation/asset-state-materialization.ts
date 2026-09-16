/*
<MODULE_CONTRACT>
<purpose>Write retained AssetState and HWO mapping projections to a fresh current-schema database and compare complete source lineage.</purpose>
<non-goals>
  <item>Does not authenticate the external canonical domain map or combine Observatory observations into this partial target.</item>
  <item>Does not turn a compared fixture into baseline admission.</item>
</non-goals>
<!-- risk: crypto, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: materialize current AssetState/HWO tables with source-only lineage and independent read-back.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: This partial target remains compared-not-admitted until joined to the authenticated complete identity/observation closure.

import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import {
  assertCanonicalFilePath,
  assertDisjointPaths,
  inspectRetainedFile,
} from "@warpgogol/pipeline-node";
import { migrateObservatory, stampObservatoryMeta } from "../../run/db/migrate.js";
import {
  compareBaselineRecords,
  type BaselineDomainComparison,
  type BaselineRecord,
} from "./baseline-comparison.js";
import {
  streamPreparedAssetStates,
  type RetainedAssetStateProjection,
} from "./asset-state-source.js";
import type { BaselineScopeInventory } from "./baseline-scope.js";
import {
  assertPreparedBaselineSource,
  type PreparedBaselineSource,
} from "./preserve.js";

export type AssetStateMaterializationReport = Readonly<{
  schema: "hdri-baseline-asset-state-materialization@1";
  status: "compared-not-admitted";
  manifestSha256: string;
  sourceSnapshot: Readonly<{ uri: string; sha256: string; bytes: number }>;
  target: Readonly<{ sha256: string; bytes: number }>;
  import: Readonly<{
    runId: string;
    importedAt: string;
    implementationFingerprint: string;
    ontologyVersion: string;
    codebookVersion: string;
  }>;
  comparisons: Readonly<{
    assetStates: BaselineDomainComparison;
    mappings: BaselineDomainComparison;
  }>;
}>;

type ImportMetadata = AssetStateMaterializationReport["import"];
const ASSET_FIELDS = [
  "asset_id",
  "domain",
  "gewerk_group",
  "hwo_uid",
  "hwo_confidence",
  "hwo_provenance",
  "bundesland",
  "gemeinde",
  "source_created_at",
  "valid_from",
  "run_id",
  "period",
] as const;
const MAPPING_FIELDS = [
  "target_code",
  "target_label",
  "source",
  "source_created_at",
  "recorded_at",
  "run_id",
] as const;

function text(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > 4096 ||
    Array.from(value).some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 0x1f || code === 0x7f;
    })
  )
    throw new Error(`INVALID_BASELINE_IMPORT_${label}`);
  return value;
}

function metadata(value: ImportMetadata): ImportMetadata {
  const importedAt = text(value.importedAt, "TIME");
  if (new Date(importedAt).toISOString() !== importedAt)
    throw new Error("INVALID_BASELINE_IMPORT_TIME");
  return Object.freeze({
    runId: text(value.runId, "RUN_ID"),
    importedAt,
    implementationFingerprint: text(value.implementationFingerprint, "IMPLEMENTATION"),
    ontologyVersion: text(value.ontologyVersion, "ONTOLOGY"),
    codebookVersion: text(value.codebookVersion, "CODEBOOK"),
  });
}

function siteKey(localSiteId: string): string {
  if (!/^\d{1,19}$/.test(localSiteId)) throw new Error("INVALID_BASELINE_LOCAL_SITE_ID");
  return localSiteId.padStart(20, "0");
}

function mappingKey(localSiteId: string, system: string): string {
  return `${siteKey(localSiteId)}:${Buffer.from(system).toString("hex")}`;
}

function assetRecord(
  row: RetainedAssetStateProjection,
  meta: ImportMetadata,
  period: string,
): BaselineRecord {
  return {
    key: siteKey(row.retained.localSiteId),
    values: [
      row.record.asset_id,
      row.record.domain,
      row.record.gewerk_group,
      row.record.hwo_uid,
      row.retained.hwoConfidence,
      row.record.hwo_provenance,
      row.record.bundesland,
      row.record.gemeinde,
      row.retained.createdAt,
      meta.importedAt,
      meta.runId,
      period,
    ],
  };
}

function mappingRecords(
  row: RetainedAssetStateProjection,
  meta: ImportMetadata,
): BaselineRecord[] {
  return row.record.mappings.map((mapping, index) => ({
    key: mappingKey(row.retained.localSiteId, mapping.mapping_system),
    values: [
      mapping.target_code,
      mapping.target_label,
      mapping.source,
      row.retained.mappings[index].createdAt,
      meta.importedAt,
      meta.runId,
    ],
  }));
}

async function* sourceAssets(options: {
  prepared: PreparedBaselineSource;
  scopeInventory: BaselineScopeInventory;
  snapshotUri: string;
  canonicalByDomain: ReadonlyMap<string, string>;
  meta: ImportMetadata;
  period: string;
}): AsyncGenerator<BaselineRecord> {
  for await (const row of streamPreparedAssetStates(options))
    yield assetRecord(row, options.meta, options.period);
}

async function* sourceMappings(
  options: Parameters<typeof sourceAssets>[0],
): AsyncGenerator<BaselineRecord> {
  for await (const row of streamPreparedAssetStates(options))
    for (const record of mappingRecords(row, options.meta)) yield record;
}

function* targetAssets(db: Database.Database): Generator<BaselineRecord> {
  const rows = db
    .prepare(
      `SELECT l.source_local_site_id,s.asset_id,s.domain,s.gewerk_group,s.hwo_uid,
      l.hwo_confidence,s.hwo_provenance,s.bundesland,s.gemeinde,l.source_created_at,
      s.valid_from,s.run_id,s.period FROM asset_states AS s
      JOIN baseline_asset_state_lineage AS l ON l.asset_id=s.asset_id
      ORDER BY l.source_local_site_id`,
    )
    .raw()
    .safeIntegers();
  for (const row of rows.iterate() as Iterable<unknown[]>)
    yield { key: siteKey(String(row[0])), values: row.slice(1) as BaselineRecord["values"] };
}

function* targetMappings(db: Database.Database): Generator<BaselineRecord> {
  const rows = db
    .prepare(
      `SELECT l.source_local_site_id,m.mapping_system,m.target_code,m.target_label,m.source,
      l.source_created_at,m.recorded_at,m.run_id FROM asset_hwo_mappings AS m
      JOIN baseline_asset_mapping_lineage AS l
      ON l.asset_id=m.asset_id AND l.mapping_system=m.mapping_system
      ORDER BY l.source_local_site_id,m.mapping_system COLLATE BINARY`,
    )
    .raw()
    .safeIntegers();
  for (const row of rows.iterate() as Iterable<unknown[]>)
    yield {
      key: mappingKey(String(row[0]), row[1] as string),
      values: row.slice(2) as BaselineRecord["values"],
    };
}

export async function materializeAssetStateBaseline(options: Readonly<{
  prepared: PreparedBaselineSource;
  scopeInventory: BaselineScopeInventory;
  snapshotUri: string;
  targetPath: string;
  canonicalByDomain: ReadonlyMap<string, string>;
  period: string;
  import: ImportMetadata;
}>): Promise<AssetStateMaterializationReport> {
  assertPreparedBaselineSource(options.prepared);
  if (options.period !== options.prepared.manifest.period)
    throw new Error("BASELINE_ASSET_STATE_PERIOD_MISMATCH");
  const importMetadata = metadata(options.import);
  const canonicalByDomain = new Map(options.canonicalByDomain);
  const writeRows = streamPreparedAssetStates({ ...options, canonicalByDomain });
  const targetPath = path.resolve(options.targetPath);
  await assertCanonicalFilePath(path.dirname(targetPath));
  await assertCanonicalFilePath(targetPath, true);
  try {
    await fs.lstat(targetPath);
    throw new Error("FRESH_BASELINE_TARGET_REQUIRED");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  assertDisjointPaths([options.prepared.root, targetPath]);
  const sourceSnapshot = options.prepared.manifest.artifacts.find(
    (artifact) =>
      artifact.uri === options.snapshotUri && artifact.representation === "sqlite-snapshot",
  );
  if (!sourceSnapshot) throw new Error("HARVEST_BASELINE_SNAPSHOT_REQUIRED");

  const target = new Database(targetPath);
  try {
    migrateObservatory(target);
    stampObservatoryMeta(target, "hdri-baseline-converter", "asset-state-v1");
    target.exec(`
      CREATE TABLE baseline_asset_state_lineage (
        asset_id TEXT PRIMARY KEY,
        source_local_site_id INTEGER NOT NULL UNIQUE,
        hwo_confidence REAL,
        source_created_at TEXT
      );
      CREATE TABLE baseline_asset_mapping_lineage (
        asset_id TEXT NOT NULL,
        mapping_system TEXT NOT NULL,
        source_local_site_id INTEGER NOT NULL,
        source_created_at TEXT,
        PRIMARY KEY (asset_id,mapping_system)
      );
    `);
    const insertState = target.prepare(
      `INSERT INTO asset_states
      (asset_id,domain,gewerk_group,hwo_uid,hwo_provenance,bundesland,gemeinde,
       valid_from,valid_to,run_id,period) VALUES (?,?,?,?,?,?,?,?,NULL,?,?)`,
    );
    const insertStateLineage = target.prepare(
      "INSERT INTO baseline_asset_state_lineage VALUES (?,?,?,?)",
    );
    const insertMapping = target.prepare(
      `INSERT INTO asset_hwo_mappings
      (asset_id,mapping_system,target_code,target_label,source,run_id,recorded_at)
      VALUES (?,?,?,?,?,?,?)`,
    );
    const insertMappingLineage = target.prepare(
      "INSERT INTO baseline_asset_mapping_lineage VALUES (?,?,?,?)",
    );
    target.exec("BEGIN IMMEDIATE");
    try {
      let count = 0;
      for await (const row of writeRows) {
        insertState.run(
          row.record.asset_id,
          row.record.domain,
          row.record.gewerk_group,
          row.record.hwo_uid,
          row.record.hwo_provenance,
          row.record.bundesland,
          row.record.gemeinde,
          importMetadata.importedAt,
          importMetadata.runId,
          options.period,
        );
        insertStateLineage.run(
          row.record.asset_id,
          BigInt(row.retained.localSiteId),
          row.retained.hwoConfidence,
          row.retained.createdAt,
        );
        for (const [index, mapping] of row.record.mappings.entries()) {
          insertMapping.run(
            row.record.asset_id,
            mapping.mapping_system,
            mapping.target_code,
            mapping.target_label,
            mapping.source,
            importMetadata.runId,
            importMetadata.importedAt,
          );
          insertMappingLineage.run(
            row.record.asset_id,
            mapping.mapping_system,
            BigInt(row.retained.localSiteId),
            row.retained.mappings[index].createdAt,
          );
        }
        count++;
      }
      if (!count) throw new Error("NONEMPTY_ASSET_STATE_DOMAIN_REQUIRED");
      target.exec("COMMIT");
    } catch (error) {
      if (target.inTransaction) target.exec("ROLLBACK");
      throw error;
    }
  } finally {
    target.close();
  }

  const sourceOptions = {
    prepared: options.prepared,
    scopeInventory: options.scopeInventory,
    snapshotUri: options.snapshotUri,
    canonicalByDomain,
    meta: importMetadata,
    period: options.period,
  };
  const verify = new Database(targetPath, { readonly: true, fileMustExist: true });
  let assetStates: BaselineDomainComparison;
  let mappings: BaselineDomainComparison;
  try {
    assetStates = await compareBaselineRecords({
      domain: "asset_states",
      fields: ASSET_FIELDS,
      source: sourceAssets(sourceOptions),
      target: targetAssets(verify),
    });
    mappings = await compareBaselineRecords({
      domain: "asset_hwo_mappings",
      fields: MAPPING_FIELDS,
      source: sourceMappings(sourceOptions),
      target: targetMappings(verify),
    });
  } finally {
    verify.close();
  }
  if (assetStates.status !== "equal" || mappings.status === "different")
    throw new Error("BASELINE_ASSET_STATE_COMPARISON_FAILED");
  const targetEvidence = await inspectRetainedFile(targetPath);
  return Object.freeze({
    schema: "hdri-baseline-asset-state-materialization@1",
    status: "compared-not-admitted",
    manifestSha256: options.prepared.manifestSha256,
    sourceSnapshot: Object.freeze({
      uri: sourceSnapshot.uri,
      sha256: sourceSnapshot.sha256,
      bytes: sourceSnapshot.bytes,
    }),
    target: Object.freeze(targetEvidence),
    import: importMetadata,
    comparisons: Object.freeze({
      assetStates: Object.freeze(assetStates),
      mappings: Object.freeze(mappings),
    }),
  });
}

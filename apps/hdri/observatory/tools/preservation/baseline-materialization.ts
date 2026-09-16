/*
<MODULE_CONTRACT>
<purpose>Materialize retained Q2 identity and observation domains into fresh current-schema databases and independently compare exact values.</purpose>
<non-goals>
  <item>Does not materialize asset states, cohorts or evidence objects.</item>
  <item>Does not authenticate historical producer scope or issue an admission receipt.</item>
</non-goals>
<!-- risk: crypto, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: materialize and independently compare the complete retained Observatory identity map.</item>
  <item>Require the exact process-local complete Observatory scope inventory before target creation.</item>
  <item>Expose the same bounded source/target record streams to the joined baseline closure comparator.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: A successful identity comparison is one partial domain result, never baseline admission.

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
  RETAINED_OBSERVATION_COLUMN_NAMES,
  streamPreparedObservationIdentities,
  streamPreparedObservationIdentityMap,
  streamPreparedObservations,
  type RetainedObservationIdentityMapRow,
  type RetainedObservationSourceRow,
} from "./observation-source.js";
import {
  assertPreparedBaselineSource,
  type PreparedBaselineSource,
} from "./preserve.js";
import {
  assertBaselineScopeInventory,
  type BaselineScopeInventory,
  type BaselineSourceClaim,
} from "./baseline-scope.js";

export type IdentityMaterializationReport = Readonly<{
  schema: "hdri-baseline-identity-materialization@1";
  status: "compared-not-admitted";
  manifestSha256: string;
  sourceSnapshot: Readonly<{ uri: string; sha256: string; bytes: number }>;
  sourceScope: BaselineSourceClaim;
  target: Readonly<{ sha256: string; bytes: number }>;
  comparison: BaselineDomainComparison;
}>;
export type ObservationMaterializationReport = Readonly<{
  schema: "hdri-baseline-observation-materialization@1";
  status: "compared-not-admitted";
  manifestSha256: string;
  sourceSnapshot: Readonly<{ uri: string; sha256: string; bytes: number }>;
  sourceScope: BaselineSourceClaim;
  target: Readonly<{ sha256: string; bytes: number }>;
  comparisons: Readonly<{
    identities: BaselineDomainComparison;
    observations: BaselineDomainComparison;
  }>;
}>;

export const BASELINE_IDENTITY_FIELDS = ["canonical_id", "domain", "first_seen"] as const;

function sourceRecord(row: RetainedObservationIdentityMapRow): BaselineRecord {
  return {
    key: row.identity.provisional_id,
    values: BASELINE_IDENTITY_FIELDS.map((field) => row.identity[field]),
  };
}

export function* targetIdentityRecords(db: Database.Database): Generator<BaselineRecord> {
  const rows = db.prepare(
    `SELECT provisional_id,canonical_id,domain,first_seen
    FROM asset_id_map INDEXED BY sqlite_autoindex_asset_id_map_1
    ORDER BY provisional_id COLLATE BINARY`,
  );
  for (const row of rows.raw().iterate() as Iterable<[unknown, unknown, unknown, unknown]>) {
    if (row.some((value) => typeof value !== "string"))
      throw new Error("INVALID_MATERIALIZED_IDENTITY_VALUE");
    yield { key: row[0] as string, values: row.slice(1) as string[] };
  }
}

export async function* sourceIdentityRecords(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<BaselineRecord> {
  for await (const row of streamPreparedObservationIdentityMap(prepared, snapshotUri))
    yield sourceRecord(row);
}

export const BASELINE_OBSERVATION_FIELDS = RETAINED_OBSERVATION_COLUMN_NAMES.slice(1);

function observationRecord(row: RetainedObservationSourceRow): BaselineRecord {
  return {
    key: row.columns.id as string,
    values: BASELINE_OBSERVATION_FIELDS.map((field) => row.columns[field]),
  };
}

export async function* sourceObservationRecords(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
): AsyncGenerator<BaselineRecord> {
  for await (const row of streamPreparedObservations(prepared, snapshotUri))
    yield observationRecord(row);
}

export function* targetObservationRecords(db: Database.Database): Generator<BaselineRecord> {
  const selected = RETAINED_OBSERVATION_COLUMN_NAMES.map((name) => `"${name}"`).join(",");
  const rows = db
    .prepare(
      `SELECT ${selected} FROM observations INDEXED BY sqlite_autoindex_observations_1
      ORDER BY id COLLATE BINARY`,
    )
    .raw()
    .safeIntegers();
  for (const row of rows.iterate() as Iterable<unknown[]>)
    yield { key: row[0] as string, values: row.slice(1) as BaselineRecord["values"] };
}

async function resolveFreshTarget(
  prepared: PreparedBaselineSource,
  scopeInventory: BaselineScopeInventory,
  snapshotUri: string,
  requestedTargetPath: string,
) {
  assertPreparedBaselineSource(prepared);
  assertBaselineScopeInventory(scopeInventory);
  if (scopeInventory.manifestSha256 !== prepared.manifestSha256)
    throw new Error("BASELINE_MATERIALIZATION_SCOPE_MISMATCH");
  const scopedSource = scopeInventory.sources.find(
    (source) => source.declaration.snapshot.uri === snapshotUri,
  );
  if (!scopedSource || scopedSource.declaration.profile !== "observatory")
    throw new Error("OBSERVATORY_BASELINE_SCOPE_REQUIRED");
  const targetPath = path.resolve(requestedTargetPath);
  await assertCanonicalFilePath(path.dirname(targetPath));
  await assertCanonicalFilePath(targetPath, true);
  try {
    await fs.lstat(targetPath);
    throw new Error("FRESH_BASELINE_TARGET_REQUIRED");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  assertDisjointPaths([prepared.root, targetPath]);
  const sourceSnapshot = prepared.manifest.artifacts.find(
    (artifact) => artifact.uri === snapshotUri && artifact.representation === "sqlite-snapshot",
  );
  if (!sourceSnapshot) throw new Error("BASELINE_IDENTITY_SNAPSHOT_REQUIRED");
  return { targetPath, sourceSnapshot, sourceScope: scopedSource.declaration.scope };
}

/** Writes only into a new file. Failed roots remain for diagnosis and are never receipts. */
export async function materializeObservationIdentityBaseline(options: Readonly<{
  prepared: PreparedBaselineSource;
  scopeInventory: BaselineScopeInventory;
  snapshotUri: string;
  targetPath: string;
}>): Promise<IdentityMaterializationReport> {
  const { targetPath, sourceSnapshot, sourceScope } = await resolveFreshTarget(
    options.prepared,
    options.scopeInventory,
    options.snapshotUri,
    options.targetPath,
  );

  const target = new Database(targetPath);
  try {
    migrateObservatory(target);
    stampObservatoryMeta(target, "hdri-baseline-converter", "identity-v1");
    const insert = target.prepare(
      "INSERT INTO asset_id_map (provisional_id,canonical_id,domain,first_seen) VALUES (?, ?, ?, ?)",
    );
    target.exec("BEGIN IMMEDIATE");
    try {
      let count = 0;
      for await (const row of streamPreparedObservationIdentityMap(
        options.prepared,
        options.snapshotUri,
      )) {
        insert.run(
          row.identity.provisional_id,
          row.identity.canonical_id,
          row.identity.domain,
          row.identity.first_seen,
        );
        count++;
      }
      if (!count) throw new Error("NONEMPTY_IDENTITY_DOMAIN_REQUIRED");
      target.exec("COMMIT");
    } catch (error) {
      if (target.inTransaction) target.exec("ROLLBACK");
      throw error;
    }
  } finally {
    target.close();
  }

  const verify = new Database(targetPath, { readonly: true, fileMustExist: true });
  let comparison: BaselineDomainComparison;
  try {
    comparison = await compareBaselineRecords({
      domain: "asset_id_map",
      fields: BASELINE_IDENTITY_FIELDS,
      source: sourceIdentityRecords(options.prepared, options.snapshotUri),
      target: targetIdentityRecords(verify),
    });
  } finally {
    verify.close();
  }
  if (comparison.status !== "equal") throw new Error("BASELINE_IDENTITY_COMPARISON_FAILED");
  const targetEvidence = await inspectRetainedFile(targetPath);
  return Object.freeze({
    schema: "hdri-baseline-identity-materialization@1",
    status: "compared-not-admitted",
    manifestSha256: options.prepared.manifestSha256,
    sourceSnapshot: Object.freeze({
      uri: sourceSnapshot.uri,
      sha256: sourceSnapshot.sha256,
      bytes: sourceSnapshot.bytes,
    }),
    sourceScope,
    target: Object.freeze(targetEvidence),
    comparison: Object.freeze(comparison),
  });
}

/** Materialize the complete retained Observatory identity and observation domains.
 * Canonical namespace is explicit: provisional IDs require a separate forward-only
 * projection because rewriting signed source envelopes would be invalid. */
export async function materializeObservationBaseline(options: Readonly<{
  prepared: PreparedBaselineSource;
  scopeInventory: BaselineScopeInventory;
  snapshotUri: string;
  targetPath: string;
  assetIdNamespace: "canonical";
}>): Promise<ObservationMaterializationReport> {
  if (options.assetIdNamespace !== "canonical")
    throw new Error("CANONICAL_OBSERVATION_NAMESPACE_REQUIRED");
  const { targetPath, sourceSnapshot, sourceScope } = await resolveFreshTarget(
    options.prepared,
    options.scopeInventory,
    options.snapshotUri,
    options.targetPath,
  );
  const target = new Database(targetPath);
  try {
    migrateObservatory(target);
    stampObservatoryMeta(target, "hdri-baseline-converter", "observation-v1");
    const identityInsert = target.prepare(
      "INSERT INTO asset_id_map (provisional_id,canonical_id,domain,first_seen) VALUES (?, ?, ?, ?)",
    );
    const columnSql = RETAINED_OBSERVATION_COLUMN_NAMES.map((name) => `"${name}"`).join(",");
    const placeholders = RETAINED_OBSERVATION_COLUMN_NAMES.map(() => "?").join(",");
    const observationInsert = target.prepare(
      `INSERT INTO observations (${columnSql}) VALUES (${placeholders})`,
    );
    target.exec("BEGIN IMMEDIATE");
    try {
      let identities = 0;
      for await (const row of streamPreparedObservationIdentityMap(
        options.prepared,
        options.snapshotUri,
      )) {
        identityInsert.run(
          row.identity.provisional_id,
          row.identity.canonical_id,
          row.identity.domain,
          row.identity.first_seen,
        );
        identities++;
      }
      if (!identities) throw new Error("NONEMPTY_IDENTITY_DOMAIN_REQUIRED");
      let observations = 0;
      for await (const row of streamPreparedObservationIdentities(
        options.prepared,
        options.snapshotUri,
        options.assetIdNamespace,
      )) {
        observationInsert.run(
          ...RETAINED_OBSERVATION_COLUMN_NAMES.map((name) => row.observation.columns[name]),
        );
        observations++;
      }
      if (!observations) throw new Error("NONEMPTY_OBSERVATION_DOMAIN_REQUIRED");
      target.exec("COMMIT");
    } catch (error) {
      if (target.inTransaction) target.exec("ROLLBACK");
      throw error;
    }
  } finally {
    target.close();
  }

  const verify = new Database(targetPath, { readonly: true, fileMustExist: true });
  let identities: BaselineDomainComparison;
  let observations: BaselineDomainComparison;
  try {
    identities = await compareBaselineRecords({
      domain: "asset_id_map",
      fields: BASELINE_IDENTITY_FIELDS,
      source: sourceIdentityRecords(options.prepared, options.snapshotUri),
      target: targetIdentityRecords(verify),
    });
    observations = await compareBaselineRecords({
      domain: "observations",
      fields: BASELINE_OBSERVATION_FIELDS,
      source: sourceObservationRecords(options.prepared, options.snapshotUri),
      target: targetObservationRecords(verify),
    });
  } finally {
    verify.close();
  }
  if (identities.status !== "equal" || observations.status !== "equal")
    throw new Error("BASELINE_OBSERVATION_COMPARISON_FAILED");
  const targetEvidence = await inspectRetainedFile(targetPath);
  return Object.freeze({
    schema: "hdri-baseline-observation-materialization@1",
    status: "compared-not-admitted",
    manifestSha256: options.prepared.manifestSha256,
    sourceSnapshot: Object.freeze({
      uri: sourceSnapshot.uri,
      sha256: sourceSnapshot.sha256,
      bytes: sourceSnapshot.bytes,
    }),
    sourceScope,
    target: Object.freeze(targetEvidence),
    comparisons: Object.freeze({
      identities: Object.freeze(identities),
      observations: Object.freeze(observations),
    }),
  });
}

/*
<MODULE_CONTRACT>
<purpose>Materialize retained Observatory identity/observations and Harvest AssetState/HWO domains into one fresh current-schema database and compare the complete joined projection.</purpose>
<non-goals>
  <item>Does not authenticate historical provenance, nonempty evidence/CAS closure or implementation dependencies.</item>
  <item>Does not issue baseline admission or make the blocked import CLI operational.</item>
</non-goals>
<!-- risk: crypto, fs-write -->
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 A1: join process-local Observatory identities to Harvest domains and compare four materialized domains in one target.</item>
  <item>Carry explicit current-Observation semantic validation evidence into the joined report.</item>
  <item>Reject caller import ontology labels that differ from the complete retained observation domain.</item>
  <item>Require exact retained ontology/codebook artifacts and validate every observation against their parsed contract.</item>
  <item>Materialize every retained pipeline run, join observations to runs and compare the run domain.</item>
  <item>Report exact bounded row counts for every declared retained-only table.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: This joined target remains compared-not-admitted until source trust, evidence and operational closure are independently verified.

import Database from "better-sqlite3";
import { inspectRetainedFile } from "@warpgogol/pipeline-node";
import {
  BASELINE_IDENTITY_FIELDS,
  BASELINE_OBSERVATION_FIELDS,
  BASELINE_RUN_FIELDS,
  materializeObservationBaseline,
  sourceIdentityRecords,
  sourceObservationRecords,
  sourceRunRecords,
  targetIdentityRecords,
  targetObservationRecords,
  targetRunRecords,
} from "./baseline-materialization.js";
import {
  BASELINE_ASSET_MAPPING_FIELDS,
  BASELINE_ASSET_STATE_FIELDS,
  sourceAssetMappingRecords,
  sourceAssetStateRecords,
  targetAssetMappingRecords,
  targetAssetStateRecords,
  validateBaselineImportMetadata,
  type BaselineImportMetadata,
} from "./asset-state-materialization.js";
import { compareBaselineRecords, type BaselineDomainComparison } from "./baseline-comparison.js";
import { streamPreparedAssetStates } from "./asset-state-source.js";
import { streamPreparedCohorts, streamPreparedStrata } from "./cohort-source.js";
import {
  streamPreparedObservationIdentityMap,
  streamPreparedObservations,
} from "./observation-source.js";
import type { BaselineScopeInventory, BaselineSourceClaim } from "./baseline-scope.js";
import type { PreparedBaselineSource } from "./preserve.js";
import { streamPreparedSnapshot } from "./prepared-snapshot.js";
import {
  inspectBaselineMethodology,
  type BaselineMethodologyInspection,
} from "./baseline-methodology.js";

export type BaselineClosureMaterializationReport = Readonly<{
  schema: "hdri-baseline-closure-materialization@1";
  status: "compared-not-admitted";
  manifestSha256: string;
  sourceSnapshots: Readonly<{
    observatory: Readonly<{ uri: string; sha256: string; bytes: number }>;
    harvest: Readonly<{ uri: string; sha256: string; bytes: number }>;
  }>;
  sourceScopes: Readonly<{ observatory: BaselineSourceClaim; harvest: BaselineSourceClaim }>;
  target: Readonly<{ sha256: string; bytes: number }>;
  import: BaselineImportMetadata;
  methodology: BaselineMethodologyInspection;
  observationSemantics: Readonly<{
    status: "validated-not-authenticated";
    rows: number;
    ontologyVersions: readonly string[];
    ontologyArtifactValidated: boolean;
  }>;
  runProvenance: Readonly<{
    status: "joined-not-authenticated";
    codebookIdProjection: "retained-column-absent-target-null-compared";
  }>;
  retainedOnlyDomains: readonly Readonly<{
    snapshotUri: string;
    table: string;
    rows: number;
  }>[];
  comparisons: Readonly<{
    identities: BaselineDomainComparison;
    pipelineRuns: BaselineDomainComparison;
    observations: BaselineDomainComparison;
    assetStates: BaselineDomainComparison;
    mappings: BaselineDomainComparison;
    cohorts: BaselineDomainComparison;
    strata: BaselineDomainComparison;
    evidenceReferences: BaselineDomainComparison;
  }>;
}>;

const COHORT_FIELDS = [
  "description",
  "owner_app",
  "codebook_version",
  "random_seed",
  "created_at",
] as const;
const STRATA_FIELDS = [
  "cohort_id",
  "site_id",
  "strata_system",
  "strata_code",
  "bundesland",
  "settlement_type",
  "gemeinde",
] as const;

async function* retainedCohortRecords(prepared: PreparedBaselineSource, snapshotUri: string) {
  let index = 0;
  for await (const row of streamPreparedCohorts(prepared, snapshotUri))
    yield {
      key: String(++index).padStart(20, "0"),
      values: COHORT_FIELDS.map((field) => row.columns[field]),
    };
}

async function* retainedStrataRecords(prepared: PreparedBaselineSource, snapshotUri: string) {
  let index = 0;
  for await (const row of streamPreparedStrata(prepared, snapshotUri))
    yield {
      key: String(++index).padStart(20, "0"),
      values: STRATA_FIELDS.map((field) => row.columns[field]),
    };
}

async function* retainedEvidenceReferenceRecords(
  prepared: PreparedBaselineSource,
  snapshotUri: string,
) {
  for await (const row of streamPreparedObservations(prepared, snapshotUri)) {
    const evidenceRef = row.columns.evidence_ref;
    if (evidenceRef !== null) yield { key: row.columns.id as string, values: [evidenceRef] };
  }
}

// Every declared retained-only table is counted inside the verified snapshot
// boundary so unmaterialized domains cannot hide rows behind a caller reason.
// Counts are accounting evidence, not a judgment that the rows may be skipped.
async function retainedOnlyDomainCounts(
  prepared: PreparedBaselineSource,
  scopeInventory: BaselineScopeInventory,
): Promise<BaselineClosureMaterializationReport["retainedOnlyDomains"]> {
  const result: BaselineClosureMaterializationReport["retainedOnlyDomains"][number][] = [];
  for (const source of scopeInventory.sources) {
    const retainedOnly = source.declaration.tables.filter(
      (table) => table.disposition === "retained-only",
    );
    if (!retainedOnly.length) continue;
    const snapshotUri = source.declaration.snapshot.uri;
    for await (const entry of streamPreparedSnapshot(
      prepared,
      snapshotUri,
      "BASELINE",
      function* (db) {
        for (const table of retainedOnly) {
          const escaped = `"${table.name.replaceAll('"', '""')}"`;
          const rows = db
            .prepare(`SELECT count(*) FROM ${escaped}`)
            .safeIntegers()
            .pluck()
            .get() as bigint;
          if (rows > BigInt(Number.MAX_SAFE_INTEGER))
            throw new Error("RETAINED_ONLY_DOMAIN_COUNT_LIMIT");
          yield Object.freeze({ table: table.name, rows: Number(rows) });
        }
      },
    ))
      result.push(Object.freeze({ snapshotUri, table: entry.table, rows: entry.rows }));
  }
  return Object.freeze(
    result.sort((left, right) =>
      Buffer.compare(
        Buffer.from(`${left.snapshotUri}\0${left.table}`),
        Buffer.from(`${right.snapshotUri}\0${right.table}`),
      ),
    ),
  );
}

function harvestSource(
  options: Readonly<{
    prepared: PreparedBaselineSource;
    scopeInventory: BaselineScopeInventory;
    harvestSnapshotUri: string;
  }>,
) {
  const scoped = options.scopeInventory.sources.find(
    (source) => source.declaration.snapshot.uri === options.harvestSnapshotUri,
  );
  if (!scoped || scoped.declaration.profile !== "harvest")
    throw new Error("HARVEST_BASELINE_SCOPE_REQUIRED");
  const snapshot = options.prepared.manifest.artifacts.find(
    (artifact) =>
      artifact.uri === options.harvestSnapshotUri && artifact.representation === "sqlite-snapshot",
  );
  if (!snapshot) throw new Error("HARVEST_BASELINE_SNAPSHOT_REQUIRED");
  return { snapshot, scope: scoped.declaration.scope };
}

async function canonicalDomains(
  prepared: PreparedBaselineSource,
  observatorySnapshotUri: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for await (const row of streamPreparedObservationIdentityMap(prepared, observatorySnapshotUri)) {
    if (result.has(row.identity.domain))
      throw new Error(`DUPLICATE_BASELINE_IDENTITY_DOMAIN: ${row.identity.domain}`);
    result.set(row.identity.domain, row.identity.canonical_id);
  }
  if (!result.size) throw new Error("NONEMPTY_IDENTITY_DOMAIN_REQUIRED");
  return result;
}

async function appendAssetStates(
  options: Readonly<{
    prepared: PreparedBaselineSource;
    scopeInventory: BaselineScopeInventory;
    harvestSnapshotUri: string;
    targetPath: string;
    canonicalByDomain: ReadonlyMap<string, string>;
    period: string;
    import: BaselineImportMetadata;
  }>,
): Promise<void> {
  const target = new Database(options.targetPath, { fileMustExist: true });
  try {
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
      for await (const row of streamPreparedAssetStates({
        prepared: options.prepared,
        scopeInventory: options.scopeInventory,
        snapshotUri: options.harvestSnapshotUri,
        canonicalByDomain: options.canonicalByDomain,
      })) {
        insertState.run(
          row.record.asset_id,
          row.record.domain,
          row.record.gewerk_group,
          row.record.hwo_uid,
          row.record.hwo_provenance,
          row.record.bundesland,
          row.record.gemeinde,
          options.import.importedAt,
          options.import.runId,
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
            options.import.runId,
            options.import.importedAt,
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
}

export async function materializeBaselineClosure(
  options: Readonly<{
    prepared: PreparedBaselineSource;
    scopeInventory: BaselineScopeInventory;
    observatorySnapshotUri: string;
    harvestSnapshotUri: string;
    ontologyArtifactUri: string;
    codebookArtifactUri: string;
    targetPath: string;
    period: string;
    import: BaselineImportMetadata;
  }>,
): Promise<BaselineClosureMaterializationReport> {
  if (options.period !== options.prepared.manifest.period)
    throw new Error("BASELINE_CLOSURE_PERIOD_MISMATCH");
  const importMetadata = validateBaselineImportMetadata(options.import);
  const harvested = harvestSource(options);
  const methodology = await inspectBaselineMethodology({
    prepared: options.prepared,
    ontologyArtifactUri: options.ontologyArtifactUri,
    codebookArtifactUri: options.codebookArtifactUri,
    ontologyVersion: importMetadata.ontologyVersion,
    codebookVersion: importMetadata.codebookVersion,
  });
  const observation = await materializeObservationBaseline({
    prepared: options.prepared,
    scopeInventory: options.scopeInventory,
    snapshotUri: options.observatorySnapshotUri,
    targetPath: options.targetPath,
    assetIdNamespace: options.scopeInventory.observationAssetIdNamespace,
    methodology,
  });
  const canonicalByDomain = await canonicalDomains(
    options.prepared,
    options.observatorySnapshotUri,
  );
  if (
    observation.semantics.ontologyVersions.length !== 1 ||
    observation.semantics.ontologyVersions[0] !== importMetadata.ontologyVersion
  )
    throw new Error("BASELINE_IMPORT_ONTOLOGY_VERSION_MISMATCH");
  await appendAssetStates({
    prepared: options.prepared,
    scopeInventory: options.scopeInventory,
    harvestSnapshotUri: options.harvestSnapshotUri,
    targetPath: options.targetPath,
    canonicalByDomain,
    period: options.period,
    import: importMetadata,
  });

  const sourceOptions = {
    prepared: options.prepared,
    scopeInventory: options.scopeInventory,
    snapshotUri: options.harvestSnapshotUri,
    canonicalByDomain,
    meta: importMetadata,
    period: options.period,
  };
  const target = new Database(options.targetPath, { readonly: true, fileMustExist: true });
  let identities: BaselineDomainComparison;
  let pipelineRuns: BaselineDomainComparison;
  let observations: BaselineDomainComparison;
  let assetStates: BaselineDomainComparison;
  let mappings: BaselineDomainComparison;
  let cohorts: BaselineDomainComparison;
  let strata: BaselineDomainComparison;
  let evidenceReferences: BaselineDomainComparison;
  try {
    identities = await compareBaselineRecords({
      domain: "asset_id_map",
      fields: BASELINE_IDENTITY_FIELDS,
      source: sourceIdentityRecords(options.prepared, options.observatorySnapshotUri),
      target: targetIdentityRecords(target),
    });
    pipelineRuns = await compareBaselineRecords({
      domain: "pipeline_runs",
      fields: BASELINE_RUN_FIELDS,
      source: sourceRunRecords(options.prepared, options.observatorySnapshotUri),
      target: targetRunRecords(target),
    });
    observations = await compareBaselineRecords({
      domain: "observations",
      fields: BASELINE_OBSERVATION_FIELDS,
      source: sourceObservationRecords(options.prepared, options.observatorySnapshotUri),
      target: targetObservationRecords(target),
    });
    assetStates = await compareBaselineRecords({
      domain: "asset_states",
      fields: BASELINE_ASSET_STATE_FIELDS,
      source: sourceAssetStateRecords(sourceOptions),
      target: targetAssetStateRecords(target),
    });
    mappings = await compareBaselineRecords({
      domain: "asset_hwo_mappings",
      fields: BASELINE_ASSET_MAPPING_FIELDS,
      source: sourceAssetMappingRecords(sourceOptions),
      target: targetAssetMappingRecords(target),
    });
    cohorts = await compareBaselineRecords({
      domain: "site_cohorts_retained_empty",
      fields: COHORT_FIELDS,
      source: retainedCohortRecords(options.prepared, options.harvestSnapshotUri),
      target: [],
    });
    strata = await compareBaselineRecords({
      domain: "site_strata_retained_empty",
      fields: STRATA_FIELDS,
      source: retainedStrataRecords(options.prepared, options.harvestSnapshotUri),
      target: [],
    });
    evidenceReferences = await compareBaselineRecords({
      domain: "observation_evidence_refs_retained_empty",
      fields: ["evidence_ref"],
      source: retainedEvidenceReferenceRecords(options.prepared, options.observatorySnapshotUri),
      target: [],
    });
  } finally {
    target.close();
  }
  if (
    identities.status !== "equal" ||
    pipelineRuns.status !== "equal" ||
    observations.status !== "equal" ||
    assetStates.status !== "equal" ||
    mappings.status === "different"
  )
    throw new Error("BASELINE_CLOSURE_COMPARISON_FAILED");
  if (cohorts.status !== "empty" || strata.status !== "empty")
    throw new Error("UNMATERIALIZED_BASELINE_SELECTION_DOMAIN");
  if (evidenceReferences.status !== "empty")
    throw new Error("UNRESOLVED_BASELINE_EVIDENCE_REFERENCE");
  if (assetStates.sourceRows !== canonicalByDomain.size)
    throw new Error("BASELINE_IDENTITY_ASSET_DOMAIN_MISMATCH");
  const retainedOnlyDomains = await retainedOnlyDomainCounts(
    options.prepared,
    options.scopeInventory,
  );
  const targetEvidence = await inspectRetainedFile(options.targetPath);
  return Object.freeze({
    schema: "hdri-baseline-closure-materialization@1",
    status: "compared-not-admitted",
    manifestSha256: options.prepared.manifestSha256,
    sourceSnapshots: Object.freeze({
      observatory: observation.sourceSnapshot,
      harvest: Object.freeze({
        uri: harvested.snapshot.uri,
        sha256: harvested.snapshot.sha256,
        bytes: harvested.snapshot.bytes,
      }),
    }),
    sourceScopes: Object.freeze({
      observatory: observation.sourceScope,
      harvest: harvested.scope,
    }),
    target: Object.freeze(targetEvidence),
    import: importMetadata,
    methodology,
    observationSemantics: observation.semantics,
    runProvenance: observation.runProvenance,
    retainedOnlyDomains,
    comparisons: Object.freeze({
      identities: Object.freeze(identities),
      pipelineRuns: Object.freeze(pipelineRuns),
      observations: Object.freeze(observations),
      assetStates: Object.freeze(assetStates),
      mappings: Object.freeze(mappings),
      cohorts: Object.freeze(cohorts),
      strata: Object.freeze(strata),
      evidenceReferences: Object.freeze(evidenceReferences),
    }),
  });
}

/*
<MODULE_CONTRACT>
<purpose>Translates every ext_* row from upstream pages_*.db into typed Observations.</purpose>
<non-goals>
  <item>Do not resolve conflicts or deduplicate — that is done by ResolveConflictsGogol.</item>
  <item>Do not sign observations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from monolithic main.ts as part of pipeline conversion.</item>
  <item>Fixed join to use local site_pages table in pages DB instead of empty registry.site_pages, restoring content→domain mapping.</item>
  <item>Add AXE audit translation from axe_YYYY.db into ontology-backed observations.</item>
  <item>RFC-0106: add coverage reconciliation and TranslationClosure computation.</item>
  <item>RFC-0106: reconcile ontology-admitted emitter paths, share liveness declarations, and reject coverage gaps before signing.</item>
  <item>RFC-0115 B5: preserve extraction context, consume retained snapshot bytes, scope rows to authenticated selected targets, and isolate derivations.</item>
</CHANGE_SUMMARY>
*/

import fsp from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  assertVerifiedQuarterExecution,
  capsuleConfigSha256,
  sha256File,
} from "@syrokomskyi/factory-core";
import {
  AXE_SIGNAL_MAP,
  classifyLivenessOutcome,
  EXT_SIGNAL_MAP,
  observationKey,
  sha256Json,
  type AxeSignalMapping,
  type ExtSignalMapping,
  type Observation,
  type SignalOntology,
} from "@syrokomskyi/observatory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext, IngestedObs, TranslationClosure } from "../pipeline/types.js";
import { outputRootDir } from "../config.js";
import { copyAdmittedSnapshot } from "../pipeline/admitted-snapshot.js";
import { readSelectedEvidence, selectedEvidenceRef } from "../pipeline/selected-evidence.js";
import {
  replayProfileSignals,
  type ProfileReplayValue,
} from "@syrokomskyi/business-crawler/extract";

const APP_VERSION = "0.1.0";
const APP_ID = "a-contract-ontology";
const COLLECTOR_VERSION = `${APP_ID}@${APP_VERSION}`;

const LIVENESS_SIGNAL_MAP = [
  { signalPath: "transport.http.status_code", column: "http_status", valueType: "num" },
  { signalPath: "transport.http.latency_ms", column: "latency_ms", valueType: "num" },
  { signalPath: "availability.website.outcome", column: "outcome", valueType: "str" },
  { signalPath: "availability.website.is_reachable", column: "is_reachable", valueType: "bool" },
  { signalPath: "availability.website.error_code", column: "error_code", valueType: "str" },
] as const;

type ContentRow = {
  content_sha256: string;
  extractor_ver: string;
  extracted_at: number | null;
  asset_id: string;
  page_observation_id: number;
  effective_url: string;
  policy_hash: string;
  [col: string]: unknown;
};

type AxeAuditRunRow = {
  site_id: number;
  provisional_asset_id: string;
  fetched_at: number | null;
  ok: number;
  error_class: string | null;
  error_message: string | null;
};

type AxeMetricRow = {
  site_id: number;
  provisional_asset_id: string;
  violations_total: number | null;
  critical_count: number | null;
  serious_count: number | null;
  moderate_count: number | null;
  minor_count: number | null;
  nodes_scanned: number | null;
  axe_version: string | null;
};

type LivenessRow = {
  provisional_asset_id: string;
  domain: string;
  checked_at: number;
  http_status: number | null;
  latency_ms: number | null;
  is_live: number;
  error_code: string | null;
};
type ReplayTuple = [boolean | null, string | null, number | null, string | null];

const profileReplayValue = (mapping: ExtSignalMapping, replay: ProfileReplayValue): unknown => {
  if (mapping.column === "present") return replay.present ? 1 : 0;
  if (mapping.column === "text") return replay.text ?? null;
  if (mapping.column === "year") return replay.year ?? null;
  if (mapping.column === "quality") return replay.quality ?? null;
  throw new Error(`Unsupported profile replay column: ${mapping.column}`);
};

const assertProfileProjection = (
  row: ContentRow & { url_norm: string },
  mapping: ExtSignalMapping,
  replay: ProfileReplayValue,
): void => {
  const expected = profileReplayValue(mapping, replay);
  const actual = row[mapping.column];
  if (mapping.valueType === "bool" && mapping.column === "text") {
    if (
      (actual != null && String(actual).trim().length > 0) !==
      Boolean(replay.text && replay.text.trim().length > 0)
    ) {
      throw new Error(
        `Profile projection differs from retained HTML: ${mapping.table}/${row.asset_id}`,
      );
    }
    return;
  }
  if (actual !== expected && !(actual == null && expected == null)) {
    throw new Error(
      `Profile projection differs from retained HTML: ${mapping.table}/${row.asset_id}`,
    );
  }
};

const localSiteIdKey = (value: unknown): string => {
  const numeric = typeof value === "number" ? value : Number(String(value));
  if (Number.isSafeInteger(numeric) && numeric > 0) return String(numeric);
  return String(value);
};

export class TranslateOntologyGogol extends Gogol {
  override readonly id = "translate-ontology";

  override async run(ctx: PipelineContext): Promise<void> {
    ctx.state.observationDbPath = null;
    ctx.state.translationClosure = null;
    const { brief, discoveredPages, livenessDbs, axeDbs, coreDbs, ontology } = ctx.state;
    if (!ontology) throw new Error("Ontology not loaded — run bootstrap first");
    if (discoveredPages.length === 0)
      throw new Error("No discovered sources — run discover-sources first");

    const sources = [...discoveredPages, ...livenessDbs, ...axeDbs];
    for (const source of sources) {
      assertVerifiedQuarterExecution(source.execution);
      if (
        source.execution.capsuleConfigSha256 !==
          capsuleConfigSha256(brief.period, brief.capsuleId, brief.instrumentPlan) ||
        source.execution.stages.some(
          (s) =>
            s.collectorId !== source.deviceId ||
            s.results.some(
              (r) => r.key.period !== brief.period || r.key.capsuleId !== brief.capsuleId,
            ),
        )
      ) {
        throw new Error(`Source execution scope differs from translation: ${source.deviceId}`);
      }
    }
    const translatorPath = fileURLToPath(import.meta.url);
    const helperHashes = await Promise.all(
      ["admitted-snapshot", "selected-evidence"].map(async (name) => ({
        module: name,
        sha256: await sha256File(
          path.resolve(
            path.dirname(translatorPath),
            "../pipeline",
            `${name}${path.extname(translatorPath)}`,
          ),
        ),
      })),
    );
    const profileReplayPath = path.resolve(
      path.dirname(translatorPath),
      "../../../../../../packages/business/business-crawler/src/extract/profile-replay.ts",
    );
    const profileReplaySha256 = await sha256File(profileReplayPath);
    // A corrected translation never mutates an earlier signed derivation. The
    // collection capsule and original measurement timestamps remain unchanged.
    const derivation = {
      schema: "hdri-translation-derivation@1",
      period: brief.period,
      capsuleId: brief.capsuleId,
      translatorSha256: await sha256File(translatorPath),
      helperHashes,
      profileReplaySha256,
      ontologySha256: sha256Json(ontology),
      signalMappingsSha256: sha256Json([EXT_SIGNAL_MAP, AXE_SIGNAL_MAP, LIVENESS_SIGNAL_MAP]),
      harvestSnapshots: coreDbs
        .map((s) => ({
          deviceId: s.deviceId,
          snapshotSha256: s.snapshotSha256,
          sourceManifestSha256: s.sourceManifestSha256,
        }))
        .sort((a, b) => a.deviceId.localeCompare(b.deviceId)),
      sources: sources
        .map((s) => ({
          deviceId: s.deviceId,
          ...s.artifact,
          journalSha256: s.execution.journalSha256,
        }))
        .sort((a, b) => `${a.deviceId}/${a.uri}`.localeCompare(`${b.deviceId}/${b.uri}`)),
    };
    const derivationId = sha256Json(derivation);
    const observationDbPath = path.join(
      outputRootDir,
      "capsules",
      brief.period,
      brief.capsuleId,
      "staging",
      "translation",
      derivationId,
      "observations.sqlite",
    );
    await fsp.mkdir(path.dirname(observationDbPath), { recursive: true });
    const observationDb = new Database(observationDbPath);
    observationDb.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS translation_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        observation_id TEXT NOT NULL UNIQUE,
        conflict_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        device_id TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      DROP INDEX IF EXISTS observations_conflict_order;
      CREATE INDEX observations_conflict_order
        ON observations(conflict_key, recorded_at DESC, device_id DESC, observation_id DESC);
    `);
    assertTranslationIdentity(observationDb, {
      period: brief.period,
      capsule_id: brief.capsuleId,
      ontology_version: brief.ontologyVersion,
      derivation_id: derivationId,
    });
    await fsp
      .writeFile(
        path.join(path.dirname(observationDbPath), "derivation.json"),
        `${JSON.stringify(derivation, null, 2)}\n`,
        { flag: "wx" },
      )
      .catch(async (error: NodeJS.ErrnoException) => {
        if (
          error.code !== "EEXIST" ||
          (await fsp.readFile(
            path.join(path.dirname(observationDbPath), "derivation.json"),
            "utf8",
          )) !== `${JSON.stringify(derivation, null, 2)}\n`
        )
          throw error;
      });
    const insertObservation = observationDb.prepare(
      `INSERT INTO observations(
         observation_id, conflict_key, recorded_at, device_id, payload_sha256, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(observation_id) DO UPDATE SET
         observation_id = observations.observation_id
       WHERE observations.payload_sha256 = excluded.payload_sha256`,
    );
    let observationCount = 0;
    let transactionRows = 0;
    observationDb.exec("BEGIN IMMEDIATE");
    const appendObservation = (obs: IngestedObs): void => {
      const payloadJson = JSON.stringify(obs);
      // payload_sha256 is a dedup key over the observation's identity + signal
      // payload, excluding the capture timestamps observed_at/recorded_at. Two
      // captures of identical content reached through different detected pages
      // share observation_id and identical signal/value/source but differ in
      // extracted_at — they are the same logical observation and must dedupe;
      // hashing the raw payload would false-positive as identity drift. A
      // genuinely divergent signal value still hashes differently → real drift.
      const { observed_at: _o, recorded_at: _r, ...identityPayload } = obs;
      const result = insertObservation.run(
        obs.observation_id,
        `${obs.asset_id}\u0000${obs.signal_path}`,
        obs.recorded_at,
        obs._device_id,
        sha256Json(identityPayload),
        payloadJson,
      );
      if (result.changes !== 1) {
        throw new Error(`Observation identity drift inside capsule: ${obs.observation_id}`);
      }
      observationCount++;
      transactionRows++;
      if (transactionRows >= 10_000) {
        observationDb.exec("COMMIT; BEGIN IMMEDIATE");
        transactionRows = 0;
      }
    };
    let untranslated = 0;
    const unknownSignals = new Set<string>();
    const deprecatedSignals = new Set<string>();

    const ontologySignals = ontology.signals;

    const snapshotDir = await fsp.mkdtemp(path.join(path.dirname(observationDbPath), "inputs-"));
    try {
      for (const src of discoveredPages) {
        const snapshotPath = await copyAdmittedSnapshot(src, snapshotDir);
        const selected = await readSelectedEvidence<{
          siteId: number;
          result: { ok: boolean; contentHash: string };
        }>(src, "homepage-capture", true);
        const owners = new Map<string, { assetId: string; sha256: string; contentHash: string }>();
        for (const [assetId, evidence] of selected) {
          const { siteId, result } = evidence.payload;
          if (
            !Number.isSafeInteger(siteId) ||
            siteId <= 0 ||
            !result?.ok ||
            typeof result.contentHash !== "string" ||
            owners.has(localSiteIdKey(siteId))
          ) {
            throw new Error(
              `Invalid or ambiguous profile capture owner: ${src.deviceId}/${assetId}`,
            );
          }
          owners.set(localSiteIdKey(siteId), {
            assetId,
            sha256: evidence.sha256,
            contentHash: result.contentHash,
          });
        }
        const replayTables = [
          ...new Set(
            EXT_SIGNAL_MAP.filter((m) => ontologySignals[m.signalPath]).map((m) => m.table),
          ),
        ];
        const replayTableIndexes = new Map(replayTables.map((table, index) => [table, index]));
        // Keep one compact primitive tuple per HTML instead of retaining one
        // object graph for every extractor result. This bounds RSS during the
        // 100k-site replay while preserving cross-table reuse.
        const replayCache = new Map<string, ReplayTuple[]>();
        const replayFor = async (
          row: ContentRow & { url_norm: string },
          table: string,
        ): Promise<ProfileReplayValue> => {
          const cacheKey = `${row.content_sha256}\0${row.url_norm}`;
          let tuples = replayCache.get(cacheKey);
          if (!tuples) {
            const relative = `data/content/${row.content_sha256.slice(0, 2)}/${row.content_sha256}.html`;
            const casPath = path.resolve(src.sourceOutputRoot, relative);
            const root = path.resolve(src.sourceOutputRoot);
            const rel = path.relative(root, casPath);
            if (rel.startsWith("..") || path.isAbsolute(rel) || rel !== relative)
              throw new Error(`Profile CAS path escapes admitted root: ${relative}`);
            const bytes = await fsp.readFile(casPath);
            const digest = crypto.createHash("sha256").update(bytes).digest("hex");
            if (digest !== row.content_sha256)
              throw new Error(`Profile CAS content hash mismatch: ${row.content_sha256}`);
            const referenceYear = Number.parseInt(brief.period.slice(0, 4), 10);
            const values = replayProfileSignals(
              bytes.toString("utf8"),
              row.url_norm,
              referenceYear,
              replayTables,
            );
            tuples = replayTables.map((name) => {
              const value = values[name];
              return [
                value?.present ?? null,
                value?.text ?? null,
                value?.year ?? null,
                value?.quality ?? null,
              ];
            });
            replayCache.set(cacheKey, tuples);
          }
          const index = replayTableIndexes.get(table);
          if (index == null || !tuples[index])
            throw new Error(`Profile replay lacks admitted table: ${table}`);
          const [present, text, year, quality] = tuples[index]!;
          return {
            present: present ?? undefined,
            text,
            year,
            quality,
          };
        };
        const runId = sha256Json(["hdri:crawl:v1", brief.period, src.deviceId, "profile"]);
        const recordedAt = periodStart(brief.period);
        const pagesDb = new Database(snapshotPath, { readonly: true });
        try {
          for (const mapping of EXT_SIGNAL_MAP) {
            const ontDef = ontologySignals[mapping.signalPath];
            if (!ontDef) {
              unknownSignals.add(mapping.signalPath);
              continue;
            }
            if (ontDef.deprecated_in != null) {
              deprecatedSignals.add(mapping.signalPath);
            }

            const tableExists = pagesDb
              .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
              .get(mapping.table) as { name: string } | undefined;
            if (!tableExists)
              throw new Error(
                `Profile snapshot lacks admitted table: ${src.deviceId}/${mapping.table}`,
              );

            const rows = pagesDb
              .prepare(
                `
              SELECT ext.*, sp.url_norm
              FROM "${mapping.table}" ext
              JOIN site_pages sp ON sp.id = ext.page_observation_id
                AND CAST(sp.site_id AS INTEGER) = CAST(ext.asset_id AS INTEGER)
              ORDER BY ext.asset_id, ext.page_observation_id, ext.effective_url,
                ext.content_sha256, ext.extractor_ver, ext.policy_hash
            `,
              )
              .iterate() as IterableIterator<ContentRow & { url_norm: string }>;
            const covered = new Set<string>();
            for (const row of rows) {
              const owner = owners.get(localSiteIdKey(row.asset_id));
              if (!owner || row.content_sha256 !== owner.contentHash) {
                untranslated++;
                continue;
              }
              assertProfileProjection(row, mapping, await replayFor(row, mapping.table));
              covered.add(owner.assetId);
              const obs = buildObservation(
                row,
                mapping,
                owner.assetId,
                runId,
                brief.ontologyVersion,
                recordedAt,
                brief.capsuleId,
                brief.period,
              );
              if (obs)
                appendObservation({
                  ...obs,
                  evidence_ref: selectedEvidenceRef(owner.sha256),
                  _device_id: src.deviceId,
                });
            }
            if (covered.size !== selected.size)
              throw new Error(
                `Profile ${mapping.signalPath} lacks ${selected.size - covered.size} selected successful owner(s)`,
              );
          }
        } finally {
          pagesDb.close();
        }
      }

      for (const src of livenessDbs) {
        const livenessSnapshot = await copyAdmittedSnapshot(src, snapshotDir);
        const selected = await readSelectedEvidence<{
          result: {
            domain: string;
            httpStatus: number | null;
            latencyMs: number | null;
            isLive: boolean;
            errorCode: string | null;
          };
        }>(src, "liveness", false);
        const covered = new Set<string>();
        const runId = sha256Json(["hdri:crawl:v1", brief.period, src.deviceId, "liveness"]);
        const recordedAt = periodStart(brief.period);
        const livenessDb = new Database(livenessSnapshot, { readonly: true });
        try {
          const rows = livenessDb
            .prepare(
              `
          SELECT provisional_asset_id, domain, checked_at, http_status, latency_ms, is_live, error_code
          FROM liveness_checks
          ORDER BY provisional_asset_id
        `,
            )
            .iterate() as IterableIterator<LivenessRow>;
          for (const row of rows) {
            const evidence = selected.get(row.provisional_asset_id);
            if (!evidence) {
              untranslated++;
              continue;
            }
            const retained = evidence.payload.result;
            if (
              !retained ||
              retained.domain !== row.domain ||
              retained.httpStatus !== row.http_status ||
              retained.latencyMs !== row.latency_ms ||
              retained.isLive !== (row.is_live === 1) ||
              retained.errorCode !== row.error_code
            ) {
              throw new Error(
                `Liveness projection differs from selected evidence: ${row.provisional_asset_id}`,
              );
            }
            if (covered.has(row.provisional_asset_id))
              throw new Error(`Duplicate liveness target: ${row.provisional_asset_id}`);
            covered.add(row.provisional_asset_id);
            const observedAt = new Date(row.checked_at * 1000).toISOString();
            const outcome = classifyLivenessOutcome({
              isLive: row.is_live === 1,
              httpStatus: row.http_status,
              errorCode: row.error_code,
            });
            const values = { ...row, outcome, is_reachable: row.is_live === 1 };
            for (const { signalPath, column, valueType } of LIVENESS_SIGNAL_MAP) {
              const value = values[column];
              if (value == null) continue;
              if (!ontologySignals[signalPath]) {
                unknownSignals.add(signalPath);
                continue;
              }
              appendObservation({
                observation_id: observationKey({
                  period: brief.period,
                  capsuleId: brief.capsuleId,
                  provisionalAssetId: row.provisional_asset_id,
                  signalPath,
                  sourceResultSha256: sha256Json(row),
                  extractorVersion: "liveness-v1",
                }),
                asset_id: row.provisional_asset_id,
                crawl_id: runId,
                signal_path: signalPath,
                value_bool: valueType === "bool" ? Boolean(value) : null,
                value_num: valueType === "num" ? Number(value) : null,
                value_str: valueType === "str" ? String(value) : null,
                value_json: null,
                value_type: valueType,
                observed_at: observedAt,
                recorded_at: observedAt || recordedAt,
                collector_version: COLLECTOR_VERSION,
                probe_version: "liveness-v1",
                ruleset_version: brief.ontologyVersion,
                source_hash: evidence.sha256,
                crawl_hash: brief.capsuleId,
                evidence_ref: selectedEvidenceRef(evidence.sha256),
                confidence: 1,
                status: "active",
                superseded_by: null,
                deprecated_reason: null,
                _device_id: src.deviceId,
              });
            }
          }
          if (covered.size !== selected.size)
            throw new Error(
              `Liveness projection lacks ${selected.size - covered.size} selected target(s)`,
            );
        } finally {
          livenessDb.close();
        }
      }

      for (const src of axeDbs) {
        const axeSnapshot = await copyAdmittedSnapshot(src, snapshotDir);
        const selected = await readSelectedEvidence<{
          result: {
            ok: boolean;
            extracted: {
              violationsTotal: number;
              criticalCount: number;
              seriousCount: number;
              moderateCount: number;
              minorCount: number;
              nodesScanned: number | null;
              axeVersion: string | null;
            };
          };
        }>(src, "axe", true);
        const covered = new Set<string>();
        const runId = sha256Json(["hdri:crawl:v1", brief.period, src.deviceId, "axe"]);
        const recordedAt = periodStart(brief.period);
        const axeDb = new Database(axeSnapshot, { readonly: true });
        try {
          const metricRows = axeDb
            .prepare(
              `
          SELECT ax.site_id, ax.provisional_asset_id, ax.violations_total, ax.critical_count,
                 ax.serious_count, ax.moderate_count, ax.minor_count, ax.nodes_scanned,
                 ax.axe_version, ar.fetched_at, ar.ok, ar.error_class, ar.error_message
          FROM axe_runs ax
          LEFT JOIN audit_runs ar
            ON ar.tool = 'axe' AND ar.provisional_asset_id = ax.provisional_asset_id
          ORDER BY ax.provisional_asset_id
        `,
            )
            .iterate() as IterableIterator<AxeMetricRow & AxeAuditRunRow>;

          for (const mapping of AXE_SIGNAL_MAP) {
            const ontDef = ontologySignals[mapping.signalPath];
            if (!ontDef) {
              unknownSignals.add(mapping.signalPath);
              continue;
            }
            if (ontDef.deprecated_in != null) {
              deprecatedSignals.add(mapping.signalPath);
            }
          }

          for (const row of metricRows) {
            const evidence = selected.get(row.provisional_asset_id);
            if (!evidence) {
              untranslated++;
              continue;
            }
            const retained = evidence.payload.result;
            const metrics = retained?.extracted;
            if (
              !retained?.ok ||
              !metrics ||
              metrics.violationsTotal !== row.violations_total ||
              metrics.criticalCount !== row.critical_count ||
              metrics.seriousCount !== row.serious_count ||
              metrics.moderateCount !== row.moderate_count ||
              metrics.minorCount !== row.minor_count ||
              metrics.nodesScanned !== row.nodes_scanned ||
              metrics.axeVersion !== row.axe_version
            ) {
              throw new Error(
                `Axe projection differs from selected evidence: ${row.provisional_asset_id}`,
              );
            }
            if (covered.has(row.provisional_asset_id))
              throw new Error(`Duplicate Axe target: ${row.provisional_asset_id}`);
            covered.add(row.provisional_asset_id);
            const auditRun: AxeAuditRunRow | undefined = row.ok == null ? undefined : row;
            if (!auditRun || auditRun.ok !== 1) {
              throw new Error(
                `Selected successful Axe target lacks successful audit: ${row.provisional_asset_id}`,
              );
            }
            for (const mapping of AXE_SIGNAL_MAP) {
              if (!ontologySignals[mapping.signalPath]) continue;
              const obs = buildAxeObservation(
                row,
                mapping,
                row.provisional_asset_id,
                runId,
                brief.ontologyVersion,
                recordedAt,
                brief.capsuleId,
                auditRun,
                brief.period,
              );
              if (obs)
                appendObservation({
                  ...obs,
                  source_hash: evidence.sha256,
                  evidence_ref: selectedEvidenceRef(evidence.sha256),
                  _device_id: src.deviceId,
                });
            }
          }
          if (covered.size !== selected.size)
            throw new Error(
              `Axe projection lacks ${selected.size - covered.size} selected successful target(s)`,
            );
        } finally {
          axeDb.close();
        }
      }

      observationDb.exec("COMMIT");
      const persistedCount = (
        observationDb.prepare("SELECT COUNT(*) AS n FROM observations").get() as { n: number }
      ).n;
      console.log(
        `[translate-ontology] Reconciled ${observationCount} obs; ${persistedCount} persisted. ` +
          `${unknownSignals.size} unknown signal(s) skipped, ${deprecatedSignals.size} deprecated kept, ` +
          `${untranslated} stale rows outside selected targets retained only in source evidence.`,
      );

      if (unknownSignals.size > 0) {
        await fsp.writeFile(
          path.join(ctx.outputDir, "unknown-signals.json"),
          JSON.stringify(
            {
              period: brief.period,
              unknown: [...unknownSignals],
              deprecated: [...deprecatedSignals],
            },
            null,
            2,
          ),
          "utf-8",
        );
      }

      observationDb.close();
      ctx.state.observationDbPath = observationDbPath;
    } finally {
      if (observationDb.open) observationDb.close();
      await fsp.rm(snapshotDir, { recursive: true, force: true });
    }

    // ── RFC-0106: Coverage reconciliation ────────────────────────────────────
    const { missing, extra, ...coverage } = reconcileTranslationCoverage(
      observationDbPath,
      ontology,
    );
    const closure: TranslationClosure = {
      ...coverage,
      sourceSnapshots: (ctx.state.verifiedSnapshots ?? []).map((s) => s.stageSealSha256),
    };
    ctx.state.translationClosure = closure;
    if (closure.unresolvedReferences > 0) {
      throw new Error(
        `Translation coverage mismatch: missing [${missing.join(", ")}]; extra [${extra.join(", ")}]`,
      );
    }
    console.log("[translate-ontology] Coverage complete: ontology-admitted emitter paths matched.");
  }
}

// @ai-invariant: Ontology omissions are not measurement absence; unexpected persisted signals and missing admitted paths still block emission.
export function reconcileTranslationCoverage(
  observationDbPath: string,
  ontology: SignalOntology,
): Omit<TranslationClosure, "sourceSnapshots"> & { missing: string[]; extra: string[] } {
  const expectedKeys = new Set(
    [...EXT_SIGNAL_MAP, ...AXE_SIGNAL_MAP, ...LIVENESS_SIGNAL_MAP]
      .map((mapping) => mapping.signalPath)
      .filter((signalPath) => Object.hasOwn(ontology.signals, signalPath)),
  );

  const emittedKeys = new Set<string>();
  const reconDb = new Database(observationDbPath, { readonly: true, fileMustExist: true });
  try {
    const signalPaths = reconDb
      .prepare(
        // signal_path lives inside payload_json (no dedicated column); the
        // NUL-separated conflict_key can't be split via instr/substr because
        // SQLite string functions truncate at the embedded NUL byte.
        "SELECT DISTINCT json_extract(payload_json, '$.signal_path') AS signal_path FROM observations",
      )
      .all() as Array<{ signal_path: string }>;
    for (const row of signalPaths) {
      emittedKeys.add(row.signal_path);
    }
  } finally {
    reconDb.close();
  }

  const expectedSorted = [...expectedKeys].sort();
  const emittedSorted = [...emittedKeys].sort();
  const expectedKeysSha256 = crypto
    .createHash("sha256")
    .update(expectedSorted.join("\n"))
    .digest("hex");
  const emittedKeysSha256 = crypto
    .createHash("sha256")
    .update(emittedSorted.join("\n"))
    .digest("hex");

  const missing = expectedSorted.filter((k) => !emittedKeys.has(k));
  const extra = emittedSorted.filter((k) => !expectedKeys.has(k));
  const unresolvedReferences = missing.length + extra.length;

  return {
    expectedKeysSha256,
    emittedKeysSha256,
    unresolvedReferences,
    missing,
    extra,
  };
}

const assertTranslationIdentity = (
  db: Database.Database,
  expected: Readonly<Record<string, string>>,
): void => {
  const select = db.prepare("SELECT value FROM translation_meta WHERE key = ?");
  const insert = db.prepare("INSERT INTO translation_meta(key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(expected)) {
    const existing = select.get(key) as { value: string } | undefined;
    if (existing && existing.value !== value) {
      throw new Error(
        `Translation store ${key} mismatch: expected ${value}, found ${existing.value}`,
      );
    }
    if (!existing) insert.run(key, value);
  }
};

const periodStart = (period: string): string => {
  const match = /^(\d{4})-q([1-4])$/.exec(period);
  if (!match) throw new Error(`Invalid period: ${period}`);
  const month = (Number(match[2]) - 1) * 3 + 1;
  return `${match[1]}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`;
};

function buildObservation(
  row: ContentRow,
  mapping: ExtSignalMapping,
  assetId: string,
  runId: string,
  ontologyVersion: string,
  now: string,
  capsuleId: string,
  period: string,
): Observation | null {
  const observedAt = row.extracted_at ? new Date(row.extracted_at * 1000).toISOString() : now;

  const rawValue = row[mapping.column];

  let valueBool: boolean | null = null;
  let valueNum: number | null = null;
  let valueStr: string | null = null;
  let valueJson: string | null = null;

  if (mapping.valueType === "bool") {
    if (mapping.column === "text") {
      valueBool = rawValue != null && (rawValue as string).trim().length > 0;
    } else {
      valueBool = rawValue != null ? Boolean(rawValue) : false;
    }
  } else if (mapping.valueType === "num") {
    valueNum = rawValue != null ? Number(rawValue) : null;
  } else if (mapping.valueType === "str") {
    valueStr = rawValue != null ? String(rawValue) : null;
  } else {
    valueJson = rawValue != null ? JSON.stringify(rawValue) : null;
  }

  return {
    observation_id: observationKey({
      period,
      capsuleId,
      provisionalAssetId: assetId,
      signalPath: mapping.signalPath,
      sourceResultSha256: sha256Json({
        contentSha256: row.content_sha256,
        assetId: row.asset_id,
        pageObservationId: row.page_observation_id,
        effectiveUrl: row.effective_url,
        policyHash: row.policy_hash,
      }),
      extractorVersion: row.extractor_ver ?? "rule_v3",
    }),
    asset_id: assetId,
    crawl_id: runId,
    signal_path: mapping.signalPath,
    value_bool: valueBool,
    value_num: valueNum,
    value_str: valueStr,
    value_json: valueJson,
    value_type: mapping.valueType,
    observed_at: observedAt,
    recorded_at: observedAt,
    collector_version: COLLECTOR_VERSION,
    probe_version: row.extractor_ver ?? "rule_v3",
    ruleset_version: ontologyVersion,
    source_hash: row.content_sha256,
    crawl_hash: capsuleId,
    evidence_ref: null,
    confidence: 1,
    status: "active",
    superseded_by: null,
    deprecated_reason: null,
  };
}

function buildAxeObservation(
  row: AxeMetricRow,
  mapping: AxeSignalMapping,
  provisionalAssetId: string,
  runId: string,
  ontologyVersion: string,
  now: string,
  capsuleId: string,
  auditRun: AxeAuditRunRow | undefined,
  period: string,
): Observation | null {
  const rawValue = row[mapping.column as keyof AxeMetricRow];
  if (rawValue == null) {
    return null;
  }

  const valueNum = Number(rawValue);
  if (Number.isNaN(valueNum)) {
    return null;
  }

  const observedAt = auditRun?.fetched_at
    ? new Date(auditRun.fetched_at * 1000).toISOString()
    : now;

  return {
    observation_id: observationKey({
      period,
      capsuleId,
      provisionalAssetId,
      signalPath: mapping.signalPath,
      sourceResultSha256: sha256Json(row),
      extractorVersion: row.axe_version ?? "axe-unknown",
    }),
    asset_id: provisionalAssetId,
    crawl_id: runId,
    signal_path: mapping.signalPath,
    value_bool: null,
    value_num: valueNum,
    value_str: null,
    value_json: null,
    value_type: mapping.valueType,
    observed_at: observedAt,
    recorded_at: observedAt,
    collector_version: COLLECTOR_VERSION,
    probe_version: row.axe_version,
    ruleset_version: ontologyVersion,
    source_hash: null,
    crawl_hash: capsuleId,
    evidence_ref: null,
    confidence: 1,
    status: "active",
    superseded_by: null,
    deprecated_reason: null,
  };
}

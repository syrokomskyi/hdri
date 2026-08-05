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
</CHANGE_SUMMARY>
*/

import fsp from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import {
  AXE_SIGNAL_MAP,
  classifyLivenessOutcome,
  EXT_SIGNAL_MAP,
  deriveAssetId,
  observationKey,
  sha256Json,
  type AxeSignalMapping,
  type ExtSignalMapping,
  type Observation,
} from "@syrokomskyi/observatory-core";
import { Gogol } from "../pipeline/Gogol.js";
import type { PipelineContext, IngestedObs } from "../pipeline/types.js";
import { outputRootDir } from "../config.js";

const APP_VERSION = "0.1.0";
const APP_ID = "a-contract-ontology";
const COLLECTOR_VERSION = `${APP_ID}@${APP_VERSION}`;

type ContentRow = {
  content_sha256: string;
  extractor_ver: string;
  extracted_at: number | null;
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

export class TranslateOntologyGogol extends Gogol {
  override readonly id = "translate-ontology";

  override async run(ctx: PipelineContext): Promise<void> {
    const { brief, discoveredPages, livenessDbs, axeDbs, ontology } = ctx.state;
    if (!ontology) throw new Error("Ontology not loaded — run bootstrap first");
    if (discoveredPages.length === 0)
      throw new Error("No discovered sources — run discover-sources first");

    const observationDbPath = path.join(
      outputRootDir,
      "capsules",
      brief.period,
      brief.capsuleId,
      "staging",
      "translation",
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
      const result = insertObservation.run(
        obs.observation_id,
        `${obs.asset_id}\u0000${obs.signal_path}`,
        obs.recorded_at,
        obs._device_id,
        crypto.createHash("sha256").update(payloadJson).digest("hex"),
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

    for (const src of discoveredPages) {
      const pagesDb = new Database(src.pagesDbPath, { readonly: true });
      const runId = sha256Json(["hdri:crawl:v1", brief.period, src.deviceId, "profile"]);
      const recordedAt = periodStart(brief.period);
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
          if (!tableExists) continue;

          const rows = pagesDb
            .prepare(`
              SELECT ext.*, sp.url_norm
              FROM "${mapping.table}" ext
              JOIN page_observations po ON po.content_sha256 = ext.content_sha256
              JOIN site_pages sp ON sp.id = po.site_page_id
              ORDER BY ext.content_sha256, sp.url_norm
            `)
            .iterate() as IterableIterator<ContentRow & { url_norm: string }>;
          for (const row of rows) {
            let domain: string;
            try {
              domain = new URL(row.url_norm).hostname.toLowerCase();
            } catch {
              untranslated++;
              continue;
            }
            const obs = buildObservation(
              row,
              mapping,
              domain,
              runId,
              brief.ontologyVersion,
              recordedAt,
              brief.capsuleId,
              brief.period,
            );
            if (obs) appendObservation({ ...obs, _device_id: src.deviceId });
          }
        }
      } finally {
        pagesDb.close();
      }
    }


    for (const src of livenessDbs) {
      const livenessDb = new Database(src.livenessDbPath, { readonly: true });
      const runId = sha256Json(["hdri:crawl:v1", brief.period, src.deviceId, "liveness"]);
      const recordedAt = periodStart(brief.period);
      try {
        const rows = livenessDb.prepare(`
          SELECT provisional_asset_id, domain, checked_at, http_status, latency_ms, is_live, error_code
          FROM liveness_checks
          ORDER BY provisional_asset_id
        `).iterate() as IterableIterator<LivenessRow>;
        for (const row of rows) {
          const observedAt = new Date(row.checked_at * 1000).toISOString();
          const outcome = classifyLivenessOutcome({
            isLive: row.is_live === 1,
            httpStatus: row.http_status,
            errorCode: row.error_code,
          });
          const signals: Array<{
            signalPath: string;
            value: boolean | number | string | null;
            valueType: "bool" | "num" | "str";
          }> = [
            { signalPath: "transport.http.status_code", value: row.http_status, valueType: "num" },
            { signalPath: "transport.http.latency_ms", value: row.latency_ms, valueType: "num" },
            { signalPath: "availability.website.outcome", value: outcome, valueType: "str" },
            { signalPath: "availability.website.is_reachable", value: row.is_live === 1, valueType: "bool" },
            { signalPath: "availability.website.error_code", value: row.error_code, valueType: "str" },
          ];
          for (const { signalPath, value, valueType } of signals) {
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
              source_hash: null,
              crawl_hash: brief.capsuleId,
              evidence_ref: null,
              confidence: 1,
              status: "active",
              superseded_by: null,
              deprecated_reason: null,
              _device_id: src.deviceId,
            });
          }
        }
      } finally {
        livenessDb.close();
      }
    }

    for (const src of axeDbs) {
      const axeDb = new Database(src.axeDbPath, { readonly: true });
      const runId = sha256Json(["hdri:crawl:v1", brief.period, src.deviceId, "axe"]);
      const recordedAt = periodStart(brief.period);
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
          const auditRun: AxeAuditRunRow | undefined = row.ok == null ? undefined : row;
          if (auditRun && auditRun.ok !== 1) {
            continue;
          }
          for (const mapping of AXE_SIGNAL_MAP) {
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
            if (obs) appendObservation({ ...obs, _device_id: src.deviceId });
          }
        }
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
        `${untranslated} rows lacked content→domain mapping.`,
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
  }
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
      throw new Error(`Translation store ${key} mismatch: expected ${value}, found ${existing.value}`);
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
  domain: string,
  runId: string,
  ontologyVersion: string,
  now: string,
  capsuleId: string,
  period: string,
): Observation | null {
  const assetId = deriveAssetId(domain);
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
      sourceResultSha256: row.content_sha256,
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

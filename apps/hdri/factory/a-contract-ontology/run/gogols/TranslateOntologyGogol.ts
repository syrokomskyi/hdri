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

const APP_VERSION = "0.1.0";
const APP_ID = "a-contract-ontology";
const COLLECTOR_VERSION = `${APP_ID}@${APP_VERSION}`;

type ContentRow = {
  content_sha256: string;
  extractor_ver: string;
  extracted_at: number | null;
  [col: string]: unknown;
};

type DomainJoinRow = {
  url_norm: string;
  content_sha256: string;
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

    const observationDbPath = path.join(ctx.outputDir, "observations.sqlite");
    await fsp.rm(observationDbPath, { force: true });
    const observationDb = new Database(observationDbPath);
    observationDb.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE observations (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        conflict_key TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        device_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX observations_conflict_order
        ON observations(conflict_key, recorded_at DESC, device_id DESC, seq DESC);
    `);
    const insertObservation = observationDb.prepare(
      `INSERT INTO observations(conflict_key, recorded_at, device_id, payload_json) VALUES (?, ?, ?, ?)`,
    );
    let observationCount = 0;
    const appendObservation = (obs: IngestedObs): void => {
      insertObservation.run(
        `${obs.asset_id}\u0000${obs.signal_path}`,
        obs.recorded_at,
        obs._device_id,
        JSON.stringify(obs),
      );
      observationCount++;
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
        const joinRows = pagesDb
          .prepare(
            `
          SELECT DISTINCT sp.url_norm, po.content_sha256
          FROM page_observations po
          JOIN site_pages sp ON sp.id = po.site_page_id
        `,
          )
          .all() as DomainJoinRow[];

        const contentToDomain = new Map<string, string>();
        for (const r of joinRows) {
          if (r.url_norm && r.content_sha256) {
            try {
              contentToDomain.set(r.content_sha256, new URL(r.url_norm).hostname.toLowerCase());
            } catch {
              untranslated++;
            }
          }
        }

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
            .prepare(`SELECT * FROM "${mapping.table}"`)
            .iterate() as IterableIterator<ContentRow>;
          for (const row of rows) {
            const domain = contentToDomain.get(row.content_sha256);
            if (!domain) {
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
              src.sourceToken,
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
                capsuleId: brief.sourceToken,
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
              crawl_hash: brief.period,
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
        const auditRunByAssetId = new Map<string, AxeAuditRunRow>();
        const auditRows = axeDb
          .prepare(
            `
          SELECT site_id, provisional_asset_id, fetched_at, ok, error_class, error_message
          FROM audit_runs
          WHERE tool = 'axe'
        `,
          )
          .all() as AxeAuditRunRow[];
        for (const row of auditRows) {
          auditRunByAssetId.set(row.provisional_asset_id, row);
        }

        const metricRows = axeDb
          .prepare(
            `
          SELECT site_id, provisional_asset_id, violations_total, critical_count, serious_count, moderate_count, minor_count, nodes_scanned, axe_version
          FROM axe_runs
        `,
          )
          .iterate() as IterableIterator<AxeMetricRow>;

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
          const auditRun = auditRunByAssetId.get(row.provisional_asset_id);
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
              brief.sourceToken,
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

    console.log(
      `[translate-ontology] Ingested ${observationCount} obs. ` +
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
  sourceToken: string,
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
      capsuleId: sourceToken,
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
    crawl_hash: sourceToken,
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
  sourceToken: string,
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
      capsuleId: sourceToken,
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
    crawl_hash: sourceToken,
    evidence_ref: null,
    confidence: 1,
    status: "active",
    superseded_by: null,
    deprecated_reason: null,
  };
}

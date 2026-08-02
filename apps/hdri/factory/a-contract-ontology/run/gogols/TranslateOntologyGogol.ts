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
  EXT_SIGNAL_MAP,
  deriveAssetId,
  newId,
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
  domain: string;
  content_sha256: string;
};

type AxeAuditRunRow = {
  site_id: number;
  fetched_at: number | null;
  ok: number;
  error_class: string | null;
  error_message: string | null;
};

type AxeMetricRow = {
  site_id: number;
  violations_total: number | null;
  critical_count: number | null;
  serious_count: number | null;
  moderate_count: number | null;
  minor_count: number | null;
  nodes_scanned: number | null;
  axe_version: string | null;
};

type SiteDomainRow = {
  site_id: number;
  domain: string;
};

type LivenessRow = {
  provisional_asset_id: string;
  domain: string;
  checked_at: number;
  http_status: number | null;
  latency_ms: number | null;
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
      const runId = newId();
      const now = new Date().toISOString();
      try {
        pagesDb.exec(`ATTACH DATABASE '${src.registryDbPath.replace(/'/g, "''")}' AS registry`);
        const joinRows = pagesDb
          .prepare(
            `
          SELECT DISTINCT s.domain, po.content_sha256
          FROM page_observations po
          JOIN site_pages sp ON sp.id = po.site_page_id
          JOIN registry.sites s ON s.id = sp.site_id
        `,
          )
          .all() as DomainJoinRow[];

        const contentToDomain = new Map<string, string>();
        for (const r of joinRows) {
          if (r.domain && r.content_sha256) {
            contentToDomain.set(r.content_sha256, r.domain.trim().toLowerCase());
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
              now,
              src.sourceToken,
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
      const runId = newId();
      const now = new Date().toISOString();
      try {
        const rows = livenessDb.prepare(`
          SELECT provisional_asset_id, domain, checked_at, http_status, latency_ms
          FROM liveness_checks
          ORDER BY provisional_asset_id
        `).iterate() as IterableIterator<LivenessRow>;
        for (const row of rows) {
          const observedAt = new Date(row.checked_at * 1000).toISOString();
          for (const [signalPath, value] of [
            ["transport.http.status_code", row.http_status],
            ["transport.http.latency_ms", row.latency_ms],
          ] as const) {
            if (value == null) continue;
            if (!ontologySignals[signalPath]) {
              unknownSignals.add(signalPath);
              continue;
            }
            appendObservation({
              observation_id: newId(),
              asset_id: row.provisional_asset_id,
              crawl_id: runId,
              signal_path: signalPath,
              value_bool: null,
              value_num: value,
              value_str: null,
              value_json: null,
              value_type: "num",
              observed_at: observedAt,
              recorded_at: now,
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
      const registryDb = new Database(src.registryDbPath, { readonly: true });
      const runId = newId();
      const now = new Date().toISOString();
      try {
        const siteRows = registryDb
          .prepare(`SELECT id AS site_id, domain FROM sites ORDER BY id`)
          .all() as SiteDomainRow[];
        const domainBySiteId = new Map<number, string>();
        for (const row of siteRows) {
          if (row.domain) {
            domainBySiteId.set(row.site_id, row.domain.trim().toLowerCase());
          }
        }

        const auditRunBySiteId = new Map<number, AxeAuditRunRow>();
        const auditRows = axeDb
          .prepare(
            `
          SELECT site_id, fetched_at, ok, error_class, error_message
          FROM audit_runs
          WHERE tool = 'axe'
        `,
          )
          .all() as AxeAuditRunRow[];
        for (const row of auditRows) {
          auditRunBySiteId.set(row.site_id, row);
        }

        const metricRows = axeDb
          .prepare(
            `
          SELECT site_id, violations_total, critical_count, serious_count, moderate_count, minor_count, nodes_scanned, axe_version
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
          const domain = domainBySiteId.get(row.site_id);
          if (!domain) {
            untranslated++;
            continue;
          }
          const auditRun = auditRunBySiteId.get(row.site_id);
          if (auditRun && auditRun.ok !== 1) {
            continue;
          }
          for (const mapping of AXE_SIGNAL_MAP) {
            const obs = buildAxeObservation(
              row,
              mapping,
              domain,
              runId,
              brief.ontologyVersion,
              now,
              brief.sourceToken,
              auditRun,
            );
            if (obs) appendObservation({ ...obs, _device_id: src.deviceId });
          }
        }
      } finally {
        axeDb.close();
        registryDb.close();
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

function buildObservation(
  row: ContentRow,
  mapping: ExtSignalMapping,
  domain: string,
  runId: string,
  ontologyVersion: string,
  now: string,
  sourceToken: string,
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
    observation_id: newId(),
    asset_id: assetId,
    crawl_id: runId,
    signal_path: mapping.signalPath,
    value_bool: valueBool,
    value_num: valueNum,
    value_str: valueStr,
    value_json: valueJson,
    value_type: mapping.valueType,
    observed_at: observedAt,
    recorded_at: now,
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
  domain: string,
  runId: string,
  ontologyVersion: string,
  now: string,
  sourceToken: string,
  auditRun: AxeAuditRunRow | undefined,
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
    observation_id: newId(),
    asset_id: deriveAssetId(domain),
    crawl_id: runId,
    signal_path: mapping.signalPath,
    value_bool: null,
    value_num: valueNum,
    value_str: null,
    value_json: null,
    value_type: mapping.valueType,
    observed_at: observedAt,
    recorded_at: now,
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
